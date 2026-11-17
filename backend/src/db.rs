use std::ffi::{c_char, c_int, CStr, CString};
use std::path::Path;
use std::sync::{Condvar, Mutex, MutexGuard};

mod ffi {
    use std::ffi::{c_char, c_double, c_int, c_void};

    #[repr(C)]
    pub struct Sqlite3 {
        _private: [u8; 0],
    }

    #[repr(C)]
    pub struct Sqlite3Stmt {
        _private: [u8; 0],
    }

    pub type Destructor = Option<unsafe extern "C" fn(*mut c_void)>;

    pub type ExecCallback = Option<
        unsafe extern "C" fn(*mut c_void, c_int, *mut *mut c_char, *mut *mut c_char) -> c_int,
    >;

    pub const SQLITE_ERROR: c_int = 1;
    pub const SQLITE_OK: c_int = 0;
    pub const SQLITE_ROW: c_int = 100;
    pub const SQLITE_DONE: c_int = 101;
    pub const SQLITE_MISUSE: c_int = 21;

    pub const SQLITE_OPEN_READWRITE: c_int = 0x0000_0002;
    pub const SQLITE_OPEN_CREATE: c_int = 0x0000_0004;
    pub const SQLITE_OPEN_FULLMUTEX: c_int = 0x0001_0000;

    pub const SQLITE_INTEGER: c_int = 1;
    pub const SQLITE_FLOAT: c_int = 2;
    pub const SQLITE_NULL: c_int = 5;

    /// `SQLITE_TRANSIENT` — tells SQLite to copy the bound buffer immediately.
    ///
    /// Defined in `sqlite3.h` as `((sqlite3_destructor_type)-1)`. Binding text
    /// with `SQLITE_STATIC` instead would hand SQLite a pointer into a Rust
    /// `String` that may be dropped before `sqlite3_step` runs — a
    /// use-after-free. This is the whole reason the constant exists here.
    pub fn transient() -> Destructor {
        // SAFETY: transmuting the sentinel integer -1 into the destructor
        // function-pointer slot is exactly what the C macro does; both are
        // pointer-sized, and SQLite compares the value rather than calling it.
        unsafe { std::mem::transmute::<isize, Destructor>(-1isize) }
    }

    #[link(name = "sqlite3")]
    unsafe extern "C" {
        pub fn sqlite3_open_v2(
            filename: *const c_char,
            pp_db: *mut *mut Sqlite3,
            flags: c_int,
            z_vfs: *const c_char,
        ) -> c_int;
        pub fn sqlite3_close_v2(db: *mut Sqlite3) -> c_int;
        pub fn sqlite3_exec(
            db: *mut Sqlite3,
            sql: *const c_char,
            callback: ExecCallback,
            arg: *mut c_void,
            errmsg: *mut *mut c_char,
        ) -> c_int;
        pub fn sqlite3_prepare_v2(
            db: *mut Sqlite3,
            sql: *const c_char,
            n_byte: c_int,
            pp_stmt: *mut *mut Sqlite3Stmt,
            pz_tail: *mut *const c_char,
        ) -> c_int;
        pub fn sqlite3_bind_text(
            stmt: *mut Sqlite3Stmt,
            idx: c_int,
            value: *const c_char,
            n_byte: c_int,
            destructor: Destructor,
        ) -> c_int;
        pub fn sqlite3_bind_int64(stmt: *mut Sqlite3Stmt, idx: c_int, value: i64) -> c_int;
        pub fn sqlite3_bind_double(stmt: *mut Sqlite3Stmt, idx: c_int, value: c_double) -> c_int;
        pub fn sqlite3_bind_null(stmt: *mut Sqlite3Stmt, idx: c_int) -> c_int;
        pub fn sqlite3_step(stmt: *mut Sqlite3Stmt) -> c_int;
        pub fn sqlite3_column_count(stmt: *mut Sqlite3Stmt) -> c_int;
        pub fn sqlite3_column_name(stmt: *mut Sqlite3Stmt, idx: c_int) -> *const c_char;
        pub fn sqlite3_column_type(stmt: *mut Sqlite3Stmt, idx: c_int) -> c_int;
        pub fn sqlite3_column_text(stmt: *mut Sqlite3Stmt, idx: c_int) -> *const u8;
        pub fn sqlite3_column_bytes(stmt: *mut Sqlite3Stmt, idx: c_int) -> c_int;
        pub fn sqlite3_column_int64(stmt: *mut Sqlite3Stmt, idx: c_int) -> i64;
        pub fn sqlite3_column_double(stmt: *mut Sqlite3Stmt, idx: c_int) -> c_double;
        pub fn sqlite3_finalize(stmt: *mut Sqlite3Stmt) -> c_int;
        pub fn sqlite3_changes(db: *mut Sqlite3) -> c_int;
        pub fn sqlite3_last_insert_rowid(db: *mut Sqlite3) -> i64;
        pub fn sqlite3_errmsg(db: *mut Sqlite3) -> *const c_char;
        pub fn sqlite3_extended_errcode(db: *mut Sqlite3) -> c_int;
        pub fn sqlite3_busy_timeout(db: *mut Sqlite3, ms: c_int) -> c_int;
        pub fn sqlite3_threadsafe() -> c_int;
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DbError {
    pub code: i32,
    pub message: String,
}

impl std::fmt::Display for DbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "sqlite error {}: {}", self.code, self.message)
    }
}

impl std::error::Error for DbError {}

impl DbError {
    pub(crate) fn local(message: impl Into<String>) -> DbError {
        DbError {
            code: ffi::SQLITE_MISUSE,
            message: message.into(),
        }
    }

