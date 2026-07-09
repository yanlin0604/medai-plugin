use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, sync::Arc};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::Mutex,
};

pub const CONTEXT_BRIDGE_ADDR: &str = "127.0.0.1:17860";
const REQUEST_BUFFER_BYTES: usize = 128 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmrContext {
    pub source: String,
    pub patient_id: String,
    pub patient_id_his: Option<String>,
    pub inpatient_no: Option<String>,
    pub patient_name: String,
    pub gender: Option<String>,
    pub age: Option<String>,
    pub bed_no: Option<String>,
    pub dept_name: Option<String>,
    pub admission_date: Option<String>,
    pub admission_days: Option<u32>,
    pub doctor: Option<String>,
    pub diagnosis: Option<String>,
    pub doc_code: String,
    pub doc_name: String,
    pub url: Option<String>,
    pub confidence: f32,
    pub signals: Vec<String>,
    pub detected_at: String,
    pub received_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BsEditAssistContext {
    pub source: String,
    pub patient_id: String,
    pub patient_name: String,
    pub doc_code: String,
    pub doc_name: String,
    pub field_key: String,
    pub field_label: String,
    #[serde(default)]
    pub parent_field_key: Option<String>,
    #[serde(default)]
    pub composition_item_key: Option<String>,
    #[serde(default)]
    pub composition_item_label: Option<String>,
    pub field_value: String,
    pub selected_text: String,
    pub prefix: String,
    pub selection_start: usize,
    pub selection_end: usize,
    pub trigger: String,
    pub detected_at: String,
    pub received_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldAssistContext {
    pub source: String,
    pub patient_id: String,
    pub patient_name: String,
    pub doc_code: String,
    pub doc_name: String,
    pub field_key: String,
    pub field_label: String,
    #[serde(default)]
    pub parent_field_key: Option<String>,
    #[serde(default)]
    pub composition_item_key: Option<String>,
    #[serde(default)]
    pub composition_item_label: Option<String>,
    #[serde(default)]
    pub doctor_code: Option<String>,
    #[serde(default)]
    pub doctor_name: Option<String>,
    #[serde(default)]
    pub dept_code: Option<String>,
    #[serde(default)]
    pub hospital_code: Option<String>,
    #[serde(default)]
    pub client_id: Option<String>,
    pub field_value: String,
    pub selected_text: String,
    pub prefix: String,
    pub selection_start: usize,
    pub selection_end: usize,
    pub trigger: String,
    pub session_id: String,
    pub writeback_url: String,
    #[serde(default)]
    pub truncated: bool,
    pub detected_at: String,
    #[serde(default)]
    pub received_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoClinicalDataContext {
    pub source: String,
    pub patient_id: String,
    pub patient_name: String,
    pub doc_code: String,
    pub data: Value,
    pub updated_at: String,
    #[serde(default)]
    pub received_at: String,
}

#[derive(Debug, Clone, Default)]
pub struct EmrContextState {
    latest: Arc<Mutex<Option<EmrContext>>>,
}

#[derive(Debug, Clone, Default)]
pub struct BsEditAssistState {
    latest: Arc<Mutex<Option<BsEditAssistContext>>>,
}

#[derive(Debug, Clone, Default)]
pub struct FieldAssistState {
    latest: Arc<Mutex<Option<FieldAssistContext>>>,
}

#[derive(Debug, Clone, Default)]
pub struct DemoClinicalDataState {
    latest: Arc<Mutex<Option<DemoClinicalDataContext>>>,
}

impl EmrContextState {
    pub async fn get_latest(&self) -> Option<EmrContext> {
        self.latest.lock().await.clone()
    }

    pub async fn set_latest(&self, context: EmrContext) {
        *self.latest.lock().await = Some(context);
    }

    pub async fn clear_latest(&self) {
        *self.latest.lock().await = None;
    }
}

impl BsEditAssistState {
    pub async fn get_latest(&self) -> Option<BsEditAssistContext> {
        self.latest.lock().await.clone()
    }

    pub async fn set_latest(&self, context: BsEditAssistContext) {
        *self.latest.lock().await = Some(context);
    }

    pub async fn clear_latest(&self) {
        *self.latest.lock().await = None;
    }
}

impl FieldAssistState {
    pub async fn get_latest(&self) -> Option<FieldAssistContext> {
        self.latest.lock().await.clone()
    }

    pub async fn set_latest(&self, context: FieldAssistContext) {
        *self.latest.lock().await = Some(context);
    }

    pub async fn clear_latest(&self) {
        *self.latest.lock().await = None;
    }
}

impl DemoClinicalDataState {
    pub async fn get_latest(&self) -> Option<DemoClinicalDataContext> {
        self.latest.lock().await.clone()
    }

    pub async fn set_latest(&self, context: DemoClinicalDataContext) {
        *self.latest.lock().await = Some(context);
    }

    pub async fn clear_latest(&self) {
        *self.latest.lock().await = None;
    }
}

pub async fn start_context_bridge(
    emr_state: EmrContextState,
    edit_assist_state: BsEditAssistState,
    field_assist_state: FieldAssistState,
    demo_clinical_data_state: DemoClinicalDataState,
) {
    let listener = match TcpListener::bind(CONTEXT_BRIDGE_ADDR).await {
        Ok(listener) => listener,
        Err(error) => {
            log::warn!("EMR 上下文桥接启动失败：{error}");
            return;
        }
    };

    log::info!("EMR 上下文桥接已监听 {CONTEXT_BRIDGE_ADDR}");

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                let emr_state = emr_state.clone();
                let edit_assist_state = edit_assist_state.clone();
                let field_assist_state = field_assist_state.clone();
                let demo_clinical_data_state = demo_clinical_data_state.clone();
                tokio::spawn(async move {
                    if let Err(error) = handle_connection(
                        stream,
                        emr_state,
                        edit_assist_state,
                        field_assist_state,
                        demo_clinical_data_state,
                    )
                    .await
                    {
                        log::debug!("EMR 上下文桥接请求处理失败：{error}");
                    }
                });
            }
            Err(error) => log::warn!("EMR 上下文桥接接收连接失败：{error}"),
        }
    }
}

