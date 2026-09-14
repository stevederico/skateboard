//! SQLite storage layer: a safe wrapper over the system `libsqlite3`, a small
//! connection pool, and the typed store API the server routes call.
//!
//! Zero-crate replacement for `backend/adapters/sqlite.ts`. SQLite is linked as
//! a *system library* (`#[link(name = "sqlite3")]`), not a crate, so the
//! dependency list stays empty. Every `unsafe` block lives in this file's FFI
//! section and carries a `// SAFETY:` justification; the exported surface
//! ([`Db`], [`Pool`], [`Row`], the store methods) is entirely safe.
//!
//! Behavioral parity with the Node adapter is deliberate and load-bearing —
//! including its quirks. The two that bite hardest are documented at
//! [`Pool::find_user`]: a stored `usage_reset_at` of `0` reads back as `None`
//! (JS `||`), while a stored `subscription_expires` of `0` reads back as
//! `Some(0)` (JS `??`).

use std::ffi::{c_char, c_int, CStr, CString};
use std::path::Path;
use std::sync::{Condvar, Mutex, MutexGuard};

// ==== FFI ====

/// Raw bindings to the system `libsqlite3`.
///
/// Private: nothing here escapes the module, so the crate never sees a raw
/// pointer or an `extern "C"` signature.
mod ffi {
    use std::ffi::{c_char, c_double, c_int, c_void};

    /// Opaque database connection handle (`sqlite3`).
    #[repr(C)]
    pub struct Sqlite3 {
        _private: [u8; 0],
    }

    /// Opaque prepared statement handle (`sqlite3_stmt`).
    #[repr(C)]
    pub struct Sqlite3Stmt {
        _private: [u8; 0],
    }

    /// `sqlite3_destructor_type` — how SQLite should release a bound buffer.
    pub type Destructor = Option<unsafe extern "C" fn(*mut c_void)>;

    /// Row callback passed to `sqlite3_exec`. Always `None` here.
    pub type ExecCallback = Option<
        unsafe extern "C" fn(*mut c_void, c_int, *mut *mut c_char, *mut *mut c_char) -> c_int,
    >;

    /// Success.
    pub const SQLITE_OK: c_int = 0;
    /// `sqlite3_step` produced a row.
    pub const SQLITE_ROW: c_int = 100;
    /// `sqlite3_step` finished the statement.
    pub const SQLITE_DONE: c_int = 101;
    /// Library used incorrectly — reused for this module's own precondition errors.
    pub const SQLITE_MISUSE: c_int = 21;

    /// Open for reading and writing.
    pub const SQLITE_OPEN_READWRITE: c_int = 0x0000_0002;
    /// Create the file if it does not exist.
    pub const SQLITE_OPEN_CREATE: c_int = 0x0000_0004;
    /// Serialized threading mode — the connection guards itself with a mutex.
    pub const SQLITE_OPEN_FULLMUTEX: c_int = 0x0001_0000;

    /// Column holds a 64-bit integer.
    pub const SQLITE_INTEGER: c_int = 1;
    /// Column holds a double.
    pub const SQLITE_FLOAT: c_int = 2;
    /// Column holds SQL NULL.
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

// ==== SAFE WRAPPER ====

/// A SQLite failure: the driver result code plus `sqlite3_errmsg` text.
///
/// `message` carries the driver text verbatim because callers pattern-match on
/// it — the signup route in `server.ts` detects a duplicate account by testing
/// for the substring `"UNIQUE constraint failed"`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DbError {
    /// SQLite extended result code, or [`ffi::SQLITE_MISUSE`] for local precondition failures.
    pub code: i32,
    /// Driver error text, suitable for substring matching.
    pub message: String,
}

impl std::fmt::Display for DbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "sqlite error {}: {}", self.code, self.message)
    }
}

impl std::error::Error for DbError {}

impl DbError {
    /// Build a local (non-driver) error, e.g. a bad path or a closed pool.
    fn local(message: impl Into<String>) -> DbError {
        DbError {
            code: ffi::SQLITE_MISUSE,
            message: message.into(),
        }
    }
}

