//! Install steps that change Windows itself and so always ask the user first:
//! the Visual C++ runtime (administrator prompt) and trusting NexDB's local
//! certificate authority (Windows' own confirmation dialog).

use crate::configure::{run_quiet, Output};
use rcgen::{
    BasicConstraints, CertificateParams, CidrSubnet, DistinguishedName, DnType, ExtendedKeyUsagePurpose,
    GeneralSubtree, IsCa, Issuer, KeyPair, KeyUsagePurpose, NameConstraints,
};
use sha1::{Digest, Sha1};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Microsoft's permanent link to the current Visual C++ v14 runtime (2015–2026).
pub const VC_REDIST_URL: &str = "https://aka.ms/vc14/vc_redist.x64.exe";

/// Oldest runtime that runs every build in the catalog (Apache Lounge VS18 builds need 14.50).
pub const VC_MIN_VERSION: (u32, u32) = (14, 50);

const POWERSHELL: &str = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe";
const CERTUTIL: &str = r"C:\Windows\System32\certutil.exe";

/// Whether an installed runtime version such as `14.51.36247.00` is new enough.
pub fn vc_runtime_ok(installed: Option<&str>) -> bool {
    let Some(v) = installed else { return false };
    let mut parts = v.trim_start_matches('v').split('.').map(|p| p.parse::<u32>().unwrap_or(0));
    let major = parts.next().unwrap_or(0);
    let minor = parts.next().unwrap_or(0);
    (major, minor) >= VC_MIN_VERSION
}

