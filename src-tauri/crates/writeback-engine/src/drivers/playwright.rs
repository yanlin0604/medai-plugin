use crate::{
    driver::WritebackDriver,
    types::{DriverConfig, TargetInfo, WritebackError},
};
use async_trait::async_trait;
use serde_json::json;
use std::time::Duration;
use thirtyfour::prelude::*;

pub struct PlaywrightDriver {
    driver: Option<WebDriver>,
    webdriver_url: String,
    timeout: Duration,
    save_selector: String,
    keep_browser_open: bool,
}

impl Default for PlaywrightDriver {
    fn default() -> Self {
        Self {
            driver: None,
            webdriver_url: "http://localhost:9515".to_string(),
            timeout: Duration::from_millis(10_000),
            save_selector: "#save-document,[data-action=\"save\"]".to_string(),
            keep_browser_open: true,
        }
    }
}

impl PlaywrightDriver {
    fn driver(&self) -> Result<&WebDriver, WritebackError> {
        self.driver
            .as_ref()
            .ok_or_else(|| WritebackError::DriverNotInitialized(self.name().to_string()))
    }
}

#[async_trait]
impl WritebackDriver for PlaywrightDriver {
    fn name(&self) -> &str {
        "playwright"
    }

    async fn init(&mut self, config: &DriverConfig) -> Result<(), WritebackError> {
        self.webdriver_url = config
            .webdriver_url
            .clone()
            .unwrap_or_else(|| "http://localhost:9515".to_string());
        self.timeout = Duration::from_millis(config.timeout_ms);
        self.save_selector = config
            .save_selector
            .clone()
            .unwrap_or_else(|| "#save-document,[data-action=\"save\"]".to_string());
        self.keep_browser_open = config.keep_browser_open;

        let mut capabilities = DesiredCapabilities::chrome();
        capabilities
            .add_arg("--start-maximized")
            .map_err(|error| WritebackError::WebDriver(error.to_string()))?;
        if config.headless {
            capabilities
                .add_arg("--headless=new")
                .map_err(|error| WritebackError::WebDriver(error.to_string()))?;
        }

        let driver = WebDriver::new(&self.webdriver_url, capabilities)
            .await
            .map_err(|error| WritebackError::WebDriver(error.to_string()))?;
        driver
            .set_implicit_wait_timeout(self.timeout)
            .await
            .map_err(|error| WritebackError::WebDriver(error.to_string()))?;
        if !config.headless {
            driver
                .maximize_window()
                .await
                .map_err(|error| WritebackError::WebDriver(error.to_string()))?;
        }
        self.driver = Some(driver);
        Ok(())
    }

    async fn locate_target(&mut self, target: &TargetInfo) -> Result<(), WritebackError> {
        match target {
            TargetInfo::Web { url } => self
                .driver()?
                .goto(url)
                .await
                .map_err(|error| WritebackError::WebDriver(error.to_string())),
            other => Err(WritebackError::UnsupportedTarget {
                driver: self.name().to_string(),
                target: format!("{other:?}"),
            }),
        }
    }

    async fn write_field(&mut self, field_key: &str, value: &str) -> Result<(), WritebackError> {
        let selector = format!(r#"[data-field="{}"]"#, field_key.replace('"', "\\\""));
        let script = r#"
            const selector = arguments[0];
            const value = arguments[1];
            const el = document.querySelector(selector);
            if (!el) {
              throw new Error(`field not found: ${selector}`);
            }
            const tag = el.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') {
              el.focus();
              el.value = value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              el.textContent = value;
            }
        "#;
        self.driver()?
            .execute(script, vec![json!(selector), json!(value)])
            .await
            .map_err(|error| WritebackError::WebDriver(error.to_string()))?;
        Ok(())
    }

    async fn save(&mut self) -> Result<(), WritebackError> {
        let script = r#"
            const button = document.querySelector(arguments[0]);
            if (!button) {
              throw new Error(`save button not found: ${arguments[0]}`);
            }
            button.click();
            const marker = document.getElementById('medai-writeback-marker') || document.createElement('div');
            marker.id = 'medai-writeback-marker';
            marker.textContent = `AI助手已回写并触发保存：${new Date().toLocaleString()}`;
            marker.style.cssText = [
              'position:sticky',
              'top:0',
              'z-index:9999',
              'padding:10px 14px',
              'background:#ECFDF5',
              'border:1px solid #10B981',
              'color:#065F46',
              'font-weight:700',
              'font-size:14px'
            ].join(';');
            document.body.prepend(marker);
        "#;
        self.driver()?
            .execute(script, vec![json!(self.save_selector.clone())])
            .await
            .map_err(|error| WritebackError::WebDriver(error.to_string()))?;
        Ok(())
    }

    async fn shutdown(&mut self) -> Result<(), WritebackError> {
        // 演示联调阶段默认保留 BS 浏览器窗口，便于医生确认字段已经写入。
        if self.keep_browser_open {
            if let Some(driver) = self.driver.take() {
                driver
                    .leak()
                    .map_err(|error| WritebackError::WebDriver(error.to_string()))?;
            }
            return Ok(());
        }

        if let Some(driver) = self.driver.take() {
            driver
                .quit()
                .await
                .map_err(|error| WritebackError::WebDriver(error.to_string()))?;
        }
        Ok(())
    }
}
