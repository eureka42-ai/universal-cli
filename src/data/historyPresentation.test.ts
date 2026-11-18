import { expect, it } from "vitest";
import { sessionText, terminalText } from "./historyPresentation";

it("removes terminal color, cursor and window-title controls while preserving Unicode", () => {
  expect(terminalText("\x1b]0;secret title\x07\x1b[32mOlá CAFE-42\x1b[0m\r\n\x1b[2Kresposta"))
    .toBe("Olá CAFE-42\nresposta");
});

it("joins split ANSI sequences before stripping them and avoids duplicate input events", () => {
  const event = (id: number, text: string, direction = "OUTPUT") => ({ id, direction, text, createdAt: 1 });
  expect(sessionText([event(1, "\x1b[3"), event(2, "2mCAFE-42\x1b[0m"), event(3, "duplicated keystrokes", "INPUT")]))
    .toBe("CAFE-42");
});


it("consolidates cursor redraws instead of repeating superseded terminal text", async () => {
  const { sessionScreen } = await import("./historyPresentation");
  const event = (id: number, text: string) => ({ id, text, direction: "OUTPUT", createdAt: 1 });
  const text = await sessionScreen([event(1, "Processing 10%"), event(2, "\r\x1b[2KDone: CAFE-42\r\n")]);
  expect(text).toBe("Done: CAFE-42"); expect(text).not.toContain("Processing");
});
it("preserves scrollback and Unicode and does not include captured keystrokes twice", async () => {
  const { sessionScreen } = await import("./historyPresentation");
  expect(await sessionScreen([{ id: 1, text: "Olá 日本語\r\n", direction: "OUTPUT", createdAt: 1 }, { id: 2, text: "hidden keys", direction: "INPUT", createdAt: 1 }, { id: 3, text: "Resposta final", direction: "OUTPUT", createdAt: 2 }])).toBe("Olá 日本語\nResposta final");
});

it("replays original bytes so split UTF-8 and OSC titles survive IPC boundaries correctly", async () => {
  const { sessionScreen } = await import("./historyPresentation");
  const data = new TextEncoder().encode("\x1b]0;private window title\x07Olá 世界");
  const split = data.length - 2;
  const events = [{ id: 1, direction: "OUTPUT", text: "old lossy preview", data: Array.from(data.slice(0, split)), createdAt: 1 }, { id: 2, direction: "OUTPUT", text: "corrupted preview", data: Array.from(data.slice(split)), createdAt: 1 }];
  expect(sessionText(events)).toBe("Olá 世界");
  expect(await sessionScreen(events)).toBe("Olá 世界");
});
