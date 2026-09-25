//! Hrana `/v2/pipeline` client for a shared libSQL (`sqld`) server.
//!
//! Speaks HTTP with the system libcurl. No libsql crate. A session keeps a
//! server baton across `BEGIN` … `COMMIT` so [`crate::db::Pool::transaction`]
//! stays one connection. Statements outside a transaction are a single
//! execute-and-close pipeline.

use std::ffi::{c_char, c_int, c_long, c_void, CString};
use std::sync::{Mutex, Once};

use crate::db::{Changes, DbError, Row, Value};
use crate::json::{self, Json};

const PIPELINE_PATH: &str = "/v2/pipeline";

/// One logical connection to a libSQL namespace.
pub struct Session {
    url: String,
    namespace: String,
    /// Stream token returned by the server while a transaction is open.
    baton: Mutex<Option<String>>,
    /// One curl handle per session, so libcurl keeps the TCP connection alive.
    curl: Mutex<Option<EasyHandle>>,
}

impl Session {
    /// `base_url` is the sqld HTTP origin, without a path.
    pub fn open(base_url: &str, namespace: &str) -> Session {
        let url = base_url.trim_end_matches('/').to_string() + PIPELINE_PATH;
        Session {
            url,
            namespace: namespace.to_string(),
            baton: Mutex::new(None),
            curl: Mutex::new(None),
        }
    }

    /// Run SQL that returns no rows the caller needs.
    pub fn exec(&self, sql: &str) -> Result<(), DbError> {
        self.execute(sql, &[])?;
        Ok(())
    }

    /// Run a parameterized read.
    pub fn query(&self, sql: &str, params: &[Value]) -> Result<Vec<Row>, DbError> {
        Ok(self.execute(sql, params)?.rows)
    }

    /// Run a parameterized write.
    pub fn run(&self, sql: &str, params: &[Value]) -> Result<Changes, DbError> {
        let outcome = self.execute(sql, params)?;
        Ok(Changes {
            changes: outcome.changes,
            last_insert_rowid: outcome.last_insert_rowid,
        })
    }

    fn execute(&self, sql: &str, params: &[Value]) -> Result<Outcome, DbError> {
        let kind = statement_kind(sql);
        let baton = self
            .baton
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone();
        let close = match kind {
            Kind::Begin => false,
            Kind::End => true,
            Kind::Stmt => baton.is_none(),
        };

        let body = pipeline_body(baton.as_deref(), sql, params, close);
        let response = self.post_json(&body).and_then(|raw| {
            json::parse(raw.as_bytes())
                .map_err(|e| DbError::remote(format!("hrana response was not JSON: {e}")))
        });
        let error = response.as_ref().ok().and_then(first_error);
        let next = next_baton(kind, close, response.as_ref().ok(), error.is_some());
        let opened = next.is_some();
        *self.baton.lock().unwrap_or_else(|p| p.into_inner()) = next;

        let parsed = response?;
        if let Some(err) = error {
            return Err(DbError::remote(err));
        }
        let outcome = first_execute(&parsed)?;
        if kind == Kind::Begin && !opened {
            return Err(DbError::remote(
                "hrana BEGIN did not return a baton".to_string(),
            ));
        }
        Ok(outcome)
    }

    fn post_json(&self, body: &str) -> Result<String, DbError> {
        let mut slot = self.curl.lock().unwrap_or_else(|p| p.into_inner());
        if slot.is_none() {
            global_init();
            // SAFETY: curl_easy_init returns a fresh handle or null.
            let handle = EasyHandle(unsafe { curl_easy_init() });
            if handle.0.is_null() {
                return Err(DbError::remote("curl_easy_init failed".to_string()));
            }
            *slot = Some(handle);
        }
        let handle = slot.as_ref().expect("curl handle set above");
        let result = post_json(handle, &self.url, &self.namespace, body);
        if result.is_err() {
            // A transport failure can leave the connection in any state.
            *slot = None;
        }
        result
    }
}

