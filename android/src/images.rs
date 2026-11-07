//! Image loading: a few worker threads download and decode pictures, then hand the pixels to the
//! UI thread, which caches them and patches every row that shows that picture.

use crate::api::Api;
use slint::{Image, Rgba8Pixel, SharedPixelBuffer};
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex, OnceLock};

thread_local! {
    static CACHE: RefCell<HashMap<String, Image>> = RefCell::new(HashMap::new());
    static PENDING: RefCell<HashSet<String>> = RefCell::new(HashSet::new());
}

static QUEUE: OnceLock<Mutex<Sender<(String, u32)>>> = OnceLock::new();

/// Start the download workers. `on_ready(url)` runs on the UI thread after an image arrives.
pub fn start(api: Arc<Api>, on_ready: fn(&str)) {
    let (tx, rx) = channel::<(String, u32)>();
    let rx = Arc::new(Mutex::new(rx));
    for _ in 0..4 {
        let rx = rx.clone();
        let api = api.clone();
        std::thread::spawn(move || loop {
            let job = rx.lock().unwrap().recv();
            let Ok((url, max)) = job else { return };
            let pixels = api.bytes(&url, 15 * 1024 * 1024).ok().and_then(|b| decode(&b, max));
            let u = url.clone();
            let _ = slint::invoke_from_event_loop(move || {
                PENDING.with(|p| p.borrow_mut().remove(&u));
                if let Some(px) = pixels {
                    CACHE.with(|c| c.borrow_mut().insert(u.clone(), Image::from_rgba8(px)));
                    on_ready(&u);
                }
            });
        });
    }
    let _ = QUEUE.set(Mutex::new(tx));
}

fn decode(bytes: &[u8], max: u32) -> Option<SharedPixelBuffer<Rgba8Pixel>> {
    let img = image::load_from_memory(bytes).ok()?;
    let img = if img.width() > max || img.height() > max { img.thumbnail(max, max) } else { img };
    let rgba = img.to_rgba8();
    Some(SharedPixelBuffer::clone_from_slice(rgba.as_raw(), rgba.width(), rgba.height()))
}

/// The cached image for `url`, or an empty image while it loads (and a download is queued).
pub fn get(url: &str, max: u32) -> Image {
    if url.is_empty() {
        return Image::default();
    }
    if let Some(img) = CACHE.with(|c| c.borrow().get(url).cloned()) {
        return img;
    }
    let queued = PENDING.with(|p| !p.borrow_mut().insert(url.to_string()));
    if !queued {
        if let Some(q) = QUEUE.get() {
            let _ = q.lock().unwrap().send((url.to_string(), max));
        }
    }
    Image::default()
}

pub fn cached(url: &str) -> Option<Image> {
    CACHE.with(|c| c.borrow().get(url).cloned())
}

/// Width / height of a loaded image (for laying out media before it arrives we use 16:9).
pub fn ratio(url: &str) -> f32 {
    cached(url).map(|i| {
        let s = i.size();
        if s.height == 0 { 16.0 / 9.0 } else { s.width as f32 / s.height as f32 }
    }).unwrap_or(16.0 / 9.0)
}
