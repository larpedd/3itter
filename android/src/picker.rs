//! Files picked in the system picker. On Android, MainActivity.java reads them and calls the JNI
//! functions below; on the desktop, notify::pick_media fakes it. Either way the files end up in
//! app::on_picked on the UI thread.

use std::sync::Mutex;

static PICKED: Mutex<Vec<(i32, String, Vec<u8>)>> = Mutex::new(Vec::new());

pub fn push(request: i32, mime: String, bytes: Vec<u8>) {
    PICKED.lock().unwrap().push((request, mime, bytes));
}

pub fn done(request: i32) {
    let files: Vec<(String, Vec<u8>)> = {
        let mut all = PICKED.lock().unwrap();
        let (mine, rest): (Vec<_>, Vec<_>) = std::mem::take(&mut *all).into_iter().partition(|f| f.0 == request);
        *all = rest;
        mine.into_iter().map(|f| (f.1, f.2)).collect()
    };
    let _ = slint::invoke_from_event_loop(move || crate::app::on_picked(request, files));
}

#[cfg(target_os = "android")]
mod jni_exports {
    use jni::objects::{JByteArray, JObject, JString};
    use jni::sys::jint;
    use jni::JNIEnv;

    #[no_mangle]
    pub extern "system" fn Java_io_github_wypiek_itter_MainActivity_onPicked(
        mut env: JNIEnv, _this: JObject, request: jint, mime: JString, data: JByteArray,
    ) {
        let mime: String = env.get_string(&mime).map(|s| s.into()).unwrap_or_default();
        let bytes = env.convert_byte_array(&data).unwrap_or_default();
        super::push(request, mime, bytes);
    }

    #[no_mangle]
    pub extern "system" fn Java_io_github_wypiek_itter_MainActivity_onPickDone(_env: JNIEnv, _this: JObject, request: jint) {
        super::done(request);
    }
}