async fn handle_connection(
    mut stream: TcpStream,
    emr_state: EmrContextState,
    edit_assist_state: BsEditAssistState,
    field_assist_state: FieldAssistState,
    demo_clinical_data_state: DemoClinicalDataState,
) -> Result<(), std::io::Error> {
    let request = read_http_request(&mut stream).await?;
    let target = request.target.as_str();

    if request.method == "OPTIONS" {
        write_response(&mut stream, "204 No Content", "").await?;
        return Ok(());
    }

    if target.starts_with("/emr-context?") {
        if let Some(context) = parse_context_target(target) {
            emr_state.set_latest(context).await;
            write_response(&mut stream, "204 No Content", "").await?;
        } else {
            write_response(&mut stream, "400 Bad Request", "invalid emr context").await?;
        }
        return Ok(());
    }

    if target.starts_with("/bs-edit-assist?") {
        if let Some(context) = parse_edit_assist_target(target) {
            edit_assist_state.set_latest(context).await;
            write_response(&mut stream, "204 No Content", "").await?;
        } else {
            write_response(
                &mut stream,
                "400 Bad Request",
                "invalid edit assist context",
            )
            .await?;
        }
        return Ok(());
    }

    if target.starts_with("/bs-edit-assist-clear") {
        edit_assist_state.clear_latest().await;
        write_response(&mut stream, "204 No Content", "").await?;
        return Ok(());
    }

    if target == "/field-context" && request.method == "POST" {
        if let Some(context) = parse_field_context_body(&request.body) {
            field_assist_state.set_latest(context).await;
            write_response(&mut stream, "204 No Content", "").await?;
        } else {
            write_response(&mut stream, "400 Bad Request", "invalid field context").await?;
        }
        return Ok(());
    }

    if target.starts_with("/field-context-clear") {
        field_assist_state.clear_latest().await;
        write_response(&mut stream, "204 No Content", "").await?;
        return Ok(());
    }

    if target == "/demo-clinical-data" && request.method == "POST" {
        if let Some(context) = parse_demo_clinical_data_body(&request.body) {
            demo_clinical_data_state.set_latest(context).await;
            write_response(&mut stream, "204 No Content", "").await?;
        } else {
            write_response(
                &mut stream,
                "400 Bad Request",
                "invalid demo clinical data",
            )
            .await?;
        }
        return Ok(());
    }

    if target == "/health" {
        write_response(&mut stream, "200 OK", "ok").await?;
    } else {
        write_response(&mut stream, "404 Not Found", "not found").await?;
    }

    Ok(())
}