    pub(crate) fn remote(message: impl Into<String>) -> DbError {
        DbError {
            code: ffi::SQLITE_ERROR,
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Int(i64),
    Real(f64),
    Text(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Row {
    cells: Vec<(String, Value)>,
}

impl Row {
    pub(crate) fn from_cells(cells: Vec<(String, Value)>) -> Row {
        Row { cells }
    }

    pub fn get(&self, col: &str) -> Option<&Value> {
        self.cells
            .iter()
            .find(|(name, _)| name == col)
            .map(|(_, value)| value)
    }

    pub fn text(&self, col: &str) -> Option<&str> {
        match self.get(col) {
            Some(Value::Text(s)) => Some(s),
            _ => None,
        }
    }

    pub fn int(&self, col: &str) -> Option<i64> {
        match self.get(col) {
            Some(Value::Int(v)) => Some(*v),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Changes {
    pub changes: i64,
    pub last_insert_rowid: i64,
}

enum Store {
    Local(*mut ffi::Sqlite3),
    Remote(crate::hrana::Session),
}

pub struct Db {
    store: Store,
}

// SAFETY: the handle is opened with SQLITE_OPEN_FULLMUTEX, so libsqlite3
// serializes every call on it internally. Moving it to another thread is
// therefore sound. `Sync` is deliberately NOT implemented: sharing `&Db` across
// threads would let two threads interleave `sqlite3_step` on the same statement.
unsafe impl Send for Db {}

impl Drop for Db {
    fn drop(&mut self) {
        // SAFETY: `handle` came from a successful sqlite3_open_v2 and has not
        // been closed before (Drop runs once). sqlite3_close_v2 tolerates
        // outstanding statements, and this type finalizes every statement it
        // prepares before returning, so none are outstanding.
        if let Store::Local(handle) = &self.store {
            unsafe {
                ffi::sqlite3_close_v2(*handle);
            }
        }
    }
}

struct Stmt<'a> {
    _db: &'a Db,
    ptr: *mut ffi::Sqlite3Stmt,
}

impl Drop for Stmt<'_> {
    fn drop(&mut self) {
        // SAFETY: `ptr` came from a successful sqlite3_prepare_v2 on `db`,
        // which outlives this statement by the `'a` borrow, and Drop runs once.
        unsafe {
            ffi::sqlite3_finalize(self.ptr);
        }
    }
}

impl Db {
    pub fn open(path: &str) -> Result<Db, DbError> {
        let filename = CString::new(path)
            .map_err(|_| DbError::local("database path contains an interior NUL byte"))?;
        let mut handle: *mut ffi::Sqlite3 = std::ptr::null_mut();
        let flags =
            ffi::SQLITE_OPEN_READWRITE | ffi::SQLITE_OPEN_CREATE | ffi::SQLITE_OPEN_FULLMUTEX;

        // SAFETY: `filename` is a live NUL-terminated C string for the duration
        // of the call, `handle` is a valid out-pointer, and a null VFS name
        // selects the default VFS.
        let rc = unsafe {
            ffi::sqlite3_open_v2(filename.as_ptr(), &mut handle, flags, std::ptr::null())
        };
        if handle.is_null() {
            return Err(DbError {
                code: rc,
                message: format!("sqlite3_open_v2 could not allocate a handle for {path}"),
            });
        }
        let db = Db {
            store: Store::Local(handle),
        };
        if rc != ffi::SQLITE_OK {
            return Err(db.last_error(rc));
        }

        // SAFETY: `handle` is a live connection just returned by open_v2.
        unsafe {
            ffi::sqlite3_busy_timeout(db.local_handle(), BUSY_TIMEOUT_MS);
        }
        Ok(db)
    }

    pub fn open_remote(base_url: &str, namespace: &str) -> Db {
        Db {
            store: Store::Remote(crate::hrana::Session::open(base_url, namespace)),
        }
    }

    fn local_handle(&self) -> *mut ffi::Sqlite3 {
        match self.store {
            Store::Local(handle) => handle,
            Store::Remote(_) => {
                panic!("local sqlite handle used on a remote connection")
            }
        }
    }

    pub fn exec(&self, sql: &str) -> Result<(), DbError> {
        if let Store::Remote(session) = &self.store {
            return session.exec(sql);
        }
        let text =
            CString::new(sql).map_err(|_| DbError::local("SQL contains an interior NUL byte"))?;

        // SAFETY: `text` outlives the call; a null callback/arg means "discard
        // any rows", and a null errmsg out-pointer means SQLite allocates
        // nothing for us to free — the message is read from the handle instead.
        let rc = unsafe {
            ffi::sqlite3_exec(
                self.local_handle(),
                text.as_ptr(),
                None,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        if rc == ffi::SQLITE_OK {
            Ok(())
        } else {
            Err(self.last_error(rc))
        }
    }

    pub fn query(&self, sql: &str, params: &[Value]) -> Result<Vec<Row>, DbError> {
        if let Store::Remote(session) = &self.store {
            return session.query(sql, params);
        }
        let stmt = self.prepare(sql)?;
        self.bind(&stmt, params)?;

        // SAFETY: `stmt.ptr` is a live prepared statement owned by `stmt`.
        let ncol = unsafe { ffi::sqlite3_column_count(stmt.ptr) };
        let ncol = if ncol < 0 { 0 } else { ncol };
        let names: Vec<String> = (0..ncol).map(|idx| column_name(&stmt, idx)).collect();

        let mut rows = Vec::new();
        loop {
            // SAFETY: `stmt.ptr` is live and stepped only from this thread,
            // which holds exclusive access to the connection.
            let rc = unsafe { ffi::sqlite3_step(stmt.ptr) };
            match rc {
                ffi::SQLITE_ROW => {
                    let cells = (0..ncol)
                        .map(|idx| {
                            let name = names.get(idx as usize).cloned().unwrap_or_default();
                            (name, read_column(&stmt, idx))
                        })
                        .collect();
                    rows.push(Row { cells });
                }
                ffi::SQLITE_DONE => return Ok(rows),
                _ => return Err(self.last_error(rc)),
            }
        }
    }

    pub fn run(&self, sql: &str, params: &[Value]) -> Result<Changes, DbError> {
        if let Store::Remote(session) = &self.store {
            return session.run(sql, params);
        }
        let stmt = self.prepare(sql)?;
        self.bind(&stmt, params)?;
        loop {
            // SAFETY: as in `query` — live statement, exclusive access.
            let rc = unsafe { ffi::sqlite3_step(stmt.ptr) };
            match rc {
                // A write statement with a RETURNING clause still yields rows;
                // drain them so `changes` reflects the whole statement.
                ffi::SQLITE_ROW => continue,
                ffi::SQLITE_DONE => break,
                _ => return Err(self.last_error(rc)),
            }
        }

        // SAFETY: `handle` is live; both calls only read counters off it.
        let changes = unsafe {
            Changes {
                changes: i64::from(ffi::sqlite3_changes(self.local_handle())),
                last_insert_rowid: ffi::sqlite3_last_insert_rowid(self.local_handle()),
            }
        };
        Ok(changes)
    }

    fn prepare(&self, sql: &str) -> Result<Stmt<'_>, DbError> {
        let bytes = sql.as_bytes();
        let len = c_int::try_from(bytes.len())
            .map_err(|_| DbError::local("SQL statement exceeds the driver length limit"))?;
        let mut ptr: *mut ffi::Sqlite3Stmt = std::ptr::null_mut();
        let mut tail: *const c_char = std::ptr::null();

        // SAFETY: `bytes` is a live UTF-8 buffer of exactly `len` bytes for the
        // duration of the call (an explicit length means no NUL terminator is
        // required); `ptr` and `tail` are valid out-pointers. On success
        // `tail` points into `bytes`, just past the statement that was
        // compiled.
        let rc = unsafe {
            ffi::sqlite3_prepare_v2(
                self.local_handle(),
                bytes.as_ptr().cast::<c_char>(),
                len,
                &mut ptr,
                &mut tail,
            )
        };
        if rc != ffi::SQLITE_OK {
            return Err(self.last_error(rc));
        }
        if ptr.is_null() {
            return Err(DbError::local("SQL text contained no statement"));
        }
        let stmt = Stmt { _db: self, ptr };
        if has_trailing_statement(bytes, tail) {
            // `prepare_v2` compiles only the first statement and reports the
            // rest through `tail`. Discarding that silently means a string
            // holding two statements runs one and drops the other with no
            // error anywhere — a typo that looks like it worked.
            return Err(DbError::local(
                "SQL text contained more than one statement; prepare compiles only the first",
            ));
        }
        Ok(stmt)
    }

    fn bind(&self, stmt: &Stmt<'_>, params: &[Value]) -> Result<(), DbError> {
        for (offset, param) in params.iter().enumerate() {
            let idx = c_int::try_from(offset + 1)
                .map_err(|_| DbError::local("too many bound parameters"))?;

            // SAFETY: `stmt.ptr` is live and unstepped. For text, the pointer
            // and length describe a live `String` buffer, and
            // `ffi::transient()` (SQLITE_TRANSIENT) makes SQLite copy it before
            // returning — so the buffer may be dropped afterwards.
            let rc = unsafe {
                match param {
                    Value::Null => ffi::sqlite3_bind_null(stmt.ptr, idx),
                    Value::Int(v) => ffi::sqlite3_bind_int64(stmt.ptr, idx, *v),
                    Value::Real(v) => ffi::sqlite3_bind_double(stmt.ptr, idx, *v),
                    Value::Text(s) => {
                        let len = c_int::try_from(s.len()).unwrap_or(c_int::MAX);
                        ffi::sqlite3_bind_text(
                            stmt.ptr,
                            idx,
                            s.as_ptr().cast::<c_char>(),
                            len,
                            ffi::transient(),
                        )
                    }
                }
            };
            if rc != ffi::SQLITE_OK {
                return Err(self.last_error(rc));
            }
        }
        Ok(())
    }

    fn last_error(&self, fallback: c_int) -> DbError {
        // SAFETY: `handle` is live. sqlite3_errmsg returns a NUL-terminated
        // UTF-8 string owned by SQLite and valid until the next call on this
        // handle; it is copied into an owned String before returning.
        unsafe {
            let extended = ffi::sqlite3_extended_errcode(self.local_handle());
            let msg = ffi::sqlite3_errmsg(self.local_handle());
            let message = if msg.is_null() {
                String::new()
            } else {
                CStr::from_ptr(msg).to_string_lossy().into_owned()
            };
            DbError {
                code: if extended == ffi::SQLITE_OK {
                    fallback
                } else {
                    extended
                },
                message,
            }
        }
    }
}

fn column_name(stmt: &Stmt<'_>, idx: c_int) -> String {
    // SAFETY: `stmt.ptr` is live and `idx` is below sqlite3_column_count. The
    // returned string is owned by SQLite and valid while the statement lives;
    // it is copied here.
    unsafe {
        let ptr = ffi::sqlite3_column_name(stmt.ptr, idx);
        if ptr.is_null() {
            String::new()
        } else {
            CStr::from_ptr(ptr).to_string_lossy().into_owned()
        }
    }
}

fn read_column(stmt: &Stmt<'_>, idx: c_int) -> Value {
    // SAFETY: `stmt.ptr` is live and positioned on a row (the caller only
    // reaches here after SQLITE_ROW); `idx` is below sqlite3_column_count.
    // sqlite3_column_text is called before sqlite3_column_bytes, which is the
    // order SQLite documents for getting the length of the converted text, and
    // the bytes are copied out before any further call on the statement.
    unsafe {
        match ffi::sqlite3_column_type(stmt.ptr, idx) {
            ffi::SQLITE_NULL => Value::Null,
            ffi::SQLITE_INTEGER => Value::Int(ffi::sqlite3_column_int64(stmt.ptr, idx)),
            ffi::SQLITE_FLOAT => Value::Real(ffi::sqlite3_column_double(stmt.ptr, idx)),
            _ => {
                let ptr = ffi::sqlite3_column_text(stmt.ptr, idx);
                if ptr.is_null() {
                    return Value::Null;
                }
                let len = ffi::sqlite3_column_bytes(stmt.ptr, idx);
                let len = if len < 0 { 0 } else { len as usize };
                let bytes = std::slice::from_raw_parts(ptr, len);
                Value::Text(String::from_utf8_lossy(bytes).into_owned())
            }
        }
    }
}

const BUSY_TIMEOUT_MS: c_int = 5000;

struct PoolState {
    idle: Vec<Db>,
    closed: bool,
}

pub struct Pool {
    state: Mutex<PoolState>,
    available: Condvar,
}

struct Checkout<'a> {
    pool: &'a Pool,
    db: Option<Db>,
}

impl Drop for Checkout<'_> {
    fn drop(&mut self) {
        let Some(db) = self.db.take() else {
            return;
        };
        let mut state = self.pool.lock();
        if state.closed {
            drop(state);
            drop(db);
            return;
        }
        state.idle.push(db);
        drop(state);
        self.pool.available.notify_one();
    }
}

impl Pool {
    pub fn open(path: &str, size: usize) -> Result<Pool, DbError> {
        require_threadsafe_sqlite()?;
        if let Some(parent) = Path::new(path).parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    DbError::local(format!(
                        "failed to create database directory {}: {e}",
                        parent.display()
                    ))
                })?;
            }
        }

        let count = size.max(1);
        let mut idle = Vec::with_capacity(count);
        for index in 0..count {
            let db = Db::open(path)?;
            apply_pragmas(&db)?;
            if index == 0 {
                ensure_schema(&db)?;
            }
            idle.push(db);
        }

        Ok(Pool {
            state: Mutex::new(PoolState {
                idle,
                closed: false,
            }),
            available: Condvar::new(),
        })
    }

