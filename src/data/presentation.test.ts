import { describe, expect, it } from "vitest";
import { displayPath } from "./presentation";
describe("caminhos exibidos no Windows", () => {
  it("remove apenas o prefixo interno preservando espaços, Unicode e UNC", () => {
    expect(displayPath(String.raw`\\?\C:\Meu projeto\ação`)).toBe(String.raw`C:\Meu projeto\ação`);
    expect(displayPath(String.raw`\\?\UNC\servidor\pasta`)).toBe(String.raw`\\servidor\pasta`);
    expect(displayPath("/home/projeto")).toBe("/home/projeto");
  });
});
