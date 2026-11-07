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

const MONTHS: [(&str, [&str; 12]); 12] = [
    ("en", ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]),
    ("pl", ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"]),
    ("de", ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."]),
    ("es", ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]),
    ("fr", ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]),
    ("pt", ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."]),
    ("uk", ["січ.", "лют.", "бер.", "квіт.", "трав.", "черв.", "лип.", "серп.", "вер.", "жовт.", "лист.", "груд."]),
    ("it", ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"]),
    ("nl", ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]),
    ("tr", ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]),
    ("cs", ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"]),
    ("ja", ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]),
];

fn month(m: usize) -> &'static str {
    let lang = i18n::language();
    MONTHS.iter().find(|x| x.0 == lang).unwrap_or(&MONTHS[0]).1[m]
}

fn day_month(t: &Local) -> String {
    match i18n::language().as_str() {
        "en" => format!("{} {}", month(t.month), t.day),
        "ja" => format!("{}{}日", month(t.month), t.day),
        _ => format!("{} {}", t.day, month(t.month)),
    }
}

pub fn date(ms: i64) -> String {
    let t = local(ms);
    if i18n::language() == "ja" { format!("{}年{}", t.year, day_month(&t)) } else { format!("{} {}", day_month(&t), t.year) }
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

/// Milliseconds for a local date and time (month 1–12).
pub fn local_ms(year: i32, month: i32, day: i32, hour: i32, minute: i32) -> i64 {
    // SAFETY: mktime only reads/normalises the struct we own.
    let mut tm: libc::tm = unsafe { std::mem::zeroed() };
    tm.tm_year = year - 1900;
    tm.tm_mon = month - 1;
    tm.tm_mday = day;
    tm.tm_hour = hour;
    tm.tm_min = minute;
    tm.tm_isdst = -1;
    (unsafe { libc::mktime(&mut tm) }) as i64 * 1000
}

/// Local (year, month 1–12, day) `days` days from today.
pub fn local_date(days: i64) -> (i32, i32, i32) {
    let t = local(now_ms() + days * 86_400_000);
    (t.year, t.month as i32 + 1, t.day)
}

pub fn local_hour() -> i32 {
    local(now_ms()).hour
}

/// "Nov 2026" / "lis 2026" / "2026年11月", for "Joined …".
pub fn month_year(ms: i64) -> String {
    let t = local(ms);
    if i18n::language() == "ja" { format!("{}年{}", t.year, month(t.month)) } else { format!("{} {}", month(t.month), t.year) }
}
