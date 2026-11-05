//! The mail catcher's inbox inside NexDB: reads and clears the emails Mailpit caught, through
//! its own API on 127.0.0.1 (the same one its web inbox uses).

use serde::Serialize;
use serde_json::Value;

use crate::supervisor::MAIL_WEB_PORT;

#[derive(Debug, Serialize, PartialEq)]
pub struct Summary {
    pub id: String,
    pub from: String,
    pub to: Vec<String>,
    pub subject: String,
    /// When it arrived, as Mailpit wrote it (ISO 8601).
    pub created: String,
    pub snippet: String,
    pub read: bool,
    pub attachments: u64,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Message {
    pub id: String,
    pub from: String,
    pub to: Vec<String>,
    pub cc: Vec<String>,
    pub subject: String,
    pub date: String,
    pub html: String,
    pub text: String,
    pub attachments: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct Inbox {
    pub messages: Vec<Summary>,
    pub total: u64,
    pub unread: u64,
}

fn base(port: u16) -> String {
    format!("http://127.0.0.1:{port}/api/v1")
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())
}

fn not_running(e: reqwest::Error) -> String {
    if e.is_connect() || e.is_timeout() {
        "The mail catcher isn't running. Start it on the Dashboard to see the emails your apps send.".into()
    } else {
        format!("Couldn't read the inbox: {e}")
    }
}

/// "Name <address>" or just the address.
fn person(v: &Value) -> String {
    let addr = v["Address"].as_str().unwrap_or("");
    match v["Name"].as_str().filter(|n| !n.is_empty()) {
        Some(n) => format!("{n} <{addr}>"),
        None => addr.to_string(),
    }
}

fn people(v: &Value) -> Vec<String> {
    v.as_array().map(|a| a.iter().map(person).collect()).unwrap_or_default()
}

pub fn parse_list(v: &Value) -> Inbox {
    let messages = v["messages"]
        .as_array()
        .map(|list| {
            list.iter()
                .map(|m| Summary {
                    id: m["ID"].as_str().unwrap_or("").to_string(),
                    from: person(&m["From"]),
                    to: people(&m["To"]),
                    subject: m["Subject"].as_str().unwrap_or("").to_string(),
                    created: m["Created"].as_str().unwrap_or("").to_string(),
                    snippet: m["Snippet"].as_str().unwrap_or("").to_string(),
                    read: m["Read"].as_bool().unwrap_or(false),
                    attachments: m["Attachments"].as_u64().unwrap_or(0),
                })
                .collect()
        })
        .unwrap_or_default();
    Inbox { messages, total: v["total"].as_u64().unwrap_or(0), unread: v["unread"].as_u64().unwrap_or(0) }
}

pub fn parse_message(v: &Value) -> Message {
    Message {
        id: v["ID"].as_str().unwrap_or("").to_string(),
        from: person(&v["From"]),
        to: people(&v["To"]),
        cc: people(&v["Cc"]),
        subject: v["Subject"].as_str().unwrap_or("").to_string(),
        date: v["Date"].as_str().unwrap_or("").to_string(),
        html: v["HTML"].as_str().unwrap_or("").to_string(),
        text: v["Text"].as_str().unwrap_or("").to_string(),
        attachments: v["Attachments"]
            .as_array()
            .map(|a| a.iter().filter_map(|x| x["FileName"].as_str().map(String::from)).collect())
            .unwrap_or_default(),
    }
}

/// The newest emails first.
pub async fn list(limit: u32) -> Result<Inbox, String> {
    list_at(MAIL_WEB_PORT, limit).await
}

pub async fn list_at(port: u16, limit: u32) -> Result<Inbox, String> {
    let text = client()?
        .get(format!("{}/messages?limit={}", base(port), limit.clamp(1, 500)))
        .send()
        .await
        .map_err(not_running)?
        .text()
        .await
        .map_err(not_running)?;
    let v: Value = serde_json::from_str(&text).map_err(|e| format!("The inbox answered in an unexpected way: {e}"))?;
    Ok(parse_list(&v))
}

/// One email, which also marks it read.
pub async fn get(id: &str) -> Result<Message, String> {
    get_at(MAIL_WEB_PORT, id).await
}

pub async fn get_at(port: u16, id: &str) -> Result<Message, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("That email doesn't exist any more.".into());
    }
    let c = client()?;
    let res = c.get(format!("{}/message/{id}", base(port))).send().await.map_err(not_running)?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("That email doesn't exist any more.".into());
    }
    let v: Value = serde_json::from_str(&res.text().await.map_err(not_running)?)
        .map_err(|e| format!("The inbox answered in an unexpected way: {e}"))?;
    // Opening it marks it read, as in any mail program.
    let _ = c
        .put(format!("{}/messages", base(port)))
        .header("Content-Type", "application/json")
        .body(serde_json::json!({ "IDs": [id], "Read": true }).to_string())
        .send()
        .await;
    Ok(parse_message(&v))
}

/// Deletes the given emails, or all of them when `ids` is empty.
pub async fn delete(ids: &[String]) -> Result<(), String> {
    delete_at(MAIL_WEB_PORT, ids).await
}

