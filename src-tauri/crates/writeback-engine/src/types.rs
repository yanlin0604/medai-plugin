use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPayload {
    pub doc_code: String,
    pub doc_name: String,
    pub patient_id: String,
    pub fields: BTreeMap<String, String>,
    #[serde(default)]
    pub field_order: Option<Vec<String>>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FieldError {
    pub field_key: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WritebackStats {
    pub total: usize,
    pub success: usize,
    pub failed: usize,
    pub errors: Vec<FieldError>,
}

impl WritebackStats {
    pub fn new(total: usize) -> Self {
        Self {
            total,
            success: 0,
            failed: 0,
            errors: Vec::new(),
        }
    }

    pub fn add_success(&mut self) {
        self.success += 1;
    }

    pub fn add_error(&mut self, field_key: impl Into<String>, message: impl Into<String>) {
        self.failed += 1;
        self.errors.push(FieldError {
            field_key: field_key.into(),
            message: message.into(),
        });
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverConfig {
    pub headless: bool,
    pub timeout_ms: u64,
    pub retry_count: u32,
    pub webdriver_url: Option<String>,
    pub step_delay_ms: u64,
    pub save_selector: Option<String>,
    pub keep_browser_open: bool,
}

impl Default for DriverConfig {
    fn default() -> Self {
        Self {
            headless: false,
            timeout_ms: 10_000,
            retry_count: 1,
            webdriver_url: Some("http://localhost:9515".to_string()),
            step_delay_ms: 800,
            save_selector: Some("#save-document,[data-action=\"save\"]".to_string()),
            keep_browser_open: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TargetInfo {
    Web { url: String },
    Desktop { window_title: String },
    Clipboard,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WritebackResult {
    Success(WritebackStats),
    Fallback {
        primary_error: String,
        stats: WritebackStats,
    },
    Failed {
        primary_error: String,
        fallback_error: String,
    },
}

#[derive(Debug, Error)]
pub enum WritebackError {
    #[error("invalid config: {0}")]
    InvalidConfig(String),
    #[error("driver is not initialized: {0}")]
    DriverNotInitialized(String),
    #[error("unsupported target for {driver}: {target}")]
    UnsupportedTarget { driver: String, target: String },
    #[error("field write failed: {0}")]
    FieldWrite(String),
    #[error("clipboard error: {0}")]
    Clipboard(String),
    #[error("webdriver error: {0}")]
    WebDriver(String),
    #[error("windows automation error: {0}")]
    Windows(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}
