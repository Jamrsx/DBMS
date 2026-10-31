//! Database page, part 2: change, add and delete rows (by primary key), MySQL users, and CSV
//! export. Values always travel as query parameters; names go through `quote`, and user names
//! and passwords are checked or escaped before they reach SQL.

use mysql::prelude::Queryable;
use mysql::{Params, Value};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;

use crate::db::{friendly, quote, Db};

/// A cell value from the screen: text, a number, or NULL.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Cell {
    Null,
    Number(serde_json::Number),
    Text(String),
}

impl Cell {
    fn value(&self) -> Value {
        match self {
            Cell::Null => Value::NULL,
            Cell::Number(n) => Value::Bytes(n.to_string().into_bytes()),
            Cell::Text(t) => Value::Bytes(t.clone().into_bytes()),
        }
    }
}

/// `column = value` for each primary-key column, which picks out exactly one row.
pub type Key = Vec<(String, Cell)>;

fn where_key(key: &Key) -> Result<(String, Vec<Value>), String> {
    if key.is_empty() {
        return Err("This table has no primary key, so a row can't be picked out safely. Use the SQL tab.".into());
    }
    let mut parts = Vec::new();
    let mut values = Vec::new();
    for (col, v) in key {
        // <=> also matches NULL safely.
        parts.push(format!("{} <=> ?", quote(col)?));
        values.push(v.value());
    }
    Ok((parts.join(" AND "), values))
}

const NOTHING_CHANGED: &str =
    "Nothing changed: the row may have been changed or deleted elsewhere. Reload the table and try again.";

impl Db {
    /// The table's primary-key columns, in order; empty when it has none.
    pub fn primary_key(&self, db: &str, table: &str) -> Result<Vec<String>, String> {
        Ok(self.columns(db, table)?.into_iter().filter(|c| c.key == "PRI").map(|c| c.name).collect())
    }

    /// Sets one cell of the row `key` picks out.
    pub fn update_cell(&self, db: &str, table: &str, key: &Key, column: &str, value: &Cell) -> Result<(), String> {
        let (qdb, qt, qc) = (quote(db)?, quote(table)?, quote(column)?);
        let (cond, mut params) = where_key(key)?;
        params.insert(0, value.value());
        let mut conn = self.conn()?;
        conn.exec_drop(format!("UPDATE {qdb}.{qt} SET {qc} = ? WHERE {cond} LIMIT 1"), Params::Positional(params))
            .map_err(friendly)?;
        // A row already holding the value reports 0 changed but did match; check it still exists.
        if conn.affected_rows() == 0 {
            let (cond, params) = where_key(key)?;
            let found: Option<u8> = conn
                .exec_first(format!("SELECT 1 FROM {qdb}.{qt} WHERE {cond} LIMIT 1"), Params::Positional(params))
                .map_err(friendly)?;
            if found.is_none() {
                return Err(NOTHING_CHANGED.into());
            }
        }
        Ok(())
    }

    /// Adds a row; columns left out get their defaults.
    pub fn insert_row(&self, db: &str, table: &str, values: &[(String, Cell)]) -> Result<(), String> {
        let (qdb, qt) = (quote(db)?, quote(table)?);
        let cols: Vec<String> = values.iter().map(|(c, _)| quote(c)).collect::<Result<_, _>>()?;
        let marks = vec!["?"; values.len()].join(", ");
        let params: Vec<Value> = values.iter().map(|(_, v)| v.value()).collect();
        let sql = format!("INSERT INTO {qdb}.{qt} ({}) VALUES ({marks})", cols.join(", "));
        let mut conn = self.conn()?;
        if params.is_empty() {
            conn.query_drop(sql).map_err(friendly)
        } else {
            conn.exec_drop(sql, Params::Positional(params)).map_err(friendly)
        }
    }

