//! PostgreSQL: the data folder NexDB creates the first time it is installed.

use std::path::Path;
use std::time::Duration;

/// The superuser NexDB creates. It needs no password, and the server only listens on 127.0.0.1.
pub const USER: &str = "postgres";

/// Creates an empty data folder with `initdb`: UTF-8, superuser `postgres`, password-free
/// connections from this PC.
pub fn init(bin: &Path, data: &Path) -> Result<(), String> {
    // initdb wants an empty or missing folder; a half-made one from an earlier try is cleared.
    if data.exists() && !data.join("PG_VERSION").is_file() {
        std::fs::remove_dir_all(data).map_err(|e| format!("Couldn't clear the PostgreSQL data folder: {e}"))?;
    }
    if let Some(parent) = data.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Couldn't create the data folder: {e}"))?;
    }
    let data_arg = data.display().to_string();
    let out = crate::configure::run_quiet(
        &bin.join("initdb.exe"),
        &["-D", &data_arg, "-U", USER, "--auth=trust", "-E", "UTF8", "--no-locale"],
        Duration::from_secs(180),
    )
    .map_err(|e| format!("Couldn't run initdb to set up PostgreSQL: {e}"))?;
    if !out.success {
        return Err(format!("PostgreSQL couldn't set up its data folder: {}", out.text.trim()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::supervisor::{ServiceSpec, StopMethod, Supervisor};

    /// Downloads PostgreSQL from the catalog, sets up a data folder, starts the server on a spare
    /// port, runs a query with psql and stops it cleanly with pg_ctl.
    /// `cargo test real_postgres -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_postgres() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let tool = crate::catalog::bundled().tools.postgres.expect("catalog has PostgreSQL");
        let target = root.join("bin").join("postgres").join(format!("postgres-{}", tool.version));
        tauri::async_runtime::block_on(crate::installer::install_archive(&tool.download, root, &target, "get-postgres", &|_| {}))
            .unwrap();
        let bin = target.join("bin");
        let data = root.join("data").join("postgres");
        init(&bin, &data).unwrap();
        assert!(data.join("PG_VERSION").is_file());

        let port = 55432u16;
        let sup = Supervisor::new(vec![ServiceSpec {
            id: "postgres".into(),
            name: "PostgreSQL".into(),
            version: Some(tool.version.clone()),
            exe: bin.join("postgres.exe"),
            args: vec![
                "-D".into(),
                data.display().to_string(),
                "-p".into(),
                port.to_string(),
                "-c".into(),
                "listen_addresses=127.0.0.1".into(),
            ],
            cwd: target.clone(),
            port,
            managed: true,
            stop: StopMethod::PgCtl,
            log: root.join("logs").join("postgres.log"),
        }]);
        sup.start("postgres").unwrap();
        let p = port.to_string();
        let out = crate::configure::run_quiet(
            &bin.join("psql.exe"),
            &["-h", "127.0.0.1", "-p", &p, "-U", USER, "-At", "-c", "select 40 + 2"],
            Duration::from_secs(30),
        )
        .unwrap();
        println!("psql: {}", out.text.trim());
        assert!(out.success && out.text.trim().ends_with("42"), "{}", out.text);
        sup.stop("postgres").unwrap();
        assert!(!data.join("postmaster.pid").exists(), "pg_ctl stopped it cleanly");
    }
}
