#[tauri::command]
pub async fn export_document(
    content: String,
    format: String,
    path: String,
) -> Result<String, String> {
    log::info!("导出文档: format={}, path={}", format, path);
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(path)
}

#[tauri::command]
pub async fn save_audio_local(data: Vec<u8>, filename: String) -> Result<String, String> {
    let path = std::env::temp_dir().join(&filename);
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn read_local_cache(key: String) -> Result<Option<String>, String> {
    log::info!("读取本地缓存: key={}", key);
    Ok(None)
}
