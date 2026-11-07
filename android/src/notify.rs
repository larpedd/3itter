//! System notifications. On Android this talks to NotificationManager through JNI (no Java code in the
//! app); elsewhere it's a no-op. Two channels: "activity" (likes, replies, follows…) and "messages".

#[cfg(target_os = "android")]
mod imp {
    use jni::objects::{GlobalRef, JObject, JValue};
    use jni::{JNIEnv, JavaVM};
    use std::sync::OnceLock;

    static VM: OnceLock<JavaVM> = OnceLock::new();
    static ACTIVITY: OnceLock<GlobalRef> = OnceLock::new();

    const CHANNELS: [(&str, &str, i32); 2] = [("activity", "Activity", 3), ("messages", "Messages", 4)];

    pub fn init(app: &slint::android::AndroidApp) {
        // SAFETY: android-activity hands out the process's JavaVM and a global ref to the activity,
        // both valid for the lifetime of the app.
        let Ok(vm) = (unsafe { JavaVM::from_raw(app.vm_as_ptr() as *mut jni::sys::JavaVM) }) else { return };
        let activity = unsafe { JObject::from_raw(app.activity_as_ptr() as jni::sys::jobject) };
        if let Ok(mut env) = vm.attach_current_thread() {
            if let Ok(global) = env.new_global_ref(&activity) {
                let _ = ACTIVITY.set(global);
            }
        }
        let _ = VM.set(vm);
        with_env(|env, ctx| {
            create_channels(env, ctx)?;
            request_permission(env, ctx)
        });
    }

    fn with_env(f: impl FnOnce(&mut JNIEnv, &JObject) -> jni::errors::Result<()>) {
        let (Some(vm), Some(act)) = (VM.get(), ACTIVITY.get()) else { return };
        let Ok(mut env) = vm.attach_current_thread() else { return };
        if f(&mut env, act.as_obj()).is_err() || env.exception_check().unwrap_or(false) {
            let _ = env.exception_describe();
            let _ = env.exception_clear();
        }
    }

    fn sdk(env: &mut JNIEnv) -> i32 {
        env.get_static_field("android/os/Build$VERSION", "SDK_INT", "I").and_then(|v| v.i()).unwrap_or(26)
    }

