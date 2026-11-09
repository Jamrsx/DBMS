//! Live version list: asks the official release sites which versions exist right now, so a
//! vendor taking an old build down (Apache Lounge keeps only its newest) doesn't break installs.
//!
//! Same sources and rules as `catalog/build-catalog.mjs`. The result is cached for 12 hours in
//! `%LOCALAPPDATA%\NexDB\catalog-live.json` and laid over the bundled catalog one component at a
//! time; anything the live check couldn't confirm keeps the bundled entry. URLs and checksums
//! still come only from the vendors' own files, never from the UI.

use crate::catalog::{self, Catalog, CatalogComponent, CatalogLine, Checksum, Download};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// How long a live check is trusted before asking the sites again.
const FRESH_SECS: u64 = 12 * 3600;
/// Release lines shown per component (matches the build script).
const MAX_LINES: usize = 4;

#[derive(Serialize, Deserialize)]
struct Cache {
    /// Unix seconds of the check.
    checked: u64,
    /// The check's date, `YYYY-MM-DD`.
    generated: String,
    components: Vec<CatalogComponent>,
}

fn cache_path() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join("NexDB").join("catalog-live.json")
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn read_cache() -> Option<Cache> {
    serde_json::from_str(&std::fs::read_to_string(cache_path()).ok()?).ok()
}

/// The bundled catalog with the last live check laid over it.
pub fn current() -> Catalog {
    let mut catalog = catalog::bundled();
    if let Some(cache) = read_cache() {
        merge(&mut catalog, cache);
    }
    catalog
}

fn merge(catalog: &mut Catalog, cache: Cache) {
    let mut used = false;
    for live in cache.components {
        // Only a component the live check could actually download replaces the bundled one.
        if !live.lines.iter().any(|l| l.download.is_some()) {
            continue;
        }
        if let Some(slot) = catalog.components.iter_mut().find(|c| c.id == live.id) {
            *slot = live;
            used = true;
        }
    }
    if used {
        catalog.generated = cache.generated;
    }
}