    /// Deletes the one row `key` picks out.
    pub fn delete_row(&self, db: &str, table: &str, key: &Key) -> Result<(), String> {
        let (qdb, qt) = (quote(db)?, quote(table)?);
        let (cond, params) = where_key(key)?;
        let mut conn = self.conn()?;
        conn.exec_drop(format!("DELETE FROM {qdb}.{qt} WHERE {cond} LIMIT 1"), Params::Positional(params))
            .map_err(friendly)?;
        if conn.affected_rows() == 0 {
            return Err(NOTHING_CHANGED.into());
        }
        Ok(())
    }
}

// ----------------------------------------------------------------------------- users

/// Hosts a NexDB user covers: this PC by name and by address.
const HOSTS: [&str; 2] = ["localhost", "127.0.0.1"];
/// MySQL's own accounts, which must never be changed here.
const SYSTEM_USERS: [&str; 5] = ["root", "mysql.sys", "mysql.session", "mysql.infoschema", ""];

#[derive(Debug, Serialize, PartialEq)]
pub struct User {
    pub name: String,
    pub hosts: Vec<String>,
    /// Databases it has all rights on.
    pub databases: Vec<String>,
    /// Rights on every database (like root).
    pub everything: bool,
    /// root and MySQL's own accounts: shown, never changed.
    pub protected: bool,
}

/// User names: letters, digits, `_`, `.` and `-`, up to 32 characters.
pub fn valid_user(name: &str) -> bool {
    !name.is_empty() && name.len() <= 32 && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
}

/// A MySQL string literal: backslashes and quotes escaped.
fn literal(text: &str) -> String {
    format!("'{}'", text.replace('\\', "\\\\").replace('\'', "\\'"))
}

/// Database names in `SHOW GRANTS` lines with all privileges on `db`.*.
pub fn granted_databases(grants: &[String]) -> (Vec<String>, bool) {
    let mut dbs = Vec::new();
    let mut everything = false;
    for g in grants {
        let Some(on) = g.split(" ON ").nth(1) else { continue };
        let target = on.split(" TO ").next().unwrap_or("").trim();
        if target == "*.*" {
            everything |= g.contains("ALL PRIVILEGES") || g.contains("SUPER");
        } else if let Some(db) = target.strip_suffix(".*") {
            let db = db.trim_matches('`').replace("\\_", "_");
            if !db.is_empty() && !dbs.contains(&db) {
                dbs.push(db);
            }
        }
    }
    dbs.sort();
    (dbs, everything)
}

impl Db {
    pub fn users(&self) -> Result<Vec<User>, String> {
        let mut conn = self.conn()?;
        let rows: Vec<(String, String)> =
            conn.query("SELECT User, Host FROM mysql.user ORDER BY User, Host").map_err(friendly)?;
        let mut users: Vec<User> = Vec::new();
        for (name, host) in rows {
            let grants: Vec<String> = conn
                .query(format!("SHOW GRANTS FOR {}@{}", literal(&name), literal(&host)))
                .unwrap_or_default();
            let (dbs, everything) = granted_databases(&grants);
            match users.iter_mut().find(|u| u.name == name) {
                Some(u) => {
                    u.hosts.push(host);
                    u.everything |= everything;
                    for d in dbs {
                        if !u.databases.contains(&d) {
                            u.databases.push(d);
                        }
                    }
                    u.databases.sort();
                }
                None => users.push(User {
                    protected: SYSTEM_USERS.contains(&name.as_str()),
                    name,
                    hosts: vec![host],
                    databases: dbs,
                    everything,
                }),
            }
        }
        Ok(users)
    }

    fn check_user(&self, name: &str) -> Result<(), String> {
        if !valid_user(name) {
            return Err("Use up to 32 letters, numbers, _ . or - for the user name.".into());
        }
        if SYSTEM_USERS.contains(&name) {
            return Err(format!("{name} is one of MySQL's own accounts, so NexDB leaves it alone."));
        }
        Ok(())
    }