    fn manager<'a>(env: &mut JNIEnv<'a>, ctx: &JObject) -> jni::errors::Result<JObject<'a>> {
        let name = env.new_string("notification")?;
        env.call_method(ctx, "getSystemService", "(Ljava/lang/String;)Ljava/lang/Object;", &[JValue::Object(&name)])?.l()
    }

    fn create_channels(env: &mut JNIEnv, ctx: &JObject) -> jni::errors::Result<()> {
        let nm = manager(env, ctx)?;
        for (id, name, importance) in CHANNELS {
            let jid = env.new_string(id)?;
            let jname = env.new_string(name)?;
            let ch = env.new_object(
                "android/app/NotificationChannel",
                "(Ljava/lang/String;Ljava/lang/CharSequence;I)V",
                &[JValue::Object(&jid), JValue::Object(&jname), JValue::Int(importance)],
            )?;
            env.call_method(&nm, "createNotificationChannel", "(Landroid/app/NotificationChannel;)V", &[JValue::Object(&ch)])?;
        }
        Ok(())
    }

    // Android 13+ asks the person before an app may post notifications.
    fn request_permission(env: &mut JNIEnv, ctx: &JObject) -> jni::errors::Result<()> {
        if sdk(env) < 33 {
            return Ok(());
        }
        let perm = env.new_string("android.permission.POST_NOTIFICATIONS")?;
        let granted = env.call_method(ctx, "checkSelfPermission", "(Ljava/lang/String;)I", &[JValue::Object(&perm)])?.i()?;
        if granted != 0 {
            let arr = env.new_object_array(1, "java/lang/String", &perm)?;
            env.call_method(ctx, "requestPermissions", "([Ljava/lang/String;I)V", &[JValue::Object(&arr), JValue::Int(7)])?;
        }
        Ok(())
    }

    /// Open the system file picker (MainActivity.pickMedia). Results arrive in crate::picker.
    pub fn pick_media(mime: &str, request: i32, multiple: bool) {
        with_env(|env, ctx| {
            let m = env.new_string(mime)?;
            env.call_method(ctx, "pickMedia", "(Ljava/lang/String;IZ)V", &[JValue::Object(&m), JValue::Int(request), JValue::Bool(multiple as u8)])?;
            Ok(())
        });
    }

    pub fn open_url(url: &str) {
        with_env(|env, ctx| {
            let u = env.new_string(url)?;
            env.call_method(ctx, "openUrl", "(Ljava/lang/String;)V", &[JValue::Object(&u)])?;
            Ok(())
        });
    }

    pub fn share_text(text: &str) -> bool {
        let mut ok = false;
        with_env(|env, ctx| {
            let t = env.new_string(text)?;
            env.call_method(ctx, "shareText", "(Ljava/lang/String;)V", &[JValue::Object(&t)])?;
            ok = true;
            Ok(())
        });
        ok
    }

    /// Is the app on screen right now?
    pub fn in_foreground() -> bool {
        let mut focused = true;
        with_env(|env, ctx| {
            focused = env.call_method(ctx, "hasWindowFocus", "()Z", &[])?.z()?;
            Ok(())
        });
        focused
    }

    pub fn show(id: i32, channel: &str, title: &str, text: &str) {
        with_env(|env, ctx| {
            let nm = manager(env, ctx)?;
            let jchannel = env.new_string(channel)?;
            let b = env.new_object(
                "android/app/Notification$Builder",
                "(Landroid/content/Context;Ljava/lang/String;)V",
                &[JValue::Object(ctx), JValue::Object(&jchannel)],
            )?;
            // Small icon: the monochrome 3itter mark from res/drawable, else the app icon.
            let res = env.call_method(ctx, "getResources", "()Landroid/content/res/Resources;", &[])?.l()?;
            let pkg = env.call_method(ctx, "getPackageName", "()Ljava/lang/String;", &[])?.l()?;
            let name = env.new_string("ic_stat_3itter")?;
            let kind = env.new_string("drawable")?;
            let mut icon = env.call_method(&res, "getIdentifier", "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)I",
                &[JValue::Object(&name), JValue::Object(&kind), JValue::Object(&pkg)])?.i()?;
            if icon == 0 {
                let info = env.call_method(ctx, "getApplicationInfo", "()Landroid/content/pm/ApplicationInfo;", &[])?.l()?;
                icon = env.get_field(&info, "icon", "I")?.i()?;
            }
            const B: &str = "Landroid/app/Notification$Builder;";
            env.call_method(&b, "setSmallIcon", format!("(I){B}"), &[JValue::Int(icon)])?;
            let jt = env.new_string(title)?;
            env.call_method(&b, "setContentTitle", format!("(Ljava/lang/CharSequence;){B}"), &[JValue::Object(&jt)])?;
            let jx = env.new_string(text)?;
            env.call_method(&b, "setContentText", format!("(Ljava/lang/CharSequence;){B}"), &[JValue::Object(&jx)])?;
            env.call_method(&b, "setAutoCancel", format!("(Z){B}"), &[JValue::Bool(1)])?;
            env.call_method(&b, "setColor", format!("(I){B}"), &[JValue::Int(0xFF6A4FE0u32 as i32)])?;
            // Tapping opens the app.
            let pm = env.call_method(ctx, "getPackageManager", "()Landroid/content/pm/PackageManager;", &[])?.l()?;
            let intent = env.call_method(&pm, "getLaunchIntentForPackage", "(Ljava/lang/String;)Landroid/content/Intent;", &[JValue::Object(&pkg)])?.l()?;
            if !intent.is_null() {
                let flags = 0x0400_0000 | 0x0800_0000; // FLAG_IMMUTABLE | FLAG_UPDATE_CURRENT
                let pi = env.call_static_method(
                    "android/app/PendingIntent",
                    "getActivity",
                    "(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;",
                    &[JValue::Object(ctx), JValue::Int(id), JValue::Object(&intent), JValue::Int(flags)],
                )?.l()?;
                env.call_method(&b, "setContentIntent", format!("(Landroid/app/PendingIntent;){B}"), &[JValue::Object(&pi)])?;
            }
            let n = env.call_method(&b, "build", "()Landroid/app/Notification;", &[])?.l()?;
            env.call_method(&nm, "notify", "(ILandroid/app/Notification;)V", &[JValue::Int(id), JValue::Object(&n)])?;
            Ok(())
        });
    }
}

#[cfg(not(target_os = "android"))]
mod imp {
    pub fn in_foreground() -> bool {
        true
    }
    /// Desktop: ITTER_PICK=file1,file2 stands in for the system picker (used by the headless tests).
    pub fn pick_media(_mime: &str, request: i32, _multiple: bool) {
        let files = std::env::var("ITTER_PICK").unwrap_or_default();
        for path in files.split(',').filter(|p| !p.is_empty()) {
            if let Ok(bytes) = std::fs::read(path) {
                let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
                let mime = match ext.as_str() {
                    "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "gif" => "image/gif", "webp" => "image/webp",
                    "mp4" => "video/mp4", "webm" => "video/webm", "mov" => "video/quicktime", _ => "",
                };
                crate::picker::push(request, mime.to_string(), bytes);
            }
        }
        crate::picker::done(request);
    }
    pub fn open_url(url: &str) {
        eprintln!("[open] {url}");
    }
    pub fn share_text(_text: &str) -> bool {
        false
    }
    pub fn show(_id: i32, _channel: &str, title: &str, text: &str) {
        eprintln!("[notification] {title}: {text}");
    }
}

pub use imp::*;
