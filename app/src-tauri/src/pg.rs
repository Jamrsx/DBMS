//! The Database page on NexDB's PostgreSQL: the same screens as for MySQL (databases, tables,
//! rows, SQL, row editing, users), answered here. NexDB's PostgreSQL only listens on this PC and
//! trusts its `postgres` user, so there is no password. Names are checked and double-quoted;
//! values are written as escaped literals.

use postgres::{Client, Config, NoTls, SimpleQueryMessage};
use std::time::{Duration, Instant};

use crate::db::{ColumnInfo, Connected, DatabaseInfo, QueryOutput, ResultSet, TableInfo, TablePage, ROW_LIMIT};
use crate::dbedit::{Cell, Key, User};

fn friendly(e: postgres::Error) -> String {
    if let Some(db) = e.as_db_error() {
        return db.message().to_string();
    }
    let text = e.to_string();
    if text.contains("error connecting") || text.contains("refused") || text.contains("timed out") {
        "PostgreSQL isn't running. Start it from the Dashboard, then try again.".into()
    } else {
        text
    }
}

fn client(port: u16, db: Option<&str>) -> Result<Client, String> {
    Config::new()
        .host("127.0.0.1")
        .port(port)
        .user("postgres")
        .dbname(db.unwrap_or("postgres"))
        .connect_timeout(Duration::from_secs(4))
        .connect(NoTls)
        .map_err(friendly)
}

/// Table, column and database names: the same rule as for MySQL, double-quoted.
pub fn quote(name: &str) -> Result<String, String> {
    if crate::db::valid_name(name) {
        Ok(format!("\"{name}\""))
    } else {
        Err(format!("\"{name}\" isn't a name this screen can handle. Use letters, numbers and underscores."))
    }
}

/// A value as an SQL literal ('it''s'), or NULL.
pub fn literal(cell: &Cell) -> String {
    match cell {
        Cell::Null => "NULL".into(),
        Cell::Number(n) => format!("'{n}'"),
        Cell::Text(t) => format!("'{}'", t.replace('\'', "''")),
    }
}

type Rows = (Vec<String>, Vec<Vec<Option<String>>>);

/// Runs SQL and returns its first result's columns and rows, all as text.
fn rows(c: &mut Client, sql: &str) -> Result<Rows, String> {
    let mut columns = Vec::new();
    let mut out = Vec::new();
    for msg in c.simple_query(sql).map_err(friendly)? {
        match msg {
            SimpleQueryMessage::RowDescription(cols) if columns.is_empty() => {
                columns = cols.iter().map(|c| c.name().to_string()).collect();
            }
            SimpleQueryMessage::Row(r) => out.push((0..r.len()).map(|i| r.get(i).map(String::from)).collect()),
            _ => {}
        }
    }
    Ok((columns, out))
}

fn json(v: Option<String>) -> serde_json::Value {
    v.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null)
}

pub fn connect(port: u16) -> Result<Connected, String> {
    let mut c = client(port, None)?;
    let (_, r) = rows(&mut c, "SHOW server_version")?;
    let v = r.into_iter().next().and_then(|r| r.into_iter().next().flatten()).unwrap_or_default();
    Ok(Connected { version: format!("PostgreSQL {}", v.split_whitespace().next().unwrap_or("")) })
}

pub fn databases(port: u16) -> Result<Vec<DatabaseInfo>, String> {
    let mut c = client(port, None)?;
    let (_, list) = rows(&mut c, "SELECT datname, pg_database_size(oid) FROM pg_database WHERE NOT datistemplate ORDER BY datname")?;
    let mut out: Vec<DatabaseInfo> = list
        .into_iter()
        .filter_map(|r| {
            let name = r.first()?.clone()?;
            let size = r.get(1).cloned().flatten().and_then(|s| s.parse().ok()).unwrap_or(0);
            // Counting tables needs a connection to each database; local ones are few.
            let tables = client(port, Some(&name))
                .and_then(|mut d| rows(&mut d, "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"))
                .ok()
                .and_then(|(_, r)| r.into_iter().next()?.into_iter().next().flatten()?.parse().ok())
                .unwrap_or(0);
            Some(DatabaseInfo { system: name == "postgres", name, tables, size_bytes: size })
        })
        .collect();
    out.sort_by_key(|d| (d.system, d.name.to_lowercase()));
    Ok(out)
}

