//! Use a database in a project: write its connection into the project's own settings (`.env`
//! for Laravel, `wp-config.php` for WordPress), keeping the old file as a backup, and find which
//! project uses which database.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// A place in a project that holds a database connection.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Target {
    /// Relative to the project; empty for the project folder.
    pub folder: String,
    /// "laravel" (a `.env`), "wordpress" (`wp-config.php`) or "other" (values to copy).
    pub kind: String,
    /// The database it uses now, and on which server ("mysql" or "postgres").
    pub database: Option<String>,
    pub engine: Option<String>,
}

/// How a project reaches a database.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Conn {
    /// "mysql" or "postgres".
    pub engine: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
}

pub(crate) fn subfolders(dir: &Path) -> Vec<String> {
    let mut subs: Vec<String> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| !n.starts_with('.') && !["node_modules", "vendor", "storage", "public"].contains(&n.as_str()))
        .collect();
    subs.sort_by_key(|n| n.to_lowercase());
    subs
}

fn env_value(text: &str, key: &str) -> Option<String> {
    text.lines()
        .filter(|l| !l.trim_start().starts_with('#'))
        .find_map(|l| l.split_once('=').filter(|(k, _)| k.trim() == key).map(|(_, v)| v.trim().trim_matches(['"', '\'']).to_string()))
        .filter(|v| !v.is_empty())
}

/// `define( 'DB_NAME', 'shop' );` -> "shop".
fn wp_value(text: &str, key: &str) -> Option<String> {
    let line = text.lines().find(|l| l.contains(&format!("'{key}'")) && l.contains("define"))?;
    line.split('\'').nth(3).map(String::from).filter(|v| !v.is_empty() && !v.ends_with("_here"))
}

/// What a folder holds and the database it points at now.
fn target_in(dir: &Path, folder: &str) -> Option<Target> {
    if dir.join("artisan").is_file() || dir.join(".env").is_file() || dir.join(".env.example").is_file() {
        let env = fs::read_to_string(dir.join(".env")).unwrap_or_default();
        let engine = match env_value(&env, "DB_CONNECTION").as_deref() {
            Some("mysql" | "mariadb") => Some("mysql".to_string()),
            Some("pgsql") => Some("postgres".to_string()),
            _ => None,
        };
        let database = engine.as_ref().and_then(|_| env_value(&env, "DB_DATABASE"));
        return Some(Target { folder: folder.into(), kind: "laravel".into(), database, engine });
    }
    if dir.join("wp-config.php").is_file() || dir.join("wp-config-sample.php").is_file() {
        let wp = fs::read_to_string(dir.join("wp-config.php")).unwrap_or_default();
        let database = wp_value(&wp, "DB_NAME");
        return Some(Target { folder: folder.into(), kind: "wordpress".into(), engine: database.as_ref().map(|_| "mysql".into()), database });
    }
    None
}

/// "laravel", "wordpress" or "other" for one folder.
pub fn kind_of(dir: &Path) -> String {
    target_in(dir, "").map(|t| t.kind).unwrap_or_else(|| "other".into())
}

/// The places in a project that can hold a database connection: the project folder and the
/// folders one level down (a Laravel `Backend`). A project with none gets one "other" entry.
pub fn targets(project: &Path) -> Vec<Target> {
    let mut out: Vec<Target> = target_in(project, "").into_iter().collect();
    for sub in subfolders(project) {
        out.extend(target_in(&project.join(&sub), &sub));
    }
    if out.is_empty() {
        out.push(Target { folder: String::new(), kind: "other".into(), database: None, engine: None });
    }
    out
}

/// The `.env` lines for a connection, as Laravel names them.
pub fn env_lines(c: &Conn) -> Vec<(String, String)> {
    let driver = if c.engine == "postgres" { "pgsql" } else { "mysql" };
    vec![
        ("DB_CONNECTION".into(), driver.into()),
        ("DB_HOST".into(), "127.0.0.1".into()),
        ("DB_PORT".into(), c.port.to_string()),
        ("DB_DATABASE".into(), c.database.clone()),
        ("DB_USERNAME".into(), c.user.clone()),
        ("DB_PASSWORD".into(), c.password.clone()),
    ]
}

