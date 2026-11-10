//! NexHost SSH: who may log in to a site, with which password, and what they may run.
//! The server itself is in `ssh_server.rs`; everything it decides comes from here.

use std::collections::{BTreeMap, HashMap};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::nexhost::NexSite;

/// A site's SSH settings (saved with the site).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct SiteSsh {
    #[serde(default)]
    pub on: bool,
    #[serde(default)]
    pub users: Vec<SshUser>,
}

/// One person's SSH login for a site. The password itself is never kept, only its hash.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SshUser {
    pub name: String,
    pub login: String,
    pub hash: String,
    /// "files" (files and site commands) or "shell" (full PowerShell in the site folder).
    pub role: String,
    pub enabled: bool,
    pub created_at: i64,
}

/// User names: 1-20 small letters or digits.
pub fn valid_user_name(name: &str) -> Result<(), String> {
    let ok = !name.is_empty() && name.len() <= 20 && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
    if ok {
        Ok(())
    } else {
        Err("Use up to 20 small letters or numbers for the user name, like maria.".into())
    }
}

/// `shop` + `maria` -> `shop-maria`.
pub fn login_for(site: &str, name: &str) -> String {
    format!("{site}-{name}")
}

/// An Argon2id hash in PHC form (`$argon2id$...`).
pub fn hash_password(pw: &str) -> Result<String, String> {
    use argon2::password_hash::{PasswordHasher, SaltString};
    let mut salt = [0u8; 16];
    getrandom::fill(&mut salt).map_err(|e| format!("Couldn't make a password salt: {e}"))?;
    let salt = SaltString::encode_b64(&salt).map_err(|e| e.to_string())?;
    argon2::Argon2::default()
        .hash_password(pw.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| format!("Couldn't protect the password: {e}"))
}

pub fn check_password(hash: &str, pw: &str) -> bool {
    use argon2::password_hash::{PasswordHash, PasswordVerifier};
    PasswordHash::new(hash).is_ok_and(|h| argon2::Argon2::default().verify_password(pw.as_bytes(), &h).is_ok())
}

/// A new login with a generated password, which is returned once and never kept.
pub fn new_user(site: &str, name: &str, existing: &[SshUser], now: i64) -> Result<(SshUser, String), String> {
    valid_user_name(name)?;
    if existing.iter().any(|u| u.name == name) {
        return Err(format!("This site already has a user named {name}."));
    }
    let password: String = crate::quickstart::random_password()?.chars().take(24).collect();
    let user = SshUser {
        name: name.to_string(),
        login: login_for(site, name),
        hash: hash_password(&password)?,
        role: "files".into(),
        enabled: true,
        created_at: now,
    };
    Ok((user, password))
}

/// Wrong-password tries per login: 5 within 10 minutes locks it for 15 minutes.
pub struct Lockout(Mutex<HashMap<String, (Vec<i64>, Option<i64>)>>);

const TRIES: usize = 5;
const WINDOW: i64 = 10 * 60;
const LOCK: i64 = 15 * 60;

impl Lockout {
    pub fn new() -> Self {
        Lockout(Mutex::new(HashMap::new()))
    }
    pub fn allowed(&self, login: &str, now: i64) -> bool {
        let mut map = self.0.lock().unwrap();
        let Some((_, locked)) = map.get_mut(login) else { return true };
        match *locked {
            Some(until) if now < until => false,
            Some(_) => {
                map.remove(login);
                true
            }
            None => true,
        }
    }
    pub fn failed(&self, login: &str, now: i64) {
        let mut map = self.0.lock().unwrap();
        let (tries, locked) = map.entry(login.to_string()).or_default();
        tries.retain(|t| now - t < WINDOW);
        tries.push(now);
        if tries.len() >= TRIES {
            *locked = Some(now + LOCK);
        }
    }
    pub fn succeeded(&self, login: &str) {
        self.0.lock().unwrap().remove(login);
    }
}