    /// Makes a user for this PC (localhost and 127.0.0.1); with `database`, it gets all rights on it.
    pub fn create_user(&self, name: &str, password: &str, database: Option<&str>) -> Result<(), String> {
        self.check_user(name)?;
        if password.chars().count() < 4 {
            return Err("Use a password of at least 4 characters.".into());
        }
        let mut conn = self.conn()?;
        let exists: Option<u8> = conn
            .exec_first("SELECT 1 FROM mysql.user WHERE User = ? LIMIT 1", (name,))
            .map_err(friendly)?;
        if exists.is_some() {
            return Err(format!("A user named {name} already exists."));
        }
        for host in HOSTS {
            conn.query_drop(format!("CREATE USER {}@{} IDENTIFIED BY {}", literal(name), literal(host), literal(password)))
                .map_err(friendly)?;
        }
        if let Some(db) = database {
            drop(conn);
            self.grant(name, db)?;
        }
        Ok(())
    }

    pub fn set_user_password(&self, name: &str, password: &str) -> Result<(), String> {
        self.check_user(name)?;
        if password.chars().count() < 4 {
            return Err("Use a password of at least 4 characters.".into());
        }
        let mut conn = self.conn()?;
        for host in self.hosts_of(&mut conn, name)? {
            conn.query_drop(format!("ALTER USER {}@{} IDENTIFIED BY {}", literal(name), literal(&host), literal(password)))
                .map_err(friendly)?;
        }
        Ok(())
    }

    /// Gives the user all rights on one database.
    pub fn grant(&self, name: &str, database: &str) -> Result<(), String> {
        self.check_user(name)?;
        let qdb = quote(database)?;
        let mut conn = self.conn()?;
        for host in self.hosts_of(&mut conn, name)? {
            conn.query_drop(format!("GRANT ALL PRIVILEGES ON {qdb}.* TO {}@{}", literal(name), literal(&host)))
                .map_err(friendly)?;
        }
        Ok(())
    }

    /// Takes away the user's rights on one database.
    pub fn revoke(&self, name: &str, database: &str) -> Result<(), String> {
        self.check_user(name)?;
        let qdb = quote(database)?;
        let mut conn = self.conn()?;
        for host in self.hosts_of(&mut conn, name)? {
            // Fails harmlessly when this host had no rights there.
            let _ = conn.query_drop(format!("REVOKE ALL PRIVILEGES ON {qdb}.* FROM {}@{}", literal(name), literal(&host)));
        }
        Ok(())
    }

    pub fn drop_user(&self, name: &str) -> Result<(), String> {
        self.check_user(name)?;
        let mut conn = self.conn()?;
        for host in self.hosts_of(&mut conn, name)? {
            conn.query_drop(format!("DROP USER {}@{}", literal(name), literal(&host))).map_err(friendly)?;
        }
        Ok(())
    }

    fn hosts_of(&self, conn: &mut mysql::PooledConn, name: &str) -> Result<Vec<String>, String> {
        let hosts: Vec<String> = conn.exec("SELECT Host FROM mysql.user WHERE User = ?", (name,)).map_err(friendly)?;
        if hosts.is_empty() {
            return Err(format!("There's no user named {name} any more."));
        }
        Ok(hosts)
    }
}

// ----------------------------------------------------------------------------- CSV

/// One CSV field: quoted when it holds a comma, quote or line break.
pub fn csv_field(text: &str) -> String {
    if text.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", text.replace('"', "\"\""))
    } else {
        text.to_string()
    }
}

fn csv_line(fields: impl Iterator<Item = String>) -> String {
    fields.map(|f| csv_field(&f)).collect::<Vec<_>>().join(",") + "\r\n"
}

