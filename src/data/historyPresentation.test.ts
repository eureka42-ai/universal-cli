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