pub async fn delete_at(port: u16, ids: &[String]) -> Result<(), String> {
    let body = if ids.is_empty() { serde_json::json!({}) } else { serde_json::json!({ "IDs": ids }) };
    let res = client()?
        .delete(format!("{}/messages", base(port)))
        .header("Content-Type", "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(not_running)?;
    if !res.status().is_success() {
        return Err(format!("The mail catcher refused to delete ({}).", res.status()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_mailpits_answers() {
        let list: Value = serde_json::from_str(
            r#"{"total":2,"unread":1,"messages":[{"ID":"abc","From":{"Name":"Shop","Address":"shop@example.test"},
            "To":[{"Name":"","Address":"you@example.test"}],"Subject":"Your order","Created":"2026-11-05T10:00:00Z",
            "Snippet":"Thanks for…","Read":false,"Attachments":1}]}"#,
        )
        .unwrap();
        let inbox = parse_list(&list);
        assert_eq!(inbox.total, 2);
        assert_eq!(inbox.unread, 1);
        assert_eq!(inbox.messages[0].from, "Shop <shop@example.test>");
        assert_eq!(inbox.messages[0].to, vec!["you@example.test"]);
        assert_eq!(inbox.messages[0].attachments, 1);

        let msg: Value = serde_json::from_str(
            r#"{"ID":"abc","From":{"Name":"","Address":"a@x.test"},"To":[],"Cc":null,"Subject":"Hi",
            "Date":"2026-11-05T10:00:00Z","HTML":"<p>Hi</p>","Text":"Hi","Attachments":[{"FileName":"invoice.pdf"}]}"#,
        )
        .unwrap();
        let m = parse_message(&msg);
        assert_eq!(m.from, "a@x.test");
        assert!(m.cc.is_empty());
        assert_eq!(m.attachments, vec!["invoice.pdf"]);
    }

    /// Real Mailpit from the catalog: sends an email over SMTP, reads it here, deletes it.
    /// `cargo test real_mail_inbox -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_mail_inbox() {
        use crate::supervisor::{ServiceSpec, StopMethod, Supervisor};
        // Spare ports, so a mail catcher already running (with your emails) is never touched.
        let (smtp, web) = (11025u16, 18025u16);
        use std::io::{BufRead, BufReader, Write};
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let tool = crate::catalog::bundled().tools.mailpit.expect("catalog has Mailpit");
        let target = root.join("bin").join("mailpit").join(format!("mailpit-{}", tool.version));
        tauri::async_runtime::block_on(crate::installer::install_archive(&tool.download, root, &target, "get-mailpit", &|_| {}))
            .unwrap();
        let sup = Supervisor::new(vec![ServiceSpec {
            id: "mailpit".into(),
            name: "Mail catcher".into(),
            version: None,
            exe: target.join("mailpit.exe"),
            args: vec![
                "--smtp".into(),
                format!("127.0.0.1:{smtp}"),
                "--listen".into(),
                format!("127.0.0.1:{web}"),
                "--database".into(),
                root.join("mailpit.db").display().to_string(),
            ],
            cwd: target.clone(),
            port: web,
            managed: true,
            stop: StopMethod::Kill,
            log: root.join("mailpit.log"),
        }]);
        sup.start("mailpit").unwrap();
        // Send one email the way an app would.
        let mut s = std::net::TcpStream::connect(("127.0.0.1", smtp)).unwrap();
        let mut r = BufReader::new(s.try_clone().unwrap());
        let mut line = String::new();
        let mut say = |cmd: &str, s: &mut std::net::TcpStream, r: &mut BufReader<std::net::TcpStream>| {
            if !cmd.is_empty() {
                s.write_all(cmd.as_bytes()).unwrap();
            }
            line.clear();
            r.read_line(&mut line).unwrap();
            line.clone()
        };
        say("", &mut s, &mut r);
        say("HELO nexdb.test\r\n", &mut s, &mut r);
        say("MAIL FROM:<app@nexdb.test>\r\n", &mut s, &mut r);
        say("RCPT TO:<you@nexdb.test>\r\n", &mut s, &mut r);
        say("DATA\r\n", &mut s, &mut r);
        say("Subject: Hello from the test\r\nFrom: App <app@nexdb.test>\r\nTo: you@nexdb.test\r\nContent-Type: text/html\r\n\r\n<p>It <b>works</b></p>\r\n.\r\n", &mut s, &mut r);
        say("QUIT\r\n", &mut s, &mut r);

        let inbox = tauri::async_runtime::block_on(list_at(web, 50)).unwrap();
        println!("{inbox:?}");
        assert_eq!(inbox.total, 1);
        let m = &inbox.messages[0];
        assert_eq!(m.subject, "Hello from the test");
        assert_eq!(m.from, "App <app@nexdb.test>");
        let full = tauri::async_runtime::block_on(get_at(web, &m.id)).unwrap();
        assert!(full.html.contains("<b>works</b>"), "{}", full.html);
        assert_eq!(tauri::async_runtime::block_on(list_at(web, 50)).unwrap().unread, 0, "opening it marks it read");
        tauri::async_runtime::block_on(delete_at(web, &[])).unwrap();
        assert_eq!(tauri::async_runtime::block_on(list_at(web, 50)).unwrap().total, 0);
        sup.stop("mailpit").unwrap();
    }
}
