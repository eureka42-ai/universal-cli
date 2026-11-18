fn main() {
    use std::{env, fs, path::PathBuf, process::Command};
    println!("cargo:rerun-if-changed=runner/main.rs");
    let target = env::var("TARGET").expect("Cargo target is required");
    let extension = if target.contains("windows") { ".exe" } else { "" };
    let binaries = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap()).join("binaries");
    fs::create_dir_all(&binaries).expect("create launcher directory");
    let output = binaries.join(format!("eureka42-agent-runner-{target}{extension}"));
    let mut compiler = Command::new(env::var_os("RUSTC").unwrap_or_else(|| "rustc".into()));
    compiler.args(["--edition=2021", "--crate-name", "eureka42_agent_runner", "--target", &target, "-C", "opt-level=2", "runner/main.rs", "-o"]);
    compiler.arg(&output);
    if let Ok(flags) = env::var("CARGO_ENCODED_RUSTFLAGS") {
        compiler.args(flags.split('\u{1f}').filter(|flag| !flag.is_empty()));
    }
    let linker_key = format!("CARGO_TARGET_{}_LINKER", target.replace('-', "_").to_uppercase());
    if let Some(linker) = env::var_os(linker_key) {
        compiler.arg("-C").arg(format!("linker={}", linker.to_string_lossy()));
    }
    assert!(compiler.status().expect("compile console launcher").success(), "console launcher compilation failed");
    println!("cargo:rustc-env=EUREKA42_RUNNER_BUILD_PATH={}", output.display());
    tauri_build::build()
}
