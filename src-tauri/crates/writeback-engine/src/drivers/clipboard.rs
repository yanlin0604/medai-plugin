use crate::{
    driver::WritebackDriver,
    types::{DriverConfig, TargetInfo, WritebackError, WritebackStats},
};
use arboard::Clipboard;
use async_trait::async_trait;
use std::{sync::Arc, time::Duration};
use tokio::time::sleep;

type ProgressCallback = Arc<dyn Fn(usize, usize, &str) + Send + Sync>;

pub struct ClipboardDriver {
    delay: Duration,
    on_progress: Option<ProgressCallback>,
}

impl Default for ClipboardDriver {
    fn default() -> Self {
        Self {
            delay: Duration::from_millis(800),
            on_progress: None,
        }
    }
}

impl ClipboardDriver {
    pub fn with_progress<F>(mut self, callback: F) -> Self
    where
        F: Fn(usize, usize, &str) + Send + Sync + 'static,
    {
        self.on_progress = Some(Arc::new(callback));
        self
    }

    fn set_text(&self, value: &str) -> Result<(), WritebackError> {
        let mut clipboard =
            Clipboard::new().map_err(|error| WritebackError::Clipboard(error.to_string()))?;
        clipboard
            .set_text(value.to_string())
            .map_err(|error| WritebackError::Clipboard(error.to_string()))
    }
}

#[async_trait]
impl WritebackDriver for ClipboardDriver {
    fn name(&self) -> &str {
        "clipboard"
    }

    async fn init(&mut self, config: &DriverConfig) -> Result<(), WritebackError> {
        self.delay = Duration::from_millis(config.step_delay_ms);
        Ok(())
    }

    async fn locate_target(&mut self, _target: &TargetInfo) -> Result<(), WritebackError> {
        Ok(())
    }

    async fn write_field(&mut self, field_key: &str, value: &str) -> Result<(), WritebackError> {
        tracing::info!(field_key, "copying field value to clipboard");
        self.set_text(value)
    }

    async fn write_fields(
        &mut self,
        fields: &[(String, String)],
    ) -> Result<WritebackStats, WritebackError> {
        let mut stats = WritebackStats::new(fields.len());
        for (index, (field_key, value)) in fields.iter().enumerate() {
            if let Some(callback) = &self.on_progress {
                callback(index + 1, fields.len(), field_key);
            }
            match self.write_field(field_key, value).await {
                Ok(()) => stats.add_success(),
                Err(error) => stats.add_error(field_key, error.to_string()),
            }
            if index + 1 < fields.len() {
                sleep(self.delay).await;
            }
        }
        Ok(stats)
    }

    async fn save(&mut self) -> Result<(), WritebackError> {
        Ok(())
    }

    async fn shutdown(&mut self) -> Result<(), WritebackError> {
        Ok(())
    }
}