    pub fn open_remote(base_url: &str, namespace: &str, size: usize) -> Result<Pool, DbError> {
        let count = size.max(1);
        let mut idle = Vec::with_capacity(count);
        for index in 0..count {
            let db = Db::open_remote(base_url, namespace);
            if index == 0 {
                ensure_schema_remote(&db)?;
            }
            idle.push(db);
        }
        Ok(Pool {
            state: Mutex::new(PoolState {
                idle,
                closed: false,
            }),
            available: Condvar::new(),
        })
    }

    pub fn with<T>(&self, f: impl FnOnce(&Db) -> Result<T, DbError>) -> Result<T, DbError> {
        let guard = self.checkout()?;
        match guard.db.as_ref() {
            Some(db) => f(db),
            None => Err(DbError::local("pooled connection was missing")),
        }
    }

    pub fn transaction<T>(&self, f: impl FnOnce(&Db) -> Result<T, DbError>) -> Result<T, DbError> {
        self.with(|db| {
            db.exec("BEGIN IMMEDIATE")?;
            let mut guard = TxGuard {
                db,
                committed: false,
            };
            let value = f(db)?;
            db.exec("COMMIT")?;
            guard.committed = true;
            Ok(value)
        })
    }

    pub fn close_all(&self) {
        let mut state = self.lock();
        state.closed = true;
        let drained = std::mem::take(&mut state.idle);
        drop(state);
        drop(drained);
        self.available.notify_all();
    }

    fn checkout(&self) -> Result<Checkout<'_>, DbError> {
        let mut state = self.lock();
        loop {
            if state.closed {
                return Err(DbError::local("database pool is closed"));
            }
            if let Some(db) = state.idle.pop() {
                return Ok(Checkout {
                    pool: self,
                    db: Some(db),
                });
            }
            state = self
                .available
                .wait(state)
                .unwrap_or_else(|poisoned| poisoned.into_inner());
        }
    }

    fn lock(&self) -> MutexGuard<'_, PoolState> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl Drop for Pool {
    fn drop(&mut self) {
        self.close_all();
    }
}

struct TxGuard<'a> {
    db: &'a Db,
    committed: bool,
}

impl Drop for TxGuard<'_> {
    fn drop(&mut self) {
        if self.committed {
            return;
        }
        if let Err(e) = self.db.exec("ROLLBACK") {
            eprintln!("warning: transaction rollback failed: {e}");
        }
    }
}

const PRAGMAS: &[&str] = &[
    "PRAGMA journal_mode = WAL",
    "PRAGMA synchronous = NORMAL",
    "PRAGMA cache_size = 1000",
    "PRAGMA temp_store = memory",
];

