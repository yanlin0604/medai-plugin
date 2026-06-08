use crate::{
    driver::WritebackDriver,
    drivers::clipboard::ClipboardDriver,
    types::{DriverConfig, TargetInfo, WritebackError, WritebackStats},
};
use async_trait::async_trait;

pub struct PywinautoDriver {
    clipboard: ClipboardDriver,
    window_title: Option<String>,
}

impl Default for PywinautoDriver {
    fn default() -> Self {
        Self {
            clipboard: ClipboardDriver::default(),
            window_title: None,
        }
    }
}

#[async_trait]
impl WritebackDriver for PywinautoDriver {
    fn name(&self) -> &str {
        "pywinauto"
    }

    async fn init(&mut self, config: &DriverConfig) -> Result<(), WritebackError> {
        self.clipboard.init(config).await
    }

    async fn locate_target(&mut self, target: &TargetInfo) -> Result<(), WritebackError> {
        match target {
            TargetInfo::Desktop { window_title } => {
                activate_window(window_title)?;
                self.window_title = Some(window_title.clone());
                Ok(())
            }
            other => Err(WritebackError::UnsupportedTarget {
                driver: self.name().to_string(),
                target: format!("{other:?}"),
            }),
        }
    }

    async fn write_field(&mut self, field_key: &str, value: &str) -> Result<(), WritebackError> {
        tracing::info!(
            field_key,
            window_title = ?self.window_title,
            "desktop field lookup falls back to ordered clipboard write"
        );
        self.clipboard.write_field(field_key, value).await
    }

    async fn write_fields(
        &mut self,
        fields: &[(String, String)],
    ) -> Result<WritebackStats, WritebackError> {
        self.clipboard.write_fields(fields).await
    }

    async fn save(&mut self) -> Result<(), WritebackError> {
        Ok(())
    }

    async fn shutdown(&mut self) -> Result<(), WritebackError> {
        self.clipboard.shutdown().await
    }
}

#[cfg(windows)]
fn activate_window(title: &str) -> Result<(), WritebackError> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::WindowsAndMessaging::{FindWindowW, SetForegroundWindow};

    let title_wide: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
    let hwnd = unsafe { FindWindowW(PCWSTR::null(), PCWSTR(title_wide.as_ptr())) }
        .map_err(|error| WritebackError::Windows(error.to_string()))?;
    if hwnd.0.is_null() {
        return Err(WritebackError::Windows(format!(
            "window not found: {title}"
        )));
    }
    let ok = unsafe { SetForegroundWindow(hwnd) };
    if !ok.as_bool() {
        return Err(WritebackError::Windows(format!(
            "failed to activate window: {title}"
        )));
    }
    Ok(())
}

#[cfg(not(windows))]
fn activate_window(title: &str) -> Result<(), WritebackError> {
    Err(WritebackError::Windows(format!(
        "desktop writeback requires Windows: {title}"
    )))
}
