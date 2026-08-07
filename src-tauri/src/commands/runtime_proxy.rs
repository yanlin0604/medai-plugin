use reqwest::{header::HeaderMap, Method};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Instant;

const RUNTIME_PROXY_BASE: &str = "http://47.113.122.118:9118/medai-admin";
const RUNTIME_PROXY_RELATIVE_PREFIX: &str = "/medai-admin";
const ALLOWED_RUNTIME_PROXY_BASES: [&str; 2] = [
    RUNTIME_PROXY_BASE,
    "http://192.168.1.88:8080",
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

#[tauri::command]
pub async fn runtime_http_request(
    request: RuntimeProxyRequest,
) -> Result<RuntimeProxyResponse, String> {
    let url = resolve_runtime_url(&request.url)?;
    let method = parse_method(&request.method)?;
    let started_at = Instant::now();
    log::info!("[runtime_proxy] -> {} {}", method, url);

    let client = reqwest::Client::new();
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
    input == base || input.starts_with(&format!("{}/", base)) || input.starts_with(&format!("{}?", base))
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