const SCHEMA: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS Users (
        _id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        subscription_stripeID TEXT,
        subscription_expires INTEGER,
        subscription_status TEXT,
        subscription_id TEXT,
        usage_count INTEGER DEFAULT 0,
        usage_reset_at INTEGER
      )",
    "CREATE TABLE IF NOT EXISTS Auths (
        email TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        userID TEXT NOT NULL,
        FOREIGN KEY (userID) REFERENCES Users(_id)
      )",
    "CREATE TABLE IF NOT EXISTS WebhookEvents (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        processed_at INTEGER NOT NULL
      )",
];

const INDEXES: &[&str] = &[
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON Users(email)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_auths_email ON Auths(email)",
];

const USERS_COLUMNS: &[(&str, &str)] = &[
    ("subscription_stripeID", "TEXT"),
    ("subscription_expires", "INTEGER"),
    ("subscription_status", "TEXT"),
    ("subscription_id", "TEXT"),
    ("usage_count", "INTEGER DEFAULT 0"),
    ("usage_reset_at", "INTEGER"),
];

const AUTHS_COLUMNS: &[(&str, &str)] = &[
    ("password", "TEXT NOT NULL DEFAULT ''"),
    ("userID", "TEXT NOT NULL DEFAULT ''"),
];

const WEBHOOK_COLUMNS: &[(&str, &str)] = &[
    ("event_type", "TEXT NOT NULL DEFAULT ''"),
    ("processed_at", "INTEGER NOT NULL DEFAULT 0"),
];

fn apply_pragmas(db: &Db) -> Result<(), DbError> {
    for pragma in PRAGMAS {
        db.exec(pragma)?;
    }
    Ok(())
}

fn ensure_schema_remote(db: &Db) -> Result<(), DbError> {
    for statement in SCHEMA {
        db.exec(statement)?;
    }
    add_missing_columns(db, "Users", USERS_COLUMNS)?;
    add_missing_columns(db, "Auths", AUTHS_COLUMNS)?;
    add_missing_columns(db, "WebhookEvents", WEBHOOK_COLUMNS)?;
    for statement in INDEXES {
        if let Err(e) = db.exec(statement) {
            if !e.message.contains("UNIQUE constraint failed") {
                return Err(e);
            }
        }
    }
    Ok(())
}

fn ensure_schema(db: &Db) -> Result<(), DbError> {
    for statement in SCHEMA {
        db.exec(statement)?;
    }
    add_missing_columns(db, "Users", USERS_COLUMNS)?;
    add_missing_columns(db, "Auths", AUTHS_COLUMNS)?;
    add_missing_columns(db, "WebhookEvents", WEBHOOK_COLUMNS)?;
    for statement in INDEXES {
        db.exec(statement)?;
    }
    Ok(())
}

