// Human-in-the-Loop Infrastructure
// Phase 1: 可接管、可恢复、可记录
// Phase 2: 可抽象、可复用、可学习 (future)
//
// Key distinction:
//   teaching    → system learns a NEW capability from human demo
//   correction  → system failed & human corrects/resumes execution
//   These are NOT merged — they have different goals, flows, and data sinks.

pub mod intervention_manager;
pub mod teaching;
pub mod correction;
pub mod trace_recorder;
pub mod recovery_bridge;
pub mod teaching_backflow;  // Teaching -> ReusablePattern -> Blueprint/Skill candidate

// Convenience re-exports
pub use intervention_manager::{ensure_schema, list_pending_interventions};