/// The baton to send with the next statement on this session.
///
/// The server hands out a new baton with every response and accepts each one
/// once. Keeping a used baton after an error made every later statement on the
/// pooled connection fail, including the `ROLLBACK`.
fn next_baton(kind: Kind, close: bool, response: Option<&Json>, failed: bool) -> Option<String> {
    if close || kind == Kind::End {
        return None;
    }
    if kind == Kind::Begin && failed {
        // No transaction opened; the server expires the idle stream.
        return None;
    }
    response?
        .as_obj()?
        .get("baton")?
        .as_str()
        .map(str::to_string)
}

impl Drop for Session {
    fn drop(&mut self) {
        let baton = self
            .baton
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .take();
        if let Some(baton) = baton {
            let body = json::stringify(&json::obj([
                ("baton", Json::Str(baton)),
                (
                    "requests",
                    Json::Arr(vec![Json::Obj(std::collections::BTreeMap::from([(
                        "type".into(),
                        json::s("close"),
                    )]))]),
                ),
            ]));
            let _ = self.post_json(&body);
        }
    }
}

struct Outcome {
    rows: Vec<Row>,
    changes: i64,
    last_insert_rowid: i64,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Begin,
    End,
    Stmt,
}

fn statement_kind(sql: &str) -> Kind {
    let trimmed = sql.trim_start();
    let head: String = trimmed
        .chars()
        .take(8)
        .collect::<String>()
        .to_ascii_uppercase();
    if head.starts_with("BEGIN") {
        Kind::Begin
    } else if head.starts_with("COMMIT") || head.starts_with("ROLLBACK") {
        Kind::End
    } else {
        Kind::Stmt
    }
}

fn pipeline_body(baton: Option<&str>, sql: &str, params: &[Value], close: bool) -> String {
    let mut requests = vec![Json::Obj(std::collections::BTreeMap::from([
        ("type".into(), json::s("execute")),
        (
            "stmt".into(),
            Json::Obj(std::collections::BTreeMap::from([
                ("sql".into(), json::s(sql)),
                ("args".into(), Json::Arr(params.iter().map(arg_json).collect())),
            ])),
        ),
    ]))];
    if close {
        requests.push(Json::Obj(std::collections::BTreeMap::from([(
            "type".into(),
            json::s("close"),
        )])));
    }
    json::stringify(&Json::Obj(std::collections::BTreeMap::from([
        (
            "baton".into(),
            baton.map(|b| Json::Str(b.to_string())).unwrap_or(Json::Null),
        ),
        ("requests".into(), Json::Arr(requests)),
    ])))
}

fn arg_json(value: &Value) -> Json {
    match value {
        Value::Null => json::obj([("type", json::s("null"))]),
        Value::Int(n) => json::obj([
            ("type", json::s("integer")),
            ("value", json::s(n.to_string())),
        ]),
        Value::Real(n) => json::obj([("type", json::s("float")), ("value", Json::Num(*n))]),
        Value::Text(s) => json::obj([("type", json::s("text")), ("value", json::s(s.clone()))]),
    }
}

fn first_error(doc: &Json) -> Option<String> {
    let results = doc.as_obj()?.get("results")?.as_arr()?;
    for item in results {
        let obj = item.as_obj()?;
        if obj.get("type").and_then(Json::as_str) == Some("error") {
            let message = obj
                .get("error")
                .and_then(Json::as_obj)
                .and_then(|e| e.get("message"))
                .and_then(Json::as_str)
                .unwrap_or("hrana error");
            return Some(message.to_string());
        }
    }
    None
}