struct HttpRequest {
    method: String,
    target: String,
    body: String,
}

async fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, std::io::Error> {
    let mut buffer = Vec::with_capacity(REQUEST_BUFFER_BYTES);
    let mut chunk = [0_u8; 4096];

    loop {
        let read = stream.read(&mut chunk).await?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.len() > REQUEST_BUFFER_BYTES {
            break;
        }

        if let Some(header_end) = find_header_end(&buffer) {
            let header_text = String::from_utf8_lossy(&buffer[..header_end]);
            let content_length = content_length(&header_text).unwrap_or(0);
            let expected_len = header_end + 4 + content_length;
            if content_length == 0 || buffer.len() >= expected_len {
                break;
            }
        }
    }

    let header_end = find_header_end(&buffer).unwrap_or(buffer.len());
    let header_text = String::from_utf8_lossy(&buffer[..header_end]);
    let mut first_line = header_text.lines().next().unwrap_or("").split_whitespace();
    let method = first_line.next().unwrap_or("GET").to_string();
    let target = first_line.next().unwrap_or("/").to_string();
    let content_length = content_length(&header_text).unwrap_or(0);
    let body_start = header_end.saturating_add(4);
    let body_end = std::cmp::min(body_start.saturating_add(content_length), buffer.len());
    let body = if body_start <= buffer.len() {
        String::from_utf8_lossy(&buffer[body_start..body_end]).into_owned()
    } else {
        String::new()
    };

    Ok(HttpRequest {
        method,
        target,
        body,
    })
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

fn content_length(headers: &str) -> Option<usize> {
    headers.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.eq_ignore_ascii_case("content-length") {
            value.trim().parse::<usize>().ok()
        } else {
            None
        }
    })
}

fn parse_context_target(target: &str) -> Option<EmrContext> {
    let query = target.split_once('?')?.1;
    let params = parse_query(query);
    Some(EmrContext {
        source: params
            .get("source")
            .cloned()
            .unwrap_or_else(|| "demo-bs".to_string()),
        patient_id: required(&params, "patientId")?,
        patient_id_his: optional(&params, "patientIdHis"),
        inpatient_no: optional(&params, "inpatientNo"),
        patient_name: required(&params, "patientName")?,
        gender: optional(&params, "gender"),
        age: optional(&params, "age"),
        bed_no: optional(&params, "bedNo"),
        dept_name: optional(&params, "deptName"),
        admission_date: optional(&params, "admissionDate"),
        admission_days: params
            .get("admissionDays")
            .and_then(|value| value.parse::<u32>().ok()),
        doctor: optional(&params, "doctor"),
        diagnosis: optional(&params, "diagnosis"),
        doc_code: required(&params, "docCode")?,
        doc_name: required(&params, "docName")?,
        url: params.get("url").cloned(),
        confidence: params
            .get("confidence")
            .and_then(|value| value.parse::<f32>().ok())
            .unwrap_or(0.0),
        signals: params
            .get("signals")
            .map(|value| {
                value
                    .split(',')
                    .filter(|signal| !signal.trim().is_empty())
                    .map(|signal| signal.trim().to_string())
                    .collect()
            })
            .unwrap_or_default(),
        detected_at: params
            .get("detectedAt")
            .cloned()
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
        received_at: chrono::Utc::now().to_rfc3339(),
    })
}

