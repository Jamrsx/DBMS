//! The database manager's backend: one connection pool to NexDB's MySQL as `root`. The password
//! is only ever kept in memory, never written to disk.

use mysql::prelude::Queryable;
use mysql::{OptsBuilder, Pool, PoolConstraints, PoolOpts, Value};
use serde::Serialize;
use serde_json::json;
use std::sync::Mutex;
use std::time::Instant;

/// Rows returned to the screen at most, for any one query.
pub const ROW_LIMIT: usize = 1000;
const SYSTEM_DATABASES: [&str; 4] = ["information_schema", "mysql", "performance_schema", "sys"];

#[derive(Default)]
pub struct Db {
    pool: std::sync::Arc<Mutex<Option<Pool>>>,
    /// Kept in memory only, so backups can sign in the same way.
    password: std::sync::Arc<Mutex<Option<String>>>,
}

#[derive(Serialize, Debug)]
pub struct Connected {
    pub version: String,
}

#[derive(Serialize, Debug)]
pub struct DatabaseInfo {
    pub name: String,
    pub tables: u64,
    pub size_bytes: u64,
    pub system: bool,
}

#[derive(Serialize, Debug)]
pub struct TableInfo {
    pub name: String,
    pub is_view: bool,
    pub engine: Option<String>,
    pub rows: Option<u64>,
    pub size_bytes: u64,
}

#[derive(Serialize, Debug)]
pub struct ColumnInfo {
    pub name: String,
    pub column_type: String,
    pub nullable: bool,
    pub key: String,
    pub default: Option<String>,
    pub extra: String,
}

#[derive(Serialize, Debug)]
pub struct ResultSet {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    /// More rows existed than `ROW_LIMIT`.
    pub truncated: bool,
}

#[derive(Serialize, Debug)]
pub struct QueryOutput {
    pub sets: Vec<ResultSet>,
    /// Rows changed by statements that return no table (INSERT, UPDATE, DELETE...).
    pub affected: u64,
    pub elapsed_ms: u64,
}

#[derive(Serialize, Debug)]
pub struct TablePage {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub total: u64,
}

/// Database and table names: letters, digits, `_` and `$`, up to 64 characters.
pub fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
}

pub(crate) fn quote(name: &str) -> Result<String, String> {
    if valid_name(name) {
        Ok(format!("`{name}`"))
    } else {
        Err(format!("\"{name}\" isn't a name this screen can handle. Use letters, numbers and underscores."))
    }
}

pub fn to_json(value: Value) -> serde_json::Value {
    match value {
        Value::NULL => serde_json::Value::Null,
        Value::Int(i) => json!(i),
        Value::UInt(u) => json!(u),
        Value::Float(f) => json!(f),
        Value::Double(d) => json!(d),
        Value::Bytes(b) => match String::from_utf8(b) {
            Ok(text) => json!(text),
            Err(e) => json!(format!("(binary, {} bytes)", e.into_bytes().len())),
        },
        Value::Date(y, mo, d, h, mi, s, us) => {
            let base = if h == 0 && mi == 0 && s == 0 && us == 0 {
                format!("{y:04}-{mo:02}-{d:02}")
            } else {
                format!("{y:04}-{mo:02}-{d:02} {h:02}:{mi:02}:{s:02}")
            };
            json!(base)
        }
        Value::Time(neg, days, h, mi, s, _) => {
            let hours = days * 24 + u32::from(h);
            json!(format!("{}{hours:02}:{mi:02}:{s:02}", if neg { "-" } else { "" }))
        }
    }
}

/// Turns driver errors into messages for people.
pub fn friendly(err: mysql::Error) -> String {
    match &err {
        mysql::Error::MySqlError(e) if e.code == 1045 => "NEEDS_PASSWORD".into(),
        mysql::Error::MySqlError(e) => e.message.clone(),
        mysql::Error::IoError(_)
        | mysql::Error::DriverError(mysql::DriverError::ConnectTimeout | mysql::DriverError::CouldNotConnect(_)) => {
            "MySQL isn't running. Start it from the Dashboard, then try again.".into()
        }
        other => other.to_string(),
    }
}

impl Db {
    pub fn connect(&self, port: u16, password: Option<&str>) -> Result<Connected, String> {
        let opts = OptsBuilder::new()
            .ip_or_hostname(Some("127.0.0.1"))
            .tcp_port(port)
            .user(Some("root"))
            .pass(password.filter(|p| !p.is_empty()))
            .prefer_socket(false)
            .tcp_connect_timeout(Some(std::time::Duration::from_secs(4)))
            .pool_opts(PoolOpts::default().with_constraints(PoolConstraints::new(0, 4).unwrap()));
        let pool = Pool::new(opts).map_err(friendly)?;
        let version: String = pool
            .get_conn()
            .map_err(friendly)?
            .query_first("SELECT VERSION()")
            .map_err(friendly)?
            .unwrap_or_default();
        *self.pool.lock().unwrap() = Some(pool);
        *self.password.lock().unwrap() = password.filter(|p| !p.is_empty()).map(str::to_string);
        Ok(Connected { version })
    }

