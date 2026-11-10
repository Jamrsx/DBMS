//! The NexDB license: activated once online, then kept on this PC for offline use.
//!
//! The website signs each license with a private key only it has (Ed25519); this app holds the
//! public key, so it can check a license but never make or change one. The signed license is
//! encrypted with Windows' own per-user protection (DPAPI), so a copy on another PC or account
//! can't be read, and stored in a hidden file. The newest time the app has seen is kept with it,
//! so turning the PC clock back doesn't stretch a license.

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Which website the app activates against: app/license-server.json, built into the app.
/// Change that one file (site and publicKey) when the website goes live, then rebuild.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerConfig {
    site: String,
    public_key: String,
}

fn server_config() -> &'static ServerConfig {
    static CONFIG: std::sync::OnceLock<ServerConfig> = std::sync::OnceLock::new();
    CONFIG.get_or_init(|| {
        serde_json::from_str(include_str!("../../license-server.json")).expect("app/license-server.json is valid")
    })
}

/// The website's license API. NEXDB_LICENSE_API (when running or building) wins over
/// license-server.json, for tests against another copy of the site.
pub fn api_base() -> String {
    std::env::var("NEXDB_LICENSE_API")
        .ok()
        .or_else(|| option_env!("NEXDB_LICENSE_API").map(str::to_string))
        .unwrap_or_else(|| server_config().site.clone())
        .trim_end_matches('/')
        .to_string()
}

/// The public half of the website's signing key (base64). NEXDB_LICENSE_PUBKEY, when set while
/// building, wins over license-server.json.
fn public_key_b64() -> &'static str {
    option_env!("NEXDB_LICENSE_PUBKEY").unwrap_or(&server_config().public_key)
}

/// After a license ends, NexDB keeps working this long so there's time to renew or upgrade.
const GRACE_SECS: i64 = 3 * 24 * 3600;
/// A clock more than this far behind the newest time seen counts as turned back.
const CLOCK_SLACK_SECS: i64 = 24 * 3600;
/// How long a quiet background check waits for the website.
const API_TIMEOUT: Duration = Duration::from_secs(15);

/// What a signed license says. Matches the website's LicenseToken payload.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Claims {
    pub v: u32,
    pub lid: u64,
    pub key_hint: String,
    pub plan: Option<String>,
    /// The reseller who sold it, if any (newer licenses only).
    #[serde(default)]
    pub seller: Option<String>,
    pub name: Option<String>,
    pub email: Option<String>,
    pub machine: String,
    pub issued_at: i64,
    pub expires_at: Option<i64>,
    pub check_by: i64,
    /// Extra app features the plan includes ("nexhost"). Older licenses have none.
    #[serde(default)]
    pub features: Vec<String>,
}

/// What's saved (encrypted) on this PC.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Stored {
    key: String,
    token: String,
    /// The newest time this app has seen, for spotting a clock turned back.
    last_seen: i64,
    /// A message from the website to show next time (the key was turned off, moved...).
    #[serde(default)]
    notice: Option<String>,
}

/// The license state the app and the gate screen work from.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum Status {
    /// No license on this PC yet.
    None { notice: Option<String> },
    /// Good to go.
    Active {
        plan: Option<String>,
        name: Option<String>,
        email: Option<String>,
        key_hint: String,
        lifetime: bool,
        expires_at: Option<i64>,
        check_by: i64,
        days_left: Option<i64>,
        features: Vec<String>,
    },
    /// Valid, but it hasn't checked in with the website for too long.
    NeedsCheckin { key_hint: String, check_by: i64 },
    /// Its time ran out, but NexDB keeps working for a few days so there's time to renew.
    Grace {
        plan: Option<String>,
        seller: Option<String>,
        name: Option<String>,
        email: Option<String>,
        key_hint: String,
        expires_at: i64,
        grace_until: i64,
        features: Vec<String>,
    },
    /// Its time ran out and the grace days are over.
    Expired { key_hint: String, expires_at: i64, plan: Option<String>, seller: Option<String> },
    /// The PC clock is behind the newest time NexDB has seen.
    ClockBack { key_hint: String },
}

