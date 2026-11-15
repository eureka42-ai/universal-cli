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

export function sessionOutput(events: TerminalEvent[]): string {
  const decoder = new TextDecoder(); let output = "";
  for (const event of events) {
    if (event.direction === "INPUT") continue;
    output += event.data ? decoder.decode(new Uint8Array(event.data), { stream: true }) : decoder.decode() + event.text;
  }
  return output + decoder.decode();
}
export function sessionText(events: TerminalEvent[]): string { return terminalText(sessionOutput(events)); }

/** Replays cursor movements and erases locally; never executes terminal input. */
export async function sessionScreen(events: TerminalEvent[]): Promise<string> {
  const { Terminal } = await import("@xterm/headless");
  const terminal = new Terminal({ cols: 120, rows: 40, scrollback: 10000, allowProposedApi: true, logLevel: "off", convertEol: true });
  try {
    const output = sessionOutput(events);
    if (!output) return "";
    await new Promise<void>(resolve => terminal.write(output, resolve));
    const buffer = terminal.buffer.active;
    const lines: string[] = [];
    for (let index = 0; index < buffer.length; index++) {
      const line = buffer.getLine(index);
      if (!line) continue;
      const text = line.translateToString(true);
      if (line.isWrapped && lines.length) lines[lines.length - 1] += text;
      else lines.push(text);
    }
    return lines.join("\n").trim();
  } finally { terminal.dispose(); }
}

export function sessionDuration(startedAt: number, endedAt: number | null): string {
  if (endedAt === null) return "—";
  const seconds = Math.max(0, endedAt - startedAt);
  if (seconds < 60) return seconds + " s";
  if (seconds < 3600) return Math.floor(seconds / 60) + " min " + seconds % 60 + " s";
  return Math.floor(seconds / 3600) + " h " + Math.floor(seconds % 3600 / 60) + " min";
}
