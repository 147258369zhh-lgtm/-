// ═══════════════════════════════════════════════════════
// Browser Automation — Playwright Integration (P2)
// Manages browser sessions & provides page operation tools
// ═══════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::process::Stdio;
use tokio::process::Command;
use tokio::sync::Mutex;
use std::sync::Arc;

/// Browser session state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserSession {
    pub id: String,
    pub name: String,
    pub status: BrowserStatus,
    pub url: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserStatus {
    Starting,
    Ready,
    Busy,
    Closed,
    Error,
}

/// Browser action request from Agent / Workflow node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserAction {
    pub action: BrowserActionType,
    pub session_id: Option<String>,
    pub params: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserActionType {
    /// Navigate to a URL
    Navigate,
    /// Click an element
    Click,
    /// Type text into an element
    Type,
    /// Fill a form field
    Fill,
    /// Wait for element / timeout
    Wait,
    /// Take a screenshot
    Screenshot,
    /// Extract text from page or element
    ExtractText,
    /// Extract table data
    ExtractTable,
    /// Upload a file
    Upload,
    /// Download a file
    Download,
    /// Select dropdown option
    Select,
    /// Scroll page
    Scroll,
    /// Execute JavaScript
    EvalJs,
    /// Get page info (URL, title, etc.)
    PageInfo,
    /// Close session
    Close,
}

/// The browser automation manager
pub struct BrowserManager {
    sessions: Arc<Mutex<Vec<BrowserSession>>>,
    /// Path to the Playwright Node.js helper script
    helper_script_path: Option<String>,
}

impl BrowserManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(Vec::new())),
            helper_script_path: None,
        }
    }

    /// Set the path to the Playwright helper script
    pub fn set_helper_path(&mut self, path: String) {
        self.helper_script_path = Some(path);
    }

    /// Create a new browser session
    pub async fn create_session(&self, name: &str) -> Result<BrowserSession, String> {
        let session = BrowserSession {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            status: BrowserStatus::Ready,
            url: None,
            created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        };

        let mut sessions = self.sessions.lock().await;
        sessions.push(session.clone());

        Ok(session)
    }

    /// Execute a browser action
    pub async fn execute_action(&self, action: &BrowserAction) -> Result<Value, String> {
        let session_id = action.session_id.clone().unwrap_or_else(|| {
            // Create a default session if none specified
            uuid::Uuid::new_v4().to_string()
        });

        // Update session status
        {
            let mut sessions = self.sessions.lock().await;
            if let Some(s) = sessions.iter_mut().find(|s| s.id == session_id) {
                s.status = BrowserStatus::Busy;
            }
        }

        let result = self.dispatch_action(&action.action, &action.params).await;

        // Update session status back
        {
            let mut sessions = self.sessions.lock().await;
            if let Some(s) = sessions.iter_mut().find(|s| s.id == session_id) {
                s.status = if result.is_ok() { BrowserStatus::Ready } else { BrowserStatus::Error };
                if action.action == BrowserActionType::Close {
                    s.status = BrowserStatus::Closed;
                }
            }
        }

        result
    }

    /// Dispatch action to appropriate handler
    async fn dispatch_action(&self, action: &BrowserActionType, params: &Value) -> Result<Value, String> {
        match action {
            BrowserActionType::Navigate => {
                let _url = params["url"].as_str().ok_or("Missing 'url' parameter")?;
                self.run_playwright_command("navigate", params).await
            },
            BrowserActionType::Click => {
                let _selector = params["selector"].as_str().ok_or("Missing 'selector' parameter")?;
                self.run_playwright_command("click", params).await
            },
            BrowserActionType::Type | BrowserActionType::Fill => {
                let _selector = params["selector"].as_str().ok_or("Missing 'selector'")?;
                let _text = params["text"].as_str().ok_or("Missing 'text'")?;
                self.run_playwright_command("fill", params).await
            },
            BrowserActionType::Wait => {
                self.run_playwright_command("wait", params).await
            },
            BrowserActionType::Screenshot => {
                self.run_playwright_command("screenshot", params).await
            },
            BrowserActionType::ExtractText => {
                self.run_playwright_command("extract_text", params).await
            },
            BrowserActionType::ExtractTable => {
                self.run_playwright_command("extract_table", params).await
            },
            BrowserActionType::Upload => {
                let _selector = params["selector"].as_str().ok_or("Missing 'selector'")?;
                let _file_path = params["file_path"].as_str().ok_or("Missing 'file_path'")?;
                self.run_playwright_command("upload", params).await
            },
            BrowserActionType::Download => {
                self.run_playwright_command("download", params).await
            },
            BrowserActionType::Select => {
                self.run_playwright_command("select", params).await
            },
            BrowserActionType::Scroll => {
                self.run_playwright_command("scroll", params).await
            },
            BrowserActionType::EvalJs => {
                let _script = params["script"].as_str().ok_or("Missing 'script'")?;
                self.run_playwright_command("eval", params).await
            },
            BrowserActionType::PageInfo => {
                self.run_playwright_command("page_info", params).await
            },
            BrowserActionType::Close => {
                self.run_playwright_command("close", params).await
            },
        }
    }

    /// Run a Playwright command via the Node.js helper script
    async fn run_playwright_command(&self, command: &str, params: &Value) -> Result<Value, String> {
        let helper_path = self.helper_script_path.as_deref()
            .unwrap_or("playwright_helper.js");

        let payload = json!({
            "command": command,
            "params": params,
        });

        // Execute via Node.js
        let output = Command::new("node")
            .arg(helper_path)
            .arg(payload.to_string())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| format!("Failed to run Playwright helper: {}. Is Node.js installed?", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Playwright error: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        serde_json::from_str(&stdout)
            .map_err(|e| format!("Failed to parse Playwright output: {}", e))
    }

    /// List active sessions
    pub async fn list_sessions(&self) -> Vec<BrowserSession> {
        let sessions = self.sessions.lock().await;
        sessions.iter().filter(|s| s.status != BrowserStatus::Closed).cloned().collect()
    }

    /// Close a session
    pub async fn close_session(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().await;
        if let Some(s) = sessions.iter_mut().find(|s| s.id == session_id) {
            s.status = BrowserStatus::Closed;
            Ok(())
        } else {
            Err(format!("Session {} not found", session_id))
        }
    }

    /// Close all sessions
    pub async fn close_all(&self) {
        let mut sessions = self.sessions.lock().await;
        for s in sessions.iter_mut() {
            s.status = BrowserStatus::Closed;
        }
    }
}