/// Text for a value inside a single-quoted PowerShell string.
fn ps_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn powershell(script: &str, timeout: Duration) -> Result<Output, String> {
    run_quiet(
        Path::new(POWERSHELL),
        &["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        timeout,
    )
    .map_err(|err| format!("Couldn't run PowerShell: {err}"))
}

/// Checks that a downloaded installer carries a valid Microsoft Authenticode signature.
pub fn verify_microsoft_signature(file: &Path) -> Result<(), String> {
    let script = format!(
        "$s = Get-AuthenticodeSignature -LiteralPath {}; \"$($s.Status)|$($s.SignerCertificate.Subject)\"",
        ps_quote(&file.display().to_string())
    );
    let out = powershell(&script, Duration::from_secs(60))?;
    let text = out.text.trim();
    if is_valid_microsoft_signature(text) {
        Ok(())
    } else {
        Err(format!(
            "The Visual C++ installer isn't validly signed by Microsoft ({}), so it wasn't run.",
            text.split('|').next().unwrap_or("unknown")
        ))
    }
}

pub fn is_valid_microsoft_signature(status_and_subject: &str) -> bool {
    let (status, subject) = status_and_subject.split_once('|').unwrap_or((status_and_subject, ""));
    status == "Valid" && subject.contains("O=Microsoft Corporation")
}

/// Runs the Visual C++ installer silently behind one administrator prompt.
/// Returns a message for the step, or an error the user can act on.
pub fn install_vc_runtime(installer: &Path) -> Result<String, String> {
    let script = format!(
        "try {{ $p = Start-Process -FilePath {} -ArgumentList '/install','/quiet','/norestart' \
         -Verb RunAs -Wait -PassThru -ErrorAction Stop; exit $p.ExitCode }} \
         catch {{ exit 1223 }}",
        ps_quote(&installer.display().to_string())
    );
    let out = run_quiet(
        Path::new(POWERSHELL),
        &["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script],
        Duration::from_secs(900),
    )
    .map_err(|err| format!("Couldn't start the Visual C++ installer: {err}"))?;
    vc_result(out.code)
}

/// Meaning of the Visual C++ installer's exit code.
pub fn vc_result(code: Option<i32>) -> Result<String, String> {
    match code {
        Some(0) => Ok("Installed".into()),
        Some(1638) => Ok("A newer version is already installed".into()),
        Some(3010) => Ok("Installed · restart Windows when convenient".into()),
        Some(1223) => Err(
            "The administrator prompt was declined, so the Visual C++ runtime wasn't installed. \
             PHP and Apache need it; choose Try again to be asked again."
                .into(),
        ),
        other => Err(format!(
            "The Visual C++ installer failed (exit code {}).",
            other.map(|c| c.to_string()).unwrap_or_else(|| "unknown".into())
        )),
    }
}

/// Where the local certificate authority lives: per-user, so other accounts can't read its key.
pub fn ca_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join("DevManager").join("ca")
}

pub struct LocalCa {
    pub cert_path: PathBuf,
    /// SHA-1 thumbprint, the id Windows' certificate store uses.
    pub thumbprint: String,
    pub created: bool,
}

/// Loads the local CA from `dir`, creating it on first use. It can only vouch for `.test`
/// and `localhost` names and loopback addresses, so even a leaked key can't impersonate
/// real websites.
pub fn ensure_ca(dir: &Path) -> Result<LocalCa, String> {
    let cert_path = dir.join("devmanager-ca.crt");
    let key_path = dir.join("devmanager-ca.key");
    let created = !(cert_path.is_file() && key_path.is_file());
    if created {
        let (cert_pem, key_pem) = generate_ca().map_err(|err| format!("Couldn't create the certificate: {err}"))?;
        fs::create_dir_all(dir).map_err(|err| format!("Couldn't create {}: {err}", dir.display()))?;
        fs::write(&key_path, key_pem).map_err(|err| format!("Couldn't save the certificate key: {err}"))?;
        fs::write(&cert_path, cert_pem).map_err(|err| format!("Couldn't save the certificate: {err}"))?;
    }
    let pem = fs::read_to_string(&cert_path).map_err(|err| format!("Couldn't read the certificate: {err}"))?;
    Ok(LocalCa { thumbprint: thumbprint(&pem)?, cert_path, created })
}

fn generate_ca() -> Result<(String, String), rcgen::Error> {
    let mut params = CertificateParams::new(Vec::<String>::new())?;
    let mut name = DistinguishedName::new();
    name.push(DnType::OrganizationName, "NexDB");
    name.push(DnType::CommonName, format!("NexDB Local CA ({})", whoami()));
    params.distinguished_name = name;
    params.is_ca = IsCa::Ca(BasicConstraints::Constrained(0));
    params.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign, KeyUsagePurpose::DigitalSignature];
    params.name_constraints = Some(NameConstraints {
        permitted_subtrees: vec![
            GeneralSubtree::DnsName("test".into()),
            GeneralSubtree::DnsName("localhost".into()),
            GeneralSubtree::IpAddress(CidrSubnet::V4([127, 0, 0, 0], [255, 0, 0, 0])),
            GeneralSubtree::IpAddress(CidrSubnet::V6(
                [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
                [0xff; 16],
            )),
        ],
        excluded_subtrees: vec![],
    });
    let now = time::OffsetDateTime::now_utc();
    params.not_before = now - time::Duration::days(1);
    params.not_after = now + time::Duration::days(3650);

    let key = KeyPair::generate()?;
    let cert = params.self_signed(&key)?;
    Ok((cert.pem(), key.serialize_pem()))
}

fn whoami() -> String {
    let user = std::env::var("USERNAME").unwrap_or_else(|_| "user".into());
    let host = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "pc".into());
    format!("{user}@{host}")
}

/// SHA-1 of the certificate's DER bytes, as uppercase hex.
fn thumbprint(pem: &str) -> Result<String, String> {
    let body: String = pem
        .lines()
        .filter(|l| !l.starts_with("-----"))
        .collect();
    let der = base64_decode(&body).ok_or("The certificate file is damaged.")?;
    Ok(Sha1::digest(&der).iter().map(|b| format!("{b:02X}")).collect())
}

