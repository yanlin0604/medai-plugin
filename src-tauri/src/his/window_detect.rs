use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::Mutex,
};

pub const CONTEXT_BRIDGE_ADDR: &str = "127.0.0.1:17860";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmrContext {
    pub source: String,
    pub patient_id: String,
    pub patient_name: String,
    pub doc_code: String,
    pub doc_name: String,
    pub url: Option<String>,
    pub confidence: f32,
    pub signals: Vec<String>,
    pub detected_at: String,
    pub received_at: String,
}

#[derive(Debug, Clone, Default)]
pub struct EmrContextState {
    latest: Arc<Mutex<Option<EmrContext>>>,
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

pub async fn start_context_bridge(state: EmrContextState) {
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
                let state = state.clone();
                tokio::spawn(async move {
                    if let Err(error) = handle_connection(stream, state).await {
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
    state: EmrContextState,
) -> Result<(), std::io::Error> {
    let mut buffer = [0_u8; 4096];
    let read = stream.read(&mut buffer).await?;
    let request = String::from_utf8_lossy(&buffer[..read]);
    let target = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/");

    if target.starts_with("/emr-context?") {
        if let Some(context) = parse_context_target(target) {
            state.set_latest(context).await;
            write_response(&mut stream, "204 No Content", "").await?;
        } else {
            write_response(&mut stream, "400 Bad Request", "invalid emr context").await?;
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

fn parse_context_target(target: &str) -> Option<EmrContext> {
    let query = target.split_once('?')?.1;
    let params = parse_query(query);
    Some(EmrContext {
        source: params
            .get("source")
            .cloned()
            .unwrap_or_else(|| "demo-bs".to_string()),
        patient_id: required(&params, "patientId")?,
        patient_name: required(&params, "patientName")?,
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

fn required(params: &HashMap<String, String>, key: &str) -> Option<String> {
    params
        .get(key)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
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
        "HTTP/1.1 {status}\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.as_bytes().len()
    );
    stream.write_all(response.as_bytes()).await
}
