// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FirstRunDialog } from "../components/FirstRunDialog";
import { LANGUAGES, getLanguage, setLanguage, setupCompleted, suggestedLanguage, t, useLanguage } from ".";
import { translations } from "./translations";
import { useAppliedTheme } from "../hooks/useAppliedTheme";
const mock = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock("../services/settings", () => ({ getAppSettings: mock.get, updateAppSettings: mock.update }));
vi.mock("../services/terminal", () => ({ isTauriRuntime: () => true }));
const settings = { theme: "dark", captureTerminalEvents: false, retentionDays: 30, contextCarryoverEnabled: false, cloudSyncEnabled: false, cloudProvider: "", googleClientId: "", onedriveClientId: "", cloudAccount: "" };
function Setup({ done = vi.fn() }: { done?: () => void }) { useLanguage(); return <FirstRunDialog onComplete={done} />; }
beforeEach(() => { localStorage.clear(); setLanguage("pt-BR", false); vi.clearAllMocks(); mock.get.mockResolvedValue(settings); mock.update.mockImplementation(async value => value); vi.spyOn(navigator, "language", "get").mockReturnValue("pt-BR"); });
afterEach(() => { cleanup(); setLanguage("pt-BR", false); vi.restoreAllMocks(); });
describe("language preferences", () => {
  it("offers the same 15 languages as the reference site and handles regional browser locales", () => { expect(LANGUAGES).toHaveLength(15); expect(suggestedLanguage("ja-JP")).toBe("ja"); expect(suggestedLanguage("pt-PT")).toBe("pt-BR"); expect(suggestedLanguage("xx")).toBe("en"); });
  it("provides translated setup, navigation and actions in every language without losing placeholders", () => { for (const [language] of LANGUAGES) { setLanguage(language, false); expect(t("Idioma")).toBeTruthy(); expect(t("{0} CLIs disponíveis", {0: 4})).toContain("4"); if (language !== "pt-BR") { expect(translations[language]["Começar a usar"]).toBeTruthy(); expect(translations[language]["Histórico do projeto"]).toBeTruthy(); } } });
  it("persists language and restores RTL when switching between Arabic and other languages", () => { setLanguage("ar"); expect(document.documentElement.dir).toBe("rtl"); expect(localStorage.getItem("eureka42.language")).toBe("ar"); setLanguage("ja"); expect(document.documentElement.dir).toBe("ltr"); expect(document.documentElement.lang).toBe("ja"); expect(t("Novo projeto")).toBe("新規プロジェクト"); expect(t("CAFE-42")).toBe("CAFE-42"); });
});
describe("first-run setup", () => {
  it("asks once, defaults to System, and preserves privacy/cloud preferences when saving", async () => { const done = vi.fn(); render(<Setup done={done} />); expect(screen.getAllByRole("option")).toHaveLength(15); expect(screen.getByRole("button", {name:"Sistema"}).getAttribute("aria-pressed")).toBe("true"); fireEvent.click(screen.getByRole("button", {name:"Começar a usar"})); await waitFor(() => expect(done).toHaveBeenCalledOnce()); expect(mock.update).toHaveBeenCalledWith({...settings,theme:"system"}); expect(setupCompleted()).toBe(true); });
  it("previews another language, saves the selected dark theme and persists the language", async () => { render(<Setup />); fireEvent.change(screen.getByRole("combobox"), {target:{value:"en"}}); expect(screen.getByRole("heading", {name:"Make it yours."})).toBeTruthy(); fireEvent.click(screen.getByRole("button", {name:"Dark"})); fireEvent.click(screen.getByRole("button", {name:"Get started"})); await waitFor(() => expect(setupCompleted()).toBe(true)); expect(mock.update).toHaveBeenCalledWith({...settings,theme:"dark"}); expect(getLanguage()).toBe("en"); expect(localStorage.getItem("eureka42.language")).toBe("en"); });
  it("keeps setup pending and allows retry when settings cannot be saved", async () => { mock.update.mockRejectedValueOnce(new Error("offline storage")); render(<Setup />); fireEvent.click(screen.getByRole("button", {name:"Começar a usar"})); expect(await screen.findByRole("alert")).toBeTruthy(); expect(setupCompleted()).toBe(false); fireEvent.click(screen.getByRole("button", {name:"Começar a usar"})); await waitFor(() => expect(setupCompleted()).toBe(true)); });
  it("keeps keyboard focus inside the initial dialog", () => { render(<Setup />); const last=screen.getByRole("button",{name:"Começar a usar"}); last.focus(); fireEvent.keyDown(last,{key:"Tab"}); expect(document.activeElement).toBe(screen.getByRole("combobox")); fireEvent.keyDown(screen.getByRole("combobox"),{key:"Tab",shiftKey:true}); expect(document.activeElement).toBe(last); });
});
describe("system theme", () => {
  it("follows OS changes only in System mode and removes its listener for a fixed theme", () => { let callback:()=>void=()=>{}; const remove=vi.fn(); const media={matches:false,addEventListener:vi.fn((_name,handler)=>{callback=handler;}),removeEventListener:remove}; vi.stubGlobal("matchMedia",()=>media); function Theme({value}:{value:"system"|"light"|"dark"}) { useAppliedTheme(value); return null; } const view=render(<Theme value="system"/>); expect(document.documentElement.dataset.theme).toBe("dark"); media.matches=true; callback(); expect(document.documentElement.dataset.theme).toBe("light"); view.rerender(<Theme value="dark"/>); expect(remove).toHaveBeenCalledOnce(); expect(document.documentElement.dataset.theme).toBe("dark"); vi.unstubAllGlobals(); });
});
