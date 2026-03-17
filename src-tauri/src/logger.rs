use std::io::Write;
use std::sync::{Once, OnceLock};
use std::path::PathBuf;

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
        let _ = std::fs::write(&path, format!(
            "═══════════════════════════════════════════════════════\n\
             ║  OpenClaw Agent Debug Log\n\
             ║  Started: {}\n\
             ║  Log Path: {}\n\
             ═══════════════════════════════════════════════════════\n\n",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
            path.display()
        ));
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
