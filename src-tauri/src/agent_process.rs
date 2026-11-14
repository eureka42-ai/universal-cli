//! Batch launchers need cmd.exe on Windows. Let Rust's process API do its
//! platform-specific escaping, including for npm shims, instead of composing
//! shell strings in the PTY layer. The same executable acts as a small bridge
//! and inherits the real ConPTY handles and working directory.
use std::{path::Path, process::Command};

pub(crate) const LAUNCHER_FLAG: &str = "--eureka42-internal-agent";

pub(crate) fn command(executable: &Path) -> Command {
    let mut command = Command::new(executable);
    let paths = crate::agents::executable_search_dirs();
    if let Ok(path) = std::env::join_paths(paths) {
        command.env("PATH", path);
    }
    command
}

pub(crate) fn pty_command(executable: &Path) -> Result<portable_pty::CommandBuilder, String> {
    let mut command = if cfg!(windows)
        && executable.extension().and_then(|value| value.to_str()).is_some_and(|extension| {
            extension.eq_ignore_ascii_case("cmd") || extension.eq_ignore_ascii_case("bat")
        })
    {
        let current = std::env::current_exe()
            .map_err(|error| format!("não foi possível localizar o lançador: {error}"))?;
        let mut bridge = portable_pty::CommandBuilder::new(current);
        bridge.args([std::ffi::OsStr::new(LAUNCHER_FLAG), executable.as_os_str()]);
        bridge
    } else {
        portable_pty::CommandBuilder::new(executable)
    };
    if let Ok(path) = std::env::join_paths(crate::agents::executable_search_dirs()) {
        command.env("PATH", path);
    }
    Ok(command)
}

/// Called before initializing Tauri. No shell text or IPC command is evaluated.
pub fn run_launcher() -> Option<i32> {
    let mut args = std::env::args_os().skip(1);
    if args.next().as_deref() != Some(std::ffi::OsStr::new(LAUNCHER_FLAG)) {
        return None;
    }
    let Some(executable) = args.next() else {
        eprintln!("Eureka42: executável do agente ausente");
        return Some(2);
    };
    Some(match command(Path::new(&executable)).args(args).status() {
        Ok(status) => status.code().unwrap_or(1),
        Err(error) => {
            eprintln!("Eureka42: falha ao iniciar agente: {error}");
            1
        }
    })
}

#[cfg(windows)]
pub(crate) fn terminate_tree(pid: u32) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let system = std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into());
    let status = Command::new(std::path::PathBuf::from(system).join("System32/taskkill.exe"))
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(0x08000000)
        .stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null())
        .status().map_err(|error| format!("falha ao encerrar processos do agente: {error}"))?;
    if status.success() { Ok(()) } else { Err("não foi possível encerrar a árvore de processos do agente".into()) }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn batch_path_with_spaces_and_unicode_runs_without_shell_concatenation() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("agente com espaços.cmd");
        std::fs::write(&path, "@echo off\r\necho VERSION_OK\r\nexit /b 0\r\n").unwrap();
        let output = command(&path).arg("--version").output().unwrap();
        assert!(output.status.success());
        assert!(String::from_utf8_lossy(&output.stdout).contains("VERSION_OK"));
    }
}
