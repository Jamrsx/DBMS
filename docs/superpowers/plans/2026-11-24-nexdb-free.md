# NexDB Free Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blocking license wall with a simple, permanently free NexDB mode, a one-click 14-day trial, and an instant upgrade path.

**Architecture:** One app. `Status::Active` and `Status::Grace` mean Full; every other state means Free. A new Rust `tier` module wraps the Tauri command handler and denies anything not on a Free list. The website issues a signed, no-email trial through the existing license token system.

**Tech Stack:** Tauri 2.12.5, Rust, React 19 + TypeScript (no frontend test runner), Laravel + PHPUnit, Inertia React.

**Spec:** `docs/superpowers/specs/2026-11-24-nexdb-free-design.md`

**Repos:**
- App: branch `feat/free-tier`, created from `macos-port` (`3ef8c74`) in its own worktree. Paths below start at the repo root.
- Website: `C:\laragon\www\nexdb`, branch `feat/free-tier`, created from `1721ba2`. Paths marked **web:** are in this repo.

## Global Constraints

- Always write "14-day free trial". Never 7-day.
- Prices: 6 months ₱299, 1 year ₱540, 2 years ₱960, 3 years ₱1,260, 4 years ₱4,900. NexHost and public links are 4-year plan only.
- A license ending must never delete or overwrite projects, databases, backups, or saved settings.
- Current paid licenses must keep every feature. Never derive Free from the token's `features` list.
- Free installs PHP 8.5 (`FREE_PHP_LINE = "8.5"`), Node LTS, and MySQL LTS. No version catalog or download button in Free.
- The trial sends only `machine_id` and `app_version`. Never name, email, device name, or stored IP.
- Windows and macOS 13+ (Intel and Apple Silicon).
- UI: plain language, raw output only behind "Show details", Nielsen's 10 heuristics.
- No ads.
- Never commit the main checkout's uncommitted files. Never push, merge to `main`, bump the version, or release without the owner's explicit OK.
- Lean testing: run each named test once unless it failed.

## Review Focus

1. **A license ends while servers are running.** Free services keep running, paid services stop, and no site files change. Test in Task 5.
2. **Project names with spaces, quotes, non-English letters, or `</script>`.** The paused page stays valid and its links work. Test in Task 6.
3. **`.env` with CRLF endings, no `APP_URL`, or a hand edit after "Use localhost".** Other lines stay byte-identical, and a hand edit is never overwritten. Test in Task 7.
4. **A hand-added folder that is wrong:** mismatched name, 32-bit PHP, broken PHP, or a path like `..\..\x`. NexDB refuses it with a plain reason and writes no marker. Test in Task 9.
5. **A school lab behind one IP, or a reinstall during the trial.** Existing trials always resume, even when the IP has hit the new-trial limit, and the end date never moves. Test in Task 1.

---

## Part A: Website (ships first)

### Task 1: Trial API

**Files:**
- Create: **web:** `database/migrations/2026_11_24_000001_add_free_trials.php`
- Create: **web:** `app/Models/TrialClaim.php`
- Modify: **web:** `app/Models/Plan.php`
- Modify: **web:** `app/Actions/Licenses/LicenseActivation.php:63,227,257-271`
- Modify: **web:** `app/Http/Controllers/Api/LicenseController.php`
- Modify: **web:** `app/Http/Controllers/Api/PlanController.php:39`
- Modify: **web:** `app/Http/Controllers/Admin/PlanController.php` (Prices list)
- Modify: **web:** `routes/api.php`
- Test: **web:** `tests/Feature/Licensing/TrialLicenseTest.php`

**Interfaces:**
- Produces: `POST /api/v1/licenses/trial` with `{machine_id: 64 hex, app_version?: string}`. Success is `200 {ok: true, key, token, license, moves_left}`. Refusal is `409 {ok: false, code: "trial_used", message}` or `429 {ok: false, code: "too_many", message}`.
- Produces: token claim `trial: bool`.
- Produces: `Plan::trial(): Plan`, `LicenseActivation::startTrial(array $in): array`.

- [ ] **Step 1: Write the failing tests**

Use the `LicenseApiTest` setup (`RefreshDatabase`, generated signing key). `$pc = str_repeat('a', 64)`.

```php
public function test_first_trial_is_a_signed_14_day_license_with_no_personal_data()
{
    $res = $this->postJson('/api/v1/licenses/trial', ['machine_id' => $this->pc, 'app_version' => '0.6.3'])->assertOk();
    $payload = LicenseToken::verify($res->json('token'));
    $this->assertTrue($payload['trial']);
    $this->assertSame([], $payload['features']);
    $this->assertNull($payload['name']);
    $this->assertNull($payload['email']);
    $license = License::findOrFail($payload['lid']);
    $this->assertTrue($license->expires_at->isSameDay(now()->addDays(14)));
    $device = $license->devices()->sole();
    $this->assertNull($device->name);
    $this->assertNull($device->ip_address);
}

public function test_repeat_on_the_same_pc_keeps_the_key_and_end_date() { /* travel 3 days, repeat: same key, same expires_at */ }
public function test_an_ended_trial_answers_trial_used() { /* travel 15 days, repeat: 409 code trial_used */ }
public function test_a_pc_that_had_another_license_cannot_start_a_trial() { /* activate a factory license first: 409 trial_used */ }
public function test_machine_id_must_be_64_hex() { /* 'short' and 64 'z' characters: 422 */ }
public function test_the_31st_new_trial_from_one_ip_is_refused_but_existing_trials_resume() { /* 30 distinct PCs OK; 31st 429 too_many; PC #1 repeat still 200 */ }
public function test_the_trial_plan_is_never_listed_as_renewable() { /* GET /api/v1/plans?current=Free trial · 14 days has no is_trial plan */ }
```

