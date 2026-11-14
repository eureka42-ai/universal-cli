//! Batch launchers need cmd.exe on Windows. Let Rust's process API do its
//! platform-specific escaping, including for npm shims, instead of composing
//! shell strings in the PTY layer. A console sidecar inherits ConPTY handles.
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
        let runner = current.with_file_name("eureka42-agent-runner.exe");
        #[cfg(debug_assertions)]
        let runner = if runner.is_file() { runner } else { std::path::PathBuf::from(env!("EUREKA42_RUNNER_BUILD_PATH")) };
        if !runner.is_file() { return Err("o lançador de console não está instalado; reinstale o Eureka42 com todos os arquivos do pacote".into()); }
        let mut bridge = portable_pty::CommandBuilder::new(runner);
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
    use std::io::{Read, Write};

    #[test]
    fn batch_console_sidecar_preserves_real_conpty_output() {
        let directory = tempfile::tempdir().unwrap();
        let cwd = directory.path().join("pasta com espaços & ação");
        std::fs::create_dir(&cwd).unwrap();
        let script = cwd.join("agente de teste.cmd");
        std::fs::write(&script, "@echo off\r\necho EUREKA_BATCH_OK\r\nexit /b 0\r\n").unwrap();
        let pair = portable_pty::native_pty_system().openpty(portable_pty::PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 }).unwrap();
        let mut command = pty_command(&script).unwrap();
        command.cwd(&cwd);
        let mut child = pair.slave.spawn_command(command).unwrap();
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut writer = pair.master.take_writer().unwrap();
        let (sender, receiver) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut sender = Some(sender);
            let mut output = Vec::new();
            let mut buffer = [0u8; 4096];
            let mut answered = false;
            while let Ok(length) = reader.read(&mut buffer) {
                if length == 0 { break; }
                output.extend_from_slice(&buffer[..length]);
                if !answered && output.windows(4).any(|bytes| bytes == b"\x1b[6n") {
                    writer.write_all(b"\x1b[1;1R").unwrap(); writer.flush().unwrap(); answered = true;
                }
                if String::from_utf8_lossy(&output).contains("EUREKA_BATCH_OK") {
                    if let Some(sender) = sender.take() { let _ = sender.send(output.clone()); }
                }
            }
            if let Some(sender) = sender { let _ = sender.send(output); }
        });
        let output = receiver.recv_timeout(std::time::Duration::from_secs(15));
        if output.is_err() { let _ = child.kill(); }
        assert!(String::from_utf8_lossy(&output.expect("batch output timed out")).contains("EUREKA_BATCH_OK"));
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        loop {
            if let Some(status) = child.try_wait().unwrap() { assert!(status.success()); break; }
            if std::time::Instant::now() > deadline { let _ = child.kill(); panic!("batch runner did not exit"); }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        drop(pair.master);
    }

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
