# 009 — Windows launchers, custom agents and regression QA

Date: 2026-11-14.

## Reproduced in the installed Windows application

Gemini was detected but CreateProcessW rejected the extensionless npm POSIX shim with Windows error 193. A failed attempt did not appear in History. Memory and completed tasks survived a restart. Context handoff produced a directory path without review/copy/open actions. Git displayed CLEAN for a directory without a repository.

## Changes

- Windows discovery prefers executable extensions, rejects extensionless POSIX shims and supports explicit executable paths. Known Node.js directories are included for npm launchers.
- Rust's standard process API launches batch files; the PTY starts the same application in an internal launcher mode, inheriting the ConPTY handles, arguments and working directory. No shell command string is built from project context.
- Custom IDs are resolved from the custom registry instead of being rejected by an early catalog lookup.
- Antigravity CLI uses the official command `agy` and the documented Windows directory `%LOCALAPPDATA%/agy/bin`. Reference: https://antigravity.google/docs/cli/tutorial/ . No resume capability is claimed without a local validation of that CLI.
- Launch attempts are recorded before PTY creation and failures are searchable. Diagnostics omit command arguments, which can contain project context. Later reader exits cannot overwrite terminal failures or explicit termination.
- Each visited project retains its own terminal workspace. Busy sessions cannot silently switch their agent label. Early output/exit events are buffered until the launch response arrives.
- Handoff has a valid initial route, review, copy and open-folder actions, and does not claim the context has been delivered. Package reads/opening are scoped to locally registered handoff directories.
- Git status, Windows path display and provenance labels are corrected. The agent picker shows paths/probe errors and supports rechecking and choosing an executable.

## Validation

- Windows frontend: `npm test` — 17 tests passed; `npm run build` passed.
- Native local test attempt reached dependency compilation, then failed because the GNU environment lacked `dlltool.exe`. This is an environment failure, not a passed native test.
- Added Windows batch resolution/version/custom-agent regressions, SQLite failed-attempt persistence, ConPTY smoke test, and Checks CI on Windows, macOS and Linux. Native results and updated-app user QA remain pending until executed.

The existing installed executable has not been replaced by these source changes. Authenticated cloud sync, provider model responses and the real Antigravity CLI are not yet claimed as tested.
