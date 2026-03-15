use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct McpConfig {
    pub enabled: bool,
    pub external_servers: Vec<ExternalMcpServer>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExternalMcpServer {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
}

pub mod client;
pub mod server;
pub mod commands;