/// A single SQLite value, covering the four storage classes this schema uses.
///
/// BLOB is deliberately absent: no column in the ported schema stores one, and
/// `sqlite3_column_text` coerces a stray blob to [`Value::Text`].
/// // yagni: no Blob variant, add one if a binary column ever lands.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    /// SQL NULL.
    Null,
    /// 64-bit integer.
    Int(i64),
    /// Double.
    Real(f64),
    /// UTF-8 text.
    Text(String),
}

/// One result row, holding `(column name, value)` pairs in column order.
///
/// Lookup is a linear scan; the widest table here has nine columns, so a map
/// would cost more in allocation than it saves in comparisons.
#[derive(Debug, Clone, PartialEq)]
pub struct Row {
    cells: Vec<(String, Value)>,
}

impl Row {
    /// Borrow a column's value by name, or `None` when the column is absent.
    ///
    /// A column that exists but holds SQL NULL returns `Some(&Value::Null)` —
    /// distinguishing "no such column" from "column is null" is what makes the
    /// stale-schema migration check work.
    pub fn get(&self, col: &str) -> Option<&Value> {
        self.cells
            .iter()
            .find(|(name, _)| name == col)
            .map(|(_, value)| value)
    }

    /// Borrow a column as `&str`. `None` unless the column exists and is text.
    pub fn text(&self, col: &str) -> Option<&str> {
        match self.get(col) {
            Some(Value::Text(s)) => Some(s),
            _ => None,
        }
    }

    /// Read a column as `i64`. `None` unless the column exists and is an integer.
    pub fn int(&self, col: &str) -> Option<i64> {
        match self.get(col) {
            Some(Value::Int(v)) => Some(*v),
            _ => None,
        }
    }
}

/// Rows affected and rowid produced by a write statement.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Changes {
    /// Rows inserted, updated, or deleted by the most recent statement.
    pub changes: i64,
    /// Rowid of the most recent successful insert on this connection.
    pub last_insert_rowid: i64,
}

/// An open SQLite connection.
///
/// Opened with `SQLITE_OPEN_FULLMUTEX` (serialized threading mode), so the
/// handle is safe to move between threads — which is what [`Pool`] does when it
/// hands a connection to a worker. The pool still gives each caller exclusive
/// use, so the serialization mutex is never actually contended; FULLMUTEX buys
/// a sound `Send` impl rather than throughput.
pub struct Db {
    handle: *mut ffi::Sqlite3,
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
        unsafe {
            ffi::sqlite3_close_v2(self.handle);
        }
    }
}

