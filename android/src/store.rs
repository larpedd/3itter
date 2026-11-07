//! Saved state: known instances, the current one and its session cookies (app-private storage).

use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Instance {
    pub url: String,
    pub name: String,
    pub domain: String,
}

#[derive(Default)]
pub struct Store {
    path: PathBuf,
    pub instances: Vec<Instance>,
    pub current: Option<String>,
    pub cookies: BTreeMap<String, BTreeMap<String, String>>,
    pub theme: String,
}

impl Store {
    pub fn load(dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("state.json");
        let mut s = Store { path, ..Default::default() };
        let Ok(text) = std::fs::read_to_string(&s.path) else { return s };
        let Ok(v) = serde_json::from_str::<Value>(&text) else { return s };
        if let Some(list) = v["instances"].as_array() {
            s.instances = list.iter().map(|x| Instance {
                url: x["url"].as_str().unwrap_or_default().into(),
                name: x["name"].as_str().unwrap_or_default().into(),
                domain: x["domain"].as_str().unwrap_or_default().into(),
            }).filter(|i| !i.url.is_empty()).collect();
        }
        s.current = v["current"].as_str().map(str::to_string);
        s.theme = v["theme"].as_str().unwrap_or("system").to_string();
        if let Some(map) = v["cookies"].as_object() {
            for (url, jar) in map {
                let jar = jar.as_object().map(|o| o.iter().filter_map(|(k, v)| v.as_str().map(|v| (k.clone(), v.to_string()))).collect())
                    .unwrap_or_default();
                s.cookies.insert(url.clone(), jar);
            }
        }
        s
    }

    pub fn save(&self) {
        let v = json!({
            "instances": self.instances.iter().map(|i| json!({ "url": i.url, "name": i.name, "domain": i.domain })).collect::<Vec<_>>(),
            "current": self.current,
            "cookies": self.cookies,
            "theme": self.theme,
        });
        let tmp = self.path.with_extension("tmp");
        if std::fs::write(&tmp, v.to_string()).is_ok() {
            let _ = std::fs::rename(&tmp, &self.path);
        }
    }

    pub fn remember(&mut self, inst: Instance) {
        self.instances.retain(|i| i.url != inst.url);
        self.instances.insert(0, inst);
        self.instances.truncate(10);
    }
}