fn base64_decode(input: &str) -> Option<Vec<u8>> {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let (mut buf, mut bits) = (0u32, 0);
    for c in input.bytes().filter(|c| !c.is_ascii_whitespace() && *c != b'=') {
        buf = (buf << 6) | ALPHABET.iter().position(|&a| a == c)? as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}

/// A server certificate for local sites, signed by the local CA.
pub struct SiteCert {
    pub cert_path: PathBuf,
    pub key_path: PathBuf,
}

/// Days a site certificate is valid; under the 398 days browsers accept.
const SITE_CERT_DAYS: i64 = 397;
/// Renew this many days before it runs out.
const SITE_CERT_RENEW_DAYS: i64 = 30;

/// One certificate for every local address in `names` (`localhost`, `127.0.0.1`, `shop.test`…),
/// written to `out` as `sites.crt` and `sites.key`. It is made again only when the names change
/// or it is close to running out, so Apache restarts don't churn keys.
pub fn site_certificate(ca_dir: &Path, out: &Path, names: &[String]) -> Result<SiteCert, String> {
    let cert_path = out.join("sites.crt");
    let key_path = out.join("sites.key");
    let stamp_path = out.join("sites.names");
    let mut wanted: Vec<String> = names.to_vec();
    wanted.sort();
    wanted.dedup();
    let now = time::OffsetDateTime::now_utc();

    // "<expiry unix seconds>\n<name>\n<name>…" from the last time it was made.
    let fresh = fs::read_to_string(&stamp_path).ok().is_some_and(|stamp| {
        let mut lines = stamp.lines();
        let expires = lines.next().and_then(|l| l.parse::<i64>().ok()).unwrap_or(0);
        let had: Vec<&str> = lines.collect();
        had == wanted.iter().map(String::as_str).collect::<Vec<_>>()
            && expires - now.unix_timestamp() > SITE_CERT_RENEW_DAYS * 86_400
    });
    if fresh && cert_path.is_file() && key_path.is_file() {
        return Ok(SiteCert { cert_path, key_path });
    }

    let ca = ensure_ca(ca_dir)?;
    let ca_pem = fs::read_to_string(&ca.cert_path).map_err(|e| format!("Couldn't read NexDB's certificate: {e}"))?;
    let ca_key_pem = fs::read_to_string(ca_dir.join("devmanager-ca.key"))
        .map_err(|e| format!("Couldn't read NexDB's certificate key: {e}"))?;
    let ca_key = KeyPair::from_pem(&ca_key_pem).map_err(|e| format!("NexDB's certificate key is damaged: {e}"))?;
    let issuer = Issuer::from_ca_cert_pem(&ca_pem, ca_key).map_err(|e| format!("NexDB's certificate is damaged: {e}"))?;

    let mut params =
        CertificateParams::new(wanted.clone()).map_err(|e| format!("Couldn't make the site certificate: {e}"))?;
    let mut name = DistinguishedName::new();
    name.push(DnType::OrganizationName, "NexDB");
    name.push(DnType::CommonName, "NexDB local sites");
    params.distinguished_name = name;
    params.is_ca = IsCa::ExplicitNoCa;
    params.key_usages = vec![KeyUsagePurpose::DigitalSignature, KeyUsagePurpose::KeyEncipherment];
    params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
    params.not_before = now - time::Duration::days(1);
    let expires = now + time::Duration::days(SITE_CERT_DAYS);
    params.not_after = expires;

    let key = KeyPair::generate().map_err(|e| format!("Couldn't make the site key: {e}"))?;
    let cert = params.signed_by(&key, &issuer).map_err(|e| format!("Couldn't sign the site certificate: {e}"))?;
    fs::create_dir_all(out).map_err(|e| format!("Couldn't create {}: {e}", out.display()))?;
    fs::write(&key_path, key.serialize_pem()).map_err(|e| format!("Couldn't save the site key: {e}"))?;
    // The chain (site, then CA) so clients that don't have the CA yet still see who signed it.
    fs::write(&cert_path, format!("{}{}", cert.pem(), ca_pem)).map_err(|e| format!("Couldn't save the site certificate: {e}"))?;
    let stamp = std::iter::once(expires.unix_timestamp().to_string()).chain(wanted).collect::<Vec<_>>().join("\n");
    fs::write(&stamp_path, stamp).map_err(|e| format!("Couldn't save the site certificate: {e}"))?;
    Ok(SiteCert { cert_path, key_path })
}

/// Whether the current user's Windows trust store already has this certificate.
pub fn is_trusted(thumbprint: &str) -> bool {
    run_quiet(Path::new(CERTUTIL), &["-user", "-store", "Root", thumbprint], Duration::from_secs(30))
        .map(|o| o.success)
        .unwrap_or(false)
}

/// Adds the CA to the current user's trusted roots. Windows shows its own confirmation
/// dialog; declining isn't fatal, sites just show a certificate warning until trusted.
pub fn trust_ca(ca: &LocalCa) -> Result<String, String> {
    if is_trusted(&ca.thumbprint) {
        return Ok("Already trusted".into());
    }
    let cert = ca.cert_path.display().to_string();
    let out = run_quiet(Path::new(CERTUTIL), &["-user", "-addstore", "Root", &cert], Duration::from_secs(600))
        .map_err(|err| format!("Couldn't run certutil: {err}"))?;
    if out.success && is_trusted(&ca.thumbprint) {
        Ok("Trusted for .test and localhost sites".into())
    } else {
        Ok("Not trusted (declined) · HTTPS sites will show a warning until you trust it".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_runtime_versions() {
        assert!(vc_runtime_ok(Some("14.51.36247.00")));
        assert!(vc_runtime_ok(Some("v14.50.0.0")));
        assert!(!vc_runtime_ok(Some("14.44.35211.00")));
        assert!(!vc_runtime_ok(Some("14.9")));
        assert!(!vc_runtime_ok(None));
    }

    #[test]
    fn reads_installer_exit_codes() {
        assert!(vc_result(Some(0)).is_ok());
        assert!(vc_result(Some(1638)).is_ok());
        assert!(vc_result(Some(3010)).unwrap().contains("restart"));
        assert!(vc_result(Some(1223)).unwrap_err().contains("declined"));
        assert!(vc_result(Some(1603)).unwrap_err().contains("1603"));
    }

    #[test]
    fn requires_valid_microsoft_signature() {
        assert!(is_valid_microsoft_signature(
            "Valid|CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US"
        ));
        assert!(!is_valid_microsoft_signature("NotSigned|"));
        assert!(!is_valid_microsoft_signature("HashMismatch|CN=Microsoft Corporation, O=Microsoft Corporation"));
        assert!(!is_valid_microsoft_signature("Valid|CN=Evil Corp, O=Evil Corp"));
    }

    #[test]
    fn quotes_powershell_strings() {
        assert_eq!(ps_quote(r"C:\it's\file.exe"), r"'C:\it''s\file.exe'");
    }

    #[test]
    fn creates_ca_once_and_reuses_it() {
        let dir = tempfile::tempdir().unwrap();
        let first = ensure_ca(dir.path()).unwrap();
        assert!(first.created);
        assert_eq!(first.thumbprint.len(), 40);
        let pem = fs::read_to_string(&first.cert_path).unwrap();
        assert!(pem.starts_with("-----BEGIN CERTIFICATE-----"));
        let second = ensure_ca(dir.path()).unwrap();
        assert!(!second.created);
        assert_eq!(first.thumbprint, second.thumbprint);
    }

    #[test]
    fn site_certificate_is_reused_until_names_change() {
        let ca = tempfile::tempdir().unwrap();
        let out = tempfile::tempdir().unwrap();
        let names = vec!["shop.test".to_string(), "localhost".to_string(), "127.0.0.1".to_string()];
        let first = site_certificate(ca.path(), out.path(), &names).unwrap();
        let pem = fs::read_to_string(&first.cert_path).unwrap();
        assert_eq!(pem.matches("BEGIN CERTIFICATE").count(), 2, "site certificate plus the CA");
        let key = fs::read_to_string(&first.key_path).unwrap();

        // Same names in another order: nothing is made again.
        let mut reordered = names.clone();
        reordered.reverse();
        site_certificate(ca.path(), out.path(), &reordered).unwrap();
        assert_eq!(fs::read_to_string(&first.key_path).unwrap(), key);

        // A new project: a new certificate.
        let mut more = names.clone();
        more.push("blog.test".into());
        site_certificate(ca.path(), out.path(), &more).unwrap();
        assert_ne!(fs::read_to_string(&first.key_path).unwrap(), key);
    }

    /// Checks a site certificate against its CA with Windows' own certutil (read-only):
    /// `cargo test real_site_cert_verifies -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_site_cert_verifies() {
        let ca = tempfile::tempdir().unwrap();
        let out = tempfile::tempdir().unwrap();
        let site = site_certificate(ca.path(), out.path(), &["shop.test".into(), "localhost".into()]).unwrap();
        let dumped = run_quiet(Path::new(CERTUTIL), &["-dump", &site.cert_path.display().to_string()], Duration::from_secs(30)).unwrap();
        println!("{}", dumped.text.lines().filter(|l| l.contains("DNS Name") || l.contains("Issuer") || l.contains("NotAfter")).collect::<Vec<_>>().join("\n"));
        assert!(dumped.text.contains("DNS Name=shop.test"));
        assert!(dumped.text.contains("Server Authentication"));
    }

    /// Inspects a freshly generated CA with Windows' own certutil (read-only):
    /// `cargo test real_ca_dump -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_ca_dump_shows_constraints() {
        let dir = tempfile::tempdir().unwrap();
        let ca = ensure_ca(dir.path()).unwrap();
        let out = run_quiet(Path::new(CERTUTIL), &["-dump", &ca.cert_path.display().to_string()], Duration::from_secs(30)).unwrap();
        let text = out.text;
        for line in text.lines().filter(|l| {
            let l = l.to_ascii_lowercase();
            l.contains("subject type") || l.contains("path length") || l.contains("dns name") || l.contains("ip address")
                || l.contains("cert hash(sha1)") || l.contains("notafter") || l.contains("permitted")
        }) {
            println!("{}", line.trim());
        }
        assert!(out.success);
        assert!(text.contains("Subject Type=CA"));
        assert!(text.contains("DNS Name=test"));
        assert!(text.contains("DNS Name=localhost"));
        let hash_line = text.lines().find(|l| l.contains("Cert Hash(sha1)")).unwrap();
        assert_eq!(hash_line.split(':').nth(1).unwrap().trim().replace(' ', "").to_uppercase(), ca.thumbprint);
    }

    /// Downloads the real Visual C++ installer and checks its signature without running it:
    /// `cargo test real_vc_signature -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_vc_signature_is_microsoft() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("vc_redist.x64.exe");
        let out = run_quiet(
            Path::new(r"C:\Windows\System32\curl.exe"),
            &["-sSfL", "-o", &file.display().to_string(), VC_REDIST_URL],
            Duration::from_secs(300),
        )
        .unwrap();
        assert!(out.success, "{}", out.text);
        verify_microsoft_signature(&file).unwrap();

        // A tampered copy must be rejected.
        let mut bytes = fs::read(&file).unwrap();
        let mid = bytes.len() / 2;
        bytes[mid] ^= 0xff;
        let tampered = dir.path().join("tampered.exe");
        fs::write(&tampered, bytes).unwrap();
        let err = verify_microsoft_signature(&tampered).unwrap_err();
        println!("tampered copy: {err}");
    }
}
