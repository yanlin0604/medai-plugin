use serde::Serialize;

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