pub fn tables(port: u16, db: &str) -> Result<Vec<TableInfo>, String> {
    let mut c = client(port, Some(db))?;
    let (_, list) = rows(
        &mut c,
        "SELECT c.relname, c.relkind, c.reltuples::bigint, pg_total_relation_size(c.oid) \
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace \
         WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p') ORDER BY c.relname",
    )?;
    Ok(list
        .into_iter()
        .filter_map(|r| {
            let kind = r.get(1).cloned().flatten().unwrap_or_default();
            Some(TableInfo {
                name: r.first()?.clone()?,
                is_view: kind == "v" || kind == "m",
                engine: None,
                // reltuples is -1 until the table was first analyzed.
                rows: r.get(2).cloned().flatten().and_then(|s| s.parse::<i64>().ok()).filter(|n| *n >= 0).map(|n| n as u64),
                size_bytes: r.get(3).cloned().flatten().and_then(|s| s.parse().ok()).unwrap_or(0),
            })
        })
        .collect())
}

pub fn columns(port: u16, db: &str, table: &str) -> Result<Vec<ColumnInfo>, String> {
    quote(table)?;
    let mut c = client(port, Some(db))?;
    let t = table.replace('\'', "''");
    let (_, list) = rows(
        &mut c,
        &format!(
            "SELECT col.column_name, \
                    CASE WHEN col.character_maximum_length IS NOT NULL THEN col.data_type || '(' || col.character_maximum_length || ')' ELSE col.data_type END, \
                    col.is_nullable, col.column_default, \
                    EXISTS (SELECT 1 FROM information_schema.table_constraints tc \
                            JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema \
                            WHERE tc.table_schema = 'public' AND tc.table_name = '{t}' AND tc.constraint_type = 'PRIMARY KEY' AND k.column_name = col.column_name), \
                    col.is_identity \
             FROM information_schema.columns col WHERE col.table_schema = 'public' AND col.table_name = '{t}' ORDER BY col.ordinal_position"
        ),
    )?;
    Ok(list
        .into_iter()
        .filter_map(|r| {
            let get = |i: usize| r.get(i).cloned().flatten();
            let default = get(3);
            let auto = get(5).as_deref() == Some("YES") || default.as_deref().is_some_and(|d| d.starts_with("nextval("));
            Some(ColumnInfo {
                name: get(0)?,
                column_type: get(1).unwrap_or_default(),
                nullable: get(2).as_deref() == Some("YES"),
                key: if get(4).as_deref() == Some("t") { "PRI".into() } else { String::new() },
                default,
                extra: if auto { "auto_increment".into() } else { String::new() },
            })
        })
        .collect())
}

pub fn browse(port: u16, db: &str, table: &str, page: u64, page_size: u64) -> Result<TablePage, String> {
    let qt = quote(table)?;
    let mut c = client(port, Some(db))?;
    let size = page_size.clamp(1, 500);
    let (mut cols, list) = rows(&mut c, &format!("SELECT * FROM {qt} LIMIT {size} OFFSET {}", page * size))?;
    if cols.is_empty() {
        cols = columns(port, db, table)?.into_iter().map(|c| c.name).collect();
    }
    let (_, total) = rows(&mut c, &format!("SELECT count(*) FROM {qt}"))?;
    Ok(TablePage {
        columns: cols,
        rows: list.into_iter().map(|r| r.into_iter().map(json).collect()).collect(),
        total: total.into_iter().next().and_then(|r| r.into_iter().next().flatten()?.parse().ok()).unwrap_or(0),
    })
}