/// Asks the official sites again unless the last check is recent (or `force`).
/// Returns an error only when nothing could be checked; partial results are kept.
pub async fn refresh(force: bool) -> Result<(), String> {
    if !force && read_cache().is_some_and(|c| now().saturating_sub(c.checked) < FRESH_SECS) {
        return Ok(());
    }
    let client = reqwest::Client::builder()
        .user_agent(concat!("NexDB/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let today = today_text();
    let tasks: Vec<_> = [("apache", "Apache", "apache-http-server"), ("php", "PHP", "php"), ("mysql", "MySQL", "mysql"), ("node", "Node.js", "nodejs")]
        .into_iter()
        .map(|(id, name, eol)| {
            let (client, today) = (client.clone(), today.clone());
            tauri::async_runtime::spawn(async move { component(&client, id, name, eol, &today).await })
        })
        .collect();

    let mut components = Vec::new();
    for task in tasks {
        if let Ok(Ok(c)) = task.await {
            components.push(c);
        }
    }
    if components.is_empty() {
        return Err("Couldn't reach the release sites. Using the version list that came with NexDB.".into());
    }
    let cache = Cache { checked: now(), generated: today, components };
    let path = cache_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    std::fs::write(&path, serde_json::to_string(&cache).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

fn today_text() -> String {
    let days = catalog::today();
    // civil_from_days (Howard Hinnant), the inverse of catalog::parse_date.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

async fn get_text(client: &reqwest::Client, url: &str) -> Result<String, String> {
    client.get(url).send().await.and_then(|r| r.error_for_status()).map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())
}

async fn get_json(client: &reqwest::Client, url: &str) -> Result<Value, String> {
    serde_json::from_str(&get_text(client, url).await?).map_err(|e| e.to_string())
}

/// Size from a HEAD request; None when the file isn't there or the site sends a web page instead.
async fn head_size(client: &reqwest::Client, url: &str) -> Option<u64> {
    let r = client.head(url).send().await.ok()?;
    let html = r.headers().get("content-type").and_then(|v| v.to_str().ok()).is_some_and(|t| t.starts_with("text/html"));
    (r.status().is_success() && !html).then(|| r.content_length()).flatten()
}

fn is_hex(s: &str, len: usize) -> bool {
    s.len() == len && s.bytes().all(|b| b.is_ascii_hexdigit())
}

fn text(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

async fn component(client: &reqwest::Client, id: &str, name: &str, eol: &str, today: &str) -> Result<CatalogComponent, String> {
    let cycles = get_json(client, &format!("https://endoflife.date/api/{eol}.json")).await?;
    let cycles = cycles.as_array().ok_or("unexpected endoflife.date answer")?;
    let supported = cycles
        .iter()
        .filter(|c| c["eol"] != Value::Bool(true) && !c["eol"].as_str().is_some_and(|d| d < today))
        .take(MAX_LINES);

    // Shared per-component sources, fetched once.
    let source = match id {
        "php" => get_json(client, "https://downloads.php.net/~windows/releases/releases.json").await?,
        "apache" => Value::String(get_text(client, "https://www.apachelounge.com/download/").await?),
        _ => Value::Null,
    };
    let security: Vec<String> = match id {
        "php" => get_json(client, "https://www.php.net/releases/index.php?json&version=8&max=200")
            .await
            .ok()
            .and_then(|v| v.as_object().cloned())
            .map(|o| {
                o.into_iter()
                    .filter(|(_, r)| r["tags"].as_array().is_some_and(|t| t.iter().any(|x| x == "security")))
                    .map(|(v, _)| v)
                    .collect()
            })
            .unwrap_or_default(),
        "node" => get_json(client, "https://nodejs.org/dist/index.json")
            .await
            .ok()
            .and_then(|v| v.as_array().cloned())
            .map(|a| {
                a.into_iter()
                    .filter(|r| r["security"] == Value::Bool(true))
                    .filter_map(|r| r["version"].as_str().map(|v| v.trim_start_matches('v').to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        _ => Vec::new(),
    };

    let mut lines = Vec::new();
    for cy in supported {
        let (Some(line), Some(mut latest)) = (text(&cy["cycle"]), text(&cy["latest"])) else { continue };
        let mut download = windows_download(client, id, &line, &latest, &source).await;
        // Apache Lounge can be a release ahead of (or behind) endoflife.date: use what it offers.
        if download.is_none() && id == "apache" {
            if let Some(v) = source.as_str().and_then(|page| lounge_version(page, &line)) {
                download = windows_download(client, id, &line, &v, &source).await;
                latest = v;
            }
        }
        lines.push(CatalogLine {
            security: security.contains(&latest),
            line,
            latest,
            latest_date: cy["latestReleaseDate"].as_str().map(str::to_string),
            line_released: cy["releaseDate"].as_str().unwrap_or("1970-01-01").to_string(),
            lts: cy["lts"] == Value::Bool(true),
            lts_from: cy["lts"].as_str().map(str::to_string),
            support_end: cy["support"].as_str().map(str::to_string),
            eol: cy["eol"].as_str().map(str::to_string),
            download,
        });
    }
    Ok(CatalogComponent { id: id.into(), name: name.into(), lines })
}

fn sha256(url: String, size: Option<u64>, value: &str) -> Download {
    Download { url, size, checksum: Checksum { algo: "sha256".into(), value: value.to_lowercase() }, subdir: None, file: None }
}

/// The official Windows x64 download for one version, or None when none is published.
async fn windows_download(client: &reqwest::Client, id: &str, line: &str, version: &str, source: &Value) -> Option<Download> {
    match id {
        "php" => {
            let release = &source[line];
            if !release["version"].as_str()?.starts_with(version) {
                return None;
            }
            let zip = release.as_object()?.iter().find(|(k, v)| k.starts_with("nts-") && k.ends_with("-x64") && v["zip"].is_object())?.1["zip"].clone();
            let sha = zip["sha256"].as_str().filter(|s| is_hex(s, 64))?;
            let url = format!("https://downloads.php.net/~windows/releases/{}", zip["path"].as_str()?);
            Some(sha256(url.clone(), head_size(client, &url).await, sha))
        }
        "node" => {
            let file = format!("node-v{version}-win-x64.zip");
            let sums = get_text(client, &format!("https://nodejs.org/dist/v{version}/SHASUMS256.txt")).await.ok()?;
            let sha = sums.lines().find(|l| l.trim().ends_with(&file))?.split_whitespace().next()?.to_string();
            let url = format!("https://nodejs.org/dist/v{version}/{file}");
            is_hex(&sha, 64).then_some(())?;
            Some(sha256(url.clone(), head_size(client, &url).await, &sha))
        }
        "apache" => {
            let path = lounge_zip(source.as_str()?, version)?;
            let url = format!("https://www.apachelounge.com{path}");
            let txt = get_text(client, &format!("{url}.txt")).await.ok()?;
            let after = &txt[txt.find("SHA256")?..];
            let sha = after.split(|c: char| !c.is_ascii_hexdigit()).find(|t| is_hex(t, 64))?;
            let size = head_size(client, &url).await;
            size.is_some().then_some(())?;
            Some(sha256(url, size, sha))
        }
        "mysql" => {
            let url = format!("https://cdn.mysql.com/Downloads/MySQL-{line}/mysql-{version}-winx64.zip");
            let md5 = get_text(client, &format!("{url}.md5")).await.ok()?;
            let md5 = md5.split_whitespace().next()?.to_lowercase();
            is_hex(&md5, 32).then_some(())?;
            Some(Download { url: url.clone(), size: head_size(client, &url).await, checksum: Checksum { algo: "md5".into(), value: md5 }, subdir: None, file: None })
        }
        _ => None,
    }
}

/// `/download/VS18/binaries/httpd-2.4.70-261106-Win64-VS18.zip` for a version, from the download page.
fn lounge_zip(page: &str, version: &str) -> Option<String> {
    let needle = format!("/httpd-{version}-");
    page.split('"')
        .find(|t| t.starts_with("/download/") && t.contains(&needle) && t.contains("-Win64-VS") && t.ends_with(".zip"))
        .map(str::to_string)
}

/// The newest Win64 version Apache Lounge offers for a release line (e.g. "2.4" -> "2.4.70").
fn lounge_version(page: &str, line: &str) -> Option<String> {
    let prefix = format!("/httpd-{line}.");
    page.split('"')
        .filter(|t| t.starts_with("/download/") && t.contains("-Win64-VS") && t.ends_with(".zip"))
        .filter_map(|t| {
            let rest = &t[t.find(&prefix)? + 7..];
            let version = rest.split('-').next()?;
            let patch: u32 = version.rsplit('.').next()?.parse().ok()?;
            Some((patch, version.to_string()))
        })
        .max()
        .map(|(_, v)| v)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAGE: &str = r#"<a href="/download/VS18/binaries/httpd-2.4.70-261106-Win64-VS18.zip">x</a>
        <a href="/download/VS18/binaries/httpd-2.4.70-261106-Win64-VS18.zip.txt">sum</a>"#;

    #[test]
    fn finds_apache_lounge_zip_and_newest_version() {
        assert_eq!(lounge_zip(PAGE, "2.4.70").as_deref(), Some("/download/VS18/binaries/httpd-2.4.70-261106-Win64-VS18.zip"));
        assert_eq!(lounge_zip(PAGE, "2.4.69"), None);
        assert_eq!(lounge_version(PAGE, "2.4").as_deref(), Some("2.4.70"));
    }

    #[test]
    fn today_text_round_trips() {
        assert_eq!(catalog::parse_date(&today_text()), Some(catalog::today()));
    }

    #[test]
    fn live_components_replace_bundled_ones_only_when_downloadable() {
        let mut cat = catalog::bundled();
        let apache = cat.components.iter().find(|c| c.id == "apache").unwrap();
        let mut live = CatalogComponent { id: "apache".into(), name: "Apache".into(), lines: vec![] };
        live.lines.push(CatalogLine { latest: "2.4.70".into(), download: apache.lines[0].download.clone(), ..clone_line(&apache.lines[0]) });
        let empty = CatalogComponent { id: "php".into(), name: "PHP".into(), lines: vec![] };
        merge(&mut cat, Cache { checked: 0, generated: "2099-01-01".into(), components: vec![live, empty] });
        assert_eq!(cat.components.iter().find(|c| c.id == "apache").unwrap().lines[0].latest, "2.4.70");
        assert!(!cat.components.iter().find(|c| c.id == "php").unwrap().lines.is_empty());
        assert_eq!(cat.generated, "2099-01-01");
    }

    fn clone_line(l: &CatalogLine) -> CatalogLine {
        serde_json::from_value(serde_json::to_value(l).unwrap()).unwrap()
    }

    /// Asks the real sites. Run: cargo test --lib real_live_catalog -- --ignored --nocapture
    #[test]
    #[ignore]
    fn real_live_catalog() {
        let dir = tempfile::tempdir().unwrap();
        unsafe { std::env::set_var("LOCALAPPDATA", dir.path()) };
        tauri::async_runtime::block_on(refresh(true)).unwrap();
        let cat = current();
        for c in &cat.components {
            let lines: Vec<String> = c.lines.iter().map(|l| format!("{}{}", l.latest, if l.download.is_some() { "" } else { " (no build)" })).collect();
            println!("{}: {}", c.name, lines.join(", "));
        }
        assert!(cat.components.iter().all(|c| c.lines.iter().any(|l| l.download.is_some())));
    }
}
