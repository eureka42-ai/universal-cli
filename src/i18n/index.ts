import { useSyncExternalStore } from "react";
import { translations } from "./translations";
export const LANGUAGES = [
  ["pt-BR", "Português"], ["en", "English"], ["it", "Italiano"], ["es", "Español"],
  ["fr", "Français"], ["de", "Deutsch"], ["nl", "Nederlands"], ["pl", "Polski"],
  ["ru", "Русский"], ["tr", "Türkçe"], ["ar", "العربية"], ["hi", "हिन्दी"],
  ["ja", "日本語"], ["ko", "한국어"], ["zh", "中文"]
] as const;
export type Language = typeof LANGUAGES[number][0];
const LANGUAGE_KEY = "eureka42.language";
const SETUP_KEY = "eureka42.setup.completed";
const listeners = new Set<() => void>();
export function isLanguage(value: unknown): value is Language { return LANGUAGES.some(([code]) => code === value); }
function stored(key: string) { try { return typeof window === "undefined" ? null : window.localStorage.getItem(key); } catch { return null; } }
const initial = stored(LANGUAGE_KEY);
let language: Language = isLanguage(initial) ? initial : "pt-BR";
export function getLanguage() { return language; }
export function suggestedLanguage(value = navigator.language): Language {
  return LANGUAGES.find(([code]) => code.split("-")[0] === value.split("-")[0])?.[0] ?? "en";
}
export function setLanguage(next: Language, persist = true) {
  if (!isLanguage(next)) return;
  language = next;
  if (persist) { try { window.localStorage.setItem(LANGUAGE_KEY, next); } catch { /* in-memory preference still works */ } }
  document.documentElement.lang = next;
  document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
  listeners.forEach(listener => listener());
}
export function useLanguage() { return useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback); }, getLanguage); }
export function setupCompleted() { return stored(SETUP_KEY) === "1"; }
export function completeSetup() { try { window.localStorage.setItem(SETUP_KEY, "1"); } catch { /* no persistent storage */ } }
export function t(source: string, values: Record<string, unknown> = {}) {
  const key = source.trim();
  const translated = language === "pt-BR" ? key : translations[language]?.[key] ?? translations.en?.[key] ?? key;
  const text = source.replace(key, () => translated);
  return text.replace(/\{([\w]+)\}/g, (match, key: string) => Object.hasOwn(values, key) ? String(values[key]) : match);
}
