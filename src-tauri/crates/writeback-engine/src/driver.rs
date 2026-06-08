use crate::types::{DriverConfig, FieldError, TargetInfo, WritebackError, WritebackStats};
use async_trait::async_trait;

#[async_trait]
pub trait WritebackDriver: Send + Sync {
    fn name(&self) -> &str;

    async fn init(&mut self, config: &DriverConfig) -> Result<(), WritebackError>;

    async fn locate_target(&mut self, target: &TargetInfo) -> Result<(), WritebackError>;

    async fn write_field(&mut self, field_key: &str, value: &str) -> Result<(), WritebackError>;

    async fn write_fields(
        &mut self,
        fields: &[(String, String)],
    ) -> Result<WritebackStats, WritebackError> {
        let mut stats = WritebackStats::new(fields.len());
        for (field_key, value) in fields {
            match self.write_field(field_key, value).await {
                Ok(()) => stats.add_success(),
                Err(error) => {
                    stats.failed += 1;
                    stats.errors.push(FieldError {
                        field_key: field_key.clone(),
                        message: error.to_string(),
                    });
                }
            }
        }
        Ok(stats)
    }

    async fn save(&mut self) -> Result<(), WritebackError>;

    async fn shutdown(&mut self) -> Result<(), WritebackError>;
}
