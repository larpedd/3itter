//! Desktop build of the native client, for development: `cargo run`.
//!
//! `ITTER_SCRIPT=steps.txt cargo run` renders headlessly with the software renderer and follows a
//! script instead of opening a window. One step per line:
//!   wait <ms> | shot <file.png> | click <x> <y> | type <text> | key back | call <callback> [arg]

use itter::{AppState, AppWindow};
use slint::platform::software_renderer::MinimalSoftwareWindow;
use slint::platform::{Platform, PointerEventButton, WindowAdapter, WindowEvent};
use slint::{ComponentHandle, LogicalPosition, PhysicalSize};
use std::rc::Rc;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

fn main() {
    let dir = std::env::var_os("ITTER_DATA").map(std::path::PathBuf::from).unwrap_or_else(|| {
        let home = std::env::var_os("HOME").map(std::path::PathBuf::from).unwrap_or_default();
        home.join(".local/share/3itter-native")
    });
    match std::env::var("ITTER_SCRIPT") {
        Ok(script) => headless(dir, &script),
        Err(_) => itter::run(dir).expect("3itter failed to start"),
    }
}

type Job = Box<dyn FnOnce() + Send>;

struct Headless {
    window: Rc<MinimalSoftwareWindow>,
    jobs: Mutex<Option<Receiver<Job>>>,
    tx: Sender<Job>,
    start: Instant,
}

struct Proxy(Sender<Job>);

impl slint::platform::EventLoopProxy for Proxy {
    fn quit_event_loop(&self) -> Result<(), slint::EventLoopError> {
        let _ = self.0.send(Box::new(|| std::process::exit(0)));
        Ok(())
    }
    fn invoke_from_event_loop(&self, event: Job) -> Result<(), slint::EventLoopError> {
        self.0.send(event).map_err(|_| slint::EventLoopError::EventLoopTerminated)
    }
}

impl Platform for Headless {
    fn create_window_adapter(&self) -> Result<Rc<dyn WindowAdapter>, slint::PlatformError> {
        Ok(self.window.clone())
    }
    fn duration_since_start(&self) -> Duration {
        self.start.elapsed()
    }
    fn new_event_loop_proxy(&self) -> Option<Box<dyn slint::platform::EventLoopProxy>> {
        Some(Box::new(Proxy(self.tx.clone())))
    }
    fn run_event_loop(&self) -> Result<(), slint::PlatformError> {
        let rx = self.jobs.lock().unwrap().take().expect("event loop already running");
        loop {
            slint::platform::update_timers_and_animations();
            while let Ok(job) = rx.try_recv() {
                job();
            }
            self.window.draw_if_needed(|_| {});
            let wait = slint::platform::duration_until_next_timer_update().unwrap_or(Duration::from_millis(16)).min(Duration::from_millis(16));
            if let Ok(job) = rx.recv_timeout(wait) {
                job();
            }
        }
    }
}

fn headless(dir: std::path::PathBuf, script: &str) {
    const SCALE: f32 = 2.0;
    let window = MinimalSoftwareWindow::new(Default::default());
    let (tx, rx) = channel::<Job>();
    slint::platform::set_platform(Box::new(Headless { window: window.clone(), jobs: Mutex::new(Some(rx)), tx, start: Instant::now() }))
        .expect("platform already set");
    window.dispatch_event(WindowEvent::ScaleFactorChanged { scale_factor: SCALE });
    window.set_size(PhysicalSize::new((412.0 * SCALE) as u32, (880.0 * SCALE) as u32));
    let steps = std::fs::read_to_string(script).expect("cannot read script");
    let out_dir = std::path::Path::new(script).parent().unwrap_or(std::path::Path::new(".")).to_path_buf();

    itter::run_with(dir, move |ui: &AppWindow| {
        let weak = ui.as_weak();
        std::thread::spawn(move || {
            for line in steps.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')) {
                let (cmd, rest) = line.split_once(' ').unwrap_or((line, ""));
                let rest = rest.to_string();
                if cmd == "wait" {
                    std::thread::sleep(Duration::from_millis(rest.parse().unwrap_or(500)));
                    continue;
                }
                let weak = weak.clone();
                let out_dir = out_dir.clone();
                let cmd = cmd.to_string();
                let (done_tx, done_rx) = channel::<()>();
                let _ = slint::invoke_from_event_loop(move || {
                    let ui = weak.upgrade().unwrap();
                    run_step(&ui, &cmd, &rest, &out_dir);
                    let _ = done_tx.send(());
                });
                let _ = done_rx.recv();
                std::thread::sleep(Duration::from_millis(120));
            }
            let _ = slint::invoke_from_event_loop(|| std::process::exit(0));
        });
    })
    .expect("3itter failed to start");
}