/// Runs any SQL (several statements are fine) and returns each result table.
pub fn query(port: u16, db: Option<&str>, sql: &str) -> Result<QueryOutput, String> {
    let mut c = client(port, db)?;
    let started = Instant::now();
    let mut sets: Vec<ResultSet> = Vec::new();
    let mut current: Option<ResultSet> = None;
    let mut affected = 0;
    for msg in c.simple_query(sql).map_err(friendly)? {
        match msg {
            SimpleQueryMessage::RowDescription(cols) => {
                current = Some(ResultSet { columns: cols.iter().map(|c| c.name().to_string()).collect(), rows: vec![], truncated: false });
            }
            SimpleQueryMessage::Row(r) => {
                let set = current.get_or_insert_with(|| ResultSet {
                    columns: r.columns().iter().map(|c| c.name().to_string()).collect(),
                    rows: vec![],
                    truncated: false,
                });
                if set.rows.len() < ROW_LIMIT {
                    set.rows.push((0..r.len()).map(|i| json(r.get(i).map(String::from))).collect());
                } else {
                    set.truncated = true;
                }
            }
            SimpleQueryMessage::CommandComplete(n) => match current.take() {
                Some(set) => sets.push(set),
                None => affected += n,
            },
            _ => {}
        }
    }
    sets.extend(current);
    Ok(QueryOutput { sets, affected, elapsed_ms: started.elapsed().as_millis() as u64 })
}

pub fn create_database(port: u16, name: &str) -> Result<(), String> {
    let q = quote(name)?;
    client(port, None)?.batch_execute(&format!("CREATE DATABASE {q} ENCODING 'UTF8' TEMPLATE template0")).map_err(friendly)
}

pub fn drop_database(port: u16, name: &str) -> Result<(), String> {
    let q = quote(name)?;
    if name == "postgres" {
        return Err("The postgres database is PostgreSQL's own and stays.".into());
    }
    // WITH (FORCE) closes the app connections still open to it (PostgreSQL 13 and later).
    client(port, None)?.batch_execute(&format!("DROP DATABASE {q} WITH (FORCE)")).map_err(friendly)
}

fn where_key(key: &Key) -> Result<String, String> {
    if key.is_empty() {
        return Err("This table has no primary key, so a row can't be picked out safely. Use the SQL tab.".into());
    }
    key.iter()
        .map(|(col, v)| Ok(format!("{} IS NOT DISTINCT FROM {}", quote(col)?, literal(v))))
        .collect::<Result<Vec<_>, String>>()
        .map(|p| p.join(" AND "))
}

const NOTHING_CHANGED: &str =
    "Nothing changed: the row may have been changed or deleted elsewhere. Reload the table and try again.";

fn changed(n: u64) -> Result<(), String> {
    if n == 0 { Err(NOTHING_CHANGED.into()) } else { Ok(()) }
}

pub fn update_cell(port: u16, db: &str, table: &str, key: &Key, column: &str, value: &Cell) -> Result<(), String> {
    let sql = format!("UPDATE {} SET {} = {} WHERE {}", quote(table)?, quote(column)?, literal(value), where_key(key)?);
    changed(client(port, Some(db))?.execute(&sql, &[]).map_err(friendly)?)
}

pub fn insert_row(port: u16, db: &str, table: &str, values: &[(String, Cell)]) -> Result<(), String> {
    let qt = quote(table)?;
    let sql = if values.is_empty() {
        format!("INSERT INTO {qt} DEFAULT VALUES")
    } else {
        let cols = values.iter().map(|(c, _)| quote(c)).collect::<Result<Vec<_>, _>>()?.join(", ");
        let vals = values.iter().map(|(_, v)| literal(v)).collect::<Vec<_>>().join(", ");
        format!("INSERT INTO {qt} ({cols}) VALUES ({vals})")
    };
    client(port, Some(db))?.execute(&sql, &[]).map(|_| ()).map_err(friendly)
}

