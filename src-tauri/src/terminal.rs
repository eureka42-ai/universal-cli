use crate::agents::{find_agent_executable, resume_args};
use crate::context;
use crate::projects::ProjectRepository;
use portable_pty::{native_pty_system, Child, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    env,
    io::{Read, Write},
    path::PathBuf,
    sync::Mutex,
    thread,
};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

pub struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct TerminalManager {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStarted {
    session_id: String,
    agent_id: String,
    working_directory: String,
    resumed: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutput {
    session_id: String,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalExited {
    session_id: String,
}

#[tauri::command]
pub fn launch_terminal(
    app: AppHandle,
    manager: State<'_, TerminalManager>,
    repository: State<'_, ProjectRepository>,
    agent_id: String,
    working_directory: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    resume: Option<bool>,
) -> Result<TerminalStarted, String> {
    let executable = find_agent_executable(&repository, &agent_id)
        .ok_or_else(|| format!("agente não instalado ou não permitido: {agent_id}"))?;
    let resumed = resume.unwrap_or(false);
    let resume_flags = if resumed {
        Some(
            resume_args(&agent_id)
                .ok_or_else(|| format!("retomada de sessão não suportada para {agent_id}"))?,
        )
    } else {
        None
    };
    let cwd = canonical_working_directory(working_directory)?;
    let cwd_string = cwd.to_string_lossy().into_owned();
    let project_id = repository
        .project_id_for_path(&cwd_string)
        .map_err(|error| format!("falha ao localizar projeto: {error}"))?
        .ok_or_else(|| "o diretório não pertence a um projeto ativo".to_string())?;
    let session_id = Uuid::new_v4().to_string();
    repository.record_session_started(&session_id, &project_id, &agent_id, &cwd_string, resumed)
        .map_err(|error| format!("falha ao registrar tentativa de sessão: {error}"))?;
    let fail = |stage: &str, error: String| {
        match repository.record_launch_failure(&session_id, stage) {
            Ok(()) => error,
            Err(record_error) => format!("{error}; falha ao registrar diagnóstico: {record_error}"),
        }
    };
    let size = checked_size(cols, rows)
        .map_err(|error| fail("Dimensões do terminal inválidas.", error))?;

    // Contexto universal entre conversas: mantém `.eureka42/contexto.md`
    // fresco no projeto e injeta o agregado em novas sessões dos agentes
    // com flag validada (hoje: Claude Code). Falha aqui nunca impede a
    // sessão — contexto é auxiliar, o PTY é o produto.
    let context_markdown = if repository.context_carryover_enabled().unwrap_or(false) {
        let _ = context::write_context_file(&repository, &project_id);
        if resumed {
            None
        } else {
            context::build_project_context(&repository, &project_id)
                .ok()
                .map(|context| context.markdown)
        }
    } else {
        None
    };

    let pair = native_pty_system()
        .openpty(size)
        .map_err(|error| fail("Falha ao abrir PTY.", format!("falha ao abrir PTY: {error}")))?;
    let mut command = crate::agent_process::pty_command(&executable)
        .map_err(|error| fail("Falha ao preparar lançador do agente.", error))?;
    if let Some(flags) = resume_flags {
        command.args(flags);
    }
    if let Some(markdown) = context_markdown {
        if let Some(flag) = context::context_injection_flag(&agent_id) {
            command.args([flag, markdown.as_str()]);
        }
    }
    command.cwd(crate::agent_process::working_directory(&cwd));
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| fail("Falha ao iniciar agente. Verifique o executável e seus pré-requisitos.", format!("falha ao iniciar agente: {error}")))?;
    drop(pair.slave);
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| { let _ = child.kill(); fail("Falha ao abrir saída do PTY.", format!("falha ao abrir saída do PTY: {error}")) })?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| { let _ = child.kill(); fail("Falha ao abrir entrada do PTY.", format!("falha ao abrir entrada do PTY: {error}")) })?;
    let output_session_id = session_id.clone();
    let output_repository = repository.inner().clone();
    let output_project_id = project_id.clone();

    manager
        .sessions
        .lock()
        .map_err(|_| { let _ = child.kill(); fail("Gerenciador de terminal indisponível.", "gerenciador de terminal indisponível".to_string()) })?
        .insert(
            session_id.clone(),
            TerminalSession {
                master: pair.master,
                writer,
                child,
            },
        );

    let reader_app = app.clone();
    let reader_repository = output_repository.clone();
    let reader_session_id = output_session_id.clone();
    let (drained_sender, drained_receiver) = std::sync::mpsc::channel();
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(length) => {
                    if reader_repository.should_capture_terminal_events().unwrap_or(false) {
                        let _ = reader_repository.record_terminal_event(&reader_session_id, "OUTPUT", &buffer[..length]);
                    }
                    let _ = reader_app.emit("terminal-output", TerminalOutput {
                        session_id: reader_session_id.clone(), data: buffer[..length].to_vec(),
                    });
                }
            }
        }
        let _ = drained_sender.send(());
    });

    // On ConPTY, EOF can depend on dropping the master. Observe process exit
    // independently so a finished child cannot keep its own terminal alive.
    thread::spawn(move || {
        let status = loop {
            let manager = app.state::<TerminalManager>();
            let mut sessions = match manager.sessions.lock() { Ok(sessions) => sessions, Err(_) => break "FAILED" };
            match sessions.get_mut(&output_session_id).map(|session| session.child.try_wait()) {
                None => break "EXITED", // Explicit close already recorded TERMINATED.
                Some(Ok(Some(exit))) => {
                    sessions.remove(&output_session_id);
                    break if exit.success() { "EXITED" } else { "FAILED" };
                }
                Some(Err(_)) => {
                    if let Some(mut session) = sessions.remove(&output_session_id) { let _ = session.child.kill(); }
                    break "FAILED";
                }
                Some(Ok(None)) => {}
            }
            drop(sessions);
            thread::sleep(std::time::Duration::from_millis(100));
        };
        let _ = output_repository.mark_session_ended(&output_session_id, status);
        let _ = drained_receiver.recv_timeout(std::time::Duration::from_secs(5));
        let _ = context::write_context_file(&output_repository, &output_project_id);
        let _ = app.emit("terminal-exited", TerminalExited { session_id: output_session_id });
    });

    Ok(TerminalStarted {
        session_id,
        agent_id,
        working_directory: cwd_string,
        resumed,
    })
}