    pub fn disconnect(&self) {
        *self.pool.lock().unwrap() = None;
    }

    pub(crate) fn conn(&self) -> Result<mysql::PooledConn, String> {
        let guard = self.pool.lock().unwrap();
        let pool = guard.as_ref().ok_or("NOT_CONNECTED")?;
        pool.get_conn().map_err(friendly)
    }

    pub fn databases(&self) -> Result<Vec<DatabaseInfo>, String> {
        let mut conn = self.conn()?;
        let rows: Vec<(String, u64, Option<u64>)> = conn
            .query(
                "SELECT s.SCHEMA_NAME, COUNT(t.TABLE_NAME), SUM(t.DATA_LENGTH + t.INDEX_LENGTH) \
                 FROM information_schema.SCHEMATA s \
                 LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = s.SCHEMA_NAME \
                 GROUP BY s.SCHEMA_NAME ORDER BY s.SCHEMA_NAME",
            )
            .map_err(friendly)?;
        let mut list: Vec<DatabaseInfo> = rows
            .into_iter()
            .map(|(name, tables, size)| DatabaseInfo {
                system: SYSTEM_DATABASES.contains(&name.to_lowercase().as_str()),
                name,
                tables,
                size_bytes: size.unwrap_or(0),
            })
            .collect();
        // Your own databases first, MySQL's built-in ones last.
        list.sort_by_key(|d| (d.system, d.name.to_lowercase()));
        Ok(list)
    }

    pub fn tables(&self, db: &str) -> Result<Vec<TableInfo>, String> {
        quote(db)?;
        let mut conn = self.conn()?;
        let rows: Vec<(String, String, Option<String>, Option<u64>, Option<u64>)> = conn
            .exec(
                "SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_ROWS, DATA_LENGTH + INDEX_LENGTH \
                 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
                (db,),
            )
            .map_err(friendly)?;
        Ok(rows
            .into_iter()
            .map(|(name, kind, engine, rows, size)| TableInfo {
                name,
                is_view: kind.contains("VIEW"),
                engine,
                rows,
                size_bytes: size.unwrap_or(0),
            })
            .collect())
    }

    pub fn columns(&self, db: &str, table: &str) -> Result<Vec<ColumnInfo>, String> {
        quote(db)?;
        quote(table)?;
        let mut conn = self.conn()?;
        let rows: Vec<(String, String, String, String, Option<String>, String)> = conn
            .exec(
                "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA \
                 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? \
                 ORDER BY ORDINAL_POSITION",
                (db, table),
            )
            .map_err(friendly)?;
        Ok(rows
            .into_iter()
            .map(|(name, column_type, nullable, key, default, extra)| ColumnInfo {
                name,
                column_type,
                nullable: nullable == "YES",
                key,
                default,
                extra,
            })
            .collect())
    }

    pub fn browse(&self, db: &str, table: &str, page: u64, page_size: u64) -> Result<TablePage, String> {
        let (qdb, qtable) = (quote(db)?, quote(table)?);
        let size = page_size.clamp(1, ROW_LIMIT as u64);
        let mut conn = self.conn()?;
        let total: u64 = conn
            .query_first(format!("SELECT COUNT(*) FROM {qdb}.{qtable}"))
            .map_err(friendly)?
            .unwrap_or(0);
        let mut result = conn
            .query_iter(format!("SELECT * FROM {qdb}.{qtable} LIMIT {size} OFFSET {}", page * size))
            .map_err(friendly)?;
        let mut first = result.iter().ok_or("The table returned nothing.")?;
        let set = read_set(&mut first, ROW_LIMIT);
        Ok(TablePage { columns: set.columns, rows: set.rows, total })
    }