impl Status {
    pub fn is_active(&self) -> bool {
        matches!(self, Status::Active { .. } | Status::Grace { .. })
    }
}

/// The cached state, so commands don't decrypt the file on every call.
static CACHE: Mutex<Option<Status>> = Mutex::new(None);

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// `%LOCALAPPDATA%\NexDB\.nexdb-lic`: per user, hidden.
fn store_path() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join("NexDB").join(".nexdb-lic")
}

// ---------- Signature ----------

/// Checks a signed license and returns what it says, or None when it was changed or isn't from
/// the website.
pub fn verify(token: &str, public_key_b64: &str) -> Option<Claims> {
    let (body, sig) = token.split_once('.')?;
    let key_bytes: [u8; 32] = STANDARD.decode(public_key_b64).ok()?.try_into().ok()?;
    let key = VerifyingKey::from_bytes(&key_bytes).ok()?;
    let sig = Signature::from_slice(&URL_SAFE_NO_PAD.decode(sig).ok()?).ok()?;
    key.verify_strict(body.as_bytes(), &sig).ok()?;
    serde_json::from_slice(&URL_SAFE_NO_PAD.decode(body).ok()?).ok()
}

/// The state for a stored license at `at` (seconds), on the PC with this machine hash.
fn evaluate(claims: &Claims, last_seen: i64, at: i64) -> Status {
    let hint = claims.key_hint.clone();
    if at + CLOCK_SLACK_SECS < last_seen {
        return Status::ClockBack { key_hint: hint };
    }
    let at = at.max(last_seen);
    if let Some(end) = claims.expires_at {
        if at >= end + GRACE_SECS {
            return Status::Expired { key_hint: hint, expires_at: end, plan: claims.plan.clone(), seller: claims.seller.clone() };
        }
        if at >= end {
            return Status::Grace {
                plan: claims.plan.clone(),
                seller: claims.seller.clone(),
                name: claims.name.clone(),
                email: claims.email.clone(),
                key_hint: hint,
                expires_at: end,
                grace_until: end + GRACE_SECS,
                features: claims.features.clone(),
            };
        }
    }
    if at > claims.check_by {
        return Status::NeedsCheckin { key_hint: hint, check_by: claims.check_by };
    }
    Status::Active {
        plan: claims.plan.clone(),
        name: claims.name.clone(),
        email: claims.email.clone(),
        key_hint: hint,
        lifetime: claims.expires_at.is_none(),
        expires_at: claims.expires_at,
        check_by: claims.check_by,
        days_left: claims.expires_at.map(|end| ((end - at) as f64 / 86400.0).ceil() as i64),
        features: claims.features.clone(),
    }
}

// ---------- This PC ----------

/// A stable id for this PC, sent hashed: Windows' MachineGuid, never the raw value.
pub fn machine_id() -> String {
    let guid = machine_guid().unwrap_or_else(|| std::env::var("COMPUTERNAME").unwrap_or_default());
    let digest = Sha256::digest(format!("nexdb-pc:{guid}").as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(windows)]
fn machine_guid() -> Option<String> {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_64KEY};
    let key = winreg::RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags(r"SOFTWARE\Microsoft\Cryptography", KEY_READ | KEY_WOW64_64KEY)
        .ok()?;
    key.get_value::<String, _>("MachineGuid").ok().filter(|g| !g.is_empty())
}

#[cfg(not(windows))]
fn machine_guid() -> Option<String> {
    std::fs::read_to_string("/etc/machine-id").ok().map(|s| s.trim().to_string())
}

pub fn device_name() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_else(|_| "This PC".to_string())
}

// ---------- Encrypted file ----------

#[cfg(windows)]
mod dpapi {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    const ENTROPY: &[u8] = b"NexDB license v1";

    fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 }
    }

    fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        // SAFETY: Windows filled `out` with a buffer of cbData bytes that we must LocalFree.
        unsafe {
            let bytes = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
            LocalFree(out.pbData as _);
            bytes
        }
    }

    pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(data);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
        // SAFETY: all pointers are valid for the call; Windows allocates `out`.
        let ok = unsafe {
            CryptProtectData(&input, std::ptr::null(), &entropy, std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        };
        if ok == 0 {
            return Err("Windows couldn't protect the license file.".into());
        }
        Ok(take(out))
    }

    pub fn unprotect(data: &[u8]) -> Option<Vec<u8>> {
        let input = blob(data);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
        // SAFETY: as above.
        let ok = unsafe {
            CryptUnprotectData(&input, std::ptr::null_mut(), &entropy, std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        };
        (ok != 0).then(|| take(out))
    }
}

#[cfg(not(windows))]
mod dpapi {
    pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
        Ok(data.to_vec())
    }
    pub fn unprotect(data: &[u8]) -> Option<Vec<u8>> {
        Some(data.to_vec())
    }
}

fn read_stored() -> Option<Stored> {
    let raw = std::fs::read(store_path()).ok()?;
    serde_json::from_slice(&dpapi::unprotect(&raw)?).ok()
}

fn write_stored(stored: &Stored) -> Result<(), String> {
    let path = store_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let data = dpapi::protect(&serde_json::to_vec(stored).map_err(|e| e.to_string())?)?;
    // Replacing a hidden file needs it gone first on Windows.
    let _ = std::fs::remove_file(&path);
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.attributes(0x2); // FILE_ATTRIBUTE_HIDDEN
    }
    use std::io::Write;
    options.open(&path).and_then(|mut f| f.write_all(&data)).map_err(|e| format!("Couldn't save the license: {e}"))
}

fn forget(notice: Option<String>) {
    let _ = std::fs::remove_file(store_path());
    set_cache(Status::None { notice });
}

fn set_cache(status: Status) {
    if let Ok(mut c) = CACHE.lock() {
        *c = Some(status);
    }
}

// ---------- State ----------

/// The license state right now, from the saved file. Also moves the "newest time seen" forward.
pub fn status() -> Status {
    let Some(mut stored) = read_stored() else {
        let s = Status::None { notice: None };
        set_cache(s.clone());
        return s;
    };
    let claims = match verify(&stored.token, public_key_b64()) {
        Some(c) if c.machine.len() == 64 => c,
        // Changed, from another site's key, or broken: start over.
        _ => {
            forget(Some("The saved license couldn't be read. Activate it again.".into()));
            return Status::None { notice: Some("The saved license couldn't be read. Activate it again.".into()) };
        }
    };
    if let Some(notice) = stored.notice.take() {
        let _ = write_stored(&stored);
        let s = Status::None { notice: Some(notice) };
        set_cache(s.clone());
        return s;
    }
    let at = now();
    let s = evaluate(&claims, stored.last_seen, at);
    if at > stored.last_seen && !matches!(s, Status::ClockBack { .. }) {
        stored.last_seen = at;
        let _ = write_stored(&stored);
    }
    set_cache(s.clone());
    s
}

/// For commands that should only run with a license (starting services, installing...).
/// Every minute: re-reads the license so it ends on time while NexDB is open. Says so once with
/// a Windows notification when it ends (grace days start) and once when the grace days are over,
/// and tells the window (`license-changed`) so it can show the renew screen.
pub fn watch_end(app: tauri::AppHandle) {
    use tauri::Emitter;
    std::thread::spawn(move || {
        let mut last = status();
        loop {
            std::thread::sleep(Duration::from_secs(60));
            let now_status = status();
            let changed = std::mem::discriminant(&now_status) != std::mem::discriminant(&last);
            // Lost NexHost (ended, signed out, other plan): public links stop right away.
            let lost_nexhost = feature_error(&last, "nexhost").is_none() && feature_error(&now_status, "nexhost").is_some();
            if lost_nexhost {
                crate::lose_nexhost(&app);
            }
            if changed || lost_nexhost {
                match &now_status {
                    Status::Grace { grace_until, .. } => crate::tray::notify(
                        &app,
                        "Your NexDB license has ended",
                        &format!("NexDB keeps working for {} more. Open NexDB to renew or upgrade.", time_left(grace_until - now())),
                    ),
                    Status::Expired { .. } => crate::tray::notify(
                        &app,
                        "NexDB needs a new license",
                        "The 3 grace days are over. Open NexDB to renew or upgrade; your projects and databases are safe.",
                    ),
                    _ => {}
                }
                let _ = app.emit("license-changed", &now_status);
            }
            last = now_status;
        }
    });
}

