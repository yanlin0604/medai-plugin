use serde_json::{json, Map, Value};
use std::{fs, path::PathBuf};
use writeback_engine::{
    ClipboardDriver, DocumentPayload, DriverConfig, FieldMapper, PlaywrightDriver, PywinautoDriver,
    TargetInfo, WritebackDriver, WritebackResult, WritebackScheduler, WritebackStats,
};

#[tauri::command]
pub async fn writeback_to_bs(
    payload: DocumentPayload,
    url: String,
) -> Result<WritebackStats, String> {
    let mut scheduler = WritebackScheduler::new(
        Box::new(PlaywrightDriver::default()),
        Box::new(ClipboardDriver::default()),
        FieldMapper::identity(),
        DriverConfig::default(),
    );
    let stats = result_to_stats(
        scheduler
            .execute(&payload, &TargetInfo::Web { url: url.clone() })
            .await,
    )?;

    if stats.failed == 0 {
        persist_bs_writeback_inbox(&payload, &url)?;
    }

    Ok(stats)
}

#[tauri::command]
pub async fn writeback_to_cs(
    payload: DocumentPayload,
    window_title: String,
) -> Result<WritebackStats, String> {
    let mut scheduler = WritebackScheduler::new(
        Box::new(PywinautoDriver::default()),
        Box::new(ClipboardDriver::default()),
        FieldMapper::identity(),
        DriverConfig::default(),
    );
    result_to_stats(
        scheduler
            .execute(&payload, &TargetInfo::Desktop { window_title })
            .await,
    )
}

#[tauri::command]
pub async fn writeback_clipboard(payload: DocumentPayload) -> Result<WritebackStats, String> {
    let mapper = FieldMapper::identity();
    let fields = mapper.map(&payload);
    let mut driver = ClipboardDriver::default();
    driver
        .init(&DriverConfig::default())
        .await
        .map_err(|error| error.to_string())?;
    driver
        .locate_target(&TargetInfo::Clipboard)
        .await
        .map_err(|error| error.to_string())?;
    driver
        .write_fields(&fields)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn writeback_mock(payload: DocumentPayload) -> Result<WritebackStats, String> {
    let fields = FieldMapper::identity().map(&payload);
    let mut stats = WritebackStats::new(fields.len());

    for (field_key, value) in fields {
        log::info!(
            "模拟回写字段：doc_code={} patient_id={} field_key={} value_len={}",
            payload.doc_code,
            payload.patient_id,
            field_key,
            value.chars().count()
        );
        stats.add_success();
    }

    Ok(stats)
}

fn result_to_stats(result: WritebackResult) -> Result<WritebackStats, String> {
    match result {
        WritebackResult::Success(stats) => Ok(stats),
        WritebackResult::Fallback {
            primary_error,
            stats,
        } => {
            log::warn!("主回写驱动失败，已降级到剪贴板模式：{primary_error}");
            Ok(stats)
        }
        WritebackResult::Failed {
            primary_error,
            fallback_error,
        } => Err(format!(
            "主回写驱动失败：{primary_error}；降级驱动失败：{fallback_error}"
        )),
    }
}

fn persist_bs_writeback_inbox(payload: &DocumentPayload, url: &str) -> Result<(), String> {
    let bs_root =
        bs_root_from_file_url(url).ok_or_else(|| "无法从 BS URL 解析演示系统目录".to_string())?;
    let inbox_path = bs_root.join("js").join("writeback-inbox.js");
    let updated_at = chrono::Utc::now().to_rfc3339();

    let mut docs_by_code = Map::new();
    docs_by_code.insert(
        payload.doc_code.clone(),
        json!({
            "patientId": payload.patient_id,
            "docCode": payload.doc_code,
            "status": "saved",
            "fields": payload.fields,
            "updatedAt": updated_at,
        }),
    );

    let mut documents = Map::new();
    documents.insert(payload.patient_id.clone(), Value::Object(docs_by_code));

    let inbox = json!({
        "documents": documents,
        "updatedAt": updated_at,
    });
    let content = format!(
        "window.DemoMedicalWritebackInbox = {};\n",
        serde_json::to_string_pretty(&inbox).map_err(|error| error.to_string())?
    );

    fs::write(&inbox_path, content).map_err(|error| format!("写入 BS 回写 inbox 失败：{error}"))
}

fn bs_root_from_file_url(url: &str) -> Option<PathBuf> {
    let path_part = url.strip_prefix("file:///")?.split('?').next()?;
    let decoded = decode_file_url_path(path_part);
    let normalized = decoded.replace('/', &std::path::MAIN_SEPARATOR.to_string());
    let path = PathBuf::from(normalized);
    path.parent().map(PathBuf::from)
}

fn decode_file_url_path(value: &str) -> String {
    let mut bytes = Vec::with_capacity(value.len());
    let mut iter = value.as_bytes().iter().copied();

    while let Some(byte) = iter.next() {
        if byte == b'%' {
            let hi = iter.next();
            let lo = iter.next();
            if let (Some(hi), Some(lo)) = (hi, lo) {
                let hex = [hi, lo];
                if let Ok(hex) = std::str::from_utf8(&hex) {
                    if let Ok(decoded) = u8::from_str_radix(hex, 16) {
                        bytes.push(decoded);
                        continue;
                    }
                }
            }
            bytes.push(byte);
            if let Some(hi) = hi {
                bytes.push(hi);
            }
            if let Some(lo) = lo {
                bytes.push(lo);
            }
        } else {
            bytes.push(byte);
        }
    }

    String::from_utf8_lossy(&bytes).into_owned()
}
