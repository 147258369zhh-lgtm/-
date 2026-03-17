// ═══════════════════════════════════════════════════════
// Workflow Engine — Persistence Layer
// ═══════════════════════════════════════════════════════

use crate::db::DbPool;
use crate::workflow::types::*;
use serde_json::Value;

/// Persistence layer for Workflow data (SQLite)
pub struct WorkflowPersistence {
    pool: DbPool,
}

impl WorkflowPersistence {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    // ── Workflow Definition CRUD ──────────────────

    pub async fn create_workflow(&self, def: &WorkflowDefinition) -> Result<(), String> {
        let nodes_json = serde_json::to_string(&def.nodes).map_err(|e| e.to_string())?;
        sqlx::query(
            "INSERT INTO workflows (id, name, description, nodes_json, version, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&def.id)
        .bind(&def.name)
        .bind(&def.description)
        .bind(&nodes_json)
        .bind(def.version)
        .bind(&def.created_at)
        .bind(&def.updated_at)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to create workflow: {}", e))?;
        Ok(())
    }

    pub async fn list_workflows(&self) -> Result<Vec<WorkflowDefinition>, String> {
        let rows: Vec<(String, String, String, String, i64, String, String)> = sqlx::query_as(
            "SELECT id, name, description, nodes_json, version, created_at, updated_at
             FROM workflows ORDER BY updated_at DESC"
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list workflows: {}", e))?;

        let mut result = Vec::new();
        for (id, name, description, nodes_json, version, created_at, updated_at) in rows {
            let nodes: Vec<WorkflowNode> = serde_json::from_str(&nodes_json)
                .unwrap_or_default();
            result.push(WorkflowDefinition {
                id,
                name,
                description,
                nodes,
                version: version as u32,
                created_at,
                updated_at,
            });
        }
        Ok(result)
    }

    pub async fn get_workflow(&self, workflow_id: &str) -> Result<WorkflowDefinition, String> {
        let row: (String, String, String, String, i64, String, String) = sqlx::query_as(
            "SELECT id, name, description, nodes_json, version, created_at, updated_at
             FROM workflows WHERE id = ?"
        )
        .bind(workflow_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| format!("Workflow not found: {}", e))?;

        let nodes: Vec<WorkflowNode> = serde_json::from_str(&row.3)
            .unwrap_or_default();

        Ok(WorkflowDefinition {
            id: row.0,
            name: row.1,
            description: row.2,
            nodes,
            version: row.4 as u32,
            created_at: row.5,
            updated_at: row.6,
        })
    }

    pub async fn update_workflow(&self, def: &WorkflowDefinition) -> Result<(), String> {
        let nodes_json = serde_json::to_string(&def.nodes).map_err(|e| e.to_string())?;
        sqlx::query(
            "UPDATE workflows SET name = ?, description = ?, nodes_json = ?, version = ?, updated_at = ?
             WHERE id = ?"
        )
        .bind(&def.name)
        .bind(&def.description)
        .bind(&nodes_json)
        .bind(def.version)
        .bind(&def.updated_at)
        .bind(&def.id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to update workflow: {}", e))?;
        Ok(())
    }

    pub async fn delete_workflow(&self, workflow_id: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM workflows WHERE id = ?")
            .bind(workflow_id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete workflow: {}", e))?;
        Ok(())
    }

    // ── Execution CRUD ──────────────────────────

    pub async fn create_execution(&self, exec: &WorkflowExecution) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO workflow_executions (id, workflow_id, status, current_node_index, started_at)
             VALUES (?, ?, ?, ?, ?)"
        )
        .bind(&exec.id)
        .bind(&exec.workflow_id)
        .bind(exec.status.as_str())
        .bind(exec.current_node_index as i64)
        .bind(&exec.started_at)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to create execution: {}", e))?;
        Ok(())
    }

    pub async fn update_execution(&self, exec: &WorkflowExecution) -> Result<(), String> {
        let result_json = exec.result.as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_default());

        sqlx::query(
            "UPDATE workflow_executions
             SET status = ?, current_node_index = ?, completed_at = ?, error = ?, result_json = ?
             WHERE id = ?"
        )
        .bind(exec.status.as_str())
        .bind(exec.current_node_index as i64)
        .bind(&exec.completed_at)
        .bind(&exec.error)
        .bind(&result_json)
        .bind(&exec.id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to update execution: {}", e))?;
        Ok(())
    }

    pub async fn list_executions(&self, limit: i64) -> Result<Vec<WorkflowExecution>, String> {
        let rows: Vec<(String, String, String, i64, Option<String>, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
            "SELECT id, workflow_id, status, current_node_index, started_at, completed_at, error, result_json
             FROM workflow_executions ORDER BY started_at DESC LIMIT ?"
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list executions: {}", e))?;

        let mut result = Vec::new();
        for (id, workflow_id, status, node_idx, started, completed, error, result_json) in rows {
            // Look up workflow name
            let wf_name = sqlx::query_scalar::<_, String>(
                "SELECT name FROM workflows WHERE id = ?"
            )
            .bind(&workflow_id)
            .fetch_optional(&self.pool)
            .await
            .unwrap_or(None)
            .unwrap_or_else(|| "Unknown".to_string());

            let total = sqlx::query_scalar::<_, i64>(
                "SELECT COALESCE(LENGTH(nodes_json) - LENGTH(REPLACE(nodes_json, '\"id\"', '')) , 0) / 4 FROM workflows WHERE id = ?"
            )
            .bind(&workflow_id)
            .fetch_optional(&self.pool)
            .await
            .unwrap_or(None)
            .unwrap_or(0);

            let parsed_result: Option<Value> = result_json
                .and_then(|s| serde_json::from_str(&s).ok());

            result.push(WorkflowExecution {
                id,
                workflow_id,
                workflow_name: wf_name,
                status: WorkflowStatus::from_str(&status),
                current_node_index: node_idx as usize,
                total_nodes: total as usize,
                started_at: started,
                completed_at: completed,
                error,
                result: parsed_result,
            });
        }
        Ok(result)
    }

    // ── Step Logs ──────────────────────────────

    pub async fn save_step_log(&self, log: &StepLog) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO workflow_step_logs (id, execution_id, node_index, node_type, status, input_json, output_json, started_at, completed_at, duration_ms, error)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&log.id)
        .bind(&log.execution_id)
        .bind(log.node_index as i64)
        .bind(&log.node_type)
        .bind(&log.status)
        .bind(&log.input_json)
        .bind(&log.output_json)
        .bind(&log.started_at)
        .bind(&log.completed_at)
        .bind(log.duration_ms.map(|v| v as i64))
        .bind(&log.error)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to save step log: {}", e))?;
        Ok(())
    }

    pub async fn get_step_logs(&self, execution_id: &str) -> Result<Vec<StepLog>, String> {
        let rows: Vec<(String, String, i64, String, String, Option<String>, Option<String>, String, Option<String>, Option<i64>, Option<String>)> = sqlx::query_as(
            "SELECT id, execution_id, node_index, node_type, status, input_json, output_json, started_at, completed_at, duration_ms, error
             FROM workflow_step_logs WHERE execution_id = ? ORDER BY node_index ASC"
        )
        .bind(execution_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to get step logs: {}", e))?;

        Ok(rows.into_iter().map(|(id, exec_id, idx, ntype, status, input, output, started, completed, duration, error)| {
            StepLog {
                id,
                execution_id: exec_id,
                node_index: idx as usize,
                node_type: ntype,
                status,
                input_json: input,
                output_json: output,
                started_at: started,
                completed_at: completed,
                duration_ms: duration.map(|v| v as u64),
                error,
            }
        }).collect())
    }
}
