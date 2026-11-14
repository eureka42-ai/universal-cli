//! Console-subsystem bridge for batch CLIs. Keep this independent of Tauri:
//! a Windows GUI executable does not inherit ConPTY stdio like a console app.
use std::{ffi::OsStr, process::Command};

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn SetConsoleCtrlHandler(handler: Option<unsafe extern "system" fn(u32) -> i32>, add: i32) -> i32;
}

#[cfg(windows)]
unsafe extern "system" fn keep_bridge_alive(event: u32) -> i32 {
    // Only the bridge ignores interruption. A callback (rather than a NULL
    // handler) leaves the child's own Ctrl+C behavior and permissions intact.
    if event == 0 || event == 1 { 1 } else { 0 }
}

fn main() {
    let mut args = std::env::args_os().skip(1);
    if args.next().as_deref() != Some(OsStr::new("--eureka42-internal-agent")) {
        eprintln!("Eureka42: lançador reservado ao aplicativo.");
        std::process::exit(2);
    }
    let Some(executable) = args.next() else {
        eprintln!("Eureka42: executável do agente ausente.");
        std::process::exit(2);
    };
    #[cfg(windows)]
    unsafe { SetConsoleCtrlHandler(Some(keep_bridge_alive), 1); }
    let code = match Command::new(executable).args(args).status() {
        Ok(status) => status.code().unwrap_or(1),
        Err(error) => { eprintln!("Eureka42: falha ao iniciar agente: {error}"); 1 }
    };
    std::process::exit(code);
}
