use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::{
    header::HeaderMap,
    multipart::{Form, Part},
    Method,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Instant;

const RUNTIME_PROXY_BASE: &str = "http://47.113.122.118:9118/medai-admin";
const RUNTIME_PROXY_RELATIVE_PREFIX: &str = "/medai-admin";
const ALLOWED_RUNTIME_PROXY_BASES: [&str; 3] = [
    RUNTIME_PROXY_BASE,
    "http://192.168.1.88:8001",
    "http://192.168.1.88:19000",
];

#[derive(Deserialize)]
pub struct RuntimeProxyRequest {
    method: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<Value>,
}

#[derive(Serialize)]
pub struct RuntimeProxyResponse {
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
    data: Value,
}

#[derive(Serialize)]
pub struct RuntimeBinaryResponse {
    status: u16,
    status_text: String,
    content_type: String,
    data_base64: String,
}

#[derive(Deserialize)]
pub struct RuntimeMultipartRequest {
    method: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    field_name: String,
    file_name: String,
    mime_type: Option<String>,
    body: Vec<u8>,
}

#[derive(Deserialize)]
pub struct RuntimeBinaryRequest {
    url: String,
    headers: Option<HashMap<String, String>>,
}

#[tauri::command]
pub async fn runtime_http_request(
    request: RuntimeProxyRequest,
) -> Result<RuntimeProxyResponse, String> {
    let url = resolve_runtime_url(&request.url)?;
    let method = parse_method(&request.method)?;
    let started_at = Instant::now();
    log::info!("[runtime_proxy] -> {} {}", method, url);

    let client = reqwest::Client::builder()
        .user_agent("medai-plugin/1.0")
        .build()
        .map_err(|error| format!("runtime proxy client build failed: {error}"))?;
    let mut builder = client.request(method.clone(), url.clone());

    if let Some(headers) = request.headers {
        builder = builder.headers(build_headers(headers)?);
    }

    if let Some(body) = request.body {
        builder = builder.json(&body);
    }

    let response = match builder.send().await {
        Ok(response) => response,
        Err(error) => {
            log::warn!(
                "[runtime_proxy] !! {} {} failed after {}ms: {}",
                method,
                url,
                started_at.elapsed().as_millis(),
                error
            );
            return Err(format!("runtime proxy request failed: {error}"));
        }
    };

    read_runtime_response(response, &method, &url, started_at).await
}

#[tauri::command]
pub async fn runtime_multipart_request(
    request: RuntimeMultipartRequest,
) -> Result<RuntimeProxyResponse, String> {
    let url = resolve_runtime_url(&request.url)?;
    let method = parse_method(&request.method)?;
    let started_at = Instant::now();
    log::info!("[runtime_proxy] -> {} {} (multipart)", method, url);

    let client = reqwest::Client::builder()
        .user_agent("medai-plugin/1.0")
        .build()
        .map_err(|error| format!("runtime proxy client build failed: {error}"))?;
    let mut builder = client.request(method.clone(), url.clone());

    if let Some(headers) = request.headers {
        builder = builder.headers(build_headers(headers)?);
    }

    let mut part = Part::bytes(request.body).file_name(request.file_name);
    if let Some(mime_type) = request.mime_type.filter(|value| !value.trim().is_empty()) {
        part = part
            .mime_str(&mime_type)
            .map_err(|error| format!("invalid multipart mime type: {error}"))?;
    }
    let form = Form::new().part(request.field_name, part);
    let response = match builder.multipart(form).send().await {
        Ok(response) => response,
        Err(error) => {
            log::warn!(
                "[runtime_proxy] !! {} {} multipart failed after {}ms: {}",
                method,
                url,
                started_at.elapsed().as_millis(),
                error
            );
            return Err(format!("runtime proxy request failed: {error}"));
        }
    };

    read_runtime_response(response, &method, &url, started_at).await
}

#[tauri::command]
pub async fn runtime_binary_request(
    request: RuntimeBinaryRequest,
) -> Result<RuntimeBinaryResponse, String> {
    let url = resolve_runtime_url(&request.url)?;
    let started_at = Instant::now();
    log::info!("[runtime_proxy] -> GET {} (binary)", url);

    let client = reqwest::Client::builder()
        .user_agent("medai-plugin/1.0")
        .build()
        .map_err(|error| format!("runtime proxy client build failed: {error}"))?;
    let mut builder = client.get(url.clone());

    if let Some(headers) = request.headers {
        builder = builder.headers(build_headers(headers)?);
    }

    let response = match builder.send().await {
        Ok(response) => response,
        Err(error) => {
            log::warn!(
                "[runtime_proxy] !! GET {} binary failed after {}ms: {}",
                url,
                started_at.elapsed().as_millis(),
                error
            );
            return Err(format!("runtime proxy request failed: {error}"));
        }
    };

    let status = response.status();
    let status_text = status.canonical_reason().unwrap_or("").to_string();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("runtime proxy binary response read failed: {error}"))?;

    log::info!(
        "[runtime_proxy] <- GET {} {} {}ms (binary)",
        url,
        status.as_u16(),
        started_at.elapsed().as_millis()
    );

    Ok(RuntimeBinaryResponse {
        status: status.as_u16(),
        status_text,
        content_type,
        data_base64: STANDARD.encode(bytes),
    })
}

