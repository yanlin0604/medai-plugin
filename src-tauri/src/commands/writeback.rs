use serde_json::{json, Map, Value};
use std::{fs, path::PathBuf};
use writeback_engine::{DocumentPayload, FieldMapper, WritebackStats};

#[tauri::command]
pub async fn writeback_to_bs_inbox(
    payload: DocumentPayload,
    url: String,
    source: Option<String>,
) -> Result<WritebackStats, String> {
    let source = source.as_deref().unwrap_or("demo-bs");

    if source == "demo-cs" || url.starts_with("http://") || url.starts_with("https://") {
        // CS 端：写入固定路径
        persist_cs_writeback_inbox(&payload)?;
    } else {
        // BS 端：从 file:// URL 解析路径
        persist_bs_writeback_inbox(&payload, &url)?;
    }

    let fields = FieldMapper::identity().map(&payload);
    let mut stats = WritebackStats::new(fields.len());
    for _ in fields {
        stats.add_success();
    }
    Ok(stats)
}

fn persist_bs_writeback_inbox(payload: &DocumentPayload, url: &str) -> Result<(), String> {
    let bs_root =
        bs_root_from_file_url(url).ok_or_else(|| "无法从 BS URL 解析演示系统目录".to_string())?;
    let inbox_path = bs_root.join("js").join("writeback-inbox.js");
    write_writeback_inbox(&inbox_path, payload)
}

fn persist_cs_writeback_inbox(payload: &DocumentPayload) -> Result<(), String> {
    // CS 端：固定路径
    
    let cs_inbox = PathBuf::from("E:/2025-zl/demo-medical-system/cs/public/writeback-inbox.js");
    write_writeback_inbox(&cs_inbox, payload)
}

fn write_writeback_inbox(inbox_path: &PathBuf, payload: &DocumentPayload) -> Result<(), String> {
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

    fs::write(&inbox_path, content).map_err(|error| format!("写入回写 inbox 失败：{error}"))
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
