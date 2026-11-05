//! A database's shape: tables, their columns and indexes, and the foreign keys between them.
//! The relationship diagram draws it; Compare puts two side by side.

use serde::Serialize;

use crate::db::{ColumnInfo, Db};

#[derive(Serialize, Debug, Clone)]
pub struct Index {
    pub name: String,
    pub columns: Vec<String>,
    pub unique: bool,
    pub primary: bool,
}

#[derive(Serialize, Debug, Clone)]
pub struct Table {
    pub name: String,
    pub is_view: bool,
    pub rows: Option<u64>,
    pub columns: Vec<ColumnInfo>,
    pub indexes: Vec<Index>,
}

/// A foreign key: `table(columns)` points at `to_table(to_columns)`.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Link {
    pub name: String,
    pub table: String,
    pub columns: Vec<String>,
    pub to_table: String,
    pub to_columns: Vec<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct Schema {
    pub database: String,
    pub engine: String,
    pub tables: Vec<Table>,
    pub links: Vec<Link>,
    /// The index or key list was longer than one query returns, so some may be missing.
    pub partial: bool,
}

fn text(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn truthy(v: &serde_json::Value) -> bool {
    matches!(text(v).to_lowercase().as_str(), "1" | "t" | "true" | "yes")
}

/// Reads the whole shape of `name` on the server the Database page is using.
pub fn read(db: &Db, name: &str) -> Result<Schema, String> {
    if !crate::db::valid_name(name) {
        return Err(format!("\"{name}\" isn't a database name NexDB can read."));
    }
    let pg = db.pg_port().is_some();
    let mut tables: Vec<Table> = Vec::new();
    for t in db.tables(name)? {
        let columns = db.columns(name, &t.name)?;
        tables.push(Table { name: t.name, is_view: t.is_view, rows: t.rows, columns, indexes: Vec::new() });
    }

    let (index_sql, key_sql) = if pg {
        (
            "SELECT t.relname, i.relname, a.attname, ix.indisunique, ix.indisprimary \
             FROM pg_index ix JOIN pg_class t ON t.oid = ix.indrelid JOIN pg_class i ON i.oid = ix.indexrelid \
             JOIN pg_namespace n ON n.oid = t.relnamespace \
             JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey) \
             WHERE n.nspname = 'public' ORDER BY t.relname, i.relname, array_position(ix.indkey, a.attnum)"
                .to_string(),
            "SELECT cl.relname, att.attname, clf.relname, attf.attname, con.conname \
             FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_class clf ON clf.oid = con.confrelid \
             JOIN pg_namespace n ON n.oid = cl.relnamespace \
             CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(attnum, fattnum, ord) \
             JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum \
             JOIN pg_attribute attf ON attf.attrelid = con.confrelid AND attf.attnum = k.fattnum \
             WHERE con.contype = 'f' AND n.nspname = 'public' ORDER BY con.conname, k.ord"
                .to_string(),
        )
    } else {
        (
            format!(
                "SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE = 0, INDEX_NAME = 'PRIMARY' \
                 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = '{name}' ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX"
            ),
            format!(
                "SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, CONSTRAINT_NAME \
                 FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = '{name}' AND REFERENCED_TABLE_NAME IS NOT NULL \
                 ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION"
            ),
        )
    };
    let mut partial = false;

    let out = db.query(Some(name), &index_sql)?;
    if let Some(set) = out.sets.first() {
        partial |= set.truncated;
        for r in &set.rows {
            let (table, index, column) = (text(&r[0]), text(&r[1]), text(&r[2]));
            let Some(t) = tables.iter_mut().find(|t| t.name == table) else { continue };
            match t.indexes.iter_mut().find(|i| i.name == index) {
                Some(i) => i.columns.push(column),
                None => t.indexes.push(Index { name: index, columns: vec![column], unique: truthy(&r[3]), primary: truthy(&r[4]) }),
            }
        }
    }

    let mut links: Vec<Link> = Vec::new();
    let out = db.query(Some(name), &key_sql)?;
    if let Some(set) = out.sets.first() {
        partial |= set.truncated;
        for r in &set.rows {
            let (table, column, to_table, to_column, fk) = (text(&r[0]), text(&r[1]), text(&r[2]), text(&r[3]), text(&r[4]));
            match links.iter_mut().find(|l| l.name == fk && l.table == table) {
                Some(l) => {
                    l.columns.push(column);
                    l.to_columns.push(to_column);
                }
                None => links.push(Link { name: fk, table, columns: vec![column], to_table, to_columns: vec![to_column] }),
            }
        }
    }

    Ok(Schema { database: name.to_string(), engine: if pg { "postgres" } else { "mysql" }.into(), tables, links, partial })
}

/// One difference between two databases, in words the Compare panel can show.
#[derive(Serialize, Debug, PartialEq)]
pub struct Diff {
    /// "table", "column", "index" or "key".
    pub kind: String,
    pub table: String,
    /// The column, index or key name; empty for a whole table.
    pub name: String,
    /// "only_a", "only_b" or "different".
    pub change: String,
    /// How it looks on each side, when it's in both but different.
    pub a: Option<String>,
    pub b: Option<String>,
}

fn diff(kind: &str, table: &str, name: &str, change: &str, a: Option<String>, b: Option<String>) -> Diff {
    Diff { kind: kind.into(), table: table.into(), name: name.into(), change: change.into(), a, b }
}

fn describe_column(c: &ColumnInfo) -> String {
    let mut s = c.column_type.clone();
    s.push_str(if c.nullable { ", can be empty" } else { ", required" });
    if let Some(d) = &c.default {
        s.push_str(&format!(", default {d}"));
    }
    if !c.extra.is_empty() {
        s.push_str(&format!(", {}", c.extra));
    }
    s
}

fn describe_index(i: &Index) -> String {
    let kind = if i.primary { "primary key" } else if i.unique { "unique" } else { "index" };
    format!("{kind} on {}", i.columns.join(", "))
}

fn describe_link(l: &Link) -> String {
    format!("{} → {}({})", l.columns.join(", "), l.to_table, l.to_columns.join(", "))
}

/// What differs between `a` and `b`: tables, columns (type, empty or not, default), indexes and
/// foreign keys. Tables only in one side are listed once, not with all their columns.
pub fn compare(a: &Schema, b: &Schema) -> Vec<Diff> {
    let mut out = Vec::new();
    let mut names: Vec<&str> = a.tables.iter().chain(&b.tables).map(|t| t.name.as_str()).collect();
    names.sort_unstable();
    names.dedup();
    for name in names {
        let (ta, tb) = (a.tables.iter().find(|t| t.name == name), b.tables.iter().find(|t| t.name == name));
        let (ta, tb) = match (ta, tb) {
            (Some(x), None) => {
                out.push(diff("table", name, "", "only_a", None, None));
                let _ = x;
                continue;
            }
            (None, Some(_)) => {
                out.push(diff("table", name, "", "only_b", None, None));
                continue;
            }
            (Some(x), Some(y)) => (x, y),
            (None, None) => continue,
        };
        for c in &ta.columns {
            match tb.columns.iter().find(|d| d.name == c.name) {
                None => out.push(diff("column", name, &c.name, "only_a", Some(describe_column(c)), None)),
                Some(d) => {
                    let (x, y) = (describe_column(c), describe_column(d));
                    if x.to_lowercase() != y.to_lowercase() {
                        out.push(diff("column", name, &c.name, "different", Some(x), Some(y)));
                    }
                }
            }
        }
        for d in tb.columns.iter().filter(|d| !ta.columns.iter().any(|c| c.name == d.name)) {
            out.push(diff("column", name, &d.name, "only_b", None, Some(describe_column(d))));
        }
        for i in &ta.indexes {
            match tb.indexes.iter().find(|j| j.name == i.name) {
                None => out.push(diff("index", name, &i.name, "only_a", Some(describe_index(i)), None)),
                Some(j) if describe_index(i) != describe_index(j) => {
                    out.push(diff("index", name, &i.name, "different", Some(describe_index(i)), Some(describe_index(j))))
                }
                _ => {}
            }
        }
        for j in tb.indexes.iter().filter(|j| !ta.indexes.iter().any(|i| i.name == j.name)) {
            out.push(diff("index", name, &j.name, "only_b", None, Some(describe_index(j))));
        }
    }
    // Foreign keys, matched by what they connect rather than by name (names are often generated).
    for l in &a.links {
        if !b.tables.iter().any(|t| t.name == l.table) {
            continue;
        }
        if !b.links.iter().any(|m| m.table == l.table && m.columns == l.columns && m.to_table == l.to_table && m.to_columns == l.to_columns) {
            out.push(diff("key", &l.table, &l.name, "only_a", Some(describe_link(l)), None));
        }
    }
    for m in &b.links {
        if !a.tables.iter().any(|t| t.name == m.table) {
            continue;
        }
        if !a.links.iter().any(|l| m.table == l.table && m.columns == l.columns && m.to_table == l.to_table && m.to_columns == l.to_columns) {
            out.push(diff("key", &m.table, &m.name, "only_b", None, Some(describe_link(m))));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn col(name: &str, ty: &str, nullable: bool) -> ColumnInfo {
        ColumnInfo { name: name.into(), column_type: ty.into(), nullable, key: String::new(), default: None, extra: String::new() }
    }

    fn table(name: &str, columns: Vec<ColumnInfo>, indexes: Vec<Index>) -> Table {
        Table { name: name.into(), is_view: false, rows: None, columns, indexes }
    }

    fn idx(name: &str, cols: &[&str], unique: bool) -> Index {
        Index { name: name.into(), columns: cols.iter().map(|s| s.to_string()).collect(), unique, primary: false }
    }

    fn link(table: &str, col: &str, to: &str) -> Link {
        Link { name: format!("{table}_{col}_fk"), table: table.into(), columns: vec![col.into()], to_table: to.into(), to_columns: vec!["id".into()] }
    }

    fn schema(tables: Vec<Table>, links: Vec<Link>) -> Schema {
        Schema { database: "x".into(), engine: "mysql".into(), tables, links, partial: false }
    }

    #[test]
    fn finds_tables_columns_indexes_and_keys_that_differ() {
        let a = schema(
            vec![
                table("users", vec![col("id", "bigint", false), col("email", "varchar(255)", false), col("age", "int", true)], vec![idx("users_email", &["email"], true)]),
                table("orders", vec![col("id", "bigint", false), col("user_id", "bigint", false)], vec![]),
                table("old_logs", vec![col("id", "int", false)], vec![]),
            ],
            vec![link("orders", "user_id", "users")],
        );
        let b = schema(
            vec![
                table("users", vec![col("id", "bigint", false), col("email", "varchar(320)", false), col("name", "text", true)], vec![idx("users_email", &["email"], false)]),
                table("orders", vec![col("id", "bigint", false), col("user_id", "bigint", false)], vec![idx("orders_user", &["user_id"], false)]),
                table("payments", vec![col("id", "int", false)], vec![]),
            ],
            vec![],
        );
        let d = compare(&a, &b);
        let has = |kind: &str, table: &str, name: &str, change: &str| d.iter().any(|x| x.kind == kind && x.table == table && x.name == name && x.change == change);
        assert!(has("table", "old_logs", "", "only_a"));
        assert!(has("table", "payments", "", "only_b"));
        assert!(has("column", "users", "email", "different"));
        assert!(has("column", "users", "age", "only_a"));
        assert!(has("column", "users", "name", "only_b"));
        assert!(has("index", "users", "users_email", "different"));
        assert!(has("index", "orders", "orders_user", "only_b"));
        assert!(has("key", "orders", "orders_user_id_fk", "only_a"));
        // A table only on one side isn't listed column by column.
        assert!(!d.iter().any(|x| x.table == "old_logs" && x.kind == "column"));
        assert_eq!(d.len(), 8, "{d:#?}");
    }

    #[test]
    fn same_schema_means_no_differences() {
        let s = schema(vec![table("t", vec![col("id", "int", false)], vec![idx("i", &["id"], true)])], vec![link("t", "id", "t")]);
        assert!(compare(&s, &s.clone()).is_empty());
    }

    /// Real MySQL (NexDB's, running on 3306): makes two databases with keys, reads and compares them.
    /// `cargo test real_schema -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_schema_mysql() {
        let db = Db::default();
        db.connect(3306, None).expect("NexDB's MySQL running, no root password");
        for (name, extra) in [("nexdb_schema_a", ""), ("nexdb_schema_b", ", ADD COLUMN note TEXT")] {
            let _ = db.query(None, &format!("DROP DATABASE IF EXISTS {name}"));
            db.query(None, &format!("CREATE DATABASE {name}")).unwrap();
            db.query(Some(name), "CREATE TABLE users (id BIGINT PRIMARY KEY, email VARCHAR(255) UNIQUE)").unwrap();
            db.query(
                Some(name),
                "CREATE TABLE orders (id BIGINT PRIMARY KEY, user_id BIGINT NOT NULL, CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES users(id))",
            )
            .unwrap();
            if !extra.is_empty() {
                db.query(Some(name), &format!("ALTER TABLE orders {}", &extra[2..])).unwrap();
            }
        }
        let a = read(&db, "nexdb_schema_a").unwrap();
        let b = read(&db, "nexdb_schema_b").unwrap();
        println!("{:#?}", a.links);
        assert_eq!(a.links, vec![Link { name: "orders_user_fk".into(), table: "orders".into(), columns: vec!["user_id".into()], to_table: "users".into(), to_columns: vec!["id".into()] }]);
        assert!(a.tables.iter().find(|t| t.name == "users").unwrap().indexes.iter().any(|i| i.primary));
        let d = compare(&a, &b);
        println!("{d:#?}");
        assert_eq!(d.len(), 1);
        assert_eq!((d[0].kind.as_str(), d[0].name.as_str(), d[0].change.as_str()), ("column", "note", "only_b"));
        for name in ["nexdb_schema_a", "nexdb_schema_b"] {
            db.query(None, &format!("DROP DATABASE {name}")).unwrap();
        }
    }
}
