import type { TerminalEvent } from "../services/history";

/** A readable terminal preview, not a reconstructed structured conversation. */
export function terminalText(text: string): string {
  return text
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[P^_][\s\S]*?\x1b\\/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[@-Z\\-_]/g, "")
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

export function sessionText(events: TerminalEvent[]): string {
  return terminalText(events.filter(event => event.direction !== "INPUT").map(event => event.text).join(""));
}
