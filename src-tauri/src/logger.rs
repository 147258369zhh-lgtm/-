use std::io::Write;
use std::sync::Once;

static INIT: Once = Once::new();
static LOG_PATH: &str = "K:\\agent_debug.log";

/// Initialize logger: clear old log file on first call
pub fn init() {
    INIT.call_once(|| {
        // Truncate log file on startup
        let _ = std::fs::write(LOG_PATH, format!(
            "=== OpenClaw Agent Debug Log ===\nStarted: {}\n\n",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
        ));
    });
}

/// Log a message with module tag and timestamp
pub fn log(module: &str, message: &str) {
    init();
    let timestamp = chrono::Local::now().format("%H:%M:%S%.3f");
    let line = format!("[{}] [{}] {}\n", timestamp, module, message);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(LOG_PATH)
    {
        let _ = f.write_all(line.as_bytes());
    }
    // Also print to console for dev mode
    println!("[{}] {}", module, message);
}

/// Log with formatting (convenience macro)
#[macro_export]
macro_rules! app_log {
    ($module:expr, $($arg:tt)*) => {{
        $crate::logger::log($module, &format!($($arg)*));
    }};
}