/// A prepared statement, finalized on drop so early returns cannot leak it.
struct Stmt<'a> {
    /// Keeps the connection borrowed for the statement's lifetime.
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
    /// Open (or create) the database file at `path`.
    ///
    /// Sets a 5 second busy timeout so concurrent writers retry instead of
    /// failing immediately with `SQLITE_BUSY`.
    ///
    /// # Errors
    /// Returns [`DbError`] when the path contains an interior NUL byte or
    /// SQLite cannot open the file.
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
        let db = Db { handle };
        if rc != ffi::SQLITE_OK {
            // Read the message off the handle before `db` drops and closes it.
            return Err(db.last_error(rc));
        }

        // SAFETY: `handle` is a live connection just returned by open_v2.
        unsafe {
            ffi::sqlite3_busy_timeout(db.handle, BUSY_TIMEOUT_MS);
        }
        Ok(db)
    }

    /// Run one or more statements with no parameters and no result rows.
    ///
    /// # Errors
    /// Returns [`DbError`] carrying the driver message on failure.
    pub fn exec(&self, sql: &str) -> Result<(), DbError> {
        let text =
            CString::new(sql).map_err(|_| DbError::local("SQL contains an interior NUL byte"))?;

        // SAFETY: `text` outlives the call; a null callback/arg means "discard
        // any rows", and a null errmsg out-pointer means SQLite allocates
        // nothing for us to free — the message is read from the handle instead.
        let rc = unsafe {
            ffi::sqlite3_exec(
                self.handle,
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

    /// Run a parameterized statement and collect every result row.
    ///
    /// # Errors
    /// Returns [`DbError`] when the statement fails to prepare, bind, or step.
    pub fn query(&self, sql: &str, params: &[Value]) -> Result<Vec<Row>, DbError> {
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

    /// Run a parameterized write statement and report the rows it touched.
    ///
    /// # Errors
    /// Returns [`DbError`] carrying the driver message — including
    /// `"UNIQUE constraint failed: ..."`, which the signup route matches on.
    pub fn run(&self, sql: &str, params: &[Value]) -> Result<Changes, DbError> {
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
                changes: i64::from(ffi::sqlite3_changes(self.handle)),
                last_insert_rowid: ffi::sqlite3_last_insert_rowid(self.handle),
            }
        };
        Ok(changes)
    }

    /// Compile `sql` into a statement handle tied to this connection.
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
                self.handle,
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
        // Built before the tail check so that returning early still finalizes
        // the compiled statement, via this guard's `Drop`.
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

    /// Bind positional parameters (1-based) to a prepared statement.
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

    /// Build a [`DbError`] from the connection's current error state.
    fn last_error(&self, fallback: c_int) -> DbError {
        // SAFETY: `handle` is live. sqlite3_errmsg returns a NUL-terminated
        // UTF-8 string owned by SQLite and valid until the next call on this
        // handle; it is copied into an owned String before returning.
        unsafe {
            let extended = ffi::sqlite3_extended_errcode(self.handle);
            let msg = ffi::sqlite3_errmsg(self.handle);
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

/// Read a result column's name, falling back to an empty string.
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

/// Read one column of the current row into an owned [`Value`].
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

// ==== POOL ====

/// Milliseconds a blocked writer waits for the database lock before erroring.
const BUSY_TIMEOUT_MS: c_int = 5000;

/// Connections held by a [`Pool`], plus its shutdown flag.
struct PoolState {
    /// Connections currently available for checkout.
    idle: Vec<Db>,
    /// Set by [`Pool::close_all`]; checkouts fail and returns are dropped.
    closed: bool,
}

/// A fixed-size pool of SQLite connections.
///
/// The Node adapter caches one `DatabaseSync` per database name and drives it
/// from a single-threaded event loop. The Rust server is multi-threaded, so
/// connections are pooled and checked out exclusively instead. WAL mode plus a
/// 5 second busy timeout (see [`BUSY_TIMEOUT_MS`]) lets readers run while one
/// writer holds the write lock.
pub struct Pool {
    state: Mutex<PoolState>,
    available: Condvar,
}

/// A borrowed connection, returned to its pool on drop — including on panic.
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
            // Pool shut down while this connection was out: close it instead of
            // resurrecting it. Release the lock first so the close is not held
            // under the pool mutex.
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
    /// Open `size` connections to `path`, apply the pragmas, and ensure the schema.
    ///
    /// Creates the parent directory when missing, matching the Node adapter's
    /// `mkdir('./databases', { recursive: true })`. A `size` of 0 is treated as 1.
    ///
    /// # Errors
    /// Returns [`DbError`] if the directory cannot be created, a connection
    /// cannot be opened, or the schema cannot be created or migrated.
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
            // The schema is shared state; creating it once is enough, and doing
            // it on the first connection matches the Node adapter's
            // create-on-first-open behavior.
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

    /// Run `f` with a pooled connection, returning it afterwards.
    ///
    /// The connection goes back to the pool even if `f` returns an error or
    /// panics (the guard's `Drop` does it).
    ///
    /// # Errors
    /// Returns [`DbError`] if the pool is closed, or whatever `f` returns.
    pub fn with<T>(&self, f: impl FnOnce(&Db) -> Result<T, DbError>) -> Result<T, DbError> {
        let guard = self.checkout()?;
        match guard.db.as_ref() {
            Some(db) => f(db),
            // Unreachable: `checkout` only returns a populated guard.
            None => Err(DbError::local("pooled connection was missing")),
        }
    }

    /// Run `f` inside a single `BEGIN IMMEDIATE` transaction.
    ///
    /// Every statement `f` issues must go through the `&Db` it is handed.
    /// Calling a [`Pool`] method inside `f` would check out a *second*
    /// connection, whose writes are not part of this transaction and which can
    /// deadlock against it on the write lock — so use the `*_tx` helpers.
    ///
    /// `IMMEDIATE` takes the write lock up front instead of upgrading partway
    /// through, which is what makes a read-then-write pair safe: a deferred
    /// transaction can have its read invalidated by another writer and fail at
    /// upgrade time with `SQLITE_BUSY` instead of waiting.
    ///
    /// The transaction is rolled back if `f` returns an error, if the commit
    /// fails, or if `f` panics — a connection is never returned to the pool
    /// with a transaction still open.
    ///
    /// # Errors
    /// Returns [`DbError`] if the pool is closed, the transaction cannot be
    /// started or committed, or whatever `f` returns.
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

    /// Close every idle connection and reject further checkouts.
    ///
    /// Connections currently checked out are closed when their caller returns
    /// them. Waiting threads are woken so none block forever.
    pub fn close_all(&self) {
        let mut state = self.lock();
        state.closed = true;
        let drained = std::mem::take(&mut state.idle);
        drop(state);
        drop(drained);
        self.available.notify_all();
    }

    /// Take a connection, blocking until one is free.
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

    /// Lock the pool state, recovering from poisoning.
    ///
    /// A panic inside a `with` closure must not brick the pool: the state is a
    /// plain `Vec` of handles with no invariant a panic can break, so the
    /// poison flag is cleared rather than propagated.
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

/// Rolls back an open transaction unless it was committed.
///
/// Exists for the panic path: an early `return` can be handled by ordinary
/// control flow, but an unwind through [`Pool::transaction`] would otherwise
/// hand a connection back to the pool mid-transaction, and the next caller to
/// borrow it would silently join that transaction.
struct TxGuard<'a> {
    db: &'a Db,
    committed: bool,
}

impl Drop for TxGuard<'_> {
    fn drop(&mut self) {
        if self.committed {
            return;
        }
        // Nothing useful can be done with a rollback failure here: the caller
        // is already unwinding or returning an error. `Db::exec` logs nothing,
        // so surface it rather than dropping it silently.
        if let Err(e) = self.db.exec("ROLLBACK") {
            eprintln!("warning: transaction rollback failed: {e}");
        }
    }
}

// ==== SCHEMA ====

/// Per-connection pragmas, byte-identical to the Node adapter's.
///
/// `PRAGMA foreign_keys` is deliberately absent: the Node adapter never enables
/// it, so SQLite leaves the `Auths.userID` foreign key declared-but-unenforced.
/// Turning it on here would change behavior (signup rollback ordering, user
/// deletion) relative to the Node backend.
/// // yagni: FKs stay off for parity; enable in both backends together if ever wanted.
const PRAGMAS: &[&str] = &[
    "PRAGMA journal_mode = WAL",
    "PRAGMA synchronous = NORMAL",
    "PRAGMA cache_size = 1000",
    "PRAGMA temp_store = memory",
];

/// `CREATE TABLE IF NOT EXISTS` / index statements, ported verbatim from
/// `ensureSQLiteSchema` in `backend/adapters/sqlite.ts`.
const SCHEMA: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS Users (
        _id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        subscription_stripeID TEXT,
        subscription_expires INTEGER,
        subscription_status TEXT,
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

/// Unique indexes, created after any column migration so the target column exists.
const INDEXES: &[&str] = &[
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON Users(email)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_auths_email ON Auths(email)",
];

/// Columns an older `Users` table may be missing, with their `ADD COLUMN` types.
const USERS_COLUMNS: &[(&str, &str)] = &[
    ("subscription_stripeID", "TEXT"),
    ("subscription_expires", "INTEGER"),
    ("subscription_status", "TEXT"),
    ("usage_count", "INTEGER DEFAULT 0"),
    ("usage_reset_at", "INTEGER"),
];

/// Columns an older `Auths` table may be missing.
///
/// `NOT NULL` needs a default for `ALTER TABLE ... ADD COLUMN` to be legal on a
/// populated table; an empty string is the inert choice (a blank hash never
/// verifies, a blank userID never resolves).
const AUTHS_COLUMNS: &[(&str, &str)] = &[
    ("password", "TEXT NOT NULL DEFAULT ''"),
    ("userID", "TEXT NOT NULL DEFAULT ''"),
];

/// Columns an older `WebhookEvents` table may be missing.
const WEBHOOK_COLUMNS: &[(&str, &str)] = &[
    ("event_type", "TEXT NOT NULL DEFAULT ''"),
    ("processed_at", "INTEGER NOT NULL DEFAULT 0"),
];

/// Apply the connection pragmas.
fn apply_pragmas(db: &Db) -> Result<(), DbError> {
    for pragma in PRAGMAS {
        db.exec(pragma)?;
    }
    Ok(())
}

/// Create the schema, then repair a stale one.
///
/// `CREATE TABLE IF NOT EXISTS` is a no-op against an existing table, so a
/// database created by an older build keeps its old, narrower columns and every
/// query referencing a newer column fails at runtime. After the creates, each
/// table is compared against its expected columns via `PRAGMA table_info` and
/// the missing ones are added.
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

/// Add any of `columns` that `table` does not already have.
///
/// `table` and the column definitions are module constants, never caller input,
/// so interpolating them into SQL introduces no injection surface — SQLite
/// accepts no placeholder in a DDL identifier position anyway.
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

// ==== STORE TYPES ====

/// Stripe subscription state stored flat in `subscription_*` columns.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Subscription {
    /// Stripe customer ID (`cus_...`), stored in `subscription_stripeID`.
    pub stripe_id: String,
    /// Unix seconds when the period ends; `None` when the column is NULL.
    pub expires: Option<i64>,
    /// Stripe subscription status; empty string when the column is NULL.
    pub status: String,
}

/// Free-tier usage counter stored flat in `usage_*` columns.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Usage {
    /// Operations consumed in the current window.
    pub count: i64,
    /// Unix seconds when the window resets. See [`Pool::find_user`] for the 0 quirk.
    pub reset_at: Option<i64>,
}

/// Application user as stored in `Users`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct User {
    /// User ID (UUID v4), the `_id` column.
    pub id: String,
    /// Normalized lowercase email (unique).
    pub email: String,
    /// Display name.
    pub name: String,
    /// Unix milliseconds of account creation.
    pub created_at: i64,
    /// Subscription state, present only once Stripe has populated it.
    pub subscription: Option<Subscription>,
    /// Usage counter; effectively always present on SQLite (see [`Pool::find_user`]).
    pub usage: Option<Usage>,
}