Disable the route's `throttle:license-api` middleware in the 31-trial test so only the new limit applies.

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --filter=TrialLicenseTest`
Expected: FAIL with 404 on the trial route.

- [ ] **Step 3: Add schema and models**

Migration: `plans.is_trial` boolean default false; `trial_claims` with `id`, unique `machine_hash` (64), `license_id` foreign key with `cascadeOnDelete`, timestamps. `Plan::trial()` follows `Giveaway::plan()`: `firstOrCreate(['is_trial' => true], ['name' => 'Free trial · 14 days', 'reseller_price' => 0, 'direct_price' => null, 'duration_days' => 14, 'is_active' => false, 'features' => []])`. Add `is_trial` to Fillable and casts.

- [ ] **Step 4: Implement `startTrial(array $in): array` in `LicenseActivation`**

Order, inside a transaction:
1. Hash the machine with `LicenseDevice::hashMachine`.
2. Existing claim: `unusable()` means deny `trial_used`. Otherwise relink the device if needed, and return `granted` plus `key`.
3. Any `LicenseDevice` with this hash means deny `trial_used`.
4. If `RateLimiter::tooManyAttempts('license-trial:'.$ip, 30)`, deny `too_many` with 429. Do this only here, so step 2 is never limited.
5. Create the license with key fields built the same way as `KeyStock`, `duration_days = 14`, `activated_at`, `handed_out_at`, `expires_at`, `sold_price = 0`. Create a device with `name = null`, `ip_address = null`. Create the claim.
6. `RateLimiter::hit('license-trial:'.$ip, 3600)`. Return `granted` plus `key`.

Catch `UniqueConstraintViolationException` around the whole transaction and rerun it once, so a race resolves through step 2. The IP is used only for this limiter.

Add `is_trial` to the two `plan:id,name,features` eager loads. Add `'trial' => (bool) $license->plan?->is_trial` to the token.

- [ ] **Step 5: Add the route and filters**

Add `Route::post('trial', [LicenseController::class, 'trial'])->name('api.licenses.trial')`, validating `machine_id` with `regex:/^[a-f0-9]{64}$/` and `app_version` nullable max 20. In `Api\PlanController` line 39 add `->where('is_trial', false)`. Exclude `is_trial` plans from the admin Prices list.

- [ ] **Step 6: Run tests to verify they pass**

Run: `php artisan test --filter="TrialLicenseTest|LicenseApiTest|GiveawayTest|PlanFeaturesTest"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add database/migrations/2026_11_24_000001_add_free_trials.php app/Models app/Actions/Licenses/LicenseActivation.php app/Http/Controllers routes/api.php tests/Feature/Licensing/TrialLicenseTest.php
git commit -m "feat: one-click 14-day trial API with no personal data"
```

### Task 2: Free on the home page

**Files:**
- Modify: **web:** `resources/js/pages/welcome.tsx:422-470`, `routes/web.php:25`
- Test: **web:** `tests/Feature/ExampleTest.php`

- [ ] **Step 1: Write the failing test**

`test_home_page_offers_free_and_the_14_day_trial`: `GET /` is OK and its Inertia props contain `freePlan.trialDays === 14`.

- [ ] **Step 2: Run it to verify it fails**

Run: `php artisan test --filter=test_home_page_offers_free`
Expected: FAIL, missing prop.

- [ ] **Step 3: Implement**

Pass `freePlan: ['trialDays' => 14]` from `routes/web.php`. Add a Free card before the paid plans, ₱0, listing: Apache, PHP 8.5, MySQL, Node, Composer, Git, phpMyAdmin, Terminal, app updates. Under the pricing heading add "Start with Free, or try every paid tool with a 14-day free trial. The trial does not include NexHost or public links." Replace "Download and try the setup for free." accordingly.

- [ ] **Step 4: Verify**

Run: `php artisan test --filter=test_home_page_offers_free` and `npm run types:check`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add resources/js/pages/welcome.tsx routes/web.php tests/Feature/ExampleTest.php
git commit -m "feat: show NexDB Free and the 14-day free trial on the home page"
```

---

## Part B: App

Run Rust tests from `app/src-tauri`. Run `npm run build` from `app`.

### Task 3: Trial in the license core

**Files:**
- Modify: `app/src-tauri/src/license.rs`
- Modify: `app/src-tauri/src/lib.rs` (`license_start_trial`, handler list)

**Interfaces:**
- Produces: `Claims.trial: bool` (`#[serde(default)]`), `trial: bool` on `Status::Active` and `Status::Expired`.
- Produces: `license::is_full() -> bool`, `license::start_trial() -> Outcome` (async), command `license_start_trial`.

- [ ] **Step 1: Write the failing tests** in `license.rs`

