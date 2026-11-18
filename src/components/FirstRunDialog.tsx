import { useEffect, useRef, useState } from "react";
import { LANGUAGES, completeSetup, setLanguage, suggestedLanguage, t, type Language } from "../i18n";
import { getAppSettings, updateAppSettings, type AppSettings, type ThemePreference } from "../services/settings";
import { isTauriRuntime } from "../services/terminal";
import logo from "../assets/brand/logo-claro.svg";
export function FirstRunDialog({ onComplete }: { onComplete(settings?: AppSettings): void }) {
  const [language, chooseLanguage] = useState<Language>(() => suggestedLanguage());
  useEffect(() => { setLanguage(language, false); }, [language]);
  const [theme, setTheme] = useState<ThemePreference>("system");
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => { dialog.current?.querySelector<HTMLSelectElement>("select")?.focus(); }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function start() {
    if (busy) return;
    setBusy(true); setError(false);
    try {
      let settings: AppSettings | undefined;
      if (isTauriRuntime()) settings = await updateAppSettings({ ...await getAppSettings(), theme });
      setLanguage(language); completeSetup(); onComplete(settings);
    } catch { setError(true); setBusy(false); }
  }
  return <div className="setup-backdrop"><section ref={dialog} onKeyDown={event => { if (event.key !== "Tab") return; const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>("select,button:not(:disabled)") ?? []); const first = nodes[0], last = nodes.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }} className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title">
    <img src={logo} alt="Eureka42" className="setup-logo" />
    <span className="eyebrow">{t("SEU ESPAÇO DE TRABALHO")}</span>
    <h1 id="setup-title">{t("Vamos deixar do seu jeito.")}</h1>
    <p>{t("Escolha seu idioma e a aparência. Você pode mudar essas opções nas Configurações a qualquer momento.")}</p>
    <label className="setup-language"><span>{t("Idioma")}</span><select aria-label={t("Idioma")} value={language} onChange={event => { const value = event.target.value as Language; chooseLanguage(value);  }}>
      {LANGUAGES.map(([code, label]) => <option key={code} value={code} lang={code}>{label}</option>)}
    </select></label>
    <fieldset className="setup-themes"><legend>{t("Aparência")}</legend><div>
      {([["system", "Sistema"], ["light", "Claro"], ["dark", "Escuro"]] as const).map(([value, label]) => <button key={value} className={theme === value ? "setup-theme setup-theme--selected" : "setup-theme"} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}><span className={"theme-swatch theme-swatch--" + value} aria-hidden="true"><i /><i /><i /></span>{t(label)}</button>)}
    </div></fieldset>
    <p className="setup-system-note">{t("Sistema acompanha automaticamente o tema do seu computador.")}</p>
    <div className="setup-local"><strong>{t("Seu trabalho fica com você")}</strong><p>{t("Comece sem criar conta. A sincronização com sua nuvem é opcional e pode ser configurada depois.")}</p></div>
    {error ? <p role="alert">{t("Não foi possível salvar. Tente novamente.")}</p> : null}
    <button className="primary-button setup-start" disabled={busy} onClick={() => void start()}>{busy ? t("Salvando…") : t("Começar a usar")} <span aria-hidden="true">↗</span></button>
    <small>Eureka42 · v0.2.0</small>
  </section></div>;
}
