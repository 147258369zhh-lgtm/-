// ═══════════════════════════════════════════════
// Environment Snapshot — Runtime Context for Planner
// ═══════════════════════════════════════════════
//
// Inspired by Cloud Code / Coze architecture:
// Before planning, capture the execution environment so
// Planner generates realistic, executable plans.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::app_log;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvSnapshot {
    pub os: String,
    pub username: String,
    pub desktop_path: String,
    pub documents_path: String,
    pub home_path: String,
    pub python_available: bool,
    pub python_version: String,
    pub python_libs: HashMap<String, bool>,
    pub powershell_available: bool,
    pub node_available: bool,
    pub current_date: String,
    pub current_time: String,
}

impl EnvSnapshot {
    /// Generate environment snapshot — called once before planning
    pub async fn capture() -> Self {
        let username = std::env::var("USERNAME")
            .or_else(|_| std::env::var("USER"))
            .unwrap_or_else(|_| "user".into());
        let home = std::env::var("USERPROFILE")
            .unwrap_or_else(|_| format!("C:\\Users\\{}", username));
        let desktop = format!("{}\\Desktop", home);
        let documents = format!("{}\\Documents", home);

        // Check Python
        let (python_ok, python_ver) = check_command("python", &["--version"]).await;

        // Check Python libraries (only if Python is available)
        let mut libs = HashMap::new();
        if python_ok {
            let key_libs = [
                "requests", "bs4", "openpyxl", "pandas", "docx",
                "pptx", "PIL", "matplotlib", "lxml", "qrcode", "markdown",
            ];
            let check_script = key_libs.iter()
                .map(|lib| format!("try:\n import {}\n print('{}: ok')\nexcept: print('{}: fail')", lib, lib, lib))
                .collect::<Vec<_>>()
                .join("\n");
            
            if let Ok(output) = tokio::process::Command::new("python")
                .args(&["-c", &check_script])
                .output()
                .await
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if let Some((name, status)) = line.split_once(": ") {
                        libs.insert(name.to_string(), status == "ok");
                    }
                }
            }
        }

        // Check PowerShell
        let (ps_ok, _) = check_command("powershell", &["-NoProfile", "-Command", "echo ok"]).await;

        // Check Node.js
        let (node_ok, _) = check_command("node", &["--version"]).await;

        // Current date/time (using system command to avoid chrono dependency)
        let (date_str, time_str) = get_datetime().await;

        let snapshot = EnvSnapshot {
            os: "Windows".into(),
            username,
            desktop_path: desktop,
            documents_path: documents,
            home_path: home,
            python_available: python_ok,
            python_version: python_ver,
            python_libs: libs,
            powershell_available: ps_ok,
            node_available: node_ok,
            current_date: date_str,
            current_time: time_str,
        };

        app_log!("ENV", "Snapshot captured: os={}, user={}, python={} ({}), ps={}, node={}, libs={}",
            snapshot.os, snapshot.username, snapshot.python_available, snapshot.python_version,
            snapshot.powershell_available, snapshot.node_available, snapshot.python_libs.len());

        snapshot
    }

    /// Format as context string for injection into Planner/Executor prompts
    pub fn to_prompt_context(&self) -> String {
        let lib_status: Vec<String> = self.python_libs.iter()
            .map(|(name, ok)| format!("  - {}: {}", name, if *ok { "✅ 可用" } else { "❌ 未安装" }))
            .collect();

        format!(
            r#"## 当前执行环境（必须严格遵守）
- 操作系统: {}
- 用户名: {}
- 桌面路径: {}
- 文档路径: {}
- 当前日期: {}
- 当前时间: {}
- Python: {} ({})
- PowerShell: {}
- Node.js: {}

### Python 可用库
{}

### ⚠️ 路径规则
- 使用以上真实路径，**绝对不要编造用户名或路径**
- 桌面保存路径直接用: {}
- 文档保存路径直接用: {}"#,
            self.os, self.username, self.desktop_path, self.documents_path,
            self.current_date, self.current_time,
            if self.python_available { format!("✅ 可用 ({})", self.python_version) } else { "❌ 不可用".into() },
            self.python_version,
            if self.powershell_available { "✅ 可用" } else { "❌ 不可用 — 不要使用 PowerShell 命令" },
            if self.node_available { "✅ 可用" } else { "❌ 不可用" },
            lib_status.join("\n"),
            self.desktop_path, self.documents_path,
        )
    }

    /// Get tool availability hints for health check
    pub fn get_tool_health(&self) -> Vec<(String, bool, String)> {
        let mut health = Vec::new();

        // File tools — always OK (Rust built-in)
        for t in &["file_read", "file_write", "file_create", "file_delete", "file_move", "file_list", "file_search"] {
            health.push((t.to_string(), true, "Rust 内置".into()));
        }

        // Python-dependent tools
        let python_tools = [
            ("excel_read", "openpyxl"),
            ("excel_write", "openpyxl"),
            ("excel_analyze", "pandas"),
            ("word_read", "docx"),
            ("word_write", "docx"),
            ("ppt_read", "pptx"),
            ("ppt_create", "pptx"),
            ("web_scrape", "requests"),
            ("chart_generate", "matplotlib"),
            ("image_process", "PIL"),
            ("qrcode_generate", "qrcode"),
            ("markdown_convert", "markdown"),
            ("pdf_read", ""),  // has fallback
            ("csv_to_excel", "pandas"),
            ("data_merge", "pandas"),
            ("table_transform", "pandas"),
            ("report_generate", "docx"),
            ("doc_convert", ""),
            ("translate_text", ""),  // uses urllib (built-in)
            ("text_extract", ""),  // no deps
            ("json_process", ""),  // Rust serde
        ];

        for (tool, lib) in &python_tools {
            if !self.python_available {
                health.push((tool.to_string(), false, "Python 不可用".into()));
            } else if lib.is_empty() {
                health.push((tool.to_string(), true, "可用".into()));
            } else {
                let ok = self.python_libs.get(*lib).copied().unwrap_or(false);
                health.push((tool.to_string(), ok, if ok { "可用".into() } else { format!("缺少库: {}", lib) }));
            }
        }

        // Shell tools
        health.push(("shell_run".to_string(), self.powershell_available, 
            if self.powershell_available { "可用".into() } else { "PowerShell 不可用".into() }));

        // Browser tools
        health.push(("browser_navigate".to_string(), true, "可用 (PowerShell fallback)".into()));
        health.push(("browser_script".to_string(), self.node_available, 
            if self.node_available { "可用".into() } else { "Node.js 不可用".into() }));

        // Compression — PowerShell built-in
        health.push(("compress_archive".to_string(), true, "PowerShell 内置".into()));

        health
    }
}

/// Check if a command is available and get its version output
async fn check_command(cmd: &str, args: &[&str]) -> (bool, String) {
    match tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::process::Command::new(cmd).args(args).output()
    ).await {
        Ok(Ok(output)) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            (true, stdout)
        }
        _ => (false, String::new()),
    }
}

/// Get current date and time as formatted strings (avoids chrono dependency)
async fn get_datetime() -> (String, String) {
    if let Ok(Ok(output)) = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        tokio::process::Command::new("python")
            .args(&["-c", "from datetime import datetime; n=datetime.now(); print(n.strftime('%Y-%m-%d')); print(n.strftime('%H:%M:%S'))"])
            .output()
    ).await {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let lines: Vec<&str> = stdout.trim().lines().collect();
        if lines.len() >= 2 {
            return (lines[0].to_string(), lines[1].to_string());
        }
    }
    // Fallback: use system time with basic formatting
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let secs_in_day = now % 86400;
    let hours = (secs_in_day / 3600 + 8) % 24; // UTC+8
    let mins = (secs_in_day % 3600) / 60;
    let secs_val = secs_in_day % 60;
    (format!("{}", now / 86400), format!("{:02}:{:02}:{:02}", hours, mins, secs_val))
}