```rust
#[test]
fn a_trial_has_no_grace_days() {
    let mut c = claims(Some(5_000_000));
    c.trial = true;
    assert!(matches!(evaluate(&c, 1_000, 2_000), Status::Active { trial: true, .. }));
    assert!(matches!(evaluate(&c, 1_000, 5_000_000), Status::Expired { trial: true, .. }));
}

#[test]
fn paid_licenses_keep_three_grace_days() {
    let c = claims(Some(5_000_000));
    assert!(matches!(evaluate(&c, 1_000, 5_000_000), Status::Grace { .. }));
    assert!(matches!(evaluate(&c, 1_000, 5_000_000 + GRACE_SECS), Status::Expired { trial: false, .. }));
}

#[test]
fn tokens_from_before_trials_are_not_trials() {
    let old = serde_json::json!({"v":1,"lid":4,"key_hint":"7KQ2","plan":"6 months","name":null,"email":null,
        "machine":"a","issued_at":1000,"expires_at":null,"check_by":2000});
    assert!(!serde_json::from_value::<Claims>(old).unwrap().trial);
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cargo test --lib license::`
Expected: compile error, no field `trial`.

- [ ] **Step 3: Implement**

Add the fields and update `claims()` and `active_status()` test helpers. In `evaluate`, use `let grace = if claims.trial { 0 } else { GRACE_SECS }`. `start_trial` posts `{machine_id, app_version}` to `trial`. A 200 goes through `accept` with `json["key"]`. Other answers use `failure`. A network error returns `code: "offline"` like `activate`. Register `license_start_trial`.

- [ ] **Step 4: Run to verify pass**

Run: `cargo test --lib license::`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/license.rs app/src-tauri/src/lib.rs
git commit -m "feat: trial licenses with no grace days"
```

### Task 4: Central command lock

**Files:**
- Create: `app/src-tauri/src/tier.rs`
- Modify: `app/src-tauri/src/lib.rs:406,602`

**Interfaces:**
- Produces: `tier::FREE_COMMANDS: &[&str]`, `tier::allowed(full: bool, command: &str) -> bool`, `tier::allow(command: &str) -> Result<(), String>`.
- Produces: `tier::LOCKED: &str = "This is part of the full NexDB. Open What you get to try it free for 14 days or upgrade."`

- [ ] **Step 1: Write the failing tests** in `tier.rs`

```rust
#[test]
fn free_denies_paid_and_unknown_commands() {
    for c in ["db_query", "project_create", "version_install", "share_public_start", "nexhost_list", "a_command_added_next_year"] {
        assert!(!allowed(false, c), "{c}");
        assert!(allowed(true, c), "{c}");
    }
}

#[test]
fn free_keeps_the_basics() {
    for c in ["license_start_trial", "start_services", "stop_services", "terminal_open", "phpmyadmin_open", "php_settings_save", "www_open", "backup_restore"] {
        assert!(allowed(false, c), "{c}");
    }
}