#[tauri::command]
pub fn send_terminal_input(
    manager: State<'_, TerminalManager>,
    repository: State<'_, ProjectRepository>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let mut sessions = manager
        .sessions
        .lock()
        .map_err(|_| "gerenciador de terminal indisponível".to_string())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| "sessão de terminal não encontrada".to_string())?;
    session
        .writer
        .write_all(&data)
        .and_then(|_| session.writer.flush())
        .map_err(|error| format!("falha ao escrever no PTY: {error}"))?;
    if repository
        .should_capture_terminal_events()
        .map_err(|error| format!("falha ao ler configuração de captura: {error}"))?
    {
        repository
            .record_terminal_event(&session_id, "INPUT", &data)
            .map_err(|error| format!("falha ao registrar entrada: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn resize_terminal(
    manager: State<'_, TerminalManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let size = checked_size(Some(cols), Some(rows))?;
    let sessions = manager
        .sessions
        .lock()
        .map_err(|_| "gerenciador de terminal indisponível".to_string())?;
    sessions
        .get(&session_id)
        .ok_or_else(|| "sessão de terminal não encontrada".to_string())?
        .master
        .resize(size)
        .map_err(|error| format!("falha ao redimensionar PTY: {error}"))
}

#[tauri::command]
pub fn close_terminal(
    manager: State<'_, TerminalManager>,
    repository: State<'_, ProjectRepository>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = manager.sessions.lock()
        .map_err(|_| "gerenciador de terminal indisponível".to_string())?;
    let Some(session) = sessions.get_mut(&session_id) else { return Ok(()); };
    if session.child.try_wait().map_err(|error| error.to_string())?.is_none() {
        #[cfg(windows)]
        if let Some(pid) = session.child.process_id() {
            if let Err(error) = crate::agent_process::terminate_tree(pid) {
                if session.child.try_wait().map_err(|error| error.to_string())?.is_none() { return Err(error); }
            }
        }
        #[cfg(not(windows))]
        session.child.kill().map_err(|error| format!("falha ao encerrar agente: {error}"))?;
    }
    repository.mark_session_ended(&session_id, "TERMINATED")
        .map_err(|error| format!("falha ao finalizar registro: {error}"))?;
    sessions.remove(&session_id);
    Ok(())
}

fn canonical_working_directory(requested: Option<String>) -> Result<PathBuf, String> {
    let path = match requested {
        Some(value) => PathBuf::from(value),
        None => env::current_dir().map_err(|error| format!("cwd indisponível: {error}"))?,
    };
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("diretório inválido: {error}"))?;
    if !canonical.is_dir() {
        return Err("o diretório de trabalho não é uma pasta".into());
    }
    Ok(canonical)
}

fn checked_size(cols: Option<u16>, rows: Option<u16>) -> Result<PtySize, String> {
    let cols = cols.unwrap_or(120);
    let rows = rows.unwrap_or(32);
    if !(2..=1000).contains(&cols) || !(2..=500).contains(&rows) {
        return Err("dimensões de terminal fora do intervalo permitido".into());
    }
    Ok(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use portable_pty::CommandBuilder;

    #[test]
    fn validates_terminal_dimensions() {
        assert!(checked_size(Some(1), Some(24)).is_err());
        assert!(checked_size(Some(80), Some(501)).is_err());
        assert!(checked_size(Some(80), Some(24)).is_ok());
    }

    #[test]
    fn rejects_missing_working_directory() {
        assert!(canonical_working_directory(Some("/definitely/missing/uai-cli".into())).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn windows_conpty_captures_real_output_in_unicode_working_directory() {
        let directory = tempfile::tempdir().unwrap();
        let cwd = directory.path().join("projeto com espaços e ação");
        std::fs::create_dir(&cwd).unwrap();
        let pair = native_pty_system().openpty(checked_size(Some(80), Some(24)).unwrap()).unwrap();
        let mut command = CommandBuilder::new(std::env::var_os("COMSPEC").unwrap_or_else(|| "cmd.exe".into()));
        command.args(["/d", "/c", "echo", "CONPTY_OK"]);
        command.cwd(cwd);
        let mut child = pair.slave.spawn_command(command).unwrap();
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut writer = pair.master.take_writer().unwrap();
        let (sender, receiver) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut sender = Some(sender);
            let mut output = Vec::new();
            let mut buffer = [0u8; 1024];
            let mut answered_cursor_query = false;
            while let Ok(length) = reader.read(&mut buffer) {
                if length == 0 { break; }
                output.extend_from_slice(&buffer[..length]);
                // portable-pty enables PSEUDOCONSOLE_INHERIT_CURSOR. A real
                // terminal (xterm.js) replies to this startup cursor query.
                if !answered_cursor_query && output.windows(4).any(|bytes| bytes == b"\x1b[6n") {
                    writer.write_all(b"\x1b[1;1R").unwrap();
                    writer.flush().unwrap();
                    answered_cursor_query = true;
                }
                if String::from_utf8_lossy(&output).contains("CONPTY_OK") {
                    if let Some(sender) = sender.take() { let _ = sender.send(String::from_utf8_lossy(&output).into_owned()); }
                }
            }
            if let Some(sender) = sender { let _ = sender.send(String::from_utf8_lossy(&output).into_owned()); }
        });
        let output = receiver.recv_timeout(std::time::Duration::from_secs(15));
        if output.is_err() { let _ = child.kill(); }
        assert!(output.unwrap().contains("CONPTY_OK"));
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        let status = loop {
            if let Some(status) = child.try_wait().unwrap() { break status; }
            if std::time::Instant::now() > deadline { let _ = child.kill(); panic!("process did not exit after printing the marker"); }
            std::thread::sleep(std::time::Duration::from_millis(25));
        };
        assert!(status.success());
        drop(pair.master);
    }

    #[cfg(unix)]
    #[test]
    fn unix_pty_captures_real_process_output() {
        let pair = native_pty_system()
            .openpty(checked_size(Some(80), Some(24)).unwrap())
            .unwrap();
        let mut command = CommandBuilder::new("/bin/sh");
        command.args(["-c", "printf 'PTY_OK\\n'"]);
        let mut child = pair.slave.spawn_command(command).unwrap();
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut output = String::new();
        reader.read_to_string(&mut output).unwrap();
        let status = child.wait().unwrap();
        assert!(status.success());
        assert!(output.contains("PTY_OK"));
    }
}