/// A value for `.env`, quoted when it has spaces or `#` so Laravel reads it whole.
pub(crate) fn env_quote(v: &str) -> String {
    if v.contains([' ', '#', '"']) { format!("\"{}\"", v.replace('"', "\\\"")) } else { v.to_string() }
}

/// Writes the connection into a Laravel folder's `.env` (made from `.env.example` when there is
/// none). The old `.env` is kept as `.env.backup`. Returns the file written.
pub fn write_laravel(dir: &Path, c: &Conn) -> Result<PathBuf, String> {
    let env = dir.join(".env");
    let text = match fs::read_to_string(&env) {
        Ok(t) => {
            fs::write(dir.join(".env.backup"), &t).map_err(|e| format!("Couldn't keep a backup of .env: {e}"))?;
            t
        }
        Err(_) => fs::read_to_string(dir.join(".env.example")).unwrap_or_default(),
    };
    let mut out = text;
    for (k, v) in env_lines(c) {
        out = crate::quickstart::set_env(&out, &k, &env_quote(&v));
    }
    fs::write(&env, out).map_err(|e| format!("Couldn't write .env: {e}"))?;
    Ok(env)
}

/// Writes the connection into `wp-config.php` (made from the sample when there is none), keeping
/// the old one as `wp-config.php.backup`. WordPress only runs on MySQL.
pub fn write_wordpress(dir: &Path, c: &Conn) -> Result<PathBuf, String> {
    if c.engine != "mysql" {
        return Err("WordPress only works with MySQL. Pick a MySQL database.".into());
    }
    let path = dir.join("wp-config.php");
    let text = match fs::read_to_string(&path) {
        Ok(t) => {
            fs::write(dir.join("wp-config.php.backup"), &t).map_err(|e| format!("Couldn't keep a backup of wp-config.php: {e}"))?;
            t
        }
        Err(_) => {
            let sample = fs::read_to_string(dir.join("wp-config-sample.php")).map_err(|_| "This WordPress has no wp-config.php or sample.")?;
            crate::quickstart::wp_config(&sample, &c.database, &c.user, &c.password, c.port)?
        }
    };
    let php = |v: &str| v.replace('\\', "\\\\").replace('\'', "\\'");
    let host = format!("127.0.0.1:{}", c.port);
    let lines: Vec<String> = text
        .lines()
        .map(|l| {
            for (key, value) in [("DB_NAME", &c.database), ("DB_USER", &c.user), ("DB_PASSWORD", &c.password), ("DB_HOST", &host)] {
                if l.contains("define") && l.contains(&format!("'{key}'")) {
                    return format!("define( '{key}', '{}' );", php(value));
                }
            }
            l.to_string()
        })
        .collect();
    fs::write(&path, lines.join("\n") + "\n").map_err(|e| format!("Couldn't write wp-config.php: {e}"))?;
    Ok(path)
}

/// Which project (and folder) uses which database.
#[derive(Debug, Serialize, PartialEq)]
pub struct Usage {
    pub project: String,
    pub folder: String,
    pub engine: String,
    pub database: String,
}