fn parse_edit_assist_target(target: &str) -> Option<BsEditAssistContext> {
    let query = target.split_once('?')?.1;
    let params = parse_query(query);
    Some(BsEditAssistContext {
        source: params
            .get("source")
            .cloned()
            .unwrap_or_else(|| "demo-bs".to_string()),
        patient_id: required(&params, "patientId")?,
        patient_name: required(&params, "patientName")?,
        doc_code: required(&params, "docCode")?,
        doc_name: required(&params, "docName")?,
        field_key: required(&params, "fieldKey")?,
        field_label: required(&params, "fieldLabel")?,
        parent_field_key: optional(&params, "parentFieldKey"),
        composition_item_key: optional(&params, "compositionItemKey"),
        composition_item_label: optional(&params, "compositionItemLabel"),
        field_value: params.get("fieldValue").cloned().unwrap_or_default(),
        selected_text: params.get("selectedText").cloned().unwrap_or_default(),
        prefix: params.get("prefix").cloned().unwrap_or_default(),
        selection_start: parse_usize(&params, "selectionStart"),
        selection_end: parse_usize(&params, "selectionEnd"),
        trigger: params
            .get("trigger")
            .cloned()
            .unwrap_or_else(|| "focus".to_string()),
        detected_at: params
            .get("detectedAt")
            .cloned()
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
        received_at: chrono::Utc::now().to_rfc3339(),
    })
}

fn parse_demo_clinical_data_body(body: &str) -> Option<DemoClinicalDataContext> {
    let mut context: DemoClinicalDataContext = serde_json::from_str(body).ok()?;
    if context.patient_id.trim().is_empty()
        || context.patient_name.trim().is_empty()
        || context.doc_code.trim().is_empty()
    {
        return None;
    }
    if context.source.trim().is_empty() {
        context.source = "demo-bs".to_string();
    }
    context.received_at = chrono::Utc::now().to_rfc3339();
    Some(context)
}

fn parse_field_context_body(body: &str) -> Option<FieldAssistContext> {
    let mut context: FieldAssistContext = serde_json::from_str(body).ok()?;
    if context.patient_id.trim().is_empty()
        || context.patient_name.trim().is_empty()
        || context.doc_code.trim().is_empty()
        || context.doc_name.trim().is_empty()
        || context.field_key.trim().is_empty()
        || context.field_label.trim().is_empty()
        || context.session_id.trim().is_empty()
    {
        return None;
    }
    if context.source.trim().is_empty() {
        context.source = "demo-cs".to_string();
    }
    context.received_at = chrono::Utc::now().to_rfc3339();
    Some(context)
}

fn required(params: &HashMap<String, String>, key: &str) -> Option<String> {
    params
        .get(key)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn optional(params: &HashMap<String, String>, key: &str) -> Option<String> {
    params
        .get(key)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn parse_usize(params: &HashMap<String, String>, key: &str) -> usize {
    params
        .get(key)
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0)
}

fn parse_query(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            Some((decode_query_value(key), decode_query_value(value)))
        })
        .collect()
}

fn decode_query_value(value: &str) -> String {
    let mut bytes = Vec::with_capacity(value.len());
    let mut iter = value.as_bytes().iter().copied();

    while let Some(byte) = iter.next() {
        if byte == b'%' {
            let hi = iter.next();
            let lo = iter.next();
            if let (Some(hi), Some(lo)) = (hi, lo) {
                if let Ok(hex) = std::str::from_utf8(&[hi, lo]) {
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
        } else if byte == b'+' {
            bytes.push(b' ');
        } else {
            bytes.push(byte);
        }
    }

    String::from_utf8_lossy(&bytes).into_owned()
}

async fn write_response(
    stream: &mut TcpStream,
    status: &str,
    body: &str,
) -> Result<(), std::io::Error> {
    let response = format!(
        "HTTP/1.1 {status}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.as_bytes().len()
    );
    stream.write_all(response.as_bytes()).await
}
