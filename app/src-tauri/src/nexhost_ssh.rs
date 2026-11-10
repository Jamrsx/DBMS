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

#[cfg(test)]
mod tests {
    use super::*;

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