fn add_missing_columns(db: &Db, table: &str, columns: &[(&str, &str)]) -> Result<(), DbError> {
    let existing: Vec<String> = db
        .query(&format!("PRAGMA table_info({table})"), &[])?
        .iter()
        .filter_map(|row| row.text("name").map(str::to_string))
        .collect();

    for (name, decl) in columns {
        if !existing.iter().any(|have| have == name) {
            db.exec(&format!("ALTER TABLE {table} ADD COLUMN {name} {decl}"))?;
        }
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Subscription {
    pub stripe_id: String,
    pub expires: Option<i64>,
    pub status: String,
    pub subscription_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Usage {
    pub count: i64,
    pub reset_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: String,
    pub created_at: i64,
    pub subscription: Option<Subscription>,
    pub usage: Option<Usage>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthRecord {
    pub email: String,
    pub password: String,
    pub user_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebhookEvent {
    pub event_id: String,
    pub event_type: String,
    pub processed_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UserQuery {
    Id(String),
    Email(String),
}

impl UserQuery {
    fn clause(&self) -> (&'static str, Value) {
        match self {
            UserQuery::Id(id) => ("_id = ?", Value::Text(id.clone())),
            UserQuery::Email(email) => ("email = ?", Value::Text(email.clone())),
        }
    }
}

fn user_from_row(row: &Row) -> Option<User> {
    let id = row.text("_id")?.to_string();
    let email = row.text("email")?.to_string();
    let name = row.text("name")?.to_string();
    let created_at = row.int("created_at")?;

    let subscription = match row.get("subscription_stripeID") {
        Some(Value::Text(stripe_id)) if !stripe_id.is_empty() => Some(Subscription {
            stripe_id: stripe_id.clone(),
            expires: row.int("subscription_expires"),
            status: row.text("subscription_status").unwrap_or("").to_string(),
            subscription_id: row
                .text("subscription_id")
                .filter(|id| !id.is_empty())
                .map(str::to_string),
        }),
        _ => None,
    };

    let usage = row.get("usage_count").map(|_| Usage {
        count: row.int("usage_count").unwrap_or(0),
        reset_at: row.int("usage_reset_at").filter(|v| *v != 0),
    });

    Some(User {
        id,
        email,
        name,
        created_at,
        subscription,
        usage,
    })
}

/// Verify the linked libsqlite3 was built thread-safe.
///
/// `unsafe impl Send for Db` is justified by opening with
/// `SQLITE_OPEN_FULLMUTEX`, but that flag is only honored when the library was
/// compiled with `SQLITE_THREADSAFE` set to 1 or 2. A build with
/// `SQLITE_THREADSAFE=0` ignores it and does no internal locking at all, which
/// would make moving a handle between worker threads undefined behavior instead
/// of merely slow. Since the library is the system's and not vendored, this is
/// checked at runtime rather than assumed.
///
/// # Errors
/// Returns [`DbError`] when `sqlite3_threadsafe()` reports 0, so the process
/// refuses to serve rather than racing inside the driver.
fn require_threadsafe_sqlite() -> Result<(), DbError> {
    // SAFETY: takes no arguments, returns a compile-time constant, and is safe
    // to call before any connection exists.
    let threadsafe = unsafe { ffi::sqlite3_threadsafe() };
    if threadsafe == 0 {
        return Err(DbError::local(
            "the system libsqlite3 was built with SQLITE_THREADSAFE=0, which does not \
             serialize access; this server shares connections across threads and cannot \
             run safely against it",
        ));
    }
    Ok(())
}

fn has_trailing_statement(sql: &[u8], tail: *const c_char) -> bool {
    if tail.is_null() {
        return false;
    }
    let start = sql.as_ptr() as usize;
    let end = start + sql.len();
    let tail_addr = tail as usize;
    if tail_addr < start || tail_addr > end {
        return false;
    }
    let remainder = &sql[tail_addr - start..];
    remainder
        .iter()
        .any(|b| !b.is_ascii_whitespace() && *b != b';')
}

fn insert_user_tx(db: &Db, u: &User) -> Result<(), DbError> {
    db.run(
        "INSERT INTO Users (_id, email, name, created_at) VALUES (?, ?, ?, ?)",
        &[
            Value::Text(u.id.clone()),
            Value::Text(u.email.clone()),
            Value::Text(u.name.clone()),
            Value::Int(u.created_at),
        ],
    )?;
    Ok(())
}

fn insert_auth_tx(db: &Db, a: &AuthRecord) -> Result<(), DbError> {
    db.run(
        "INSERT INTO Auths (email, password, userID) VALUES (?, ?, ?)",
        &[
            Value::Text(a.email.clone()),
            Value::Text(a.password.clone()),
            Value::Text(a.user_id.clone()),
        ],
    )?;
    Ok(())
}

impl Pool {
    pub fn find_user(&self, q: &UserQuery) -> Result<Option<User>, DbError> {
        let (clause, param) = q.clause();
        let sql = format!("SELECT * FROM Users WHERE {clause}");
        self.with(|db| {
            let rows = db.query(&sql, &[param.clone()])?;
            Ok(rows.first().and_then(user_from_row))
        })
    }

    pub fn insert_user(&self, u: &User) -> Result<(), DbError> {
        self.with(|db| insert_user_tx(db, u))
    }

    pub fn update_user_set_name(&self, id: &str, name: &str) -> Result<u64, DbError> {
        self.with(|db| {
            let changes = db.run(
                "UPDATE Users SET name = ? WHERE _id = ?",
                &[Value::Text(name.to_string()), Value::Text(id.to_string())],
            )?;
            Ok(changes.changes.max(0) as u64)
        })
    }

    pub fn update_user_subscription(&self, id: &str, sub: &Subscription) -> Result<u64, DbError> {
        self.with(|db| {
            let changes = db.run(
                "UPDATE Users SET
        subscription_stripeID = ?,
        subscription_expires = ?,
        subscription_status = ?,
        subscription_id = ?
        WHERE _id = ?",
                &[
                    Value::Text(sub.stripe_id.clone()),
                    sub.expires.map_or(Value::Null, Value::Int),
                    Value::Text(sub.status.clone()),
                    sub.subscription_id.clone().map_or(Value::Null, Value::Text),
                    Value::Text(id.to_string()),
                ],
            )?;
            Ok(changes.changes.max(0) as u64)
        })
    }

    pub fn update_user_usage(&self, id: &str, usage: &Usage) -> Result<u64, DbError> {
        self.with(|db| {
            let changes = db.run(
                "UPDATE Users SET
        usage_count = ?,
        usage_reset_at = ?
        WHERE _id = ?",
                &[
                    Value::Int(usage.count),
                    usage.reset_at.map_or(Value::Null, Value::Int),
                    Value::Text(id.to_string()),
                ],
            )?;
            Ok(changes.changes.max(0) as u64)
        })
    }

    pub fn increment_usage_count(&self, id: &str, delta: i64) -> Result<u64, DbError> {
        self.with(|db| {
            let changes = db.run(
                "UPDATE Users SET usage_count = COALESCE(usage_count, 0) + ? WHERE _id = ?",
                &[Value::Int(delta), Value::Text(id.to_string())],
            )?;
            Ok(changes.changes.max(0) as u64)
        })
    }

    pub fn consume_usage(&self, id: &str, limit: i64) -> Result<Option<i64>, DbError> {
        self.transaction(|db| {
            let changes = db.run(
                "UPDATE Users SET usage_count = COALESCE(usage_count, 0) + 1
                 WHERE _id = ? AND COALESCE(usage_count, 0) < ?",
                &[Value::Text(id.to_string()), Value::Int(limit)],
            )?;
            if changes.changes <= 0 {
                return Ok(None);
            }
            let rows = db.query(
                "SELECT usage_count FROM Users WHERE _id = ?",
                &[Value::Text(id.to_string())],
            )?;
            Ok(rows.first().and_then(|r| r.int("usage_count")))
        })
    }

    pub fn reset_usage_window(
        &self,
        id: &str,
        reset_at: i64,
        consume: bool,
    ) -> Result<i64, DbError> {
        let count = i64::from(consume);
        self.transaction(|db| {
            db.run(
                "UPDATE Users SET usage_count = ?, usage_reset_at = ? WHERE _id = ?",
                &[
                    Value::Int(count),
                    Value::Int(reset_at),
                    Value::Text(id.to_string()),
                ],
            )?;
            Ok(count)
        })
    }

    pub fn delete_user(&self, q: &UserQuery) -> Result<u64, DbError> {
        let (clause, param) = q.clause();
        let sql = format!("DELETE FROM Users WHERE {clause}");
        self.with(|db| {
            let changes = db.run(&sql, &[param.clone()])?;
            Ok(changes.changes.max(0) as u64)
        })
    }

    pub fn find_auth(&self, email: &str) -> Result<Option<AuthRecord>, DbError> {
        self.with(|db| {
            let rows = db.query(
                "SELECT * FROM Auths WHERE email = ?",
                &[Value::Text(email.to_string())],
            )?;
            Ok(rows.first().and_then(|row| {
                Some(AuthRecord {
                    email: row.text("email")?.to_string(),
                    password: row.text("password")?.to_string(),
                    user_id: row.text("userID")?.to_string(),
                })
            }))
        })
    }

    pub fn insert_auth(&self, a: &AuthRecord) -> Result<(), DbError> {
        self.with(|db| insert_auth_tx(db, a))
    }

    pub fn create_account(&self, u: &User, a: &AuthRecord) -> Result<(), DbError> {
        self.transaction(|db| {
            insert_user_tx(db, u)?;
            insert_auth_tx(db, a)
        })
    }

    pub fn update_auth_password(&self, email: &str, password: &str) -> Result<u64, DbError> {
        self.with(|db| {
            let changes = db.run(
                "UPDATE Auths SET password = ? WHERE email = ?",
                &[
                    Value::Text(password.to_string()),
                    Value::Text(email.to_string()),
                ],
            )?;
            Ok(changes.changes.max(0) as u64)
        })
    }

    pub fn find_webhook_event(&self, event_id: &str) -> Result<Option<WebhookEvent>, DbError> {
        self.with(|db| {
            let rows = db.query(
                "SELECT * FROM WebhookEvents WHERE event_id = ?",
                &[Value::Text(event_id.to_string())],
            )?;
            Ok(rows.first().and_then(|row| {
                Some(WebhookEvent {
                    event_id: row.text("event_id")?.to_string(),
                    event_type: row.text("event_type")?.to_string(),
                    processed_at: row.int("processed_at")?,
                })
            }))
        })
    }

    pub fn insert_webhook_event(
        &self,
        event_id: &str,
        event_type: &str,
        processed_at: i64,
    ) -> Result<(), DbError> {
        self.with(|db| {
            db.run(
                "INSERT INTO WebhookEvents (event_id, event_type, processed_at) VALUES (?, ?, ?)",
                &[
                    Value::Text(event_id.to_string()),
                    Value::Text(event_type.to_string()),
                    Value::Int(processed_at),
                ],
            )?;
            Ok(())
        })
    }

    pub fn delete_webhook_event(&self, event_id: &str) -> Result<(), DbError> {
        self.with(|db| {
            db.run(
                "DELETE FROM WebhookEvents WHERE event_id = ?",
                &[Value::Text(event_id.to_string())],
            )?;
            Ok(())
        })
    }

    pub fn prune_webhook_events(&self, cutoff_ms: i64) -> Result<i64, DbError> {
        self.with(|db| {
            let changes = db.run(
                "DELETE FROM WebhookEvents WHERE processed_at < ?",
                &[Value::Int(cutoff_ms)],
            )?;
            Ok(changes.changes)
        })
    }

    pub fn ping(&self) -> Result<(), DbError> {
        self.with(|db| {
            db.query("SELECT 1", &[])?;
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;

    static SEQ: AtomicU64 = AtomicU64::new(0);

    struct TempDb {
        dir: std::path::PathBuf,
    }

    impl TempDb {
        fn new(tag: &str) -> TempDb {
            let seq = SEQ.fetch_add(1, Ordering::Relaxed);
            let mut dir = std::env::temp_dir();
            dir.push(format!("skateboard-db-{}-{tag}-{seq}", std::process::id()));
            TempDb { dir }
        }

        fn path(&self) -> String {
            self.dir
                .join("databases")
                .join("App.db")
                .to_string_lossy()
                .into_owned()
        }
    }

    impl Drop for TempDb {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    #[test]
    fn query_rejects_more_than_one_statement() {
        let tmp = TempDb::new("multi-stmt");
        let pool = Pool::open(&tmp.path(), 1).unwrap();
        pool.insert_user(&sample_user("u1", "a@example.com")).unwrap();

        let err = pool
            .with(|db| db.run("DELETE FROM Users; DELETE FROM Auths", &[]))
            .expect_err("a second statement must be refused, not dropped");
        assert!(err.message.contains("more than one statement"), "{err}");
        assert!(
            pool.find_user(&UserQuery::Id("u1".into())).unwrap().is_some(),
            "nothing should have run"
        );
    }

    #[test]
    fn query_allows_trailing_semicolons_and_whitespace() {
        let tmp = TempDb::new("trailing-semi");
        let pool = Pool::open(&tmp.path(), 1).unwrap();
        pool.insert_user(&sample_user("u1", "a@example.com")).unwrap();
        let rows = pool
            .with(|db| db.query("SELECT _id FROM Users ;  \n", &[]))
            .expect("a trailing semicolon is not a second statement");
        assert_eq!(rows.len(), 1);
    }

    #[test]
    fn linked_sqlite_is_threadsafe() {
        require_threadsafe_sqlite().expect("libsqlite3 must be built thread-safe");
    }

    #[test]
    fn transaction_commits_all_or_nothing() {
        let tmp = TempDb::new("tx-commit");
        let pool = Pool::open(&tmp.path(), 2).unwrap();
        pool.transaction(|db| {
            insert_user_tx(db, &sample_user("u1", "a@example.com"))?;
            insert_user_tx(db, &sample_user("u2", "b@example.com"))
        })
        .unwrap();
        assert!(pool.find_user(&UserQuery::Id("u1".into())).unwrap().is_some());
        assert!(pool.find_user(&UserQuery::Id("u2".into())).unwrap().is_some());
    }

    #[test]
    fn transaction_rolls_back_every_write_on_error() {
        let tmp = TempDb::new("tx-rollback");
        let pool = Pool::open(&tmp.path(), 2).unwrap();
        let result = pool.transaction::<()>(|db| {
            insert_user_tx(db, &sample_user("u1", "a@example.com"))?;
            Err(DbError::local("deliberate failure"))
        });
        assert!(result.is_err());
        assert!(
            pool.find_user(&UserQuery::Id("u1".into())).unwrap().is_none(),
            "the first insert must not survive a later failure"
        );
    }

    #[test]
    fn transaction_leaves_no_open_transaction_after_a_panic() {
        let tmp = TempDb::new("tx-panic");
        let pool = Pool::open(&tmp.path(), 1).unwrap();
        let panicked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            pool.transaction::<()>(|db| {
                insert_user_tx(db, &sample_user("u1", "a@example.com"))?;
                panic!("deliberate panic inside a transaction");
            })
        }));
        assert!(panicked.is_err());
        assert!(
            pool.find_user(&UserQuery::Id("u1".into())).unwrap().is_none(),
            "the panicking transaction must have been rolled back"
        );
        pool.transaction(|db| insert_user_tx(db, &sample_user("u2", "b@example.com")))
            .expect("connection must be reusable after a panic");
        assert!(pool.find_user(&UserQuery::Id("u2".into())).unwrap().is_some());
    }

    #[test]
    fn create_account_writes_nothing_when_the_email_is_taken() {
        let tmp = TempDb::new("tx-account");
        let pool = Pool::open(&tmp.path(), 2).unwrap();
        let auth = AuthRecord {
            email: "dup@example.com".into(),
            password: "scrypt$16384$8$1$salt$key".into(),
            user_id: "u1".into(),
        };
        pool.insert_auth(&auth).unwrap();

        let err = pool
            .create_account(&sample_user("u1", "dup@example.com"), &auth)
            .expect_err("duplicate credentials must fail");
        assert!(err.message.contains("UNIQUE constraint failed"), "{err}");
        assert!(
            pool.find_user(&UserQuery::Id("u1".into())).unwrap().is_none(),
            "a failed signup must not leave a user row holding the email"
        );
    }

    #[test]
    fn consume_usage_stops_at_the_limit() {
        let tmp = TempDb::new("usage-limit");
        let pool = Pool::open(&tmp.path(), 2).unwrap();
        pool.insert_user(&sample_user("u1", "a@example.com")).unwrap();

        assert_eq!(pool.consume_usage("u1", 2).unwrap(), Some(1));
        assert_eq!(pool.consume_usage("u1", 2).unwrap(), Some(2));
        assert_eq!(
            pool.consume_usage("u1", 2).unwrap(),
            None,
            "the third call must be refused rather than counted and undone"
        );
        let user = pool.find_user(&UserQuery::Id("u1".into())).unwrap().unwrap();
        assert_eq!(
            user.usage.map(|u| u.count),
            Some(2),
            "a refused call must not leave the counter above the limit"
        );
    }

    #[test]
    fn consume_usage_reports_a_missing_user_as_refused() {
        let tmp = TempDb::new("usage-missing");
        let pool = Pool::open(&tmp.path(), 2).unwrap();
        assert_eq!(pool.consume_usage("ghost", 5).unwrap(), None);
    }

    #[test]
    fn concurrent_consume_usage_never_exceeds_the_limit() {
        let tmp = TempDb::new("usage-race");
        let pool = Arc::new(Pool::open(&tmp.path(), 4).unwrap());
        pool.insert_user(&sample_user("u1", "a@example.com")).unwrap();

        const LIMIT: i64 = 10;
        const THREADS: usize = 4;
        const EACH: usize = 10;
        let granted = Arc::new(AtomicU64::new(0));
        let mut handles = Vec::new();
        for _ in 0..THREADS {
            let pool = Arc::clone(&pool);
            let granted = Arc::clone(&granted);
            handles.push(std::thread::spawn(move || {
                for _ in 0..EACH {
                    if pool.consume_usage("u1", LIMIT).unwrap().is_some() {
                        granted.fetch_add(1, Ordering::Relaxed);
                    }
                }
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        assert_eq!(
            granted.load(Ordering::Relaxed),
            LIMIT as u64,
            "exactly the limit must be granted across concurrent callers"
        );
        let user = pool.find_user(&UserQuery::Id("u1".into())).unwrap().unwrap();
        assert_eq!(user.usage.map(|u| u.count), Some(LIMIT));
    }

    #[test]
    fn reset_usage_window_can_consume_the_first_unit() {
        let tmp = TempDb::new("usage-reset");
        let pool = Pool::open(&tmp.path(), 2).unwrap();
        pool.insert_user(&sample_user("u1", "a@example.com")).unwrap();
        pool.consume_usage("u1", 100).unwrap();

        assert_eq!(pool.reset_usage_window("u1", 5000, true).unwrap(), 1);
        let user = pool.find_user(&UserQuery::Id("u1".into())).unwrap().unwrap();
        let usage = user.usage.unwrap();
        assert_eq!(usage.count, 1);
        assert_eq!(usage.reset_at, Some(5000));

        assert_eq!(pool.reset_usage_window("u1", 6000, false).unwrap(), 0);
        let user = pool.find_user(&UserQuery::Id("u1".into())).unwrap().unwrap();
        assert_eq!(user.usage.unwrap().count, 0);
    }

    fn sample_user(id: &str, email: &str) -> User {
        User {
            id: id.to_string(),
            email: email.to_string(),
            name: "Test User".to_string(),
            created_at: 1000,
            subscription: None,
            usage: None,
        }
    }

    #[test]
    fn opens_pool_and_creates_schema() {
        let tmp = TempDb::new("schema");
        let pool = Pool::open(&tmp.path(), 2).expect("pool opens");

        let tables = pool
            .with(|db| {
                db.query(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
                    &[],
                )
            })
            .expect("query succeeds");
        let names: Vec<&str> = tables.iter().filter_map(|r| r.text("name")).collect();
        assert_eq!(names, vec!["Auths", "Users", "WebhookEvents"]);
    }

    #[test]
    fn creates_missing_parent_directory() {
        let tmp = TempDb::new("mkdir");
        assert!(!tmp.dir.exists());
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");
        pool.close_all();
        assert!(std::path::Path::new(&tmp.path()).exists());
    }

    #[test]
    fn migrates_stale_users_table() {
        let tmp = TempDb::new("stale");
        let path = tmp.path();
        std::fs::create_dir_all(std::path::Path::new(&path).parent().expect("has parent"))
            .expect("dir created");

        {
            let db = Db::open(&path).expect("raw open");
            db.exec(
                "CREATE TABLE Users (
                    _id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )",
            )
            .expect("stale table created");
            db.run(
                "INSERT INTO Users (_id, email, name, created_at) VALUES (?, ?, ?, ?)",
                &[
                    Value::Text("old-1".into()),
                    Value::Text("old@example.com".into()),
                    Value::Text("Old".into()),
                    Value::Int(42),
                ],
            )
            .expect("legacy row inserted");
        }

        let pool = Pool::open(&path, 1).expect("pool opens");
        let cols: Vec<String> = pool
            .with(|db| db.query("PRAGMA table_info(Users)", &[]))
            .expect("table_info")
            .iter()
            .filter_map(|r| r.text("name").map(str::to_string))
            .collect();

        for (name, _) in USERS_COLUMNS {
            assert!(cols.iter().any(|c| c == name), "missing column {name}");
        }

        let user = pool
            .find_user(&UserQuery::Id("old-1".into()))
            .expect("find succeeds")
            .expect("legacy user found");
        assert_eq!(user.email, "old@example.com");
        assert_eq!(user.subscription, None);
        assert_eq!(
            user.usage,
            Some(Usage {
                count: 0,
                reset_at: None
            })
        );
    }

    #[test]
    fn inserts_and_finds_user_by_id_and_email() {
        let tmp = TempDb::new("roundtrip");
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");
        pool.insert_user(&sample_user("u1", "u1@example.com"))
            .expect("insert succeeds");

        let by_id = pool
            .find_user(&UserQuery::Id("u1".into()))
            .expect("find succeeds")
            .expect("user found");
        assert_eq!(by_id.email, "u1@example.com");

        let by_email = pool
            .find_user(&UserQuery::Email("u1@example.com".into()))
            .expect("find succeeds")
            .expect("user found");
        assert_eq!(by_email.id, "u1");

        assert_eq!(
            pool.find_user(&UserQuery::Id("missing".into()))
                .expect("find succeeds"),
            None
        );
    }

    #[test]
    fn duplicate_email_reports_unique_constraint() {
        let tmp = TempDb::new("dupe");
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");
        pool.insert_user(&sample_user("u1", "dupe@example.com"))
            .expect("first insert succeeds");

        let err = pool
            .insert_user(&sample_user("u2", "dupe@example.com"))
            .expect_err("second insert fails");
        assert!(
            err.message.contains("UNIQUE constraint failed"),
            "unexpected message: {}",
            err.message
        );
    }

    #[test]
    fn nests_subscription_only_when_stripe_id_present() {
        let tmp = TempDb::new("sub");
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");
        pool.insert_user(&sample_user("u1", "u1@example.com"))
            .expect("insert succeeds");

        let before = pool
            .find_user(&UserQuery::Id("u1".into()))
            .expect("find succeeds")
            .expect("user found");
        assert_eq!(before.subscription, None);

        let sub = Subscription {
            stripe_id: "cus_123".into(),
            expires: Some(2000),
            status: "active".into(),
            subscription_id: Some("sub_123".into()),
        };
        assert_eq!(
            pool.update_user_subscription("u1", &sub)
                .expect("update succeeds"),
            1
        );

        let after = pool
            .find_user(&UserQuery::Id("u1".into()))
            .expect("find succeeds")
            .expect("user found");
        assert_eq!(after.subscription, Some(sub));
    }

    #[test]
    fn subscription_expires_zero_survives_as_some() {
        let tmp = TempDb::new("expires0");
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");
        pool.insert_user(&sample_user("u1", "u1@example.com"))
            .expect("insert succeeds");
        pool.update_user_subscription(
            "u1",
            &Subscription {
                stripe_id: "cus_123".into(),
                expires: Some(0),
                status: "active".into(),
                subscription_id: None,
            },
        )
        .expect("update succeeds");

        let user = pool
            .find_user(&UserQuery::Id("u1".into()))
            .expect("find succeeds")
            .expect("user found");
        assert_eq!(
            user.subscription.and_then(|s| s.expires),
            Some(0),
            "expires 0 must survive"
        );
    }

    #[test]
    fn usage_reset_at_zero_reads_back_as_none() {
        let tmp = TempDb::new("reset0");
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");
        pool.insert_user(&sample_user("u1", "u1@example.com"))
            .expect("insert succeeds");
        pool.update_user_usage(
            "u1",
            &Usage {
                count: 7,
                reset_at: Some(0),
            },
        )
        .expect("update succeeds");

        let usage = pool
            .find_user(&UserQuery::Id("u1".into()))
            .expect("find succeeds")
            .expect("user found")
            .usage
            .expect("usage present");
        assert_eq!(usage.count, 7);
        assert_eq!(usage.reset_at, None, "reset_at 0 must read back as None");
    }

    #[test]
    fn increments_and_decrements_usage_count() {
        let tmp = TempDb::new("inc");
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");
        pool.insert_user(&sample_user("u1", "u1@example.com"))
            .expect("insert succeeds");

        assert_eq!(
            pool.increment_usage_count("u1", 3).expect("inc succeeds"),
            1
        );
        assert_eq!(
            pool.increment_usage_count("u1", -1).expect("dec succeeds"),
            1
        );

        let usage = pool
            .find_user(&UserQuery::Id("u1".into()))
            .expect("find succeeds")
            .expect("user found")
            .usage
            .expect("usage present");
        assert_eq!(usage.count, 2);

        assert_eq!(
            pool.increment_usage_count("nobody", 1)
                .expect("inc succeeds"),
            0
        );
    }

    #[test]
    fn updates_name_and_deletes_user() {
        let tmp = TempDb::new("namedel");
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");
        pool.insert_user(&sample_user("u1", "u1@example.com"))
            .expect("insert succeeds");

        assert_eq!(
            pool.update_user_set_name("u1", "Renamed")
                .expect("update succeeds"),
            1
        );
        assert_eq!(
            pool.find_user(&UserQuery::Id("u1".into()))
                .expect("find succeeds")
                .expect("user found")
                .name,
            "Renamed"
        );

        assert_eq!(
            pool.delete_user(&UserQuery::Email("u1@example.com".into()))
                .expect("delete succeeds"),
            1
        );
        assert_eq!(
            pool.delete_user(&UserQuery::Id("u1".into()))
                .expect("delete succeeds"),
            0
        );
    }

    #[test]
    fn inserts_finds_and_updates_auth() {
        let tmp = TempDb::new("auth");
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");
        let auth = AuthRecord {
            email: "a@example.com".into(),
            password: "scrypt$salt$key".into(),
            user_id: "u1".into(),
        };
        pool.insert_auth(&auth).expect("insert succeeds");

        assert_eq!(
            pool.find_auth("a@example.com").expect("find succeeds"),
            Some(auth)
        );
        assert_eq!(
            pool.find_auth("missing@example.com")
                .expect("find succeeds"),
            None
        );

        assert_eq!(
            pool.update_auth_password("a@example.com", "scrypt$new$key")
                .expect("update succeeds"),
            1
        );
        assert_eq!(
            pool.find_auth("a@example.com")
                .expect("find succeeds")
                .expect("auth found")
                .password,
            "scrypt$new$key"
        );
    }

    #[test]
    fn inserts_finds_and_deletes_webhook_event() {
        let tmp = TempDb::new("webhook");
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");

        assert_eq!(
            pool.find_webhook_event("evt_1").expect("find succeeds"),
            None
        );
        pool.insert_webhook_event("evt_1", "invoice.paid", 1234)
            .expect("insert succeeds");
        assert_eq!(
            pool.find_webhook_event("evt_1").expect("find succeeds"),
            Some(WebhookEvent {
                event_id: "evt_1".into(),
                event_type: "invoice.paid".into(),
                processed_at: 1234,
            })
        );

        let err = pool
            .insert_webhook_event("evt_1", "invoice.paid", 1234)
            .expect_err("duplicate event fails");
        assert!(err.message.contains("UNIQUE constraint failed"));

        pool.delete_webhook_event("evt_1").expect("delete succeeds");
        assert_eq!(
            pool.find_webhook_event("evt_1").expect("find succeeds"),
            None
        );
    }

    #[test]
    fn binds_text_safely_for_values_with_quotes_and_unicode() {
        let tmp = TempDb::new("bind");
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");
        let mut user = sample_user("u1", "o'brien@example.com");
        user.name = "Zoë \"; DROP TABLE Users; --".to_string();
        pool.insert_user(&user).expect("insert succeeds");

        let found = pool
            .find_user(&UserQuery::Email("o'brien@example.com".into()))
            .expect("find succeeds")
            .expect("user found");
        assert_eq!(found.name, "Zoë \"; DROP TABLE Users; --");
    }

    #[test]
    fn serves_concurrent_callers_from_the_pool() {
        let tmp = TempDb::new("concurrent");
        let pool = Arc::new(Pool::open(&tmp.path(), 3).expect("pool opens"));

        let workers: Vec<_> = (0..8)
            .map(|worker| {
                let pool = Arc::clone(&pool);
                std::thread::spawn(move || {
                    for step in 0..10 {
                        let id = format!("u-{worker}-{step}");
                        let email = format!("{id}@example.com");
                        pool.insert_user(&sample_user(&id, &email))
                            .expect("insert succeeds");
                        pool.increment_usage_count(&id, 1).expect("inc succeeds");
                        let found = pool
                            .find_user(&UserQuery::Id(id.clone()))
                            .expect("find succeeds")
                            .expect("user found");
                        assert_eq!(found.email, email);
                    }
                })
            })
            .collect();

        for worker in workers {
            worker.join().expect("worker finished");
        }

        let total = pool
            .with(|db| db.query("SELECT COUNT(*) AS n FROM Users", &[]))
            .expect("count succeeds");
        assert_eq!(total.first().and_then(|r| r.int("n")), Some(80));
    }

    #[test]
    fn a_connection_returned_after_close_all_is_closed_not_pooled() {
        let tmp = TempDb::new("late-return");
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");
        pool.with(|_db| {
            pool.close_all();
            Ok(())
        })
        .expect("checked-out work finishes");
        assert_eq!(pool.lock().idle.len(), 0);
        assert!(pool.find_user(&UserQuery::Id("u1".into())).is_err());
    }

    #[test]
    fn falsy_columns_read_back_like_node() {
        let tmp = TempDb::new("falsy");
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");
        pool.insert_user(&sample_user("u1", "u1@example.com")).unwrap();
        pool.with(|db| {
            db.exec(
                "UPDATE Users SET subscription_stripeID = '', subscription_status = 'active', \
                 usage_count = NULL, usage_reset_at = 0 WHERE _id = 'u1'",
            )
        })
        .unwrap();
        let user = pool.find_user(&UserQuery::Id("u1".into())).unwrap().unwrap();
        assert_eq!(user.subscription, None, "an empty stripe id means no subscription");
        assert_eq!(
            user.usage,
            Some(Usage {
                count: 0,
                reset_at: None
            })
        );
    }

    #[test]
    fn find_auth_treats_a_row_with_a_null_column_as_missing() {
        let tmp = TempDb::new("auth-null");
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");
        pool.with(|db| {
            db.exec("DROP TABLE Auths")?;
            db.exec("CREATE TABLE Auths (email TEXT PRIMARY KEY, password TEXT, userID TEXT)")?;
            db.exec("INSERT INTO Auths (email, password, userID) VALUES ('a@example.com', 'scrypt$x$y', NULL)")?;
            db.exec("INSERT INTO Auths (email, password, userID) VALUES ('b@example.com', NULL, 'u2')")
        })
        .unwrap();
        assert_eq!(pool.find_auth("a@example.com").unwrap(), None);
        assert_eq!(pool.find_auth("b@example.com").unwrap(), None);
    }

    #[test]
    fn foreign_keys_stay_off_like_the_node_adapter() {
        let tmp = TempDb::new("fk-off");
        let pool = Pool::open(&tmp.path(), 2).expect("pool opens");
        for _ in 0..2 {
            let rows = pool.with(|db| db.query("PRAGMA foreign_keys", &[])).unwrap();
            assert_eq!(rows.first().and_then(|r| r.int("foreign_keys")), Some(0));
        }
        pool.insert_auth(&AuthRecord {
            email: "orphan@example.com".into(),
            password: "scrypt$salt$key".into(),
            user_id: "no-such-user".into(),
        })
        .expect("an auth row without its user is accepted, as under Node");
    }

    #[test]
    fn close_all_rejects_further_use() {
        let tmp = TempDb::new("closed");
        let pool = Pool::open(&tmp.path(), 2).expect("pool opens");
        pool.close_all();

        let err = pool
            .find_user(&UserQuery::Id("u1".into()))
            .expect_err("closed pool rejects work");
        assert_eq!(err.message, "database pool is closed");

        pool.close_all();
    }

    #[test]
    fn returns_connection_after_a_panicking_closure() {
        let tmp = TempDb::new("panic");
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");

        let caught = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            pool.with(|_db| -> Result<(), DbError> { panic!("boom") })
        }));
        assert!(caught.is_err(), "closure panicked");

        pool.insert_user(&sample_user("u1", "u1@example.com"))
            .expect("pool still usable");
    }

    #[test]
    fn reports_driver_errors_with_message() {
        let tmp = TempDb::new("errors");
        let pool = Pool::open(&tmp.path(), 1).expect("pool opens");
        let err = pool
            .with(|db| db.query("SELECT * FROM NoSuchTable", &[]))
            .expect_err("bad SQL fails");
        assert!(
            err.message.contains("no such table"),
            "unexpected message: {}",
            err.message
        );
    }
}
