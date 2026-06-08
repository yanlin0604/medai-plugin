use crate::audio::recorder::AudioState;
use tauri::State;

#[tauri::command]
pub async fn start_audio_recording(
    round_task_id: String,
    state: State<'_, AudioState>,
) -> Result<String, String> {
    let session_id = uuid::Uuid::new_v4().to_string();
    log::info!(
        "开始录音: round_task_id={}, session={}",
        round_task_id,
        session_id
    );
    // TODO: 初始化CPAL录音流
    Ok(session_id)
}

#[tauri::command]
pub async fn pause_audio_recording(state: State<'_, AudioState>) -> Result<(), String> {
    log::info!("暂停录音");
    Ok(())
}

#[tauri::command]
pub async fn resume_audio_recording(state: State<'_, AudioState>) -> Result<(), String> {
    log::info!("恢复录音");
    Ok(())
}

#[tauri::command]
pub async fn stop_audio_recording(state: State<'_, AudioState>) -> Result<String, String> {
    log::info!("停止录音");
    Ok("".to_string())
}

use cpal::traits::{DeviceTrait, HostTrait};

#[tauri::command]
pub async fn get_audio_devices() -> Result<Vec<String>, String> {
    let host = cpal::default_host();
    let devices: Vec<String> = host
        .input_devices()
        .map(|mut iter| {
            iter.filter_map(|d: cpal::Device| d.name().ok())
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();
    Ok(devices)
}
