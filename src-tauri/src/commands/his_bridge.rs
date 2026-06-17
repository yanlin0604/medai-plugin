use crate::his::window_detect::{
    BsEditAssistContext, BsEditAssistState, DemoClinicalDataContext, DemoClinicalDataState,
    EmrContext, EmrContextState, FieldAssistContext, FieldAssistState,
};
use arboard::Clipboard;
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
    let mut clipboard = Clipboard::new().map_err(|error| format!("读取剪贴板失败：{error}"))?;
    clipboard
        .get_text()
        .map_err(|error| format!("读取剪贴板文本失败：{error}"))
}

#[tauri::command]
pub async fn set_clipboard_text(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|error| format!("打开剪贴板失败：{error}"))?;
    clipboard
        .set_text(text)
        .map_err(|error| format!("写入剪贴板失败：{error}"))
}

#[tauri::command]
pub async fn get_latest_emr_context(
    state: State<'_, EmrContextState>,
) -> Result<Option<EmrContext>, String> {
    Ok(state.get_latest().await)
}

#[tauri::command]
pub async fn clear_latest_emr_context(state: State<'_, EmrContextState>) -> Result<(), String> {
    state.clear_latest().await;
    Ok(())
}

#[tauri::command]
pub async fn get_latest_bs_edit_assist_context(
    state: State<'_, BsEditAssistState>,
) -> Result<Option<BsEditAssistContext>, String> {
    Ok(state.get_latest().await)
}

#[tauri::command]
pub async fn clear_latest_bs_edit_assist_context(
    state: State<'_, BsEditAssistState>,
) -> Result<(), String> {
    state.clear_latest().await;
    Ok(())
}

#[tauri::command]
pub async fn get_latest_field_assist_context(
    state: State<'_, FieldAssistState>,
) -> Result<Option<FieldAssistContext>, String> {
    Ok(state.get_latest().await)
}

#[tauri::command]
pub async fn clear_latest_field_assist_context(
    state: State<'_, FieldAssistState>,
) -> Result<(), String> {
    state.clear_latest().await;
    Ok(())
}

#[tauri::command]
pub async fn get_latest_demo_clinical_data(
    state: State<'_, DemoClinicalDataState>,
) -> Result<Option<DemoClinicalDataContext>, String> {
    Ok(state.get_latest().await)
}

#[tauri::command]
pub async fn clear_latest_demo_clinical_data(
    state: State<'_, DemoClinicalDataState>,
) -> Result<(), String> {
    state.clear_latest().await;
    Ok(())
}
