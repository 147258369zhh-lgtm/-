use super::types::*;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use crate::app_log;

// ═══════════════════════════════════════════════════════════════
// Agent V5 — Unified LLM Client
// Single reqwest::Client instance (connection pool reuse)
// Supports: standard chat, function calling, streaming text
// ═══════════════════════════════════════════════════════════════

pub struct LlmClient {
    client: reqwest::Client,
    config: LlmConfig,
}

impl LlmClient {
    /// Create a new client for the given LLM config.
    pub fn new(config: LlmConfig) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .pool_max_idle_per_host(4)
            .build()
            .map_err(|e| format!("HTTP client build error: {e}"))?;
        Ok(Self { client, config })
    }

    // ─── Core: Chat with Tools ────────────────────────────────────

    /// Send a chat request with tool definitions.
    /// The LLM may respond with tool_calls or a final answer.
    /// Optionally emits "thinking" streaming chunks to the frontend.
    pub async fn chat_with_tools(
        &self,
        messages: &[Message],
        tools: &[ToolDef],
        app: Option<&AppHandle>,
        round: u32,
    ) -> Result<LlmChatResponse, String> {
        let payload = json!({
            "model": self.config.model_name,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "temperature": 0.2,
            "stream": false,
        });

        self.do_request(payload, app, round).await
    }

    /// Simple chat with no tools — for blueprint generation, etc.
    pub async fn chat_simple(
        &self,
        system: &str,
        user: &str,
    ) -> Result<String, String> {
        let payload = json!({
            "model": self.config.model_name,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.3,
            "stream": false,
        });

        let resp = self.raw_request(payload).await?;
        extract_text_content(&resp)
    }

    // ─── Low-level HTTP ───────────────────────────────────────────

    async fn do_request(
        &self,
        payload: Value,
        app: Option<&AppHandle>,
        round: u32,
    ) -> Result<LlmChatResponse, String> {
        app_log!("LLM", "→ POST {} [round={}]", self.config.endpoint, round);

        let raw = self.raw_request(payload).await?;

        app_log!("LLM", "← Response received [round={}]", round);

        // Detect finish_reason
        let finish_reason = raw
            .get("choices").and_then(|c| c.as_array()).and_then(|c| c.first())
            .and_then(|c| c.get("finish_reason")).and_then(|v| v.as_str())
            .unwrap_or("stop").to_string();

        let message = raw
            .get("choices").and_then(|c| c.as_array()).and_then(|c| c.first())
            .and_then(|c| c.get("message"))
            .ok_or("LLM response missing message")?
            .clone();

        // Parse text content
        let text_content = message.get("content").and_then(|c| c.as_str())
            .map(|s| s.to_string());

        // If there's text content and app is provided, emit a "thinking" event
        if let (Some(text), Some(app_h)) = (&text_content, app) {
            if !text.is_empty() && (finish_reason == "stop" || finish_reason == "length") {
                let _ = app_h.emit("agent-event", AgentEvent {
                    event_type: "thinking".into(),
                    step: Some(AgentStep {
                        round,
                        step_type: "thinking".into(),
                        tool_name: None,
                        tool_args: None,
                        tool_result: None,
                        content: Some(text.clone()),
                        duration_ms: None,
                    }),
                    message: Some(crate::logger::safe_truncate(&text, 200).to_string()),
                });
            }
        }

        // Parse tool_calls if present
        let tool_calls = parse_tool_calls(&message);

        Ok(LlmChatResponse {
            text_content,
            tool_calls,
            finish_reason,
        })
    }

    async fn raw_request(&self, payload: Value) -> Result<Value, String> {
        let mut req = self.client.post(&self.config.endpoint).json(&payload);
        if !self.config.api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", self.config.api_key));
        }

        let resp = match tokio::time::timeout(
            std::time::Duration::from_secs(120),
            req.send(),
        ).await {
            Ok(Ok(r)) => r,
            Ok(Err(e)) => return Err(format!("LLM 请求失败: {e}")),
            Err(_) => return Err("LLM 响应超时 (120s)".into()),
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("LLM HTTP {status}: {}", crate::logger::safe_truncate(&body, 400)));
        }

        resp.json::<Value>().await
            .map_err(|e| format!("LLM JSON 解析失败: {e}"))
    }
}

// ─── LLM Response ─────────────────────────────────────────────────

pub struct LlmChatResponse {
    pub text_content: Option<String>,
    pub tool_calls: Vec<ToolCall>,
    pub finish_reason: String,
}

impl LlmChatResponse {
    /// Classify the response into a LoopAction for the ReAct engine.
    pub fn into_action(self) -> LoopAction {
        if !self.tool_calls.is_empty() {
            LoopAction::CallTools(self.tool_calls)
        } else if let Some(text) = self.text_content {
            if text.trim().is_empty() {
                LoopAction::Error("LLM returned empty response".into())
            } else {
                LoopAction::FinalAnswer(text)
            }
        } else {
            LoopAction::Error("LLM returned neither tool_calls nor content".into())
        }
    }

    /// Convert to a Message for appending to conversation history.
    pub fn to_message(&self) -> Message {
        if !self.tool_calls.is_empty() {
            Message::assistant_tool_calls(self.tool_calls.clone())
        } else {
            Message::assistant_text(self.text_content.clone().unwrap_or_default())
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────

fn extract_text_content(json: &Value) -> Result<String, String> {
    json.get("choices").and_then(|c| c.as_array()).and_then(|c| c.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| {
            let err = json.get("error").and_then(|e| e.get("message"))
                .and_then(|m| m.as_str()).unwrap_or("no content");
            format!("LLM 返回异常: {err}")
        })
}

fn parse_tool_calls(message: &Value) -> Vec<ToolCall> {
    let arr = match message.get("tool_calls").and_then(|v| v.as_array()) {
        Some(a) if !a.is_empty() => a,
        _ => return vec![],
    };

    arr.iter().filter_map(|tc| {
        let id = tc.get("id").and_then(|v| v.as_str())?.to_string();
        let func = tc.get("function")?;
        let name = func.get("name").and_then(|v| v.as_str())?.to_string();
        let arguments = func.get("arguments").and_then(|v| v.as_str())
            .unwrap_or("{}").to_string();
        Some(ToolCall {
            id,
            call_type: "function".into(),
            function: ToolCallFunction { name, arguments },
        })
    }).collect()
}