fn first_execute(doc: &Json) -> Result<Outcome, DbError> {
    let results = doc
        .as_obj()
        .and_then(|o| o.get("results"))
        .and_then(Json::as_arr)
        .ok_or_else(|| DbError::remote("hrana response missing results".to_string()))?;
    for item in results {
        let Some(obj) = item.as_obj() else {
            continue;
        };
        if obj.get("type").and_then(Json::as_str) != Some("ok") {
            continue;
        }
        let Some(response) = obj.get("response").and_then(Json::as_obj) else {
            continue;
        };
        if response.get("type").and_then(Json::as_str) != Some("execute") {
            continue;
        }
        let result = response
            .get("result")
            .and_then(Json::as_obj)
            .ok_or_else(|| DbError::remote("hrana execute missing result".to_string()))?;
        let names = result
            .get("cols")
            .and_then(Json::as_arr)
            .map(|cols| {
                cols.iter()
                    .map(|c| {
                        c.as_obj()
                            .and_then(|o| o.get("name"))
                            .and_then(Json::as_str)
                            .unwrap_or("")
                            .to_string()
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let mut rows = Vec::new();
        if let Some(raw_rows) = result.get("rows").and_then(Json::as_arr) {
            for raw in raw_rows {
                let Some(cells_json) = raw.as_arr() else {
                    continue;
                };
                let cells = cells_json
                    .iter()
                    .enumerate()
                    .map(|(i, cell)| {
                        let name = names.get(i).cloned().unwrap_or_default();
                        (name, value_from_json(cell))
                    })
                    .collect();
                rows.push(Row::from_cells(cells));
            }
        }
        return Ok(Outcome {
            rows,
            changes: json_i64(result.get("affected_row_count")).unwrap_or(0),
            last_insert_rowid: json_i64(result.get("last_insert_rowid")).unwrap_or(0),
        });
    }
    Ok(Outcome {
        rows: Vec::new(),
        changes: 0,
        last_insert_rowid: 0,
    })
}

fn value_from_json(cell: &Json) -> Value {
    let Some(obj) = cell.as_obj() else {
        return Value::Null;
    };
    let kind = obj.get("type").and_then(Json::as_str).unwrap_or("null");
    match kind {
        "null" => Value::Null,
        "integer" => Value::Int(json_i64(obj.get("value")).unwrap_or(0)),
        "float" => Value::Real(obj.get("value").and_then(Json::as_f64).unwrap_or(0.0)),
        "text" => Value::Text(
            obj.get("value")
                .and_then(Json::as_str)
                .unwrap_or("")
                .to_string(),
        ),
        _ => Value::Null,
    }
}

fn json_i64(v: Option<&Json>) -> Option<i64> {
    match v? {
        Json::Num(n) => Some(*n as i64),
        Json::Str(s) => s.parse().ok(),
        _ => None,
    }
}

fn post_json(
    handle: &EasyHandle,
    url: &str,
    namespace: &str,
    body: &str,
) -> Result<String, DbError> {
    let response = http_post(
        handle,
        url,
        &[
            ("Content-Type", "application/json"),
            ("x-namespace", namespace),
        ],
        body.as_bytes(),
    )?;
    if response.status != 200 {
        let text = String::from_utf8_lossy(&response.body);
        return Err(DbError::remote(format!(
            "hrana HTTP {}: {}",
            response.status,
            text.chars().take(300).collect::<String>()
        )));
    }
    String::from_utf8(response.body)
        .map_err(|_| DbError::remote("hrana response was not UTF-8".to_string()))
}

// ==== HTTP OVER SYSTEM libcurl ====

struct HttpResponse {
    status: u16,
    body: Vec<u8>,
}

#[repr(C)]
struct CURL {
    _private: [u8; 0],
}

#[repr(C)]
struct CurlSlist {
    _private: [u8; 0],
}

type CurlCb = extern "C" fn(*mut c_char, usize, usize, *mut c_void) -> usize;

const CURL_GLOBAL_DEFAULT: c_long = 3;
const CURLE_OK: c_int = 0;
const CURLOPT_WRITEDATA: c_int = 10_001;
const CURLOPT_URL: c_int = 10_002;
const CURLOPT_POSTFIELDS: c_int = 10_015;
const CURLOPT_USERAGENT: c_int = 10_018;
const CURLOPT_HTTPHEADER: c_int = 10_023;
const CURLOPT_WRITEFUNCTION: c_int = 20_011;
const CURLOPT_POST: c_int = 47;
const CURLOPT_POSTFIELDSIZE: c_int = 60;
const CURLOPT_FOLLOWLOCATION: c_int = 52;
const CURLOPT_SSL_VERIFYPEER: c_int = 64;
const CURLOPT_SSL_VERIFYHOST: c_int = 81;
const CURLOPT_NOSIGNAL: c_int = 99;
const CURLOPT_TIMEOUT_MS: c_int = 155;
const CURLOPT_CONNECTTIMEOUT_MS: c_int = 156;
const CURLINFO_RESPONSE_CODE: c_int = 2_097_154;
const TIMEOUT_MS: c_long = 15_000;
const CONNECT_TIMEOUT_MS: c_long = 5_000;

#[link(name = "curl")]
extern "C" {
    fn curl_global_init(flags: c_long) -> c_int;
    fn curl_easy_init() -> *mut CURL;
    fn curl_easy_perform(handle: *mut CURL) -> c_int;
    fn curl_easy_cleanup(handle: *mut CURL);
    fn curl_easy_strerror(code: c_int) -> *const c_char;
    fn curl_slist_append(list: *mut CurlSlist, string: *const c_char) -> *mut CurlSlist;
    fn curl_slist_free_all(list: *mut CurlSlist);
    fn curl_easy_setopt(handle: *mut CURL, option: c_int, ...) -> c_int;
    fn curl_easy_getinfo(handle: *mut CURL, info: c_int, ...) -> c_int;
}

static CURL_INIT: Once = Once::new();

fn global_init() {
    CURL_INIT.call_once(|| {
        // SAFETY: once before any easy handle in this module. stripe.rs has its
        // own Once; both run curl_global_init, which is safe when not overlapping.
        unsafe {
            curl_global_init(CURL_GLOBAL_DEFAULT);
        }
    });
}

extern "C" fn write_cb(ptr: *mut c_char, size: usize, nmemb: usize, userdata: *mut c_void) -> usize {
    let len = size.saturating_mul(nmemb);
    if ptr.is_null() || userdata.is_null() {
        return 0;
    }
    let result = std::panic::catch_unwind(|| {
        // SAFETY: libcurl owns `ptr` for this callback and `userdata` is the
        // Vec passed to CURLOPT_WRITEDATA, which outlives perform.
        unsafe {
            let sink = &mut *(userdata as *mut Vec<u8>);
            sink.extend_from_slice(std::slice::from_raw_parts(ptr as *const u8, len));
        }
        len
    });
    result.unwrap_or(0)
}

struct EasyHandle(*mut CURL);

// SAFETY: libcurl allows an easy handle on any thread as long as two threads
// never use it at once. Session keeps it behind a Mutex.
unsafe impl Send for EasyHandle {}

impl Drop for EasyHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // SAFETY: handle from curl_easy_init, freed once.
            unsafe { curl_easy_cleanup(self.0) };
        }
    }
}

struct HeaderList(*mut CurlSlist);

impl Drop for HeaderList {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // SAFETY: list head from curl_slist_append, freed once.
            unsafe { curl_slist_free_all(self.0) };
        }
    }
}

