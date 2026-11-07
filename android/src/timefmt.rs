//! Relative ("5m") and full ("13:05 · 7 Nov 2026") timestamps in the device's local time.

use crate::i18n;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

struct Local {
    year: i32,
    month: usize, // 0-11
    day: i32,
    hour: i32,
    minute: i32,
}

fn local(ms: i64) -> Local {
    let secs = (ms / 1000) as libc::time_t;
    // SAFETY: localtime_r only writes into the zeroed struct we pass.
    let mut tm: libc::tm = unsafe { std::mem::zeroed() };
    unsafe { libc::localtime_r(&secs, &mut tm) };
    Local { year: tm.tm_year + 1900, month: tm.tm_mon.clamp(0, 11) as usize, day: tm.tm_mday, hour: tm.tm_hour, minute: tm.tm_min }
}

const MONTHS: [(&str, [&str; 12]); 7] = [
    ("en", ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]),
    ("pl", ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"]),
    ("de", ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."]),
    ("es", ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]),
    ("fr", ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]),
    ("pt", ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."]),
    ("uk", ["січ.", "лют.", "бер.", "квіт.", "трав.", "черв.", "лип.", "серп.", "вер.", "жовт.", "лист.", "груд."]),
];

fn month(m: usize) -> &'static str {
    let lang = i18n::language();
    MONTHS.iter().find(|x| x.0 == lang).unwrap_or(&MONTHS[0]).1[m]
}

fn day_month(t: &Local) -> String {
    if i18n::language() == "en" { format!("{} {}", month(t.month), t.day) } else { format!("{} {}", t.day, month(t.month)) }
}

pub fn date(ms: i64) -> String {
    let t = local(ms);
    format!("{} {}", day_month(&t), t.year)
}

pub fn rel(ms: i64) -> String {
    let s = (now_ms() - ms) / 1000;
    if s < 60 {
        return i18n::t("now");
    }
    if s < 3600 {
        return format!("{}m", s / 60);
    }
    if s < 86_400 {
        return format!("{}h", s / 3600);
    }
    if s < 7 * 86_400 {
        return format!("{}d", s / 86_400);
    }
    let t = local(ms);
    if t.year == local(now_ms()).year { day_month(&t) } else { date(ms) }
}

pub fn full(ms: i64) -> String {
    let t = local(ms);
    format!("{:02}:{:02} · {} {}", t.hour, t.minute, day_month(&t), t.year)
}
