use crate::his::window_detect::{EmrContext, EmrContextState};
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct HisWindowInfo {
    pub title: String,
    pub process_name: String,
    pub patient_id: Option<String>,
    pub patient_name: Option<String>,
}

#[tauri::command]
pub async fn detect_his_window() -> Result<Option<HisWindowInfo>, String> {
    // TODO: 实现Windows窗口检测逻辑
    log::info!("检测HIS窗口");
    Ok(None)
}

#[tauri::command]
pub async fn get_clipboard_text() -> Result<String, String> {
    // TODO: 实现剪贴板读取
    Ok(String::new())
}

#[tauri::command]
pub async fn set_clipboard_text(text: String) -> Result<(), String> {
    // TODO: 实现剪贴板写入
    log::info!("设置剪贴板内容");
    Ok(())
}

#[tauri::command]
pub async fn get_latest_emr_context(
    state: State<'_, EmrContextState>,
) -> Result<Option<EmrContext>, String> {
    Ok(state.get_latest().await)
}

#[tauri::command]
pub async fn clear_latest_emr_context(
    state: State<'_, EmrContextState>,
) -> Result<(), String> {
    state.clear_latest().await;
    Ok(())
}