/// Credential record stored in `Auths`, keyed by email.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthRecord {
    /// Normalized lowercase email (primary key).
    pub email: String,
    /// Password hash: `scrypt$<n>$<r>$<p>$<salt>$<key>`, the older
    /// parameterless `scrypt$<salt>$<key>`, or a legacy bcrypt string.
    pub password: String,
    /// Owning user's id, the `userID` column.
    pub user_id: String,
}

/// Processed Stripe webhook event, recorded for idempotency.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebhookEvent {
    /// Stripe event ID (`evt_...`, unique).
    pub event_id: String,
    /// Stripe event type, e.g. `invoice.paid`.
    pub event_type: String,
    /// Unix milliseconds when the event was recorded.
    pub processed_at: i64,
}

/// Selector for a user lookup or delete.
///
/// The Node adapter accepts `{}` and returns null / 0 rows for it; that empty
/// case is simply unrepresentable here, so the check disappears rather than
/// being ported.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UserQuery {
    /// Match on `_id`.
    Id(String),
    /// Match on `email`.
    Email(String),
}

impl UserQuery {
    /// The `WHERE` fragment and bound value for this selector.
    fn clause(&self) -> (&'static str, Value) {
        match self {
            UserQuery::Id(id) => ("_id = ?", Value::Text(id.clone())),
            UserQuery::Email(email) => ("email = ?", Value::Text(email.clone())),
        }
    }
}