/// "2 days", "5 hours", "12 minutes".
fn time_left(secs: i64) -> String {
    let (n, unit) = match secs.max(0) {
        s if s >= 86_400 => ((s as f64 / 86_400.0).ceil() as i64, "day"),
        s if s >= 3_600 => ((s as f64 / 3_600.0).ceil() as i64, "hour"),
        s => (((s as f64) / 60.0).ceil().max(1.0) as i64, "minute"),
    };
    format!("{n} {unit}{}", if n == 1 { "" } else { "s" })
}

/// Shown when a feature needs a plan this license doesn't have.
pub const NEXHOST_LOCKED: &str = "NexHost and public links are part of the 4-year plan.";

/// Why `name` can't be used with this license state, or None when it can.
fn feature_error(status: &Status, name: &str) -> Option<String> {
    let features = match status {
        Status::Active { features, .. } | Status::Grace { features, .. } => features,
        _ => return Some("NexDB needs an active license for this. Open NexDB to activate it.".into()),
    };
    if features.iter().any(|f| f == name) {
        None
    } else if name == "nexhost" {
        Some(NEXHOST_LOCKED.into())
    } else {
        Some("Your plan doesn't include this.".into())
    }
}

fn current_status() -> Status {
    let cached = CACHE.lock().ok().and_then(|c| c.clone());
    cached.unwrap_or_else(status)
}

/// Whether this license's plan includes an app feature, like "nexhost".
pub fn has_feature(name: &str) -> bool {
    feature_error(&current_status(), name).is_none()
}

/// Ok when the license is active and its plan includes `name`; else a plain message.
pub fn require_feature(name: &str) -> Result<(), String> {
    feature_error(&current_status(), name).map_or(Ok(()), Err)
}

pub fn require() -> Result<(), String> {
    let cached = CACHE.lock().ok().and_then(|c| c.clone());
    let s = cached.unwrap_or_else(status);
    if s.is_active() {
        Ok(())
    } else {
        Err("NexDB needs an active license for this. Open NexDB to activate it.".into())
    }
}

// ---------- Website calls ----------

