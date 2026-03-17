// ═══════════════════════════════════════════════════════
// Workflow Engine — Node Executors
// ═══════════════════════════════════════════════════════
//
// This module contains the execution context and helpers
// for the three node types. The main execution logic is
// in engine.rs; this module provides shared context and
// utilities needed by node executors.

use serde_json::Value;

/// Context available to all node executors during execution
#[derive(Debug, Clone)]
pub struct NodeExecutorContext {
    /// Accumulated outputs from previous nodes
    pub previous_outputs: Value,
    /// The workflow execution ID
    pub execution_id: String,
    /// Current node index
    pub node_index: usize,
}

impl NodeExecutorContext {
    pub fn new(execution_id: String, node_index: usize, previous_outputs: Value) -> Self {
        Self {
            previous_outputs,
            execution_id,
            node_index,
        }
    }

    /// Get output of a previous node by node_id
    pub fn get_previous_output(&self, node_id: &str) -> Option<&Value> {
        self.previous_outputs.get(node_id)
    }

    /// Resolve template strings like "{{node_1.field_name}}" against previous outputs
    pub fn resolve_template(&self, template: &str) -> String {
        let mut result = template.to_string();

        // Simple template resolution: {{node_id.field}} or {{node_id}}
        let re = regex::Regex::new(r"\{\{([^}]+)\}\}").unwrap();
        for cap in re.captures_iter(template) {
            let key = &cap[1];
            let parts: Vec<&str> = key.split('.').collect();

            let value = if parts.len() == 1 {
                self.previous_outputs.get(parts[0])
                    .map(|v| v.to_string())
            } else if parts.len() == 2 {
                self.previous_outputs.get(parts[0])
                    .and_then(|v| v.get(parts[1]))
                    .map(|v| match v {
                        Value::String(s) => s.clone(),
                        other => other.to_string(),
                    })
            } else {
                None
            };

            if let Some(val) = value {
                result = result.replace(&cap[0], &val);
            }
        }

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_resolve_template() {
        let ctx = NodeExecutorContext::new(
            "test".into(),
            0,
            json!({
                "step1": {"name": "alice", "age": 30},
                "step2": "hello world"
            }),
        );

        assert_eq!(
            ctx.resolve_template("Hello {{step1.name}}, you are {{step1.age}}"),
            "Hello alice, you are 30"
        );
    }
}
