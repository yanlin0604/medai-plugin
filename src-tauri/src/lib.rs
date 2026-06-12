use tauri::Manager;

mod audio;
mod commands;
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

            let emr_context_state = his::window_detect::EmrContextState::default();
            app.manage(emr_context_state.clone());
            let edit_assist_state = his::window_detect::BsEditAssistState::default();
            app.manage(edit_assist_state.clone());
            let demo_clinical_data_state = his::window_detect::DemoClinicalDataState::default();
            app.manage(demo_clinical_data_state.clone());
            tauri::async_runtime::spawn(his::window_detect::start_context_bridge(
                emr_context_state,
                edit_assist_state,
                demo_clinical_data_state,
            ));

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
            commands::his_bridge::get_latest_emr_context,
            commands::his_bridge::clear_latest_emr_context,
            commands::his_bridge::get_latest_bs_edit_assist_context,
            commands::his_bridge::clear_latest_bs_edit_assist_context,
            commands::his_bridge::get_latest_demo_clinical_data,
            commands::his_bridge::clear_latest_demo_clinical_data,
            commands::writeback::writeback_to_bs_inbox,
            // 系统命令
            commands::system_tray::get_system_info,
        ])
        .run(tauri::generate_context!())
        .expect("AI智能病历书写助手启动失败");
}