/// Rebuild a [`User`] from a `SELECT *` row, nesting the flat columns.
///
/// Returns `None` when a required column is missing or has the wrong storage
/// class, mirroring the `isUserRow` type guard in the Node adapter (which makes
/// `findUser` return null rather than a half-built object).
fn user_from_row(row: &Row) -> Option<User> {
    let id = row.text("_id")?.to_string();
    let email = row.text("email")?.to_string();
    let name = row.text("name")?.to_string();
    let created_at = row.int("created_at")?;

    // JS: `if (result.subscription_stripeID)` — a NULL or empty-string stripe
    // ID is falsy, so no subscription object is produced.
    let subscription = match row.get("subscription_stripeID") {
        Some(Value::Text(stripe_id)) if !stripe_id.is_empty() => Some(Subscription {
            stripe_id: stripe_id.clone(),
            // JS: `?? null` — nullish, so a stored 0 survives as Some(0).
            expires: row.int("subscription_expires"),
            // JS: `?? ''`.
            status: row.text("subscription_status").unwrap_or("").to_string(),
        }),
        _ => None,
    };

    // JS: `if (result.usage_count !== undefined)`. SELECT * always yields the
    // column once the schema exists, so usage is effectively always present.
    let usage = row.get("usage_count").map(|_| Usage {
        // JS: `usage_count || 0` — NULL and 0 both land on 0.
        count: row.int("usage_count").unwrap_or(0),
        // JS: `usage_reset_at || null` — a stored 0 is falsy and becomes null.
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

// ==== STORE API ====

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

/// Whether `tail` points at anything other than trailing whitespace and
/// semicolons within `sql`.
///
/// `tail` comes from `sqlite3_prepare_v2` and points into `sql` just past the
/// statement it compiled. A pointer outside `sql` is treated as "nothing left"
/// rather than trusted, so a surprising value cannot produce an out-of-range
/// slice.
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

/// Insert a new user on an existing connection.
///
/// Only `_id`, `email`, `name`, `created_at` are written; the subscription and
/// usage columns take their schema defaults, so the `subscription` / `usage`
/// fields of `u` are ignored.
///
/// # Errors
/// Returns [`DbError`] whose `message` contains `"UNIQUE constraint failed"`
/// when the email is already registered.
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

/// Insert a credential record on an existing connection.
///
/// # Errors
/// Returns [`DbError`] whose `message` contains `"UNIQUE constraint failed"`
/// when the email already has credentials.
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
    /// Find a user by id or email, nesting the flat columns into
    /// [`Subscription`] / [`Usage`].
    ///
    /// Two JS truthiness quirks are reproduced exactly, because routes read
    /// these values:
    /// - `subscription` appears only when `subscription_stripeID` is a
    ///   non-empty string.
    /// - `usage.reset_at` of `0` reads back as `None` (JS `||`), while
    ///   `subscription.expires` of `0` reads back as `Some(0)` (JS `??`).
    ///
    /// # Errors
    /// Returns [`DbError`] on a driver failure.
    pub fn find_user(&self, q: &UserQuery) -> Result<Option<User>, DbError> {
        let (clause, param) = q.clause();
        let sql = format!("SELECT * FROM Users WHERE {clause}");
        self.with(|db| {
            let rows = db.query(&sql, &[param.clone()])?;
            Ok(rows.first().and_then(user_from_row))
        })
    }

    /// Insert a new user.
    ///
    /// Only `_id`, `email`, `name`, `created_at` are written; the subscription
    /// and usage columns take their schema defaults, matching `insertUser`. The
    /// `subscription` / `usage` fields of `u` are therefore ignored.
    ///
    /// # Errors
    /// Returns [`DbError`] whose `message` contains
    /// `"UNIQUE constraint failed"` when the email is already registered.
    pub fn insert_user(&self, u: &User) -> Result<(), DbError> {
        self.with(|db| insert_user_tx(db, u))
    }

    /// Set a user's display name. Returns the number of rows modified.
    ///
    /// The Node adapter filters `$set` keys against an `ALLOWED_FIELDS`
    /// whitelist to keep caller-supplied names out of the SQL. Here the typed
    /// methods make that structural: no caller can name a column, so the
    /// whitelist is enforced by the type system and has no runtime counterpart.
    ///
    /// # Errors
    /// Returns [`DbError`] on a driver failure.
    pub fn update_user_set_name(&self, id: &str, name: &str) -> Result<u64, DbError> {
        self.with(|db| {
            let changes = db.run(
                "UPDATE Users SET name = ? WHERE _id = ?",
                &[Value::Text(name.to_string()), Value::Text(id.to_string())],
            )?;
            Ok(changes.changes.max(0) as u64)
        })
    }

    /// Replace a user's subscription columns. Returns the number of rows modified.
    ///
    /// # Errors
    /// Returns [`DbError`] on a driver failure.
    pub fn update_user_subscription(&self, id: &str, sub: &Subscription) -> Result<u64, DbError> {
        self.with(|db| {
            let changes = db.run(
                "UPDATE Users SET
        subscription_stripeID = ?,
        subscription_expires = ?,
        subscription_status = ?
        WHERE _id = ?",
                &[
                    Value::Text(sub.stripe_id.clone()),
                    sub.expires.map_or(Value::Null, Value::Int),
                    Value::Text(sub.status.clone()),
                    Value::Text(id.to_string()),
                ],
            )?;
            Ok(changes.changes.max(0) as u64)
        })
    }

    /// Replace a user's usage columns. Returns the number of rows modified.
    ///
    /// # Errors
    /// Returns [`DbError`] on a driver failure.
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

    /// Atomically add `delta` to a user's usage count.
    ///
    /// `COALESCE` matches the Node adapter's `$inc` SQL so a NULL counter
    /// starts from 0. A negative `delta` is the rollback path: the usage route
    /// increments before doing the work and decrements by 1 if it fails.
    ///
    /// # Errors
    /// Returns [`DbError`] on a driver failure.
    pub fn increment_usage_count(&self, id: &str, delta: i64) -> Result<u64, DbError> {
        self.with(|db| {
            let changes = db.run(
                "UPDATE Users SET usage_count = COALESCE(usage_count, 0) + ? WHERE _id = ?",
                &[Value::Int(delta), Value::Text(id.to_string())],
            )?;
            Ok(changes.changes.max(0) as u64)
        })
    }

    /// Consume one unit of quota, but only if the user is below `limit`.
    ///
    /// The limit is enforced by the `WHERE` clause, so the check and the
    /// increment are a single atomic statement. Incrementing first and
    /// compensating afterwards cannot hold a limit under concurrency: two
    /// requests can both read a count below the limit and both increment, and
    /// the compensating decrements then race each other too.
    ///
    /// # Arguments
    ///
    /// * `id` - User id.
    /// * `limit` - Maximum number of units allowed in the current window.
    ///
    /// # Returns
    ///
    /// `Some(new_count)` if a unit was consumed, or `None` if the user is
    /// already at or above `limit` — which is also what a missing user returns,
    /// since neither case may proceed.
    ///
    /// # Errors
    /// Returns [`DbError`] on a driver failure.
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

    /// Start a fresh usage window and consume the first unit atomically.
    ///
    /// Resetting and then incrementing as two calls lets a concurrent request
    /// land in between and have its increment erased by the reset.
    ///
    /// # Arguments
    ///
    /// * `id` - User id.
    /// * `reset_at` - When the new window expires, in seconds.
    /// * `consume` - Whether to count this request against the new window.
    ///
    /// # Returns
    /// The usage count after the reset: 1 when `consume`, otherwise 0.
    ///
    /// # Errors
    /// Returns [`DbError`] on a driver failure.
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

    /// Delete a user by id or email. Returns the number of rows deleted.
    ///
    /// # Errors
    /// Returns [`DbError`] on a driver failure.
    pub fn delete_user(&self, q: &UserQuery) -> Result<u64, DbError> {
        let (clause, param) = q.clause();
        let sql = format!("DELETE FROM Users WHERE {clause}");
        self.with(|db| {
            let changes = db.run(&sql, &[param.clone()])?;
            Ok(changes.changes.max(0) as u64)
        })
    }

    /// Find a credential record by email.
    ///
    /// # Errors
    /// Returns [`DbError`] on a driver failure.
    pub fn find_auth(&self, email: &str) -> Result<Option<AuthRecord>, DbError> {
        self.with(|db| {
            let rows = db.query(
                "SELECT * FROM Auths WHERE email = ?",
                &[Value::Text(email.to_string())],
            )?;
            // Mirrors the isAuthRecord guard: a row missing any required text
            // column reads as "not found" rather than a partial record.
            Ok(rows.first().and_then(|row| {
                Some(AuthRecord {
                    email: row.text("email")?.to_string(),
                    password: row.text("password")?.to_string(),
                    user_id: row.text("userID")?.to_string(),
                })
            }))
        })
    }

    /// Insert a credential record.
    ///
    /// # Errors
    /// Returns [`DbError`] whose `message` contains
    /// `"UNIQUE constraint failed"` when the email already has credentials.
    pub fn insert_auth(&self, a: &AuthRecord) -> Result<(), DbError> {
        self.with(|db| insert_auth_tx(db, a))
    }

    /// Create a user and their credential record as one unit.
    ///
    /// Signup writes two tables, and a half-written signup is unrecoverable
    /// from the outside: a `Users` row with no `Auths` row can never be signed
    /// in to, yet its email occupies the unique index, so the address cannot be
    /// registered again. Doing both inserts in one transaction removes that
    /// state, and with it the compensating delete the caller used to need.
    ///
    /// # Errors
    /// Returns [`DbError`] whose `message` contains
    /// `"UNIQUE constraint failed"` when the email is already registered.
    /// Nothing is written in that case.
    pub fn create_account(&self, u: &User, a: &AuthRecord) -> Result<(), DbError> {
        self.transaction(|db| {
            insert_user_tx(db, u)?;
            insert_auth_tx(db, a)
        })
    }

    /// Replace a credential record's password hash (the lazy bcrypt-to-scrypt
    /// rehash on signin). Returns the number of rows modified.
    ///
    /// # Errors
    /// Returns [`DbError`] on a driver failure.
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

    /// Idempotency lookup for a processed Stripe webhook event.
    ///
    /// # Errors
    /// Returns [`DbError`] on a driver failure.
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

    /// Record a Stripe webhook event as processed.
    ///
    /// # Errors
    /// Returns [`DbError`] whose `message` contains
    /// `"UNIQUE constraint failed"` when the event was already recorded.
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

    /// Forget a webhook event so Stripe's retry is processed instead of skipped.
    ///
    /// Called when handling failed after the idempotency row was written;
    /// without it the retry would be treated as a duplicate and the update lost.
    ///
    /// # Errors
    /// Returns [`DbError`] on a driver failure.
    pub fn delete_webhook_event(&self, event_id: &str) -> Result<(), DbError> {
        self.with(|db| {
            db.run(
                "DELETE FROM WebhookEvents WHERE event_id = ?",
                &[Value::Text(event_id.to_string())],
            )?;
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;

    /// Counter making each test's temp directory unique within the process.
    static SEQ: AtomicU64 = AtomicU64::new(0);

    /// A throwaway directory holding one test database, removed on drop.
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

        /// Path to the database file, inside a `databases` subdirectory that
        /// does not exist yet — so every test also exercises directory creation.
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

    // --- statement compilation ---

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
        // The `Send` impl on `Db` is only sound against a thread-safe build, so
        // this is a requirement on the environment, not a property of our code.
        require_threadsafe_sqlite().expect("libsqlite3 must be built thread-safe");
    }

    // --- transactions ---

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
        // A single connection, so the next operation is guaranteed to reuse the
        // one the panic unwound through.
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
        // Proves the connection is usable and not still inside a transaction:
        // a stray open transaction would make this BEGIN fail.
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

        // The Auths insert now collides, so the Users insert must be undone.
        let err = pool
            .create_account(&sample_user("u1", "dup@example.com"), &auth)
            .expect_err("duplicate credentials must fail");
        assert!(err.message.contains("UNIQUE constraint failed"), "{err}");
        assert!(
            pool.find_user(&UserQuery::Id("u1".into())).unwrap().is_none(),
            "a failed signup must not leave a user row holding the email"
        );
    }

    // --- usage accounting ---

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

        // Simulate a database written by an older build: Users exists but stops
        // at created_at, so CREATE TABLE IF NOT EXISTS will not repair it.
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

        // The legacy row survives and reads back through the new columns.
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
        // The signup route detects a duplicate account by this exact substring.
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
            },
        )
        .expect("update succeeds");

        let user = pool
            .find_user(&UserQuery::Id("u1".into()))
            .expect("find succeeds")
            .expect("user found");
        // JS `?? null` is nullish, not falsy — 0 is kept.
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
        // JS `|| null` is falsy-based — a stored 0 becomes null.
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
        // Rollback path: the usage route decrements by 1 when the work fails.
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

        // No such user: zero rows modified, no error.
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
        // Fewer connections than threads, so checkouts genuinely queue.
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
    fn close_all_rejects_further_use() {
        let tmp = TempDb::new("closed");
        let pool = Pool::open(&tmp.path(), 2).expect("pool opens");
        pool.close_all();

        let err = pool
            .find_user(&UserQuery::Id("u1".into()))
            .expect_err("closed pool rejects work");
        assert_eq!(err.message, "database pool is closed");

        // Idempotent: closing twice must not hang or panic.
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

        // The single connection must be back in the pool, not lost.
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