pub fn delete_row(port: u16, db: &str, table: &str, key: &Key) -> Result<(), String> {
    let sql = format!("DELETE FROM {} WHERE {}", quote(table)?, where_key(key)?);
    changed(client(port, Some(db))?.execute(&sql, &[]).map_err(friendly)?)
}

/// Login roles; a role's databases are the ones it owns (so it can make tables in them).
pub fn users(port: u16) -> Result<Vec<User>, String> {
    let mut c = client(port, None)?;
    let (_, list) = rows(
        &mut c,
        "SELECT r.rolname, r.rolsuper, COALESCE((SELECT string_agg(d.datname, ',' ORDER BY d.datname) FROM pg_database d \
                 WHERE d.datdba = r.oid AND NOT d.datistemplate), '') \
         FROM pg_roles r WHERE r.rolcanlogin AND r.rolname !~ '^pg_' ORDER BY r.rolname",
    )?;
    Ok(list
        .into_iter()
        .filter_map(|r| {
            let name = r.first()?.clone()?;
            let superuser = r.get(1).cloned().flatten().as_deref() == Some("t");
            let dbs = r.get(2).cloned().flatten().unwrap_or_default();
            Some(User {
                protected: name == "postgres",
                everything: superuser,
                hosts: vec!["localhost".into()],
                databases: if superuser { vec![] } else { dbs.split(',').filter(|s| !s.is_empty()).map(String::from).collect() },
                name,
            })
        })
        .collect())
}

fn check_user(name: &str) -> Result<String, String> {
    if !crate::dbedit::valid_user(name) || name.contains(['.', '-']) {
        return Err("Use letters, numbers and _ for a PostgreSQL user name.".into());
    }
    if name == "postgres" {
        return Err("postgres is PostgreSQL's own user and stays as it is.".into());
    }
    Ok(format!("\"{name}\""))
}

fn password_literal(password: &str) -> Result<String, String> {
    if password.len() < 4 {
        return Err("Use at least 4 characters for the password.".into());
    }
    Ok(format!("'{}'", password.replace('\'', "''")))
}

pub fn create_user(port: u16, name: &str, password: &str, database: Option<&str>) -> Result<(), String> {
    let (role, pw) = (check_user(name)?, password_literal(password)?);
    client(port, None)?.batch_execute(&format!("CREATE ROLE {role} LOGIN PASSWORD {pw}")).map_err(friendly)?;
    match database {
        Some(db) => grant(port, name, db),
        None => Ok(()),
    }
}

pub fn set_user_password(port: u16, name: &str, password: &str) -> Result<(), String> {
    let (role, pw) = (check_user(name)?, password_literal(password)?);
    client(port, None)?.batch_execute(&format!("ALTER ROLE {role} PASSWORD {pw}")).map_err(friendly)
}

/// Gives the user the database: it becomes its owner, so it can make and change tables there.
pub fn grant(port: u16, name: &str, database: &str) -> Result<(), String> {
    let (role, db) = (check_user(name)?, quote(database)?);
    client(port, None)?
        .batch_execute(&format!("ALTER DATABASE {db} OWNER TO {role}; GRANT ALL PRIVILEGES ON DATABASE {db} TO {role}"))
        .map_err(friendly)
}

pub fn revoke(port: u16, name: &str, database: &str) -> Result<(), String> {
    let (role, db) = (check_user(name)?, quote(database)?);
    client(port, None)?
        .batch_execute(&format!("ALTER DATABASE {db} OWNER TO postgres; REVOKE ALL PRIVILEGES ON DATABASE {db} FROM {role}"))
        .map_err(friendly)
}

/// Deletes a user; databases it owned go back to postgres first, so none is lost.
pub fn drop_user(port: u16, name: &str) -> Result<(), String> {
    let role = check_user(name)?;
    let mut c = client(port, None)?;
    let (_, owned) = rows(&mut c, &format!("SELECT d.datname FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba WHERE r.rolname = '{name}'"))?;
    for db in owned.into_iter().filter_map(|r| r.into_iter().next().flatten()) {
        c.batch_execute(&format!("ALTER DATABASE {} OWNER TO postgres", quote(&db)?)).map_err(friendly)?;
    }
    c.batch_execute(&format!("DROP ROLE {role}")).map_err(friendly)
}

