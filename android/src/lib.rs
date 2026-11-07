//! 3itter for Android: a native client. The UI is Slint (ui/*.slint), drawn by Rust with Skia;
//! there is no WebView and no Java code besides Slint's small built-in input helper.

slint::include_modules!();

mod api;
mod app;
mod i18n;
mod images;
mod notify;
mod store;
mod theme;
mod timefmt;

pub use app::{run, run_with};

#[cfg(target_os = "android")]
#[no_mangle]
fn android_main(android_app: slint::android::AndroidApp) {
    let data_dir = android_app.internal_data_path().unwrap_or_else(|| std::path::PathBuf::from("/data/local/tmp/3itter"));
    notify::init(&android_app);
    slint::android::init(android_app).expect("could not start the Slint Android backend");
    if let Err(e) = run(data_dir) {
        eprintln!("3itter: {e}");
    }
}
