use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

pub struct McpClient {
    pub name: String,
    pub child: Child,
}

pub struct McpClientManager {
    pub clients: Arc<Mutex<HashMap<String, McpClient>>>,
}

impl McpClientManager {
    pub fn new() -> Self {
        Self {
            clients: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn connect_stdio(
        &self,
        name: &str,
        command: &str,
        args: &[String],
    ) -> Result<(), String> {
        let mut child = Command::new(command)
            .args(args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to spawn MCP server {}: {}", name, e))?;

        // Standard MCP initialization handshake
        let stdin = child.stdin.as_mut().ok_or("Failed to open stdin")?;

        let init_msg = json!({
            "jsonrpc": "2.0",
            "id": "1",
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "OpenClaw-Client", "version": "1.0.0" }
            }
        });

        let msg_str = format!("{}\n", serde_json::to_string(&init_msg).unwrap());
        stdin
            .write_all(msg_str.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())?;

        // Read response
        let stdout = child.stdout.as_mut().ok_or("Failed to open stdout")?;
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .await
            .map_err(|e| e.to_string())?;

        println!("MCP {} initialized: {}", name, line);

        let mut clients = self.clients.lock().await;
        clients.insert(
            name.to_string(),
            McpClient {
                name: name.to_string(),
                child,
            },
        );

        Ok(())
    }

    pub async fn list_tools(&self) -> Result<Value, String> {
        let mut clients = self.clients.lock().await;
        let mut results = Vec::new();

        for (name, client) in clients.iter_mut() {
            let stdin = client.child.stdin.as_mut().ok_or("Stdin closed")?;
            let request = json!({
                "jsonrpc": "2.0",
                "id": format!("lt_{}", name),
                "method": "list_tools",
                "params": {}
            });

            let msg = format!("{}\n", serde_json::to_string(&request).unwrap());
            stdin
                .write_all(msg.as_bytes())
                .await
                .map_err(|e| e.to_string())?;
            stdin.flush().await.map_err(|e| e.to_string())?;

            // Note: In a production client, we'd have a loop reading responses
            // and matching by ID. For this MVP, we'll try a single read.
            let stdout = client.child.stdout.as_mut().ok_or("Stdout closed")?;
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            reader
                .read_line(&mut line)
                .await
                .map_err(|e| e.to_string())?;

            if let Ok(val) = serde_json::from_str::<Value>(&line) {
                results.push(json!({
                    "server": name,
                    "info": val
                }));
            }
        }

        Ok(json!(results))
    }

    pub async fn call_tool(
        &self,
        server_name: &str,
        tool_name: &str,
        arguments: &Value,
    ) -> Result<Value, String> {
        let mut clients = self.clients.lock().await;
        let available: Vec<String> = clients.keys().cloned().collect();
        let client = clients.get_mut(server_name).ok_or_else(|| {
            format!(
                "MCP server '{}' not found. Available: {:?}",
                server_name, available
            )
        })?;

        let stdin = client.child.stdin.as_mut().ok_or("Stdin closed")?;
        let request = json!({
            "jsonrpc": "2.0",
            "id": format!("call_{}_{}", server_name, tool_name),
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        });

        let msg = format!("{}\n", serde_json::to_string(&request).unwrap());
        stdin
            .write_all(msg.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())?;

        let stdout = client.child.stdout.as_mut().ok_or("Stdout closed")?;
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .await
            .map_err(|e| e.to_string())?;

        serde_json::from_str::<Value>(&line)
            .map_err(|e| format!("Failed to parse MCP response: {}", e))
    }
}