async fn read_runtime_response(
    response: reqwest::Response,
    method: &Method,
    url: &str,
    started_at: Instant,
) -> Result<RuntimeProxyResponse, String> {
    let status = response.status();
    let status_text = status.canonical_reason().unwrap_or("").to_string();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|text| (name.as_str().to_string(), text.to_string()))
        })
        .collect();
    let text = match response.text().await {
        Ok(text) => text,
        Err(error) => {
            log::warn!(
                "[runtime_proxy] !! {} {} response read failed after {}ms: {}",
                method,
                url,
                started_at.elapsed().as_millis(),
                error
            );
            return Err(format!("runtime proxy response read failed: {error}"));
        }
    };
    let data = if text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(&text).unwrap_or(Value::String(text))
    };

    log::info!(
        "[runtime_proxy] <- {} {} {} {}ms",
        method,
        url,
        status.as_u16(),
        started_at.elapsed().as_millis()
    );

    Ok(RuntimeProxyResponse {
        status: status.as_u16(),
        status_text,
        headers,
        data,
    })
}

fn resolve_runtime_url(input: &str) -> Result<String, String> {
    if ALLOWED_RUNTIME_PROXY_BASES
        .iter()
        .any(|base| is_url_under_base(input, base))
    {
        return Ok(input.to_string());
    }

    if input == RUNTIME_PROXY_RELATIVE_PREFIX
        || input.starts_with(&format!("{}/", RUNTIME_PROXY_RELATIVE_PREFIX))
        || input.starts_with(&format!("{}?", RUNTIME_PROXY_RELATIVE_PREFIX))
    {
        return Ok(format!(
            "{}{}",
            RUNTIME_PROXY_BASE.trim_end_matches(RUNTIME_PROXY_RELATIVE_PREFIX),
            input
        ));
    }

    Err("runtime proxy target is not allowed".to_string())
}

fn is_url_under_base(input: &str, base: &str) -> bool {
    input == base
        || input.starts_with(&format!("{}/", base))
        || input.starts_with(&format!("{}?", base))
}

fn parse_method(method: &str) -> Result<Method, String> {
    match method.to_ascii_uppercase().as_str() {
        "GET" => Ok(Method::GET),
        "POST" => Ok(Method::POST),
        "PUT" => Ok(Method::PUT),
        "PATCH" => Ok(Method::PATCH),
        "DELETE" => Ok(Method::DELETE),
        _ => Err("runtime proxy method is not allowed".to_string()),
    }
}

fn build_headers(headers: HashMap<String, String>) -> Result<HeaderMap, String> {
    let mut output = HeaderMap::new();

    for (name, value) in headers {
        let lower_name = name.to_ascii_lowercase();
        if matches!(
            lower_name.as_str(),
            "host" | "origin" | "referer" | "content-length" | "access-control-allow-origin"
        ) {
            continue;
        }

        let header_name = reqwest::header::HeaderName::from_bytes(name.as_bytes())
            .map_err(|error| format!("invalid request header name: {error}"))?;
        let header_value = reqwest::header::HeaderValue::from_str(&value)
            .map_err(|error| format!("invalid request header value: {error}"))?;
        output.insert(header_name, header_value);
    }

    Ok(output)
}