fn json_text(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Null => String::new(),
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

/// Writes rows the screen already has (a query result) as CSV, UTF-8 with a BOM so Excel reads it.
pub fn write_csv(path: &Path, columns: &[String], rows: &[Vec<serde_json::Value>]) -> Result<usize, String> {
    let mut out = String::from("\u{feff}");
    out.push_str(&csv_line(columns.iter().cloned()));
    for row in rows {
        out.push_str(&csv_line(row.iter().map(json_text)));
    }
    std::fs::write(path, out).map_err(|e| format!("Couldn't save the file: {e}"))?;
    Ok(rows.len())
}

impl Db {
    /// Writes a whole table as CSV, streaming every row (not only the first page).
    pub fn export_table_csv(&self, db: &str, table: &str, path: &Path) -> Result<usize, String> {
        let (qdb, qt) = (quote(db)?, quote(table)?);
        let mut conn = self.conn()?;
        let mut result = conn.query_iter(format!("SELECT * FROM {qdb}.{qt}")).map_err(friendly)?;
        let mut set = result.iter().ok_or("The table returned nothing.")?;
        let columns: Vec<String> = set.columns().as_ref().iter().map(|c| c.name_str().to_string()).collect();
        let file = std::fs::File::create(path).map_err(|e| format!("Couldn't save the file: {e}"))?;
        let mut w = std::io::BufWriter::new(file);
        let io = |e: std::io::Error| format!("Couldn't save the file: {e}");
        w.write_all("\u{feff}".as_bytes()).map_err(io)?;
        w.write_all(csv_line(columns.into_iter()).as_bytes()).map_err(io)?;
        let mut count = 0;
        for row in set.by_ref() {
            let row = row.map_err(friendly)?;
            let line = csv_line(row.unwrap().into_iter().map(|v| json_text(&crate::db::to_json(v))));
            w.write_all(line.as_bytes()).map_err(io)?;
            count += 1;
        }
        w.flush().map_err(io)?;
        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_quotes_only_when_needed() {
        assert_eq!(csv_field("plain"), "plain");
        assert_eq!(csv_field("a,b"), "\"a,b\"");
        assert_eq!(csv_field("say \"hi\""), "\"say \"\"hi\"\"\"");
        assert_eq!(csv_field("two\nlines"), "\"two\nlines\"");
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("x.csv");
        let rows = vec![vec![serde_json::json!(1), serde_json::json!("Café, ☕"), serde_json::Value::Null]];
        write_csv(&path, &["id".into(), "name".into(), "note".into()], &rows).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "\u{feff}id,name,note\r\n1,\"Café, ☕\",\r\n");
    }

    #[test]
    fn user_names_and_literals_are_safe() {
        assert!(valid_user("shop_app") && valid_user("a.b-c"));
        for bad in ["", "a b", "x'y", "a`b", "x;drop", &"a".repeat(33)] {
            assert!(!valid_user(bad), "{bad}");
        }
        assert_eq!(literal(r"it's \ ok"), r"'it\'s \\ ok'");
    }

    #[test]
    fn reads_database_grants() {
        let grants = vec![
            "GRANT USAGE ON *.* TO `shop`@`localhost`".to_string(),
            "GRANT ALL PRIVILEGES ON `shop_db`.* TO `shop`@`localhost`".to_string(),
            "GRANT ALL PRIVILEGES ON `my\\_app`.* TO `shop`@`localhost`".to_string(),
        ];
        assert_eq!(granted_databases(&grants), (vec!["my_app".to_string(), "shop_db".to_string()], false));
        let root = vec!["GRANT SELECT, INSERT, SUPER ON *.* TO `root`@`localhost` WITH GRANT OPTION".to_string()];
        assert!(granted_databases(&root).1);
    }

    #[test]
    fn rows_without_a_key_are_refused() {
        assert!(where_key(&vec![]).unwrap_err().contains("primary key"));
        let (cond, params) = where_key(&vec![("id".into(), Cell::Number(5.into())), ("lang".into(), Cell::Null)]).unwrap();
        assert_eq!(cond, "`id` <=> ? AND `lang` <=> ?");
        assert_eq!(params.len(), 2);
    }

    /// Rows, users and CSV against a throwaway MySQL from NexDB's install.
    /// `cargo test real_db_edit -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_db_edit() {
        use crate::supervisor::{ServiceSpec, StopMethod, Supervisor};
        use std::path::PathBuf;
        let base = crate::settings::load(Path::new(r"C:\NexDB")).expect("NexDB must be installed in C:/NexDB");
        let mysql_dir = PathBuf::from(&base.components.iter().find(|c| c.id == "mysql").unwrap().path);
        let dir = tempfile::tempdir().unwrap();
        let (data, logs) = (dir.path().join("data"), dir.path().join("logs"));
        std::fs::create_dir_all(&logs).unwrap();
        let ini = dir.path().join("my.ini");
        let port = 3398;
        crate::configure::write_file(&ini, &crate::configure::mysql_ini(&crate::configure::MysqlConf { base_dir: &mysql_dir, data_dir: &data, port, logs_dir: &logs })).unwrap();
        crate::configure::setup_mysql(&mysql_dir, &ini, &data, port, Some("rootpw")).unwrap();
        let sup = Supervisor::new(vec![ServiceSpec {
            id: "mysql".into(), name: "MySQL".into(), version: None, exe: mysql_dir.join("bin").join("mysqld.exe"),
            args: vec![format!("--defaults-file={}", ini.display()), "--console".into()],
            cwd: mysql_dir.clone(), port, managed: true, stop: StopMethod::MysqlEvent, log: logs.join("mysql_error.log"),
        }]);
        sup.start("mysql").unwrap();
        let outcome = (|| -> Result<(), String> {
            let db = Db::default();
            db.connect(port, Some("rootpw"))?;
            db.create_database("shop")?;
            db.query(Some("shop"), "CREATE TABLE items (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(40), note TEXT NULL); CREATE TABLE nokey (a INT);")?;
            assert_eq!(db.primary_key("shop", "items")?, ["id"]);
            assert!(db.primary_key("shop", "nokey")?.is_empty());

            db.insert_row("shop", "items", &[("name".into(), Cell::Text("Café, \"best\"".into()))])?;
            db.insert_row("shop", "items", &[])?;
            let key: Key = vec![("id".into(), Cell::Number(1.into()))];
            db.update_cell("shop", "items", &key, "note", &Cell::Text("line1\nline2".into()))?;
            db.update_cell("shop", "items", &key, "note", &Cell::Text("line1\nline2".into()))?; // same value is fine
            db.update_cell("shop", "items", &key, "note", &Cell::Null)?;
            db.delete_row("shop", "items", &vec![("id".into(), Cell::Number(2.into()))])?;
            assert!(db.delete_row("shop", "items", &vec![("id".into(), Cell::Number(2.into()))]).unwrap_err().contains("Nothing changed"));
            let page = db.browse("shop", "items", 0, 50)?;
            println!("rows: {:?}", page.rows);
            assert_eq!(page.total, 1);

            let csv = dir.path().join("items.csv");
            assert_eq!(db.export_table_csv("shop", "items", &csv)?, 1);
            let text = std::fs::read_to_string(&csv).unwrap();
            println!("{text}");
            assert!(text.contains("1,\"Café, \"\"best\"\"\","));

            db.create_user("shop_app", "pa'ss\\word", Some("shop"))?;
            let users = db.users()?;
            let u = users.iter().find(|u| u.name == "shop_app").unwrap();
            println!("{u:?}");
            assert_eq!(u.databases, ["shop"]);
            assert_eq!(u.hosts.len(), 2);
            assert!(users.iter().find(|u| u.name == "root").unwrap().protected);
            db.set_user_password("shop_app", "newpass")?;
            db.revoke("shop_app", "shop")?;
            assert!(db.users()?.iter().find(|u| u.name == "shop_app").unwrap().databases.is_empty());
            assert!(db.drop_user("root").is_err());
            db.drop_user("shop_app")?;
            assert!(db.users()?.iter().all(|u| u.name != "shop_app"));
            Ok(())
        })();
        sup.stop_all();
        outcome.unwrap();
    }
}
