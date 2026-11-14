#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(code) = universal_ai_cli_lib::agent_process::run_launcher() {
        std::process::exit(code);
    }
    universal_ai_cli_lib::run();
}