/// The website's answer, as the gate screen needs it.
#[derive(Debug, Clone, Serialize, Default)]
pub struct Outcome {
    pub ok: bool,
    pub status: Option<Status>,
    pub code: Option<String>,
    pub message: Option<String>,
    /// For "other_device": the PC it's on now, and how many moves are left this month.
    pub device: Option<String>,
    pub moves_left: Option<i64>,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(API_TIMEOUT)
        .user_agent(concat!("NexDB/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}

/// Percent-encodes a query value.
fn url_encode(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// The plans people can buy, from the website, for the renew-or-upgrade screen.
pub async fn plans(current: Option<String>) -> Result<serde_json::Value, String> {
    let res = client()?
        // The person's own plan is always listed, so it can be renewed.
        .get(format!("{}/api/v1/plans?current={}", api_base(), url_encode(&current.unwrap_or_default())))
        .header("Accept", "application/json")
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|_| "Couldn't load the plans. Check your internet connection.".to_string())?;
    res.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

async fn post(path: &str, body: serde_json::Value) -> Result<(u16, serde_json::Value), String> {
    let res = client()?
        .post(format!("{}/api/v1/licenses/{path}", api_base()))
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|_| "NexDB couldn't reach the license server. Check your internet connection and try again.".to_string())?;
    let code = res.status().as_u16();
    let json = res.json::<serde_json::Value>().await.unwrap_or(serde_json::Value::Null);
    Ok((code, json))
}

fn failure(json: &serde_json::Value, fallback: &str) -> Outcome {
    let message = json["message"].as_str().map(str::to_string).or_else(|| {
        // Laravel validation errors: the first message.
        json["errors"].as_object().and_then(|m| m.values().next()).and_then(|v| v[0].as_str()).map(str::to_string)
    });
    Outcome {
        ok: false,
        code: json["code"].as_str().map(str::to_string),
        message: Some(message.unwrap_or_else(|| fallback.to_string())),
        device: json["device"].as_str().map(str::to_string),
        moves_left: json["moves_left"].as_i64(),
        ..Default::default()
    }
}

/// Saves a license the website just signed, after checking it really is for this PC.
fn accept(key: &str, json: &serde_json::Value) -> Outcome {
    let Some(token) = json["token"].as_str() else {
        return failure(json, "The license server sent an answer NexDB doesn't understand.");
    };
    let Some(claims) = verify(token, public_key_b64()) else {
        return failure(&serde_json::Value::Null, "The license couldn't be verified. Make sure NexDB is up to date.");
    };
    let stored = Stored { key: key.trim().to_uppercase(), token: token.to_string(), last_seen: now().max(claims.issued_at), notice: None };
    if let Err(e) = write_stored(&stored) {
        return Outcome { ok: false, message: Some(e), ..Default::default() };
    }
    Outcome { ok: true, status: Some(status()), moves_left: json["moves_left"].as_i64(), ..Default::default() }
}

/// Signs in with the NexDB account (email and password) instead of a key: the website puts the
/// account's license on this PC. `move_here` moves it from another PC (uses one of the monthly moves).
pub async fn sign_in(email: &str, password: &str, move_here: bool) -> Outcome {
    let body = serde_json::json!({
        "email": email.trim(),
        "password": password,
        "machine_id": machine_id(),
        "device_name": device_name(),
        "app_version": env!("CARGO_PKG_VERSION"),
        "move": move_here,
    });
    match post("signin", body).await {
        Ok((200, json)) => match json["key"].as_str() {
            Some(key) => accept(key, &json),
            None => failure(&json, "The license server sent an answer NexDB doesn't understand."),
        },
        Ok((_, json)) => failure(&json, "Couldn't sign in."),
        Err(e) => Outcome { ok: false, code: Some("offline".into()), message: Some(e), ..Default::default() },
    }
}

/// Activates a key on this PC. The first activation makes the person's NexDB account with this
/// email and password. `move_here` moves it from another PC (uses one of the monthly moves).
pub async fn activate(key: &str, name: &str, email: &str, password: &str, move_here: bool) -> Outcome {
    let body = serde_json::json!({
        "key": key.trim(),
        "machine_id": machine_id(),
        "device_name": device_name(),
        "name": name.trim(),
        "email": email.trim(),
        "password": password,
        "app_version": env!("CARGO_PKG_VERSION"),
        "move": move_here,
    });
    match post("activate", body).await {
        Ok((200, json)) => accept(key, &json),
        Ok((_, json)) => failure(&json, "The key couldn't be activated."),
        Err(e) => Outcome { ok: false, code: Some("offline".into()), message: Some(e), ..Default::default() },
    }
}

/// The quiet check-in. Online: refreshes the license, or ends it if the website says it was
/// turned off or moved. Offline: nothing changes.
pub async fn check_in() -> Outcome {
    let Some(stored) = read_stored() else {
        return Outcome { ok: true, status: Some(status()), ..Default::default() };
    };
    let body = serde_json::json!({ "key": stored.key, "machine_id": machine_id(), "app_version": env!("CARGO_PKG_VERSION") });
    match post("check", body).await {
        Ok((200, json)) => accept(&stored.key, &json),
        Ok((code, json)) if matches!(json["code"].as_str(), Some("revoked" | "moved" | "lapsed" | "not_found")) || code == 404 => {
            let out = failure(&json, "This license can no longer be used on this PC.");
            forget(out.message.clone());
            Outcome { status: Some(status()), ..out }
        }
        // Server trouble or too many tries: keep what's saved.
        Ok(_) | Err(_) => Outcome { ok: true, status: Some(status()), code: Some("offline".into()), ..Default::default() },
    }
}

/// Frees the key from this PC so it can be activated on another one.
pub async fn unlink() -> Outcome {
    let Some(stored) = read_stored() else {
        return Outcome { ok: true, status: Some(status()), ..Default::default() };
    };
    match post("unlink", serde_json::json!({ "key": stored.key, "machine_id": machine_id() })).await {
        Ok((200, json)) => {
            forget(None);
            Outcome { ok: true, status: Some(status()), moves_left: json["moves_left"].as_i64(), ..Default::default() }
        }
        Ok((_, json)) => failure(&json, "The key couldn't be unlinked."),
        Err(e) => Outcome { ok: false, code: Some("offline".into()), message: Some(e), ..Default::default() },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn signed(claims: &Claims) -> (String, String) {
        let key = SigningKey::from_bytes(&[7u8; 32]);
        let body = URL_SAFE_NO_PAD.encode(serde_json::to_vec(claims).unwrap());
        let sig = key.sign(body.as_bytes());
        (format!("{body}.{}", URL_SAFE_NO_PAD.encode(sig.to_bytes())), STANDARD.encode(key.verifying_key().to_bytes()))
    }

    fn claims(expires_at: Option<i64>) -> Claims {
        Claims {
            v: 1,
            lid: 4,
            key_hint: "7KQ2".into(),
            plan: Some("6 months".into()),
            seller: Some("Alpha Shop".into()),
            name: Some("Maria".into()),
            email: Some("maria@example.com".into()),
            machine: "a".repeat(64),
            issued_at: 1_000,
            expires_at,
            check_by: 1_000 + 30 * 86400,
            features: vec![],
        }
    }

    fn active_status(features: Vec<String>) -> Status {
        Status::Active {
            plan: Some("4 years".into()),
            name: None,
            email: None,
            key_hint: "7KQ2".into(),
            lifetime: false,
            expires_at: Some(5_000_000),
            check_by: 2_000,
            days_left: Some(10),
            features,
        }
    }

    #[test]
    fn features_come_from_the_token_and_old_tokens_have_none() {
        let mut c = claims(Some(5_000_000));
        c.features = vec!["nexhost".into()];
        let (token, public) = signed(&c);
        assert_eq!(verify(&token, &public).unwrap().features, vec!["nexhost".to_string()]);

        // A token signed before features existed has no "features" key.
        let old = serde_json::json!({"v":1,"lid":4,"key_hint":"7KQ2","plan":"6 months","name":null,"email":null,
            "machine":"a","issued_at":1000,"expires_at":null,"check_by":2000});
        let parsed: Claims = serde_json::from_value(old).unwrap();
        assert!(parsed.features.is_empty());
    }

    #[test]
    fn require_feature_says_which_plan() {
        assert_eq!(feature_error(&active_status(vec![]), "nexhost"), Some("NexHost and public links are part of the 4-year plan.".into()));
        assert_eq!(feature_error(&active_status(vec!["nexhost".into()]), "nexhost"), None);
        assert!(feature_error(&Status::None { notice: None }, "nexhost").unwrap().contains("active license"));
    }

    #[test]
    fn a_signed_license_is_read_and_a_changed_one_is_refused() {
        let (token, public) = signed(&claims(Some(5_000_000)));
        assert_eq!(verify(&token, &public), Some(claims(Some(5_000_000))));

        // Push the end date out without the website's key: the signature no longer matches.
        let (_, sig) = token.split_once('.').unwrap();
        let forged_body = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims(Some(9_999_999_999))).unwrap());
        assert_eq!(verify(&format!("{forged_body}.{sig}"), &public), None);
        assert_eq!(verify("garbage", &public), None);
    }

    #[test]
    fn states_follow_the_dates() {
        let c = claims(Some(5_000_000));
        assert!(evaluate(&c, 1_000, 2_000).is_active());
        assert!(matches!(evaluate(&c, 1_000, c.check_by + 1), Status::NeedsCheckin { .. }));
        // Ended: 3 days of grace (still works), then expired.
        let grace = evaluate(&c, 1_000, 5_000_001);
        assert!(grace.is_active() && matches!(grace, Status::Grace { grace_until: 5_259_200, .. }));
        assert!(matches!(evaluate(&c, 1_000, 5_000_000 + GRACE_SECS), Status::Expired { .. }));
        assert!(!evaluate(&c, 1_000, 5_000_000 + GRACE_SECS).is_active());
        assert!(matches!(evaluate(&claims(None), 1_000, 2_000), Status::Active { lifetime: true, .. }));
    }

    #[test]
    fn turning_the_clock_back_is_noticed() {
        let c = claims(Some(2_000_000));
        assert!(matches!(evaluate(&c, 500_000, 100_000), Status::ClockBack { .. }));
        // A small difference (time zone, a resync) is fine.
        assert!(evaluate(&c, 500_000, 500_000 - 3600).is_active());
    }

    #[test]
    fn the_machine_id_is_a_stable_hash() {
        let a = machine_id();
        assert_eq!(a.len(), 64);
        assert_eq!(a, machine_id());
    }

    /// The whole flow against a real NexDB website (run by hand):
    /// NEXDB_LICENSE_API=http://127.0.0.1:8011 NEXDB_TEST_KEY=NEXDB-... cargo test --lib real_license_flow -- --ignored
    /// Uses a throwaway folder instead of this PC's real license file.
    #[test]
    #[ignore]
    fn real_license_flow() {
        let key = std::env::var("NEXDB_TEST_KEY").expect("NEXDB_TEST_KEY");
        let dir = std::env::temp_dir().join(format!("nexdb-license-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        // SAFETY: this ignored test runs alone (by name), before any other thread reads it.
        unsafe { std::env::set_var("LOCALAPPDATA", &dir) };

        assert!(matches!(status(), Status::None { .. }));
        assert!(require().is_err());

        let bad = tauri::async_runtime::block_on(activate("NEXDB-AAAA-BBBB-CCCC-DDDD", "Test Person", "test@example.com", "test-pass-123", false));
        assert!(!bad.ok);
        assert_eq!(bad.code.as_deref(), Some("not_found"), "{bad:?}");

        let out = tauri::async_runtime::block_on(activate(&key, "Test Person", "test@example.com", "test-pass-123", false));
        assert!(out.ok, "{out:?}");
        assert!(status().is_active());
        assert!(require().is_ok());

        // The saved file is encrypted and hidden: the key isn't readable in it.
        let raw = std::fs::read(store_path()).unwrap();
        assert!(!String::from_utf8_lossy(&raw).contains(&key));
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            assert_ne!(std::fs::metadata(store_path()).unwrap().file_attributes() & 0x2, 0, "hidden");
        }

        let checked = tauri::async_runtime::block_on(check_in());
        assert!(checked.ok && checked.code.is_none(), "{checked:?}");

        let freed = tauri::async_runtime::block_on(unlink());
        assert!(freed.ok, "{freed:?}");
        assert!(matches!(status(), Status::None { .. }));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn windows_protection_round_trips() {
        let secret = b"NEXDB-AAAA-BBBB-CCCC-DDDD";
        let sealed = dpapi::protect(secret).unwrap();
        assert_ne!(&sealed[..], &secret[..]);
        assert_eq!(dpapi::unprotect(&sealed).unwrap(), secret);
    }
}
