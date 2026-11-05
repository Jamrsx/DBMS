//! A fixed `.local` name for each project shared on the Wi-Fi: NexDB announces `blog.local` on the
//! local network (mDNS, as printers and Macs do), so phones open http://blog.local:8181/ instead
//! of an address that changes with the network.

use std::collections::{BTreeMap, HashMap};
use std::sync::Mutex;

use mdns_sd::{ServiceDaemon, ServiceInfo};

struct State {
    daemon: ServiceDaemon,
    /// project name -> (announced full service name, the IP it points at)
    announced: HashMap<String, (String, String)>,
}

static STATE: Mutex<Option<State>> = Mutex::new(None);

/// The `.local` host for a project: lowercase letters, digits and hyphens (OCC_Admission → occ-admission).
pub fn host_for(project: &str) -> String {
    let mut out = String::new();
    for c in project.chars() {
        let c = c.to_ascii_lowercase();
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() { "project".into() } else { out.chars().take(63).collect() }
}

#[cfg(test)]
/// The address phones can open for a project's share port.
pub fn url(project: &str, port: u16) -> String {
    format!("http://{}.local:{port}/", host_for(project))
}

/// Announces a name for every shared project (project -> any of its share ports), and withdraws
/// names for projects no longer shared. Safe to call often: it only changes what's different.
/// Returns the projects whose names are announced.
pub fn sync(shared: &BTreeMap<String, u16>, ip: Option<&str>) -> Vec<String> {
    let mut guard = STATE.lock().unwrap();
    let Some(ip) = ip else {
        // No network: nothing can be announced.
        if let Some(state) = guard.as_mut() {
            for (_, (full, _)) in state.announced.drain() {
                let _ = state.daemon.unregister(&full);
            }
        }
        return Vec::new();
    };
    if shared.is_empty() && guard.is_none() {
        return Vec::new();
    }
    if guard.is_none() {
        let Ok(daemon) = ServiceDaemon::new() else { return Vec::new() };
        // Answers also go back to this PC, so its own browser can open blog.local too.
        let _ = daemon.set_multicast_loop_v4(true);
        *guard = Some(State { daemon, announced: HashMap::new() });
    }
    let state = guard.as_mut().unwrap();
    // Withdraw names for projects no longer shared, or announced for an old IP.
    let stale: Vec<String> = state
        .announced
        .iter()
        .filter(|(p, (_, at))| !shared.contains_key(*p) || at != ip)
        .map(|(p, _)| p.clone())
        .collect();
    for p in stale {
        if let Some((full, _)) = state.announced.remove(&p) {
            let _ = state.daemon.unregister(&full);
        }
    }
    for (project, port) in shared {
        if state.announced.contains_key(project) {
            continue;
        }
        let host = format!("{}.local.", host_for(project));
        let props: [(&str, &str); 1] = [("path", "/")];
        let Ok(info) = ServiceInfo::new("_http._tcp.local.", &format!("{project} (NexDB)"), &host, ip, *port, &props[..]) else {
            continue;
        };
        let full = info.get_fullname().to_string();
        if state.daemon.register(info).is_ok() {
            state.announced.insert(project.clone(), (full, ip.to_string()));
        }
    }
    state.announced.keys().cloned().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_names_become_valid_hosts() {
        assert_eq!(host_for("blog"), "blog");
        assert_eq!(host_for("OCC-Admission"), "occ-admission");
        assert_eq!(host_for("my_shop  2"), "my-shop-2");
        assert_eq!(host_for("__"), "project");
        assert_eq!(url("Shop", 8181), "http://shop.local:8181/");
    }

    /// Announces a name and looks it up with an ordinary mDNS client, as a phone on the Wi-Fi does.
    /// `cargo test real_local_name -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_local_name() {
        let ip = crate::share::lan_ip().expect("this PC is on a network");
        let project = "nexdb-name-test";
        let shared: BTreeMap<String, u16> = [(project.to_string(), 8199u16)].into_iter().collect();
        assert_eq!(sync(&shared, Some(&ip)), vec![project.to_string()]);
        std::thread::sleep(std::time::Duration::from_secs(2));
        // First, an ordinary mDNS client (as a phone uses) asks for the name.
        let client = ServiceDaemon::new().unwrap();
        let rx = client.resolve_hostname(&format!("{project}.local."), Some(4000)).unwrap();
        let mut found = Vec::new();
        while let Ok(ev) = rx.recv_timeout(std::time::Duration::from_secs(5)) {
            println!("mdns client: {ev:?}");
            if let mdns_sd::HostnameResolutionEvent::AddressesFound(_, ips) = ev {
                found.extend(ips.iter().map(|i| i.to_string()));
                break;
            }
            if matches!(ev, mdns_sd::HostnameResolutionEvent::SearchTimeout(_)) {
                break;
            }
        }
        let _ = client.shutdown();
        assert!(found.iter().any(|f| f.contains(&ip)), "an mDNS client found {found:?}, expected {ip}");
        // Windows' own lookup on this same PC can't hear an app's mDNS answers (they share the port),
        // which is fine: this PC has its .test addresses. Shown for information only.
        let out = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &format!("(Resolve-DnsName -Name {project}.local -Type A -ErrorAction SilentlyContinue).IPAddress")])
            .output()
            .unwrap();
        println!("phones get {project}.local -> {found:?}; this PC's own Windows lookup -> {:?}", String::from_utf8_lossy(&out.stdout).trim());
        // Unsharing withdraws the name.
        assert!(sync(&BTreeMap::new(), Some(&ip)).is_empty());
    }
}
