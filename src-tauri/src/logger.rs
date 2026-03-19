use std::io::Write;
use std::sync::{Once, OnceLock};
use std::path::PathBuf;

/// Safely truncate a string to at most `max_bytes` bytes on a valid UTF-8
/// char boundary. Returns the full string if it's already short enough.
/// This avoids the `byte index N is not a char boundary` panic that occurs
/// when slicing multi-byte characters (e.g., Chinese, emoji).
pub fn safe_truncate(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    // Walk backwards from max_bytes to find a valid char boundary
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

static INIT: Once = Once::new();
static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Get the log file path. Falls back to exe dir if not explicitly set.
fn log_path() -> PathBuf {
    LOG_DIR.get_or_init(|| {
        // Default: next to the executable
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
            .unwrap_or_else(|| PathBuf::from("."))
    }).join("openclaw_debug.log")
}

/// Set the log directory (call once during app setup)
pub fn set_log_dir(dir: PathBuf) {
    let _ = LOG_DIR.set(dir);
}

/// Initialize logger: clear old log file on first call
pub fn init() {
    INIT.call_once(|| {
        let path = log_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        // Write UTF-8 BOM + header for proper Windows encoding
        let header = format!(
            "═══════════════════════════════════════════════════════\n\
             ║  OpenClaw Agent Debug Log\n\
             ║  Started: {}\n\
             ║  Log Path: {}\n\
             ═══════════════════════════════════════════════════════\n\n",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
            path.display()
        );
        let mut content = vec![0xEF, 0xBB, 0xBF]; // UTF-8 BOM
        content.extend_from_slice(header.as_bytes());
        let _ = std::fs::write(&path, content);
        println!("[LOGGER] Log file initialized at: {}", path.display());
    });
}

/// Log a message with module tag, timestamp, and level
pub fn log_with_level(level: &str, module: &str, message: &str) {
    init();
    let timestamp = chrono::Local::now().format("%H:%M:%S%.3f");
    let line = format!("[{}] [{}] [{}] {}\n", timestamp, level, module, message);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path())
    {
        let _ = f.write_all(line.as_bytes());
    }
    // Also print to console for dev mode
    println!("[{}] [{}] {}", level, module, message);
}

/// Log a message (INFO level by default)
pub fn log(module: &str, message: &str) {
    log_with_level("INFO", module, message);
}

/// Log an error
pub fn error(module: &str, message: &str) {
    log_with_level("ERROR", module, message);
}

/// Log a warning
pub fn warn(module: &str, message: &str) {
    log_with_level("WARN", module, message);
}

/// Log with formatting (convenience macro)
#[macro_export]
macro_rules! app_log {
    ($module:expr, $($arg:tt)*) => {{
        $crate::logger::log($module, &format!($($arg)*));
    }};
}

/// Log error with formatting
#[macro_export]
macro_rules! app_error {
    ($module:expr, $($arg:tt)*) => {{
        $crate::logger::error($module, &format!($($arg)*));
    }};
}

/// Log warning with formatting
#[macro_export]
macro_rules! app_warn {
    ($module:expr, $($arg:tt)*) => {{
        $crate::logger::warn($module, &format!($($arg)*));
    }};
}

/// Install a global panic hook that writes panic info to the log file.
/// This ensures that ANY panic in the application (including in async tasks)
/// is captured in openclaw_debug.log, not just lost in stderr.
pub fn install_panic_hook() {
    init(); // ensure log file exists
    std::panic::set_hook(Box::new(|info| {
        let location = if let Some(loc) = info.location() {
            format!("{}:{}:{}", loc.file(), loc.line(), loc.column())
        } else {
            "unknown location".to_string()
        };

        let message = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic payload".to_string()
        };

        let backtrace = std::backtrace::Backtrace::force_capture();

        let panic_msg = format!(
            "\n\
            ╔══════════════════════════════════════════════════════════╗\n\
            ║  ⚠️  PANIC CAPTURED                                     ║\n\
            ╠══════════════════════════════════════════════════════════╣\n\
            ║  Location: {}\n\
            ║  Message:  {}\n\
            ╠══════════════════════════════════════════════════════════╣\n\
            ║  Backtrace:\n{}\n\
            ╚══════════════════════════════════════════════════════════╝\n",
            location, message, backtrace
        );

        // Write to log file
        log_with_level("PANIC", "SYSTEM", &panic_msg);
        // Also print to stderr for terminal visibility
        eprintln!("{}", panic_msg);
    }));
    log("SYSTEM", "Panic hook installed — all panics will be captured to log file");
}

/// Write a visual separator to the log for readability between operations
pub fn log_separator(label: &str) {
    let line = format!(
        "\n═══════════════════════ {} ═══════════════════════ [{}]\n",
        label,
        chrono::Local::now().format("%H:%M:%S")
    );
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path())
    {
        use std::io::Write;
        let _ = f.write_all(line.as_bytes());
    }
    println!("{}", line);
}
