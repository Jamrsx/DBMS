//! Installable versions and the rules that label and recommend them.
//! The catalog is built by `catalog/build-catalog.mjs` and bundled at compile time.

use serde::{Deserialize, Serialize};

const BUNDLED: &str = include_str!("../../../catalog/catalog.json");

/// A new PHP line is only recommended once frameworks have had time to catch up.
const PHP_SETTLE_DAYS: i64 = 90;
/// Lines whose end of life is this close get an "ends soon" label.
const ENDS_SOON_DAYS: i64 = 180;

#[derive(Debug, Deserialize)]
pub struct Catalog {
    pub generated: String,
    pub components: Vec<CatalogComponent>,
}

#[derive(Debug, Deserialize)]
pub struct CatalogComponent {
    pub id: String,
    pub name: String,
    pub lines: Vec<CatalogLine>,
}

#[derive(Debug, Deserialize)]
pub struct CatalogLine {
    pub line: String,
    pub latest: String,
    pub latest_date: Option<String>,
    pub line_released: String,
    pub lts: bool,
    pub lts_from: Option<String>,
    pub support_end: Option<String>,
    pub eol: Option<String>,
    pub security: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Label {
    Recommended,
    Latest,
    Lts,
    SecurityFix,
    EndsSoon,
}

#[derive(Debug, Serialize)]
pub struct ComponentChoices {
    pub id: String,
    pub name: String,
    /// Newest first.
    pub versions: Vec<VersionChoice>,
    /// The version preselected in the wizard.
    pub recommended: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct VersionChoice {
    pub line: String,
    pub version: String,
    pub released: Option<String>,
    pub eol: Option<String>,
    pub labels: Vec<Label>,
    /// Short plain-language caveat, e.g. "Security fixes only".
    pub note: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Choices {
    pub catalog_date: String,
    pub components: Vec<ComponentChoices>,
}

pub fn bundled() -> Catalog {
    serde_json::from_str(BUNDLED).expect("bundled catalog.json is valid")
}

/// Labels and recommends every installable version as of `today` (days since 1970-01-01).
pub fn choices(catalog: &Catalog, today: i64) -> Choices {
    Choices {
        catalog_date: catalog.generated.clone(),
        components: catalog
            .components
            .iter()
            .map(|c| component_choices(c, today))
            .collect(),
    }
}

fn component_choices(component: &CatalogComponent, today: i64) -> ComponentChoices {
    let mut lines: Vec<&CatalogLine> = component
        .lines
        .iter()
        .filter(|l| !l.eol.as_deref().and_then(parse_date).is_some_and(|eol| eol < today))
        .collect();
    lines.sort_by_key(|l| std::cmp::Reverse(parse_date(&l.line_released).unwrap_or(0)));

    let is_lts = |l: &CatalogLine| {
        l.lts || l.lts_from.as_deref().and_then(parse_date).is_some_and(|d| d <= today)
    };
    let recommended: Option<&CatalogLine> = match component.id.as_str() {
        "node" | "mysql" => lines.iter().copied().find(|l| is_lts(l)),
        "nginx" => lines.iter().copied().find(|l| is_even_minor(&l.line)),
        "php" => lines
            .iter()
            .copied()
            .find(|l| parse_date(&l.line_released).is_some_and(|d| today - d >= PHP_SETTLE_DAYS)),
        _ => None,
    }
    .or_else(|| lines.first().copied());

    let versions = lines
        .iter()
        .enumerate()
        .map(|(i, l)| {
            let mut labels = Vec::new();
            if recommended.is_some_and(|r| std::ptr::eq(r, *l)) {
                labels.push(Label::Recommended);
            }
            if i == 0 {
                labels.push(Label::Latest);
            }
            if is_lts(l) {
                labels.push(Label::Lts);
            }
            if l.security {
                labels.push(Label::SecurityFix);
            }
            if l.eol.as_deref().and_then(parse_date).is_some_and(|eol| eol - today <= ENDS_SOON_DAYS) {
                labels.push(Label::EndsSoon);
            }
            VersionChoice {
                line: l.line.clone(),
                version: l.latest.clone(),
                released: l.latest_date.clone(),
                eol: l.eol.clone(),
                labels,
                note: note_for(&component.id, l, is_lts(l), today),
            }
        })
        .collect();

    ComponentChoices {
        id: component.id.clone(),
        name: component.name.clone(),
        versions,
        recommended: recommended.map(|l| l.latest.clone()),
    }
}

fn note_for(id: &str, line: &CatalogLine, lts: bool, today: i64) -> Option<String> {
    let active_support_over = line
        .support_end
        .as_deref()
        .and_then(parse_date)
        .is_some_and(|end| end < today);
    match id {
        "php" if active_support_over => Some("Security fixes only".into()),
        "node" if !lts => Some("Short-lived Current release".into()),
        "mysql" if !lts => Some("Innovation release, short support".into()),
        "nginx" if !is_even_minor(&line.line) => Some("Mainline (newest features)".into()),
        _ => None,
    }
}

fn is_even_minor(line: &str) -> bool {
    line.split('.')
        .nth(1)
        .and_then(|m| m.parse::<u32>().ok())
        .is_some_and(|m| m % 2 == 0)
}

/// Days since 1970-01-01 for a `YYYY-MM-DD` date.
pub fn parse_date(date: &str) -> Option<i64> {
    let mut parts = date.get(..10)?.split('-');
    let y: i64 = parts.next()?.parse().ok()?;
    let m: i64 = parts.next()?.parse().ok()?;
    let d: i64 = parts.next()?.parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    // Howard Hinnant's days_from_civil.
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146_097 + doe - 719_468)
}

pub fn today() -> i64 {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    secs.div_euclid(86_400)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(line: &str, latest: &str, released: &str) -> CatalogLine {
        CatalogLine {
            line: line.into(),
            latest: latest.into(),
            latest_date: None,
            line_released: released.into(),
            lts: false,
            lts_from: None,
            support_end: None,
            eol: None,
            security: false,
        }
    }

    fn component(id: &str, lines: Vec<CatalogLine>) -> CatalogComponent {
        CatalogComponent { id: id.into(), name: id.into(), lines }
    }

    fn day(date: &str) -> i64 {
        parse_date(date).unwrap()
    }

    #[test]
    fn parses_dates() {
        assert_eq!(parse_date("1970-01-01"), Some(0));
        assert_eq!(parse_date("2000-03-01"), Some(11_017));
        assert_eq!(day("2026-10-30") - day("2026-10-01"), 29);
        assert_eq!(parse_date("2026-13-01"), None);
        assert_eq!(parse_date("soon"), None);
    }

    #[test]
    fn php_waits_before_recommending_a_new_line() {
        let php = component(
            "php",
            vec![line("8.6", "8.6.0", "2026-10-01"), line("8.5", "8.5.12", "2025-11-20")],
        );
        let c = component_choices(&php, day("2026-10-30"));
        assert_eq!(c.recommended.as_deref(), Some("8.5.12"));
        assert_eq!(c.versions[0].labels, vec![Label::Latest]);
        assert_eq!(c.versions[1].labels, vec![Label::Recommended]);

        // 90 days later the new line becomes the recommendation.
        let c = component_choices(&php, day("2026-12-30"));
        assert_eq!(c.recommended.as_deref(), Some("8.6.0"));
    }

    #[test]
    fn node_recommends_lts_including_lines_that_just_became_lts() {
        let mut v26 = line("26", "26.13.0", "2026-05-05");
        v26.lts_from = Some("2026-10-28".into());
        let mut v24 = line("24", "24.22.2", "2025-05-06");
        v24.lts_from = Some("2025-10-28".into());
        let node = component("node", vec![line("27", "27.0.0", "2026-10-20"), v26, v24]);

        let before = component_choices(&node, day("2026-10-27"));
        assert_eq!(before.recommended.as_deref(), Some("24.22.2"));
        assert_eq!(before.versions[0].note.as_deref(), Some("Short-lived Current release"));

        let after = component_choices(&node, day("2026-10-30"));
        assert_eq!(after.recommended.as_deref(), Some("26.13.0"));
        assert_eq!(after.versions[1].labels, vec![Label::Recommended, Label::Lts]);
    }

    #[test]
    fn hides_ended_lines_and_flags_ending_soon() {
        let mut old = line("8.2", "8.2.35", "2022-12-08");
        old.eol = Some("2026-12-31".into());
        old.support_end = Some("2024-12-31".into());
        old.security = true;
        let mut gone = line("8.1", "8.1.34", "2021-11-25");
        gone.eol = Some("2025-12-31".into());
        let php = component("php", vec![old, gone]);

        let c = component_choices(&php, day("2026-10-30"));
        assert_eq!(c.versions.len(), 1);
        let v = &c.versions[0];
        assert!(v.labels.contains(&Label::SecurityFix));
        assert!(v.labels.contains(&Label::EndsSoon));
        assert_eq!(v.note.as_deref(), Some("Security fixes only"));
    }

    #[test]
    fn nginx_prefers_stable_even_line() {
        let nginx = component(
            "nginx",
            vec![line("1.31", "1.31.8", "2026-05-13"), line("1.30", "1.30.6", "2026-04-14")],
        );
        let c = component_choices(&nginx, day("2026-10-30"));
        assert_eq!(c.recommended.as_deref(), Some("1.30.6"));
        assert_eq!(c.versions[0].note.as_deref(), Some("Mainline (newest features)"));
    }

    #[test]
    fn mysql_recommends_lts_over_innovation() {
        let mut lts = line("9.7", "9.7.4", "2026-04-21");
        lts.lts = true;
        let mysql = component("mysql", vec![line("26.10", "26.10.0", "2026-10-20"), lts]);
        let c = component_choices(&mysql, day("2026-10-30"));
        assert_eq!(c.recommended.as_deref(), Some("9.7.4"));
        assert_eq!(c.versions[0].note.as_deref(), Some("Innovation release, short support"));
    }

    #[test]
    fn bundled_catalog_has_a_recommendation_for_every_component() {
        let all = choices(&bundled(), today());
        for c in &all.components {
            assert!(c.recommended.is_some(), "{} has no recommendation", c.id);
        }
    }

    /// Writes the browser-preview data used when the UI runs outside the desktop app:
    /// `cargo test write_preview_choices -- --ignored`
    #[test]
    #[ignore]
    fn write_preview_choices() {
        let all = choices(&bundled(), today());
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../src/lib/preview-choices.json");
        std::fs::write(path, serde_json::to_string_pretty(&all).unwrap() + "\n").unwrap();
    }
}
