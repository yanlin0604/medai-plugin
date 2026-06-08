use crate::{
    mapper::FieldMapper,
    types::{
        DocumentPayload, DriverConfig, TargetInfo, WritebackError, WritebackResult, WritebackStats,
    },
    WritebackDriver,
};

pub struct WritebackScheduler {
    primary_driver: Box<dyn WritebackDriver>,
    fallback_driver: Box<dyn WritebackDriver>,
    mapper: FieldMapper,
    config: DriverConfig,
}

impl WritebackScheduler {
    pub fn new(
        primary_driver: Box<dyn WritebackDriver>,
        fallback_driver: Box<dyn WritebackDriver>,
        mapper: FieldMapper,
        config: DriverConfig,
    ) -> Self {
        Self {
            primary_driver,
            fallback_driver,
            mapper,
            config,
        }
    }

    pub async fn execute(
        &mut self,
        payload: &DocumentPayload,
        target: &TargetInfo,
    ) -> WritebackResult {
        let fields = self.mapper.map(payload);

        match run_driver(&mut self.primary_driver, &self.config, target, &fields).await {
            Ok(stats) => WritebackResult::Success(stats),
            Err(primary_error) => {
                let primary_error = primary_error.to_string();
                match run_driver(&mut self.fallback_driver, &self.config, target, &fields).await {
                    Ok(stats) => WritebackResult::Fallback {
                        primary_error,
                        stats,
                    },
                    Err(fallback_error) => WritebackResult::Failed {
                        primary_error,
                        fallback_error: fallback_error.to_string(),
                    },
                }
            }
        }
    }
}

async fn run_driver(
    driver: &mut Box<dyn WritebackDriver>,
    config: &DriverConfig,
    target: &TargetInfo,
    fields: &[(String, String)],
) -> Result<WritebackStats, WritebackError> {
    driver.init(config).await?;
    driver.locate_target(target).await?;
    let stats = driver.write_fields(fields).await?;
    driver.save().await?;
    driver.shutdown().await?;
    Ok(stats)
}