/// Every row of a table, for CSV export.
pub fn all_rows(port: u16, db: &str, table: &str) -> Result<(Vec<String>, Vec<Vec<serde_json::Value>>), String> {
    let qt = quote(table)?;
    let mut c = client(port, Some(db))?;
    let (mut cols, list) = rows(&mut c, &format!("SELECT * FROM {qt}"))?;
    if cols.is_empty() {
        cols = columns(port, db, table)?.into_iter().map(|c| c.name).collect();
    }
    Ok((cols, list.into_iter().map(|r| r.into_iter().map(json).collect()).collect()))
}

/// NexDB's PostgreSQL client tools (pg_dump, psql).
pub fn bin(settings: &crate::settings::Settings) -> Result<std::path::PathBuf, String> {
    let c = settings.components.iter().find(|c| c.id == "postgres").ok_or("PostgreSQL isn't installed.")?;
    let bin = std::path::PathBuf::from(&c.path).join("bin");
    if bin.join("pg_dump.exe").is_file() { Ok(bin) } else { Err("PostgreSQL's tools are missing. Reinstall it on the Versions page.".into()) }
}

fn tool(bin: &std::path::Path, exe: &str, port: u16) -> std::process::Command {
    let mut cmd = std::process::Command::new(bin.join(exe));
    cmd.args(["-h", "127.0.0.1", "-p", &port.to_string(), "-U", "postgres"]).stdin(std::process::Stdio::null());
    crate::scan::hide_console(&mut cmd);
    cmd
}

fn last_error(stderr: &[u8]) -> String {
    let text = String::from_utf8_lossy(stderr);
    let line = text.lines().map(str::trim).filter(|l| !l.is_empty()).last().unwrap_or("PostgreSQL stopped without saying why.");
    if line.contains("Connection refused") || line.contains("could not connect") {
        "PostgreSQL isn't running. Start it from the Dashboard, then try again.".into()
    } else {
        line.trim_start_matches("pg_dump: ").trim_start_matches("psql: ").trim_start_matches("error: ").to_string()
    }
}

/// Writes a database as a plain .sql file; it only gets its name once pg_dump finished.
pub fn dump_to(bin: &std::path::Path, port: u16, db: &str, target: &std::path::Path) -> Result<(), String> {
    quote(db)?;
    let partial = target.with_extension("sql.part");
    let out = tool(bin, "pg_dump.exe", port)
        .args(["--no-owner", "--no-acl", "-f"])
        .arg(&partial)
        .arg(db)
        .output()
        .map_err(|e| format!("Couldn't run pg_dump: {e}"))?;
    if !out.status.success() {
        let _ = std::fs::remove_file(&partial);
        return Err(last_error(&out.stderr));
    }
    let _ = std::fs::remove_file(target);
    std::fs::rename(&partial, target).map_err(|e| format!("Couldn't save the file: {e}"))
}

