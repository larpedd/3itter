//! Translations shared with the web app: the instance serves /js/i18n/strings.js, a table of
//! `"English": ["pl", "de", …]` rows. The app parses it line by line (it's JSON per row).

use serde_json::Value;
use std::cell::RefCell;
use std::collections::HashMap;

#[derive(Default)]
pub struct Table {
    pub langs: Vec<String>,
    pub rows: HashMap<String, Vec<String>>,
}

thread_local! {
    static TABLE: RefCell<Table> = RefCell::new(Table::default());
    static CURRENT: RefCell<Option<usize>> = const { RefCell::new(None) };
}

pub const NAMES: [(&str, &str, &str); 7] = [
    ("en", "English", "English"),
    ("pl", "Polski", "Polish"),
    ("de", "Deutsch", "German"),
    ("es", "Español", "Spanish"),
    ("fr", "Français", "French"),
    ("pt", "Português", "Portuguese"),
    ("uk", "Українська", "Ukrainian"),
];

pub fn native_name(code: &str) -> String {
    NAMES.iter().find(|n| n.0 == code).map(|n| n.1.to_string()).unwrap_or_else(|| code.to_string())
}

pub fn parse(src: &str) -> Table {
    let mut t = Table::default();
    for line in src.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("export const LANGS = ") {
            if let Ok(Value::Array(a)) = serde_json::from_str(rest.trim_end_matches(';').replace('\'', "\"").as_str()) {
                t.langs = a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect();
            }
            continue;
        }
        if !line.starts_with('"') {
            continue;
        }
        // "key": ["…", "…"],
        let Some(split) = line.find("\": [") else { continue };
        let key: Result<String, _> = serde_json::from_str(&line[..=split]);
        let row: Result<Vec<String>, _> = serde_json::from_str(line[split + 3..].trim_end_matches(','));
        if let (Ok(k), Ok(r)) = (key, row) {
            t.rows.insert(k, r);
        }
    }
    t
}

pub fn install(table: Table) {
    TABLE.with(|t| *t.borrow_mut() = table);
}

/// Switch language ("en" or one of the table's columns).
pub fn set_language(code: &str) {
    let idx = TABLE.with(|t| t.borrow().langs.iter().position(|l| l == code));
    CURRENT.with(|c| *c.borrow_mut() = idx);
}

pub fn language() -> String {
    let idx = CURRENT.with(|c| *c.borrow());
    match idx {
        Some(i) => TABLE.with(|t| t.borrow().langs.get(i).cloned().unwrap_or_else(|| "en".into())),
        None => "en".into(),
    }
}

/// Translate. Context after "|" ("Post|noun") is dropped when falling back to English.
pub fn t(s: &str) -> String {
    let idx = CURRENT.with(|c| *c.borrow());
    if let Some(i) = idx {
        let hit = TABLE.with(|t| t.borrow().rows.get(s).and_then(|r| r.get(i)).filter(|x| !x.is_empty()).cloned());
        if let Some(h) = hit {
            return h;
        }
    }
    s.split('|').next().unwrap_or(s).to_string()
}

/// Translate and fill every `{name}` placeholder from `vars`.
pub fn tf(s: &str, vars: &[(&str, &str)]) -> String {
    let mut out = t(s);
    for (k, v) in vars {
        out = out.replace(&format!("{{{k}}}"), v);
    }
    out
}

/// Translate and fill whichever single placeholder the text has.
pub fn t1(s: &str, value: &str) -> String {
    let out = t(s);
    match (out.find('{'), out.find('}')) {
        (Some(a), Some(b)) if b > a => format!("{}{}{}", &out[..a], value, &out[b + 1..]),
        _ => out,
    }
}