    pub fn query(&self, db: Option<&str>, sql: &str) -> Result<QueryOutput, String> {
        if sql.trim().is_empty() {
            return Err("Type a SQL statement first.".into());
        }
        let mut conn = self.conn()?;
        if let Some(db) = db.filter(|d| !d.is_empty()) {
            let q = quote(db)?;
            conn.query_drop(format!("USE {q}")).map_err(friendly)?;
        }
        let started = Instant::now();
        let mut result = conn.query_iter(sql).map_err(friendly)?;
        let mut sets = Vec::new();
        let mut affected = 0;
        while let Some(mut set) = result.iter() {
            affected += set.affected_rows();
            if set.columns().as_ref().is_empty() {
                continue;
            }
            if sets.len() < 5 {
                sets.push(read_set(&mut set, ROW_LIMIT));
            } else {
                for _ in set.by_ref() {}
            }
        }
        Ok(QueryOutput { sets, affected, elapsed_ms: started.elapsed().as_millis() as u64 })
    }

    pub fn create_database(&self, name: &str) -> Result<(), String> {
        let q = quote(name)?;
        self.conn()?
            .query_drop(format!("CREATE DATABASE {q} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
            .map_err(friendly)
    }

    pub fn drop_database(&self, name: &str) -> Result<(), String> {
        let q = quote(name)?;
        if SYSTEM_DATABASES.contains(&name.to_lowercase().as_str()) {
            return Err("MySQL's built-in databases can't be deleted here.".into());
        }
        self.conn()?.query_drop(format!("DROP DATABASE {q}")).map_err(friendly)
    }
}

/// Reads up to `limit` rows of the current result set and drains the rest.
fn read_set<'a, 'b, 'c, 'd, T: mysql::prelude::Protocol>(
    set: &mut mysql::ResultSet<'a, 'b, 'c, 'd, T>,
    limit: usize,
) -> ResultSet {
    let columns: Vec<String> = set.columns().as_ref().iter().map(|c| c.name_str().to_string()).collect();
    let kinds: Vec<mysql::consts::ColumnType> = set.columns().as_ref().iter().map(|c| c.column_type()).collect();
    let mut rows = Vec::new();
    let mut truncated = false;
    for row in set.by_ref() {
        let Ok(row) = row else { break };
        if rows.len() >= limit {
            truncated = true;
            continue;
        }
        rows.push(row.unwrap().into_iter().zip(&kinds).map(|(v, k)| typed(v, *k)).collect());
    }
    ResultSet { columns, rows, truncated }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_checked() {
        assert!(valid_name("my_shop$1"));
        for bad in ["", "a b", "a`b", "a;drop", "../x", "é"] {
            assert!(!valid_name(bad), "{bad}");
        }
        assert!(quote("a`b").is_err());
        assert_eq!(quote("shop").unwrap(), "`shop`");
    }

    #[test]
    fn values_become_json() {
        assert_eq!(to_json(Value::NULL), serde_json::Value::Null);
        assert_eq!(to_json(Value::Int(-3)), json!(-3));
        assert_eq!(to_json(Value::Bytes(b"hi".to_vec())), json!("hi"));
        assert_eq!(to_json(Value::Bytes(vec![0xff, 0xfe])), json!("(binary, 2 bytes)"));
        assert_eq!(to_json(Value::Date(2026, 10, 30, 0, 0, 0, 0)), json!("2026-10-30"));
        assert_eq!(to_json(Value::Date(2026, 10, 30, 8, 5, 9, 0)), json!("2026-10-30 08:05:09"));
        assert_eq!(to_json(Value::Time(true, 1, 2, 3, 4, 0)), json!("-26:03:04"));
    }

    /// Real NexDB MySQL, which must be running on port 3306 with an empty root password:
    /// `cargo test real_database_manager -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_database_manager() {
        // A throwaway MySQL (NexDB's own binaries, new data folder) on a spare port.
        let base = crate::settings::load(std::path::Path::new(r"C:\NexDB")).expect("NexDB must be installed in C:/NexDB");
        let mysql_dir = std::path::PathBuf::from(&base.components.iter().find(|c| c.id == "mysql").unwrap().path);
        let dir = tempfile::tempdir().unwrap();
        let (data, logs) = (dir.path().join("data"), dir.path().join("logs"));
        std::fs::create_dir_all(&logs).unwrap();
        let ini = dir.path().join("my.ini");
        crate::configure::write_file(&ini, &crate::configure::mysql_ini(&crate::configure::MysqlConf { base_dir: &mysql_dir, data_dir: &data, port: 3398, logs_dir: &logs })).unwrap();
        crate::configure::setup_mysql(&mysql_dir, &ini, &data, 3398, None).unwrap();
        let sup = crate::supervisor::Supervisor::new(vec![crate::supervisor::ServiceSpec {
            id: "mysql".into(), name: "MySQL".into(), version: None, exe: mysql_dir.join("bin").join("mysqld.exe"),
            args: vec![format!("--defaults-file={}", ini.display()), "--console".into()],
            cwd: mysql_dir.clone(), port: 3398, managed: true, stop: crate::supervisor::StopMethod::MysqlEvent, log: logs.join("mysql_error.log"),
        }]);
        sup.start("mysql").unwrap();
        let db = Db::default();
        assert_eq!(db.databases().unwrap_err(), "NOT_CONNECTED");
        let info = db.connect(3398, None).expect("NexDB's MySQL must be running");
        println!("connected to {}", info.version);

        let name = "nexdb_selftest";
        let _ = db.drop_database(name);
        db.create_database(name).unwrap();
        assert!(db.create_database(name).is_err(), "creating twice fails with MySQL's message");

        let out = db
            .query(
                Some(name),
                "CREATE TABLE people (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(40) NOT NULL, born DATE, note TEXT NULL); \
                 INSERT INTO people (name, born) VALUES ('Ada', '1815-12-10'), ('Linus', '1969-12-28'), ('Grace', NULL);",
            )
            .unwrap();
        assert_eq!(out.affected, 3);

        let list = db.databases().unwrap();
        let mine = list.iter().find(|d| d.name == name).unwrap();
        assert_eq!(mine.tables, 1);
        assert!(!mine.system);
        assert!(list.last().unwrap().system, "system databases sort last");

        let tables = db.tables(name).unwrap();
        assert_eq!(tables[0].name, "people");
        let cols = db.columns(name, "people").unwrap();
        assert_eq!(cols.len(), 4);
        assert_eq!(cols[0].key, "PRI");
        assert!(cols[0].extra.contains("auto_increment"));
        assert!(!cols[1].nullable && cols[3].nullable);

        let page = db.browse(name, "people", 0, 2).unwrap();
        assert_eq!((page.total, page.rows.len()), (3, 2));
        assert_eq!(page.rows[0][1], json!("Ada"));
        assert_eq!(page.rows[0][2], json!("1815-12-10"));
        assert_eq!(db.browse(name, "people", 1, 2).unwrap().rows.len(), 1);

        let sel = db.query(Some(name), "SELECT name, born FROM people ORDER BY id; SELECT COUNT(*) AS n FROM people").unwrap();
        assert_eq!(sel.sets.len(), 2);
        assert_eq!(sel.sets[0].columns, ["name", "born"]);
        assert_eq!(sel.sets[0].rows[2][1], serde_json::Value::Null);
        assert_eq!(sel.sets[1].rows[0][0], json!(3));

        let bad = db.query(Some(name), "SELEKT 1").unwrap_err();
        assert!(bad.contains("syntax"), "{bad}");
        assert!(db.tables("a`b").is_err());
        assert!(db.drop_database("mysql").unwrap_err().contains("built-in"));

        db.drop_database(name).unwrap();
        assert!(db.databases().unwrap().iter().all(|d| d.name != name));

        // Wrong password and a stopped server get distinct, readable errors.
        let other = Db::default();
        assert_eq!(other.connect(3398, Some("definitely-wrong")).unwrap_err(), "NEEDS_PASSWORD");
        assert!(other.connect(3397, None).unwrap_err().contains("isn't running"));
        sup.stop_all();
    }
}

impl Db {
    /// A handle sharing the same pool, so a command can move it onto a worker thread.
    pub fn clone_handle(&self) -> Db {
        Db { pool: self.pool.clone(), password: self.password.clone() }
    }
}

/// The text protocol sends every value as bytes; whole numbers and floats become JSON numbers
/// so the screen can align and sort them. Decimals stay text so no digits are lost.
fn typed(value: Value, kind: mysql::consts::ColumnType) -> serde_json::Value {
    use mysql::consts::ColumnType::*;
    if let Value::Bytes(bytes) = &value {
        let text = std::str::from_utf8(bytes).unwrap_or("");
        match kind {
            MYSQL_TYPE_TINY | MYSQL_TYPE_SHORT | MYSQL_TYPE_LONG | MYSQL_TYPE_LONGLONG | MYSQL_TYPE_INT24 | MYSQL_TYPE_YEAR => {
                if let Ok(n) = text.parse::<i64>() {
                    return json!(n);
                }
                if let Ok(n) = text.parse::<u64>() {
                    return json!(n);
                }
            }
            MYSQL_TYPE_FLOAT | MYSQL_TYPE_DOUBLE => {
                if let Some(n) = text.parse::<f64>().ok().and_then(serde_json::Number::from_f64) {
                    return serde_json::Value::Number(n);
                }
            }
            _ => {}
        }
    }
    to_json(value)
}

impl Db {
    /// The password the current connection used, if any.
    pub fn password(&self) -> Option<String> {
        self.password.lock().unwrap().clone()
    }
}