#[test]
fn every_free_command_is_a_real_command() {
    let src = include_str!("lib.rs");
    let list = src.split("generate_handler![").nth(1).unwrap().split(']').next().unwrap();
    let real: Vec<&str> = list.split(',').map(|s| s.trim().rsplit("::").next().unwrap()).collect();
    for c in FREE_COMMANDS { assert!(real.contains(c), "{c}"); }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cargo test --lib tier::`
Expected: compile error, unresolved module.

- [ ] **Step 3: Implement `tier.rs`**

Copy the Free list from spec section 6. Leave out `local_versions`, `local_version_check`, `local_version_pick`, `paused_sites`, and `project_use_localhost`; Tasks 7 and 9 add each with its command, so the real-command test stays green. `allow` uses `license::is_full()`.

- [ ] **Step 4: Wrap the handler in `lib.rs`**

```rust
let commands = tauri::generate_handler![/* unchanged */];
// ...builder...
.invoke_handler(move |invoke| {
    if let Err(message) = tier::allow(invoke.message.command()) {
        invoke.resolver.reject(message);
        return true;
    }
    commands(invoke)
})
```

- [ ] **Step 5: Run to verify pass**

Run: `cargo test --lib tier::`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src-tauri/src/tier.rs app/src-tauri/src/lib.rs
git commit -m "feat: lock every non-Free command in the backend by default"
```

### Task 5: Free services and background paths

**Files:**
- Modify: `app/src-tauri/src/tier.rs`
- Modify: `app/src-tauri/src/lib.rs:102,217-228,618-649,3797`
- Modify: `app/src-tauri/src/tray.rs:31,66-78`
- Modify: `app/src-tauri/src/autobackup.rs:87`

**Interfaces:**
- Produces: `tier::free_services(web: Option<&str>, all: &[String]) -> Vec<String>`
- Produces: `tier::start_ids(full: bool, requested: Option<String>, web: Option<&str>, all: Vec<String>) -> Result<Vec<String>, String>`
- Produces: `tier::to_stop(web: Option<&str>, running: &[String]) -> Vec<String>`
- Produces: `tier::version_switch_allowed(full: bool, id: &str) -> bool`, `tier::install_allowed(full: bool, installed: bool, repairing: bool) -> bool`

- [ ] **Step 1: Write the failing tests**

```rust
fn ids(v: &[&str]) -> Vec<String> { v.iter().map(|s| s.to_string()).collect() }

#[test]
fn free_starts_only_core_services_and_existing_databases() {
    let all = ids(&["php", "php-8.3.14", "apache", "mysql", "postgres", "mailpit", "redis"]);
    assert_eq!(free_services(Some("apache"), &all), ids(&["php", "apache", "mysql", "postgres"]));
}

#[test]
fn free_refuses_a_paid_service_by_name() {
    let all = ids(&["php", "apache", "mailpit"]);
    assert_eq!(start_ids(false, Some("mailpit".into()), Some("apache"), all.clone()).unwrap_err(), LOCKED);
    assert_eq!(start_ids(true, Some("mailpit".into()), Some("apache"), all).unwrap(), ids(&["mailpit"]));
}

#[test]
fn ending_a_license_stops_only_paid_services() {
    let running = ids(&["php", "php-8.3.14", "apache", "mysql", "mailpit"]);
    assert_eq!(to_stop(Some("apache"), &running), ids(&["php-8.3.14", "mailpit"]));
}

#[test]
fn free_switches_only_php_and_node() {
    assert!(version_switch_allowed(false, "php") && version_switch_allowed(false, "node"));
    assert!(!version_switch_allowed(false, "mysql") && version_switch_allowed(true, "mysql"));
}

#[test]
fn free_installs_only_during_setup_or_repair() {
    assert!(install_allowed(false, false, false) && install_allowed(false, true, true));
    assert!(!install_allowed(false, true, false) && install_allowed(true, true, false));
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cargo test --lib tier::`
Expected: compile errors for the new functions.

- [ ] **Step 3: Implement and wire**

- `start_services`: replace `license::require()` with `start_ids`.
- `tray_services` and `tray_service`: use `start_ids`. A refused single service calls `tray::notify` with `LOCKED`. Stopping is never blocked.
- `version_use`: return `LOCKED` when not allowed.
- `run_install`: add `stack`, compute `installed` from `stack.get().is_ok()`, and `repairing` with the same lookup `setup_info` uses for `repair_root`. Return `LOCKED` when not allowed.
- `tray::snapshot`: in Free return only `free_services` entries and no projects, and `build_menu` omits the Projects submenu.
- `autobackup::check`: return immediately when `!license::is_full()`.

- [ ] **Step 4: Run to verify pass**

Run: `cargo test --lib`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/tier.rs app/src-tauri/src/lib.rs app/src-tauri/src/tray.rs app/src-tauri/src/autobackup.rs
git commit -m "feat: limit services, tray, version switch and auto-backup in Free"
```

### Task 6: Free site configs and paused page

**Files:**
- Create: `app/src-tauri/src/freesites.rs`
- Modify: `app/src-tauri/src/projects.rs:382-433,506-535,730-797`

**Interfaces:**
- Produces: `freesites::PausedSite { name: String, host: String, local_url: String, can_use_localhost: bool }` (Serialize).
- Produces: `freesites::local_url(www: &Path, doc_root: &Path, port: u16) -> String` (percent-encoded, trailing slash, no `:80`)
- Produces: `freesites::paused_sites(www: &Path, port: u16, roots: &SiteRoots) -> Vec<PausedSite>`
- Produces: `freesites::paused_page(sites: &[PausedSite], renew_url: &str) -> String`
- Produces: `freesites::write_paused(etc: &Path, web: &str, port: u16, sites: &[PausedSite], renew_url: &str) -> Result<(), String>`
- Produces: `freesites::PAUSED_DIR: &str = "nexdb-paused"`

- [ ] **Step 1: Write the failing tests**

```rust
#[test]
fn paused_page_survives_hostile_project_names() {
    let site = PausedSite { name: "a</script><b>".into(), host: "x.test".into(), local_url: "http://localhost/a%3C/".into(), can_use_localhost: false };
    let page = paused_page(&[site], "https://example.test/#price");
    assert_eq!(page.matches("</script>").count(), 1);
    assert!(page.contains("\\u003c/script"));
}

#[test]
fn local_url_encodes_and_includes_the_public_folder() {
    assert_eq!(local_url(Path::new("C:/www"), Path::new("C:/www/My Shop/public"), 80), "http://localhost/My%20Shop/public/");
    assert_eq!(local_url(Path::new("C:/www"), Path::new("C:/www/blog"), 8080), "http://localhost:8080/blog/");
}

#[test]
fn free_apache_config_has_localhost_and_the_catch_all_but_no_project_sites() { /* tempdir with www/shop: write_vhosts(..., sites = false) + write_paused: 00-localhost.conf exists, shop.conf absent, paused conf contains "ServerAlias *.test" and "Require local" */ }

#[test]
fn full_apache_config_is_unchanged() { /* write_vhosts(..., sites = true) still writes shop.conf and no paused conf */ }

#[test]
fn free_nginx_config_has_the_catch_all() { /* contains server_name ~^.+\.test$ and deny all */ }
```

- [ ] **Step 2: Run to verify failure**

Run: `cargo test --lib freesites::`
Expected: compile error.

- [ ] **Step 3: Implement**

Add a `sites: bool` parameter to `write_vhosts` and a `sites: bool` field to `NginxSites`; both skip per-project files when false. In `write_site_configs`, when `!license::is_full()`: no HTTPS, empty PHP ports, empty shares, empty NexHost map, `sites = false`, then `write_paused`.

Apache catch-all, `sites-enabled/01-paused.conf`:

```apache
<VirtualHost *:{port}>
    ServerName nexdb-paused.test
    ServerAlias *.test
    DocumentRoot "{paused}"
    <Directory "{paused}">
        Require local
        FallbackResource /index.html
    </Directory>
</VirtualHost>
```

nginx catch-all, `sites-enabled/01-paused.conf`:

```nginx
server {
    listen {port};
    server_name ~^.+\.test$;
    root "{paused}";
    allow 127.0.0.1;
    allow ::1;
    deny all;
    location / { try_files /index.html =404; }
}
```

The page is one static HTML file with inline CSS. It finds the site by `location.hostname` in a JSON map serialized with `<` escaped as `\u003c`, and shows the site's `localhost` link, "Nothing was deleted", and the renew link.

- [ ] **Step 4: Run to verify pass**

Run: `cargo test --lib freesites:: && cargo test --lib projects::`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/freesites.rs app/src-tauri/src/projects.rs app/src-tauri/src/lib.rs
git commit -m "feat: pause .test sites in Free with a helpful local page"
```

### Task 7: Use localhost for paused Laravel sites

**Files:**
- Modify: `app/src-tauri/src/freesites.rs`
- Modify: `app/src-tauri/src/lib.rs`, `app/src-tauri/src/tier.rs`

**Interfaces:**
- Produces: `freesites::use_localhost(etc: &Path, project_dir: &Path, name: &str, host: &str, local_url: &str) -> Result<(), String>`
- Produces: `freesites::restore_urls(etc: &Path, www: &Path) -> Result<usize, String>`
- Produces: commands `paused_sites() -> Vec<PausedSite>`, `project_use_localhost(name: String)`, both added to `FREE_COMMANDS`.

- [ ] **Step 1: Write the failing tests**

```rust
#[test]
fn use_localhost_changes_only_app_url_and_keeps_crlf() {
    // .env = "APP_NAME=Shop\r\nAPP_URL=http://shop.test\r\nDB_PASSWORD=s3cret\r\n"
    // after: "APP_NAME=Shop\r\nAPP_URL=http://localhost/shop/public\r\nDB_PASSWORD=s3cret\r\n"
    // backup at etc/free-url-backups/shop.env equals the original, and no new file in the project
}

#[test]
fn use_localhost_refuses_when_app_url_is_missing_or_different() { /* Err, file unchanged, no record */ }

#[test]
fn restore_puts_back_the_test_address() { /* after use_localhost + restore_urls: original bytes, record emptied */ }

#[test]
fn restore_never_overwrites_a_hand_edit() { /* edit APP_URL to http://example.local; restore leaves it */ }

#[test]
fn restore_skips_a_project_that_was_deleted() { /* Ok(0), no error */ }
```

- [ ] **Step 2: Run to verify failure**

Run: `cargo test --lib freesites::`
Expected: compile error.

- [ ] **Step 3: Implement**

Record changes in `etc/free-url-changes.json` as `{ "<name>": { "old": "...", "new": "..." } }`. Write `APP_URL` from `local_url` with its trailing slash removed. Keep the first backup; never overwrite it. Set `can_use_localhost` in `paused_sites` when `.env` has `APP_URL=http://<host>` or `https://<host>`. Write the `.env` only after the backup and record succeed. Register both commands and add them to `FREE_COMMANDS`.

- [ ] **Step 4: Run to verify pass**

Run: `cargo test --lib freesites:: && cargo test --lib tier::`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/freesites.rs app/src-tauri/src/lib.rs app/src-tauri/src/tier.rs
git commit -m "feat: safe Use localhost for paused Laravel projects"
```

### Task 8: Move between Free and Full

**Files:**
- Modify: `app/src-tauri/src/lib.rs:238-264,330-357`
- Modify: `app/src-tauri/src/license.rs:481-513`
- Modify: `app/src-tauri/src/tier.rs`

**Interfaces:**
- Consumes: `tier::to_stop`, `freesites::restore_urls`, `lose_nexhost`, `apply_vhosts`.
- Produces: `tier::needs_rewrite(full: bool, paused_dir_exists: bool) -> bool`, which is `full == paused_dir_exists`. The paused folder records that Free configs are in place, so a routine check-in never restarts the web server.
- Produces: `pub(crate) fn apply_mode(app: &tauri::AppHandle)` in `lib.rs`.

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn sites_are_rewritten_only_when_the_mode_changed() {
    assert!(needs_rewrite(false, false) && needs_rewrite(true, true));
    assert!(!needs_rewrite(false, true) && !needs_rewrite(true, false));
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cargo test --lib sites_are_rewritten`
Expected: compile error, no function `needs_rewrite`.

- [ ] **Step 3: Implement `apply_mode`**

Serialize with a static `Mutex`, and return early if the stack is not loaded.

- **Free, when `needs_rewrite`:** `lose_nexhost`; stop every id from `tier::to_stop`; `apply_vhosts`, which creates `etc/nexdb-paused`.
- **Full, when `needs_rewrite`:** remove `etc/nexdb-paused`, `apply_vhosts`, then `freesites::restore_urls`.
- Always emit `license-changed` with the status and `services-changed`.

Failures are logged and never block the app.

- [ ] **Step 4: Call it**

- At startup, after the stack loads and **before** the `start_services_on_launch` check at `lib.rs:354`.
- In `license_activate`, `license_sign_in`, `license_change`, `license_check_in`, `license_unlink`, and `license_start_trial`: add `app: tauri::AppHandle` and call it from a blocking task after the result.
- In `watch_end`, when `now_status.is_active() != last.is_active()`.

Change the expired notification to "NexDB is now in Free mode" / "Your projects and databases are safe. Open NexDB to renew or upgrade."

- [ ] **Step 5: Run to verify pass**

Run: `cargo test --lib`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src-tauri/src/lib.rs app/src-tauri/src/license.rs app/src-tauri/src/tier.rs
git commit -m "feat: switch between Free and Full with no restart or data change"
```

### Task 9: Add versions by hand

**Files:**
- Create: `app/src-tauri/src/localversions.rs`
- Modify: `app/src-tauri/src/lib.rs`, `app/src-tauri/src/tier.rs`

**Interfaces:**
- Produces: `LocalVersion { id: String, version: String, folder: String, active: bool, ready: bool, problem: Option<String> }` (Serialize).
- Produces: `localversions::list(root: &Path, settings: &Settings) -> Vec<LocalVersion>`
- Produces: `localversions::check_folder(root: &Path, id: &str, folder: &str) -> Result<String, String>`
- Produces: `#[cfg(not(windows))] localversions::adopt_binary(root: &Path, id: &str, picked: &Path) -> Result<String, String>`
- Produces (private, tested): `php_version(output: &str) -> Option<String>`, `node_version(output: &str) -> Option<String>`, `verify_php(folder: &str, output: &str, need_x64: bool) -> Result<String, String>`
- Produces: commands `local_versions`, `local_version_check(id, folder)`, `local_version_pick(id)` (a plain "not used on Windows" error there), all added to `FREE_COMMANDS`.

- [ ] **Step 1: Write the failing tests**

```rust
#[test]
fn folder_names_cannot_leave_the_bin_folder() {
    for bad in ["..", "../x", r"..\x", "php-8.3.14/..", "C:/x", ""] {
        assert!(check_folder(Path::new("root"), "php", bad).is_err(), "{bad}");
    }
}

#[test]
fn only_php_and_node_can_be_added() {
    assert!(check_folder(Path::new("root"), "mysql", "mysql-9.7.4").is_err());
}

#[test]
fn reads_versions_from_program_output() {
    assert_eq!(php_version("PHP 8.3.14 (cli) (built: Nov 19 2024) (NTS Visual C++ 2019 x64)"), Some("8.3.14".into()));
    assert_eq!(node_version("v24.22.3\n"), Some("24.22.3".into()));
    assert_eq!(php_version("not php"), None);
}

#[test]
fn a_mismatch_or_32_bit_build_is_explained() {
    assert!(verify_php("php-8.3.14", "PHP 8.2.1 (cli) (NTS x64)", true).unwrap_err().contains("8.2.1"));
    assert!(verify_php("php-8.3.14", "PHP 8.3.14 (cli) (NTS x86)", true).unwrap_err().contains("64-bit"));
    assert!(verify_php("php-8.3.14", "PHP 8.3.14 (cli) (NTS x64)", true).is_ok());
}

#[test]
fn a_failed_check_writes_no_marker() { /* tempdir folder with no php executable: Err, MARKER absent */ }

#[test]
fn list_shows_new_folders_as_not_ready() { /* one folder with marker, one without: ready true and false */ }
```

- [ ] **Step 2: Run to verify failure**

Run: `cargo test --lib localversions::`
Expected: compile error.

- [ ] **Step 3: Implement**

`check_folder`: validate the name is exactly `<id>-<number.number.number>` with no separators. Locate it with `versions::target_dir`. Require `php` + `php-cgi` (or `node`) through `platform::exe`. Run `-v` with a 10-second limit. On Windows require `x64`. For PHP, render a temp ini and run `phpini::test_ini`. Write `versions::MARKER` only after every check passes. A process that cannot start on Windows returns "This PHP needs the Microsoft Visual C++ Redistributable."

`adopt_binary` (Mac): run the chosen binary, read its version, create `bin/php/php-<v>/` or `bin/node/node-<v>/` with symlinks, then run the same checks. For PHP the user selects `php-cgi`; the sibling `php` must exist. Remove the created folder if a check fails.

- [ ] **Step 4: Run to verify pass**

Run: `cargo test --lib localversions:: && cargo test --lib tier::`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/localversions.rs app/src-tauri/src/lib.rs app/src-tauri/src/tier.rs
git commit -m "feat: add PHP and Node versions by hand with safety checks"
```

### Task 10: Free setup

**Files:**
- Modify: `app/src-tauri/src/catalog.rs:227-272`
- Modify: `app/src-tauri/src/lib.rs:102-109`
- Modify: `app/src/lib/catalog.ts`, `app/src/lib/preview-choices.json`
- Modify: `app/src/steps/Components.tsx:24-47,64`, `app/src/Wizard.tsx`

**Interfaces:**
- Produces: `catalog::FREE_PHP_LINE: &str = "8.5"`, `Choices.free_php: Option<String>`.
- Produces: `defaultSelections(choices: Choices, free: boolean): Selections`, `Components` prop `free: boolean`.

- [ ] **Step 1: Write the failing tests** in `catalog.rs`

```rust
#[test]
fn free_php_is_the_newest_85_patch_even_after_86_is_recommended() { /* catalog with 8.6 settled and 8.5.13: recommended 8.6.x, free_php Some("8.5.13") */ }

#[test]
fn free_php_falls_back_when_85_has_no_download() { /* 8.5 download None: free_php equals recommended */ }
```

- [ ] **Step 2: Run to verify failure**

Run: `cargo test --lib free_php`
Expected: compile error, no field `free_php`.

- [ ] **Step 3: Implement backend**

Compute `free_php` from the PHP component's installable versions. In `run_install`, after `installer::run` succeeds and when items contain `apache` or `nginx`, call `phpmyadmin::install` with the catalog download, the install root, and the MySQL port. Emit its progress as `install-progress`. A failure is logged and does **not** fail setup.

- [ ] **Step 4: Implement wizard**

`Wizard` reads `licenseStatus()`; `free = !licenseWorks(status)`. In Free: `php.version = choices.free_php ?? recommended`, nginx off, and `Components` renders a read-only list with name and version plus "phpMyAdmin", with no pickers. The Apache description becomes "Web server for your local sites." Add `free_php` to the TS type and preview JSON.

- [ ] **Step 5: Verify**

Run: `cargo test --lib catalog::` and `npm run build`
Expected: PASS, and a clean build.

- [ ] **Step 6: Commit**

```bash
git add app/src-tauri/src/catalog.rs app/src-tauri/src/lib.rs app/src/lib/catalog.ts app/src/lib/preview-choices.json app/src/steps/Components.tsx app/src/Wizard.tsx
git commit -m "feat: fixed Free setup with PHP 8.5, LTS versions and phpMyAdmin"
```

### Task 11: Free window

**Files:**
- Create: `app/src/free/FreeShell.tsx`, `app/src/free/free.css`, `app/src/lib/free.ts`
- Modify: `app/src/App.tsx:63-127`, `app/src/lib/license.ts`, `app/src/components/LicenseGate.tsx`

**Interfaces:**
- Produces: `FreeShell({ license, onLicense }: { license: LicenseStatus; onLicense: (mode: "key" | "signin") => void })`
- Produces: `LicenseGate` prop `initialMode?: "key" | "signin"`, and window event `OPEN_LICENSE = "nexdb-open-license"` in `lib/license.ts`, which `App.tsx` handles by opening `LicenseGate`.
- Produces in `lib/free.ts`, each with a sample result in preview and practice: `startTrial()`, `localVersions()`, `checkLocalVersion(id, folder)`, `pickLocalVersion(id)`, `pausedSites()`, `useLocalhost(name)`.
- Produces: `trial: boolean` on the TS `active` and `expired` states; `?license=free` preview.

- [ ] **Step 1: Route the app**

In `App.tsx`: `typingKey` shows `LicenseGate` with `onClose` always set; `licenseWorks` shows `Shell`; otherwise `FreeShell`. Remove the "no way past it" behavior and comment. The Escape handler closes when `onClose` exists. Change wording that says a license is required before use.

- [ ] **Step 2: Build the main window to match the approved mockup**

Status line, Apache and MySQL cards from `listServices`, a PHP dropdown placeholder, and five buttons: **Start All / Stop All**, **Web**, **Database**, **Terminal**, **Folder**. The title bar has **Sign in**, which calls `onLicense("signin")`. A successful sign-in opens the full app; a license on another computer uses the existing move prompt; an account with no working license stays in Free with the website's message.

- Start and Stop use `startServices` / `stopServices`, show progress, and report a plain result, with raw errors behind "Show details".
- Web opens `http://localhost[:port]/`.
- Database uses `pmaStatus`, then `pmaOpen`, or offers **Install phpMyAdmin** through `pmaInstall`.
- Terminal invokes `terminal_window`; Folder uses `openWwwFolder`.
- Web and Database are disabled with the title "Press Start All first" until servers run.
- State messages follow spec section 5, including trial ended, license ended, needs internet, and wrong date.

- [ ] **Step 3: Verify in preview**

Run: `npm run build`, then open the dev preview at `/?license=free`.
Expected: no console errors; Start All flips status; Web and Database enable; `/?license=nexhost` still shows the full app.

- [ ] **Step 4: Commit**

```bash
git add app/src/free app/src/lib/free.ts app/src/App.tsx app/src/lib/license.ts app/src/components/LicenseGate.tsx
git commit -m "feat: simple Free window replaces the license wall"
```

### Task 12: PHP controls and Free settings

**Files:**
- Create: `app/src/free/VersionMenu.tsx`, `app/src/free/AddVersion.tsx`, `app/src/free/FreeSettings.tsx`
- Modify: `app/src/free/FreeShell.tsx`

**Interfaces:**
- Consumes: `localVersions`, `checkLocalVersion`, `pickLocalVersion`, `useVersion`, `PhpSettingsPanel`, `LicenseCard`, `useUpdates`.

- [ ] **Step 1: Version menu**

Lists ready PHP versions, switches with `useVersion("php", version)`, shows progress and restart result, and ends with **Add another version**. Include a small Node switcher in the same menu when more than one Node is ready.

- [ ] **Step 2: Add-version screen**

Windows steps: download from php.net (or nodejs.org), extract to `<root>\bin\php\php-<version>`, press **Check again**, with **Open PHP folder**. Mac steps: install PHP yourself (for example Homebrew), press **Choose PHP**, select `php-cgi`. Show check failures in plain words. Never show a download button for a version.

- [ ] **Step 3: Free settings**

Sections only: theme, ports (`save_ports`), start with computer, start services on launch, PHP settings (reuse `PhpSettingsPanel`), app updates, license (`LicenseCard`), uninstall. Existing backups, if `backups_list` has any, show a **Restore** action and **Open folder**.

- [ ] **Step 4: Verify in preview**

Run: `npm run build`, then at `/?license=free` open each screen.
Expected: no console errors and no rejected command in the console.

- [ ] **Step 5: Commit**

```bash
git add app/src/free
git commit -m "feat: PHP versions, extensions and basic settings in Free"
```

### Task 13: Upgrade path and paused sites

**Files:**
- Create: `app/src/free/UpgradeNotice.tsx`, `app/src/free/WhatYouGet.tsx`, `app/src/free/PausedSites.tsx`
- Modify: `app/src/free/FreeShell.tsx`, `app/src/settings/LicenseCard.tsx`

**Interfaces:**
- Consumes: `startTrial`, `licensePlans`, `pausedSites`, `useLocalhost`, `BUY_URL`.

- [ ] **Step 1: Upgrade notice**

Copy: "Try `.test` sites, templates and one-click versions free for 14 days." Button **See what you get**; close button. Store the hide-until time in `nexdb.freeNoticeUntil` for 7 days. Hide while a task runs. Never a popup.

- [ ] **Step 2: What you get**

Comparison rows copied from the approved mockup, with "Add PHP and Node versions" replacing the old row. Prices from `licensePlans` with an offline fallback line. Buttons: **Back**, **I have a key**, **See plans**, **Start 14-day free trial**. Text: "The trial does not include NexHost or public links." On `trial_used`, replace the trial button with **See plans** and keep the plain message. On `offline`, keep the user on the screen with "Connect to the internet to start your trial."

- [ ] **Step 3: Paused sites**

Shown only when `pausedSites()` is non-empty: "`N` sites are paused. Nothing was deleted." Each row has **Open at localhost** and, when allowed, **Use localhost**, with one confirmation explaining that the address in `.env` changes and is restored after upgrading.

- [ ] **Step 4: Trial wording in the full app**

`LicenseCard`: for `trial: true` show "Free trial, N days left", hide "Move to another PC" and **Change key**, and show **Enter a key or sign in**, which dispatches `OPEN_LICENSE`.

- [ ] **Step 5: Verify in preview**

Run: `npm run build`, then at `/?license=free` close the notice, reload (stays hidden), open What you get, and start the sample trial.
Expected: no console errors; a sample trial shows the full app.

- [ ] **Step 6: Commit**

```bash
git add app/src/free app/src/settings/LicenseCard.tsx
git commit -m "feat: upgrade notice, What you get screen and paused sites"
```

### Task 14: Nex tour

**Files:**
- Modify: `app/src/components/Tour.tsx:28-66`, `app/src/components/whatsNew.ts:12`, `app/src/free/FreeShell.tsx`

**Interfaces:**
- Produces: tour chapter `"NexDB Free"` and `WHATS_NEW` entry `{ version: "0.6.3", chapter: "New in 0.6.3" }`.

- [ ] **Step 1: Add the Free chapter**

Steps target `data-tour` attributes in `FreeShell`: Start All, Web, Database, Terminal, Folder, PHP version, What you get. It runs in practice mode using the sample data in `lib/free.ts`, so nothing on the computer changes. Mount `Tour` in `FreeShell` and play only this chapter there. Offer it once after the first Free launch.

- [ ] **Step 2: Add the 0.6.3 chapter for full users**

One or two steps explaining that NexDB now has a Free mode and their license and features are unchanged.

- [ ] **Step 3: Verify**

Run: `npm run build`, then play both chapters in preview.
Expected: every target is found, and no backend command is called during practice.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/Tour.tsx app/src/components/whatsNew.ts app/src/free/FreeShell.tsx
git commit -m "feat: Nex tours for NexDB Free"
```

### Task 15: End-to-end check

No new code unless a check fails. Use a throwaway install folder and a local copy of the website (`NEXDB_LICENSE_API=http://127.0.0.1:8011`). Never use the owner's real license file.

- [ ] **Step 1: Run all automated tests**

Run: `cargo test --lib` in `app/src-tauri`, `npm run build` in `app`, and `php artisan test` in the website.
Expected: all pass.

- [ ] **Step 2: Windows real-app run, once**

1. Fresh setup installs PHP 8.5, Node LTS, MySQL LTS, and phpMyAdmin.
2. Free window: Start All, `localhost`, phpMyAdmin, Terminal, Folder.
3. A locked command called from the dev console is rejected with `LOCKED`.
4. Add PHP 8.3 by hand and switch to it.
5. Turn an extension on in PHP settings.
6. App update check still works in Free.
7. Start the trial, create a `.test` Laravel project and a database.
8. Move the trial's end date on the local website, check in: app returns to Free; the project and database are intact; the `.test` address shows the paused page.
9. Use localhost, then activate a paid test key: `.test` and `APP_URL` return.
10. Unlink the key, then press **Sign in** in the Free window with that test account: the full app returns. Repeat with the license linked to another test machine: NexDB asks before moving it.

Expected: every step works, with no restart needed for steps 8, 9 and 10.

- [ ] **Step 3: Mac check on a real Mac**

Build through the existing GitHub Actions flow only after the owner approves a push. Run steps 1, 2, 4 (with **Choose PHP**), 7, and 8.
Expected: same results. Report anything untested.

- [ ] **Step 4: Hand off**

Report results. Do not bump the version, push, merge, or release. The owner approves those, and the release then follows the `nexdb-release` skill, with the website deployed first.
