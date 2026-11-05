//! Memory and CPU per service, for the Dashboard. A service counts its own process plus every
//! process it started (Apache and PHP run several), read with `sysinfo`.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct Usage {
    pub id: String,
    /// Share of the whole PC's CPU (all cores), 0–100.
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    /// Processes counted (the service and the ones it started).
    pub processes: usize,
}

/// One System kept between calls: CPU use is measured between two readings.
static SYS: Mutex<Option<System>> = Mutex::new(None);

/// `pid` and everything below it, from a child → parent map.
pub fn tree(root: u32, parents: &HashMap<u32, u32>) -> Vec<u32> {
    let mut out = vec![root];
    let mut i = 0;
    while i < out.len() {
        let p = out[i];
        for (&child, &parent) in parents {
            if parent == p && child != p && !out.contains(&child) {
                out.push(child);
            }
        }
        i += 1;
    }
    out
}

/// Usage of each running service, given (service id, main process id).
pub fn of(services: &[(String, u32)]) -> Vec<Usage> {
    let mut guard = SYS.lock().unwrap();
    if guard.is_none() {
        // Can't read processes on this PC: report nothing rather than fail the Dashboard.
        let Ok(made) = System::new() else { return Vec::new() };
        *guard = Some(made);
    }
    let sys = guard.as_mut().unwrap();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_cpu().with_memory());
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1) as f32;
    let parents: HashMap<u32, u32> = sys
        .processes()
        .iter()
        .filter_map(|(pid, p)| p.parent().map(|parent| (pid.as_u32(), parent.as_u32())))
        .collect();
    services
        .iter()
        .map(|(id, pid)| {
            let pids = tree(*pid, &parents);
            let (mut cpu, mut mem, mut n) = (0f32, 0u64, 0usize);
            for p in pids {
                if let Some(proc_) = sys.process(Pid::from_u32(p)) {
                    cpu += proc_.cpu_usage();
                    mem += proc_.memory();
                    n += 1;
                }
            }
            Usage { id: id.clone(), cpu_percent: (cpu / cores).clamp(0.0, 100.0), memory_bytes: mem, processes: n }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_service_counts_the_processes_it_started() {
        // 10 started 11 and 12; 12 started 13; 20 is someone else's.
        let parents: HashMap<u32, u32> = [(11, 10), (12, 10), (13, 12), (21, 20), (10, 1)].into_iter().collect();
        let mut t = tree(10, &parents);
        t.sort();
        assert_eq!(t, vec![10, 11, 12, 13]);
        assert_eq!(tree(99, &parents), vec![99]);
    }

    #[test]
    fn reads_this_test_process() {
        let me = std::process::id();
        let first = of(&[("me".into(), me)]);
        assert_eq!(first[0].processes, 1);
        assert!(first[0].memory_bytes > 1_000_000, "{first:?}");
        // A second reading has a CPU figure in range.
        let second = of(&[("me".into(), me)]);
        assert!((0.0..=100.0).contains(&second[0].cpu_percent));
    }
}
