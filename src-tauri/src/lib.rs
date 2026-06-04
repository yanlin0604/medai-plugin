use tauri::Manager;

mod commands;
mod audio;
mod his;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // 初始化日志
            utils::logger::init();
            log::info!("AI智能病历书写助手启动");

            // 初始化音频状态
            let audio_state = audio::recorder::AudioState::default();
            app.manage(audio_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 录音控制命令
            commands::audio::start_audio_recording,
            commands::audio::pause_audio_recording,
            commands::audio::resume_audio_recording,
            commands::audio::stop_audio_recording,
            commands::audio::get_audio_devices,
            // 文件操作命令
            commands::file_ops::export_document,
            commands::file_ops::save_audio_local,
            commands::file_ops::read_local_cache,
            // HIS联动命令
            commands::his_bridge::detect_his_window,
            commands::his_bridge::get_clipboard_text,
            commands::his_bridge::set_clipboard_text,
            // 系统命令
            commands::system_tray::get_system_info,
        ])
        .run(tauri::generate_context!())
        .expect("AI智能病历书写助手启动失败");
}