/// The result of a login attempt.
#[derive(Debug, Clone, PartialEq)]
pub enum Who {
    Ok { site: String, user: SshUser },
    Refused(&'static str),
}

/// Whether `login` with `password` may use SSH right now.
pub fn authenticate(sites: &BTreeMap<String, NexSite>, has_nexhost: bool, login: &str, password: &str) -> Who {
    if !has_nexhost {
        return Who::Refused("SSH is part of the 4-year plan.");
    }
    // The login's prefix isn't trusted: look it up in every site.
    let found = sites.iter().find_map(|(name, s)| s.ssh.users.iter().find(|u| u.login == login).map(|u| (name, s, u)));
    let Some((site, s, user)) = found else {
        // Still spend the time a real check takes, so unknown logins look the same.
        let _ = check_password("$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g", password);
        return Who::Refused("Wrong login or password.");
    };
    if !check_password(&user.hash, password) {
        return Who::Refused("Wrong login or password.");
    }
    if !s.ssh.on {
        return Who::Refused("SSH is turned off for this site.");
    }
    if !user.enabled {
        return Who::Refused("This login is turned off.");
    }
    Who::Ok { site: site.clone(), user: user.clone() }
}

// ---------- What a "files" login may run ----------

/// Splits a command line into arguments (spaces, '...' and "..." quotes). Pipes, redirects,
/// `;`, `&`, backticks and `$(` are refused: one plain command at a time.
pub fn split_args(line: &str) -> Result<Vec<String>, String> {
    if line.contains('`') || line.contains("$(") {
        return Err("Run one plain command at a time, without ` or $(...).".into());
    }
    let mut args = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut started = false;
    for c in line.chars() {
        match (quote, c) {
            (Some(q), c) if c == q => quote = None,
            (Some(_), c) => cur.push(c),
            (None, '"' | '\'') => {
                quote = Some(c);
                started = true;
            }
            (None, '|' | ';' | '&' | '<' | '>') => {
                return Err("Run one plain command at a time, without | ; & < or >.".into());
            }
            (None, c) if c.is_whitespace() => {
                if started {
                    args.push(std::mem::take(&mut cur));
                    started = false;
                }
            }
            (None, c) => {
                cur.push(c);
                started = true;
            }
        }
    }
    if quote.is_some() {
        return Err("A quote isn't closed.".into());
    }
    if started {
        args.push(cur);
    }
    Ok(args)
}

/// Ok when this command may run for a "files and site commands" login.
pub fn check_command(args: &[String]) -> Result<(), String> {
    const ALLOWED: [&str; 13] = ["php", "composer", "git", "npm", "npx", "node", "ls", "cat", "tail", "mkdir", "rm", "pwd", "exit"];
    let Some(cmd) = args.first().map(|c| c.to_ascii_lowercase()) else {
        return Err("Type a command.".into());
    };
    if !ALLOWED.contains(&cmd.as_str()) {
        return Err(format!(
            "{cmd} isn't allowed here. You can run: php artisan, composer, git, npm, npx, node, ls, cat, tail, mkdir, rm, pwd, exit."
        ));
    }
    if cmd == "php" && args.get(1).map(String::as_str) != Some("artisan") {
        return Err("Only php artisan ... can run here.".into());
    }
    for arg in &args[1..] {
        if leaves_site(arg) {
            return Err(format!("{arg} points outside this site's folder."));
        }
    }
    Ok(())
}

/// Whether an argument names a place outside the site: an absolute, drive or network path, or
/// one with `..` (also after `--option=`). Web addresses (`https://…`) are fine.
fn leaves_site(arg: &str) -> bool {
    let drive = |p: &str| {
        let b = p.as_bytes();
        b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':'
    };
    arg.split('=').any(|part| {
        let p = part.trim_matches(|c| c == '"' || c == '\'');
        if p.contains("://") {
            return false;
        }
        p.starts_with('/') || p.starts_with('\\') || p.starts_with('~') || drive(p) || p.split(['/', '\\']).any(|seg| seg == "..")
    })
}

// ---------- Host key and log ----------

fn ssh_dir(root: &std::path::Path) -> std::path::PathBuf {
    crate::nexhost::dir(root).join(".ssh")
}

/// The server's own key, made once and kept encrypted for this Windows user.
pub fn host_key(root: &std::path::Path) -> Result<russh::keys::PrivateKey, String> {
    use russh::keys::ssh_key::{private::Ed25519Keypair, LineEnding, PrivateKey};
    let path = ssh_dir(root).join("host_key");
    if let Some(text) = std::fs::read(&path).ok().and_then(|b| crate::license::dpapi::unprotect(&b)).and_then(|b| String::from_utf8(b).ok()) {
        if let Ok(key) = PrivateKey::from_openssh(&text) {
            return Ok(key);
        }
    }
    let mut seed = [0u8; 32];
    getrandom::fill(&mut seed).map_err(|e| format!("Couldn't make the SSH key: {e}"))?;
    let key = PrivateKey::from(Ed25519Keypair::from_seed(&seed));
    let text = key.to_openssh(LineEnding::LF).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(ssh_dir(root)).map_err(|e| e.to_string())?;
    let sealed = crate::license::dpapi::protect(text.as_bytes())?;
    std::fs::write(&path, sealed).map_err(|e| format!("Couldn't save the SSH key: {e}"))?;
    Ok(key)
}

/// `SHA256:…`, what SSH shows people the first time they connect.
pub fn fingerprint(key: &russh::keys::PrivateKey) -> String {
    key.public_key().fingerprint(russh::keys::ssh_key::HashAlg::Sha256).to_string()
}

/// One line of the SSH log.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct LogEntry {
    pub at: i64,
    pub login: String,
    pub site: String,
    pub from: Option<String>,
    /// login_ok, login_failed, locked, command, sftp_write, sftp_delete
    pub event: String,
    pub detail: Option<String>,
}

