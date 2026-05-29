use std::sync::Mutex;

pub struct AudioState {
    pub is_recording: Mutex<bool>,
    pub session_id: Mutex<Option<String>>,
}

impl Default for AudioState {
    fn default() -> Self {
        Self {
            is_recording: Mutex::new(false),
            session_id: Mutex::new(None),
        }
    }
}