pub fn usage(www: &Path) -> Vec<Usage> {
    crate::projects::list(www, 80)
        .into_iter()
        .flat_map(|p| {
            let name = p.name.clone();
            targets(Path::new(&p.path)).into_iter().filter_map(move |t| {
                Some(Usage { project: name.clone(), folder: t.folder, engine: t.engine?, database: t.database? })
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn(engine: &str) -> Conn {
        Conn { engine: engine.into(), port: 3306, database: "responde".into(), user: "responde".into(), password: "p#ss word".into() }
    }

    #[test]
    fn writes_laravel_env_and_keeps_a_backup() {
        let dir = tempfile::tempdir().unwrap();
        let app = dir.path().join("Backend");
        fs::create_dir_all(&app).unwrap();
        fs::write(app.join("artisan"), "").unwrap();
        fs::write(app.join(".env"), "APP_NAME=Responde\nDB_CONNECTION=sqlite\n# DB_HOST=127.0.0.1\n").unwrap();
        let found = targets(dir.path());
        assert_eq!(found.len(), 1);
        assert_eq!((found[0].folder.as_str(), found[0].kind.as_str(), found[0].database.as_deref()), ("Backend", "laravel", None));
        write_laravel(&app, &conn("mysql")).unwrap();
        let env = fs::read_to_string(app.join(".env")).unwrap();
        assert!(env.contains("DB_CONNECTION=mysql") && env.contains("DB_DATABASE=responde") && env.contains("APP_NAME=Responde"), "{env}");
        assert!(env.contains("DB_PASSWORD=\"p#ss word\""), "a # or space is quoted: {env}");
        assert!(fs::read_to_string(app.join(".env.backup")).unwrap().contains("DB_CONNECTION=sqlite"));
        let t = &targets(dir.path())[0];
        assert_eq!((t.engine.as_deref(), t.database.as_deref()), (Some("mysql"), Some("responde")));
        write_laravel(&app, &Conn { engine: "postgres".into(), port: 5432, ..conn("postgres") }).unwrap();
        assert!(fs::read_to_string(app.join(".env")).unwrap().contains("DB_CONNECTION=pgsql"));
        assert_eq!(usage_of(dir.path()), [("postgres".to_string(), "responde".to_string())]);
    }

    fn usage_of(project: &Path) -> Vec<(String, String)> {
        targets(project).into_iter().filter_map(|t| Some((t.engine?, t.database?))).collect()
    }

    #[test]
    fn writes_wordpress_config() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("wp-config.php"),
            "<?php\ndefine( 'DB_NAME', 'old' );\ndefine( 'DB_USER', 'root' );\ndefine( 'DB_PASSWORD', '' );\ndefine( 'DB_HOST', 'localhost' );\n",
        )
        .unwrap();
        write_wordpress(dir.path(), &Conn { password: "it's".into(), ..conn("mysql") }).unwrap();
        let wp = fs::read_to_string(dir.path().join("wp-config.php")).unwrap();
        assert!(wp.contains("define( 'DB_NAME', 'responde' );") && wp.contains("define( 'DB_HOST', '127.0.0.1:3306' );"), "{wp}");
        assert!(wp.contains("'it\\'s'"), "quotes are escaped: {wp}");
        assert!(fs::read_to_string(dir.path().join("wp-config.php.backup")).unwrap().contains("'old'"));
        assert!(write_wordpress(dir.path(), &conn("postgres")).is_err());
    }

    /// NexDB's MySQL: a database gets a user of its own, the user and password go into a
    /// Laravel folder's .env, and signing in with exactly those works. Everything is removed.
    /// `cargo test real_use_database_in_project -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_use_database_in_project() {
        let root = Path::new(r"C:\NexDB");
        let settings = crate::settings::load(root).expect("NexDB must be installed in C:/NexDB");
        let port = settings.mysql.as_ref().unwrap().port;
        let name = "nexdb_use_test";
        let (made, _) = crate::quickstart::ensure_database(None, port, name).expect("NexDB's MySQL running, no root password");
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("artisan"), "").unwrap();
        fs::write(dir.path().join(".env.example"), "APP_NAME=Test\nDB_CONNECTION=sqlite\n").unwrap();
        let c = Conn { engine: "mysql".into(), port, database: name.into(), user: made.user.clone(), password: made.password.clone() };
        write_laravel(dir.path(), &c).unwrap();
        let env = fs::read_to_string(dir.path().join(".env")).unwrap();
        let user = env_value(&env, "DB_USERNAME").unwrap();
        let password = env_value(&env, "DB_PASSWORD").unwrap();
        use mysql::prelude::Queryable;
        let opts = mysql::OptsBuilder::new()
            .ip_or_hostname(Some("127.0.0.1"))
            .tcp_port(port)
            .user(Some(user))
            .pass(Some(password))
            .db_name(Some(name))
            .prefer_socket(false);
        let mut conn = mysql::Conn::new(opts).expect("the .env user signs in");
        let db: Option<String> = conn.query_first("SELECT DATABASE()").unwrap();
        println!("signed in to {db:?} as {}", made.user);
        assert_eq!(db.as_deref(), Some(name));
        drop(conn);
        let admin = crate::db::Db::default();
        admin.connect(port, None).unwrap();
        admin.drop_database(name).unwrap();
        let _ = admin.drop_user(name);
    }

    #[test]
    fn plain_projects_get_values_to_copy() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("index.php"), "<?php").unwrap();
        assert_eq!(targets(dir.path())[0].kind, "other");
        let lines = env_lines(&conn("mysql"));
        assert_eq!(lines[2], ("DB_PORT".to_string(), "3306".to_string()));
    }
}
