//! HTTP client for the 3itter JSON API. Keeps the instance's session cookies itself, so the app
//! signs in exactly like the website does (HttpOnly session cookie, X-3itter-Client: android).

use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::Duration;

pub struct Api {
    agent: ureq::Agent,
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    base: String,
    cookies: BTreeMap<String, String>,
}

#[derive(Debug)]
pub struct ApiError {
    pub status: u16,
    pub message: String,
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

pub type ApiResult = Result<Value, ApiError>;

fn net_error(e: impl std::fmt::Display) -> ApiError {
    ApiError { status: 0, message: format!("Can’t reach the server ({e})") }
}

impl Api {
    pub fn new() -> Self {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .http_status_as_error(false)
            .timeout_global(Some(Duration::from_secs(25)))
            .user_agent(concat!("Mozilla/5.0 (Linux; Android) 3itter-native/", env!("CARGO_PKG_VERSION")))
            .build()
            .into();
        Api { agent, inner: Mutex::new(Inner::default()) }
    }

    pub fn set_base(&self, base: &str, cookies: BTreeMap<String, String>) {
        let mut i = self.inner.lock().unwrap();
        i.base = base.trim_end_matches('/').to_string();
        i.cookies = cookies;
    }

    pub fn base(&self) -> String {
        self.inner.lock().unwrap().base.clone()
    }

    pub fn cookies(&self) -> BTreeMap<String, String> {
        self.inner.lock().unwrap().cookies.clone()
    }

    pub fn clear_cookies(&self) {
        self.inner.lock().unwrap().cookies.clear();
    }

    /// Absolute URL for a path the server returned (uploads are relative: "/uploads/…").
    pub fn abs(&self, path: &str) -> String {
        if path.starts_with("http://") || path.starts_with("https://") || path.is_empty() {
            path.to_string()
        } else {
            format!("{}{}", self.base(), if path.starts_with('/') { path.to_string() } else { format!("/{path}") })
        }
    }

    fn cookie_header(&self) -> String {
        let i = self.inner.lock().unwrap();
        i.cookies.iter().map(|(k, v)| format!("{k}={v}")).collect::<Vec<_>>().join("; ")
    }

    fn remember_cookies(&self, resp: &ureq::http::Response<ureq::Body>) {
        let mut i = self.inner.lock().unwrap();
        for h in resp.headers().get_all("set-cookie") {
            let Ok(raw) = h.to_str() else { continue };
            let mut parts = raw.split(';');
            let Some((name, value)) = parts.next().and_then(|p| p.split_once('=')) else { continue };
            let expired = parts.any(|p| {
                let p = p.trim().to_ascii_lowercase();
                p == "max-age=0" || p.starts_with("expires=thu, 01 jan 1970")
            });
            if expired || value.is_empty() {
                i.cookies.remove(name.trim());
            } else {
                i.cookies.insert(name.trim().to_string(), value.trim().to_string());
            }
        }
    }

    /// Call `/api{path}`. Errors carry the server's message ("Wrong handle or password.").
    pub fn call(&self, method: &str, path: &str, body: Option<Value>) -> ApiResult {
        let url = format!("{}/api{}", self.base(), path);
        self.call_url(method, &url, body)
    }

    pub fn call_url(&self, method: &str, url: &str, body: Option<Value>) -> ApiResult {
        let cookie = self.cookie_header();
        let result = match method {
            "GET" | "DELETE" => {
                let mut r = if method == "GET" { self.agent.get(url) } else { self.agent.delete(url) };
                r = r.header("X-3itter-Client", "android").header("Accept", "application/json");
                if !cookie.is_empty() {
                    r = r.header("Cookie", &cookie);
                }
                r.call()
            }
            _ => {
                let mut r = match method {
                    "PATCH" => self.agent.patch(url),
                    "PUT" => self.agent.put(url),
                    _ => self.agent.post(url),
                };
                r = r.header("X-3itter-Client", "android").header("Accept", "application/json");
                if !cookie.is_empty() {
                    r = r.header("Cookie", &cookie);
                }
                r.send_json(body.unwrap_or_else(|| json!({})))
            }
        };
        let mut resp = result.map_err(net_error)?;
        self.remember_cookies(&resp);
        let status = resp.status().as_u16();
        let text = resp.body_mut().with_config().limit(8 * 1024 * 1024).read_to_string().map_err(net_error)?;
        let value: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        if status >= 400 {
            let message = value.get("error").and_then(Value::as_str).map(str::to_string)
                .unwrap_or_else(|| format!("Request failed ({status})"));
            return Err(ApiError { status, message });
        }
        Ok(value)
    }

    /// Follow the instance's Server-Sent Events stream (/api/stream). Calls `on_event(event, data)` for
    /// each event until the connection ends (the server or a 2-minute cap closes it; callers reconnect).
    pub fn stream(&self, mut on_event: impl FnMut(&str, &str) -> bool) -> Result<(), ApiError> {
        use std::io::BufRead;
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .http_status_as_error(false)
            .timeout_connect(Some(Duration::from_secs(15)))
            .timeout_recv_response(Some(Duration::from_secs(20)))
            .timeout_recv_body(Some(Duration::from_secs(120)))
            .user_agent(concat!("Mozilla/5.0 (Linux; Android) 3itter-native/", env!("CARGO_PKG_VERSION")))
            .build()
            .into();
        let url = format!("{}/api/stream", self.base());
        let mut req = agent.get(&url).header("X-3itter-Client", "android").header("Accept", "text/event-stream");
        let cookie = self.cookie_header();
        if !cookie.is_empty() {
            req = req.header("Cookie", &cookie);
        }
        let resp = req.call().map_err(net_error)?;
        let status = resp.status().as_u16();
        if status >= 400 {
            return Err(ApiError { status, message: format!("HTTP {status}") });
        }
        let reader = std::io::BufReader::new(resp.into_body().into_reader());
        let (mut event, mut data) = (String::new(), String::new());
        for line in reader.lines() {
            let Ok(line) = line else { break };
            if line.is_empty() {
                if !data.is_empty() && !on_event(if event.is_empty() { "message" } else { &event }, &data) {
                    return Ok(());
                }
                event.clear();
                data.clear();
            } else if let Some(v) = line.strip_prefix("event:") {
                event = v.trim().to_string();
            } else if let Some(v) = line.strip_prefix("data:") {
                if !data.is_empty() { data.push('\n'); }
                data.push_str(v.trim_start());
            }
        }
        Ok(())
    }

    /// Raw bytes (images, the shared translation table).
    pub fn bytes(&self, url: &str, limit: u64) -> Result<Vec<u8>, ApiError> {
        let mut resp = self.agent.get(url).header("X-3itter-Client", "android").call().map_err(net_error)?;
        let status = resp.status().as_u16();
        if status >= 400 {
            return Err(ApiError { status, message: format!("HTTP {status}") });
        }
        resp.body_mut().with_config().limit(limit).read_to_vec().map_err(net_error)
    }
}

/// Small helpers for reading loosely-typed JSON.
pub trait J {
    fn s(&self, key: &str) -> String;
    fn i(&self, key: &str) -> i64;
    fn b(&self, key: &str) -> bool;
}

impl J for Value {
    fn s(&self, key: &str) -> String {
        match self.get(key) {
            Some(Value::String(s)) => s.clone(),
            Some(Value::Number(n)) => n.to_string(),
            _ => String::new(),
        }
    }
    fn i(&self, key: &str) -> i64 {
        self.get(key).and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64))).unwrap_or(0)
    }
    fn b(&self, key: &str) -> bool {
        self.get(key).and_then(Value::as_bool).unwrap_or(false)
    }
}