/// Runs a .sql file against a database (which must exist), stopping at the first error.
pub fn import(bin: &std::path::Path, port: u16, db: &str, file: &std::path::Path) -> Result<(), String> {
    quote(db)?;
    let out = tool(bin, "psql.exe", port)
        .args(["-v", "ON_ERROR_STOP=1", "-q", "-d", db, "-f"])
        .arg(file)
        .output()
        .map_err(|e| format!("Couldn't run psql: {e}"))?;
    if out.status.success() { Ok(()) } else { Err(last_error(&out.stderr)) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn values_and_names_are_escaped() {
        assert_eq!(literal(&Cell::Text("it's".into())), "'it''s'");
        assert_eq!(literal(&Cell::Null), "NULL");
        assert_eq!(quote("members").unwrap(), "\"members\"");
        assert!(quote("a\"; DROP TABLE x; --").is_err());
        assert!(check_user("postgres").is_err());
        assert!(check_user("bad-name").is_err());
    }

    /// NexDB's PostgreSQL program on a fresh data folder and a spare port: a database with a
    /// table, rows added, changed and deleted, a user that owns it, SQL with two statements, then
    /// everything removed again. `cargo test real_postgres_database_page -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_postgres_database_page() {
        let bin = std::fs::read_dir(r"C:\NexDB\bin\postgres")
            .expect("install PostgreSQL on the Versions page")
            .flatten()
            .map(|e| e.path().join("bin"))
            .find(|b| b.join("postgres.exe").is_file())
            .unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        crate::postgres::init(&bin, &data).unwrap();
        let port = crate::scan::suggest_port(5444).unwrap();
        let mut server = std::process::Command::new(bin.join("postgres.exe"))
            .args(["-D", &data.display().to_string(), "-p", &port.to_string(), "-c", "listen_addresses=127.0.0.1"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(30);
        while connect(port).is_err() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(300));
        }
        println!("{}", connect(port).unwrap().version);
        let db = "nexdb_pg_test";
        let _ = drop_database(port, db);
        let _ = drop_user(port, "nexdb_pg_user");
        create_database(port, db).unwrap();
        let q = query(port, Some(db), "CREATE TABLE members (id serial PRIMARY KEY, name text NOT NULL, note text); INSERT INTO members (name) VALUES ('Ana'), ('Ben')").unwrap();
        assert_eq!(q.affected, 2);
        let cols = columns(port, db, "members").unwrap();
        assert_eq!((cols[0].key.as_str(), cols[0].extra.as_str()), ("PRI", "auto_increment"));
        insert_row(port, db, "members", &[("name".into(), Cell::Text("Cy's".into()))]).unwrap();
        let page = browse(port, db, "members", 0, 50).unwrap();
        assert_eq!((page.total, page.columns.len()), (3, 3));
        let key: Key = vec![("id".into(), Cell::Text("1".into()))];
        update_cell(port, db, "members", &key, "note", &Cell::Text("first".into())).unwrap();
        delete_row(port, db, "members", &vec![("id".into(), Cell::Text("2".into()))]).unwrap();
        let out = query(port, Some(db), "SELECT name, note FROM members ORDER BY id; SELECT count(*) AS n FROM members").unwrap();
        println!("{:?}", out.sets.iter().map(|s| &s.rows).collect::<Vec<_>>());
        assert_eq!(out.sets.len(), 2);
        assert_eq!(out.sets[0].rows[0], vec![serde_json::json!("Ana"), serde_json::json!("first")]);
        assert_eq!(out.sets[0].rows[1][0], serde_json::json!("Cy's"));
        assert!(tables(port, db).unwrap().iter().any(|t| t.name == "members"));
        assert!(databases(port).unwrap().iter().any(|d| d.name == db && d.tables == 1));
        create_user(port, "nexdb_pg_user", "secret1", Some(db)).unwrap();
        assert!(users(port).unwrap().iter().any(|u| u.name == "nexdb_pg_user" && u.databases == [db]));
        // A backup and a restore into a new database bring the rows back.
        let file = tmp.path().join("members.sql");
        dump_to(&bin, port, db, &file).unwrap();
        create_database(port, "nexdb_pg_copy").unwrap();
        import(&bin, port, "nexdb_pg_copy", &file).unwrap();
        assert_eq!(browse(port, "nexdb_pg_copy", "members", 0, 10).unwrap().total, 2);
        drop_database(port, "nexdb_pg_copy").unwrap();
        drop_user(port, "nexdb_pg_user").unwrap();
        drop_database(port, db).unwrap();
        assert!(!databases(port).unwrap().iter().any(|d| d.name == db));
        let stop = ["stop", "-D", &data.display().to_string(), "-m", "fast"].map(String::from);
        let stop: Vec<&str> = stop.iter().map(String::as_str).collect();
        let _ = crate::configure::run_quiet(&bin.join("pg_ctl.exe"), &stop, Duration::from_secs(30));
        let _ = server.wait();
    }
}