fn http_post(
    handle: &EasyHandle,
    url: &str,
    headers: &[(&str, &str)],
    body: &[u8],
) -> Result<HttpResponse, DbError> {
    let c_url = CString::new(url).map_err(|_| DbError::remote("url has a NUL byte".to_string()))?;
    let user_agent = CString::new("skateboard-backend (libcurl)")
        .map_err(|_| DbError::remote("bad user agent".to_string()))?;

    let mut list = HeaderList(std::ptr::null_mut());
    for (name, value) in headers {
        let line = CString::new(format!("{name}: {value}"))
            .map_err(|_| DbError::remote("header has a NUL byte".to_string()))?;
        // SAFETY: list is null or a previous head; `line` is copied by libcurl.
        let next = unsafe { curl_slist_append(list.0, line.as_ptr()) };
        if next.is_null() {
            return Err(DbError::remote("curl_slist_append failed".to_string()));
        }
        list.0 = next;
    }

    let mut sink: Vec<u8> = Vec::new();
    // SAFETY: options match libcurl's documented argument widths. Pointers
    // outlive curl_easy_perform.
    let setup = unsafe {
        let h = handle.0;
        let mut rc = curl_easy_setopt(h, CURLOPT_URL, c_url.as_ptr().cast::<c_void>());
        rc |= curl_easy_setopt(h, CURLOPT_USERAGENT, user_agent.as_ptr().cast::<c_void>());
        rc |= curl_easy_setopt(h, CURLOPT_WRITEFUNCTION, write_cb as CurlCb);
        rc |= curl_easy_setopt(h, CURLOPT_WRITEDATA, (&mut sink as *mut Vec<u8>).cast::<c_void>());
        rc |= curl_easy_setopt(h, CURLOPT_TIMEOUT_MS, TIMEOUT_MS);
        rc |= curl_easy_setopt(h, CURLOPT_CONNECTTIMEOUT_MS, CONNECT_TIMEOUT_MS);
        rc |= curl_easy_setopt(h, CURLOPT_FOLLOWLOCATION, 0 as c_long);
        rc |= curl_easy_setopt(h, CURLOPT_NOSIGNAL, 1 as c_long);
        rc |= curl_easy_setopt(h, CURLOPT_SSL_VERIFYPEER, 1 as c_long);
        rc |= curl_easy_setopt(h, CURLOPT_SSL_VERIFYHOST, 2 as c_long);
        rc |= curl_easy_setopt(h, CURLOPT_HTTPHEADER, list.0);
        rc |= curl_easy_setopt(h, CURLOPT_POST, 1 as c_long);
        rc |= curl_easy_setopt(h, CURLOPT_POSTFIELDSIZE, body.len() as c_long);
        rc |= curl_easy_setopt(h, CURLOPT_POSTFIELDS, body.as_ptr().cast::<c_void>());
        rc
    };
    if setup != CURLE_OK {
        return Err(DbError::remote(
            "failed to configure curl handle".to_string(),
        ));
    }

    // SAFETY: handle is configured; buffers above stay alive through perform.
    let rc = unsafe { curl_easy_perform(handle.0) };
    // The handle outlives this call. Drop its pointers to the header list,
    // body, and sink before they are freed. Every call sets them again.
    // SAFETY: null is a valid value for all three options.
    unsafe {
        curl_easy_setopt(handle.0, CURLOPT_HTTPHEADER, std::ptr::null_mut::<CurlSlist>());
        curl_easy_setopt(handle.0, CURLOPT_WRITEDATA, std::ptr::null_mut::<c_void>());
        curl_easy_setopt(handle.0, CURLOPT_POSTFIELDS, std::ptr::null::<c_void>());
    }
    if rc != CURLE_OK {
        let text = unsafe {
            let p = curl_easy_strerror(rc);
            if p.is_null() {
                format!("curl error {rc}")
            } else {
                std::ffi::CStr::from_ptr(p)
                    .to_str()
                    .unwrap_or("curl error")
                    .to_string()
            }
        };
        return Err(DbError::remote(text));
    }

    let mut status: c_long = 0;
    // SAFETY: CURLINFO_RESPONSE_CODE writes a long.
    let rc =
        unsafe { curl_easy_getinfo(handle.0, CURLINFO_RESPONSE_CODE, &mut status as *mut c_long) };
    if rc != CURLE_OK {
        return Err(DbError::remote(
            "could not read response status".to_string(),
        ));
    }
    Ok(HttpResponse {
        status: status.clamp(0, u16::MAX as c_long) as u16,
        body: sink,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_execute_rows_and_errors() {
        let doc = json::parse(
            br#"{"baton":null,"results":[{"type":"ok","response":{"type":"execute","result":{"cols":[{"name":"title"}],"rows":[[{"type":"text","value":"Steak"}]],"affected_row_count":0,"last_insert_rowid":null}}}]}"#,
        )
        .unwrap();
        let outcome = first_execute(&doc).unwrap();
        assert_eq!(outcome.rows[0].text("title"), Some("Steak"));
        assert!(first_error(&json::parse(
            br#"{"results":[{"type":"error","error":{"message":"UNIQUE constraint failed: Users.email"}}]}"#
        )
        .unwrap())
        .unwrap()
        .contains("UNIQUE constraint failed"));
    }

    fn doc(text: &str) -> Json {
        json::parse(text.as_bytes()).unwrap()
    }

    #[test]
    fn an_error_inside_a_transaction_keeps_the_new_baton() {
        let res = doc(r#"{"baton":"b2","results":[{"type":"error","error":{"message":"UNIQUE"}}]}"#);
        assert_eq!(next_baton(Kind::Stmt, false, Some(&res), true).as_deref(), Some("b2"));
    }

    #[test]
    fn a_failed_request_drops_the_baton() {
        assert_eq!(next_baton(Kind::Stmt, false, None, false), None);
        assert_eq!(next_baton(Kind::Begin, false, None, false), None);
    }

    #[test]
    fn commit_and_rollback_always_drop_the_baton() {
        let res = doc(r#"{"baton":"b3","results":[]}"#);
        assert_eq!(next_baton(Kind::End, true, Some(&res), false), None);
        assert_eq!(next_baton(Kind::End, true, Some(&res), true), None);
        assert_eq!(next_baton(Kind::End, true, None, false), None);
    }

    #[test]
    fn a_failed_begin_opens_nothing() {
        let res = doc(r#"{"baton":"b4","results":[{"type":"error","error":{"message":"busy"}}]}"#);
        assert_eq!(next_baton(Kind::Begin, false, Some(&res), true), None);
        let ok = doc(r#"{"baton":"b5","results":[]}"#);
        assert_eq!(next_baton(Kind::Begin, false, Some(&ok), false).as_deref(), Some("b5"));
    }

    /// A sqld stand-in that accepts each baton once, like the real server.
    /// Any statement containing `FAIL` returns an error result.
    fn fake_sqld() -> String {
        use std::io::{BufRead, BufReader, Read, Write};
        use std::net::TcpListener;
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let live: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
        let seq = Arc::new(AtomicUsize::new(0));
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(stream) = stream else { continue };
                let live = Arc::clone(&live);
                let seq = Arc::clone(&seq);
                std::thread::spawn(move || {
                    let mut reader = BufReader::new(stream.try_clone().unwrap());
                    let mut out = stream;
                    loop {
                        let mut len = 0usize;
                        let mut line = String::new();
                        loop {
                            line.clear();
                            if reader.read_line(&mut line).unwrap_or(0) == 0 {
                                return;
                            }
                            if line == "\r\n" {
                                break;
                            }
                            if let Some(v) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                                len = v.trim().parse().unwrap_or(0);
                            }
                        }
                        let mut body = vec![0u8; len];
                        reader.read_exact(&mut body).unwrap();
                        let req = json::parse(&body).unwrap();
                        let sent = req.get_str("baton").map(str::to_string);
                        let mut slot = live.lock().unwrap();
                        let (status, reply) = if sent.is_some() && sent != *slot {
                            (400, r#"{"error":"stream not found"}"#.to_string())
                        } else {
                            let reqs = req.get("requests").and_then(Json::as_arr).unwrap();
                            let closing = reqs.iter().any(|r| r.get_str("type") == Some("close"));
                            let sql = reqs[0].path("stmt.sql").and_then(|v| v.as_str()).unwrap_or("");
                            let result = if sql.contains("FAIL") {
                                r#"{"type":"error","error":{"message":"constraint failed"}}"#.to_string()
                            } else {
                                r#"{"type":"ok","response":{"type":"execute","result":{"cols":[],"rows":[],"affected_row_count":0,"last_insert_rowid":null}}}"#.to_string()
                            };
                            let baton = if closing {
                                *slot = None;
                                "null".to_string()
                            } else {
                                let next = format!("b{}", seq.fetch_add(1, Ordering::Relaxed));
                                *slot = Some(next.clone());
                                format!("\"{next}\"")
                            };
                            (200, format!(r#"{{"baton":{baton},"results":[{result}]}}"#))
                        };
                        drop(slot);
                        let head = format!(
                            "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
                            reply.len()
                        );
                        if out.write_all(head.as_bytes()).is_err() || out.write_all(reply.as_bytes()).is_err() {
                            return;
                        }
                    }
                });
            }
        });
        format!("http://{addr}")
    }

    #[test]
    fn a_failed_statement_in_a_transaction_does_not_poison_the_session() {
        let session = Session::open(&fake_sqld(), "T");
        session.exec("BEGIN IMMEDIATE").expect("begin");
        assert!(session.run("INSERT FAIL", &[]).is_err());
        session.exec("ROLLBACK").expect("rollback uses the fresh baton");
        session.query("SELECT 1", &[]).expect("session still works");
        session.exec("BEGIN IMMEDIATE").expect("a second transaction opens");
        session.exec("COMMIT").expect("commit");
        session.query("SELECT 2", &[]).expect("and after it");
    }

    #[test]
    fn a_statement_outside_a_transaction_closes_its_stream() {
        let res = doc(r#"{"baton":"b6","results":[]}"#);
        assert_eq!(next_baton(Kind::Stmt, true, Some(&res), false), None);
    }
}