fn run_step(ui: &AppWindow, cmd: &str, rest: &str, out_dir: &std::path::Path) {
    let w = ui.window();
    match cmd {
        "shot" => {
            let snap = w.take_snapshot().expect("snapshot failed");
            let img = image::RgbaImage::from_raw(snap.width(), snap.height(), snap.as_bytes().to_vec()).unwrap();
            let path = out_dir.join(rest);
            img.save(&path).unwrap();
            println!("SHOT {}", path.display());
        }
        "click" => {
            let mut it = rest.split_whitespace().map(|v| v.parse::<f32>().unwrap_or(0.0));
            let position = LogicalPosition::new(it.next().unwrap_or(0.0), it.next().unwrap_or(0.0));
            w.dispatch_event(WindowEvent::PointerMoved { position });
            w.dispatch_event(WindowEvent::PointerPressed { position, button: PointerEventButton::Left });
            w.dispatch_event(WindowEvent::PointerReleased { position, button: PointerEventButton::Left });
            w.dispatch_event(WindowEvent::PointerExited);
        }
        "scroll" => {
            let mut it = rest.split_whitespace().map(|v| v.parse::<f32>().unwrap_or(0.0));
            let (x, y, dy) = (it.next().unwrap_or(200.0), it.next().unwrap_or(400.0), it.next().unwrap_or(-300.0));
            w.dispatch_event(WindowEvent::PointerScrolled { position: LogicalPosition::new(x, y), delta_x: 0.0, delta_y: dy });
        }
        "type" => {
            for ch in rest.chars() {
                let text = slint::SharedString::from(ch.to_string());
                w.dispatch_event(WindowEvent::KeyPressed { text: text.clone() });
                w.dispatch_event(WindowEvent::KeyReleased { text });
            }
        }
        "enter" => {
            let text = slint::SharedString::from(slint::platform::Key::Return);
            w.dispatch_event(WindowEvent::KeyPressed { text: text.clone() });
            w.dispatch_event(WindowEvent::KeyReleased { text });
        }
        "key" if rest == "back" => ui.global::<AppState>().invoke_back(),
        "call" => {
            let s = ui.global::<AppState>();
            let (name, arg) = rest.split_once(' ').unwrap_or((rest, ""));
            match name {
                "connect" => s.invoke_connect(arg.into()),
                "navigate" => s.invoke_navigate(arg.into()),
                "open-post" => s.invoke_open_post(arg.parse().unwrap_or(1)),
                "open-user" => s.invoke_open_user(arg.into()),
                "open-chat" => s.invoke_open_chat(arg.into()),
                "compose" => s.invoke_compose(),
                "search" => s.invoke_search(arg.into(), "posts".into()),
                "search-people" => s.invoke_search(arg.into(), "people".into()),
                "post-menu" => s.invoke_post_menu(arg.parse().unwrap_or(1)),
                "like" => s.invoke_like(arg.parse().unwrap_or(1)),
                "set-language" => s.invoke_set_language(arg.into()),
                "logout" => s.invoke_logout(),
                "refresh" => s.invoke_refresh(),
                "pick-images" => s.invoke_compose_pick_images(),
                "pick-video" => s.invoke_compose_pick_video(),
                "poll" => s.set_compose_poll(true),
                "policy-menu" => s.invoke_compose_policy_menu(),
                "schedule-menu" => s.invoke_compose_schedule_menu(),
                "sheet-pick" => s.invoke_sheet_pick(arg.parse().unwrap_or(0)),
                "theme" => s.invoke_set_theme(arg.into()),
                "login" => {
                    let (h, p) = arg.split_once(' ').unwrap_or((arg, ""));
                    s.invoke_login(h.into(), p.into())
                }
                other => eprintln!("unknown call {other}"),
            }
        }
        other => eprintln!("unknown step {other}"),
    }
}