const KEEP_SECS: i64 = 30 * 86400;

/// Adds an entry; entries older than 30 days are dropped.
pub fn log(root: &std::path::Path, e: &LogEntry) {
    static WRITE: Mutex<()> = Mutex::new(());
    let _guard = WRITE.lock().unwrap();
    let path = ssh_dir(root).join("log.jsonl");
    let mut kept: Vec<String> = std::fs::read_to_string(&path)
        .unwrap_or_default()
        .lines()
        .filter(|l| serde_json::from_str::<LogEntry>(l).is_ok_and(|x| e.at - x.at < KEEP_SECS))
        .map(str::to_string)
        .collect();
    if let Ok(line) = serde_json::to_string(e) {
        kept.push(line);
    }
    let _ = std::fs::create_dir_all(ssh_dir(root));
    let _ = std::fs::write(&path, kept.join("\n") + "\n");
}

/// A site's newest entries first.
pub fn recent(root: &std::path::Path, site: &str, limit: usize) -> Vec<LogEntry> {
    let mut list: Vec<LogEntry> = std::fs::read_to_string(ssh_dir(root).join("log.jsonl"))
        .unwrap_or_default()
        .lines()
        .filter_map(|l| serde_json::from_str::<LogEntry>(l).ok())
        .filter(|e| e.site == site)
        .collect();
    list.sort_by(|a, b| b.at.cmp(&a.at));
    list.truncate(limit);
    list
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn host_key_is_made_once_and_kept_encrypted() {
        let root = tempfile::tempdir().unwrap();
        let a = fingerprint(&host_key(root.path()).unwrap());
        let b = fingerprint(&host_key(root.path()).unwrap());
        assert_eq!(a, b);
        assert!(a.starts_with("SHA256:"));
        let raw = std::fs::read(ssh_dir(root.path()).join("host_key")).unwrap();
        assert!(!String::from_utf8_lossy(&raw).contains("OPENSSH PRIVATE KEY"));
    }

    fn entry(at: i64, site: &str, event: &str) -> LogEntry {
        LogEntry { at, login: format!("{site}-maria"), site: site.into(), from: None, event: event.into(), detail: None }
    }

    #[test]
    fn log_keeps_30_days_and_lists_newest_first() {
        let root = tempfile::tempdir().unwrap();
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;
        log(root.path(), &entry(now - 31 * 86400, "shop", "login_ok"));
        log(root.path(), &entry(now - 10, "shop", "login_ok"));
        log(root.path(), &entry(now - 5, "blog", "command"));
        log(root.path(), &entry(now, "shop", "command"));
        let shop = recent(root.path(), "shop", 10);
        assert_eq!(shop.iter().map(|e| e.at).collect::<Vec<_>>(), vec![now, now - 10]);
        assert_eq!(recent(root.path(), "shop", 1).len(), 1);
    }


    fn check(line: &str) -> Result<(), String> {
        split_args(line).and_then(|a| check_command(&a))
    }

    #[test]
    fn allowed_commands_pass() {
        for ok in [
            "php artisan migrate",
            "composer install",
            "git pull",
            "npm run build",
            "ls",
            "cat .env",
            "tail -n 50 storage/logs/laravel.log",
            "mkdir uploads",
            "rm old.txt",
            "pwd",
            "git commit -m \"fix the menu\"",
        ] {
            assert!(check(ok).is_ok(), "{ok}");
        }
    }

    #[test]
    fn escapes_are_refused() {
        for bad in [
            "php -r 'echo 1;'",
            "php x.php",
            "powershell",
            "cmd /c dir",
            "git -C C:\\ status",
            "npm --prefix ..\\x i",
            "cat ../../secret",
            "ls C:/",
            "cat \\\\server\\x",
            "rm -rf /",
            "",
        ] {
            assert!(check(bad).is_err(), "{bad}");
        }
        assert!(split_args("ls | more").is_err());
        assert!(split_args("git pull; calc").is_err());
        assert!(split_args("echo `whoami`").is_err());
        assert!(split_args("cat $(x)").is_err());
        assert!(split_args("ls > out.txt").is_err());
    }


    #[test]
    fn user_names_and_logins() {
        assert!(valid_user_name("maria").is_ok());
        assert!(valid_user_name("dev2").is_ok());
        let long = "a".repeat(21);
        for bad in ["", "Maria", "ma ria", "a-b", long.as_str()] {
            assert!(valid_user_name(bad).is_err(), "{bad}");
        }
        assert_eq!(login_for("shop", "maria"), "shop-maria");
    }

    #[test]
    fn passwords_are_hashed_and_checked() {
        let h = hash_password("s3cret").unwrap();
        assert!(h.starts_with("$argon2id$") && !h.contains("s3cret"));
        assert!(check_password(&h, "s3cret") && !check_password(&h, "nope"));
        assert!(!check_password("not a hash", "s3cret"));
    }

    #[test]
    fn new_user_gets_a_strong_password_once() {
        let (u, pw) = new_user("shop", "maria", &[], 1).unwrap();
        assert_eq!((u.login.as_str(), u.role.as_str(), u.enabled), ("shop-maria", "files", true));
        assert_eq!(pw.len(), 24);
        assert!(check_password(&u.hash, &pw));
        assert!(new_user("shop", "maria", &[u], 2).is_err(), "same name twice");
        assert!(new_user("shop", "Bad Name", &[], 2).is_err());
    }

    fn sites_with(on: bool, enabled: bool, pw: &str) -> BTreeMap<String, NexSite> {
        let (mut u, _) = new_user("shop", "maria", &[], 1).unwrap();
        u.hash = hash_password(pw).unwrap();
        u.enabled = enabled;
        let site = NexSite { port: 8201, ssh: SiteSsh { on, users: vec![u] }, ..Default::default() };
        BTreeMap::from([("shop".to_string(), site)])
    }

    #[test]
    fn login_needs_site_on_user_enabled_and_licence() {
        let ok = sites_with(true, true, "pw");
        assert!(matches!(authenticate(&ok, true, "shop-maria", "pw"), Who::Ok { ref site, .. } if site == "shop"));
        assert!(matches!(authenticate(&ok, true, "shop-maria", "wrong"), Who::Refused(_)));
        assert!(matches!(authenticate(&ok, true, "shop-nobody", "pw"), Who::Refused(_)));
        assert!(matches!(authenticate(&ok, false, "shop-maria", "pw"), Who::Refused(_)));
        assert!(matches!(authenticate(&sites_with(false, true, "pw"), true, "shop-maria", "pw"), Who::Refused(_)));
        assert!(matches!(authenticate(&sites_with(true, false, "pw"), true, "shop-maria", "pw"), Who::Refused(_)));
    }

    #[test]
    fn five_wrong_tries_lock_for_fifteen_minutes() {
        let l = Lockout::new();
        for i in 0..5 {
            assert!(l.allowed("shop-maria", 100 + i));
            l.failed("shop-maria", 100 + i);
        }
        assert!(!l.allowed("shop-maria", 110));
        assert!(l.allowed("shop-maria", 110 + 15 * 60));
        assert!(l.allowed("shop-other", 110), "other logins unaffected");
    }
}
