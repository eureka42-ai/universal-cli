import { LANGUAGES, useLanguage, getLanguage, setLanguage, t, type Language } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { getAppSettings, updateAppSettings, type AppSettings, type ThemePreference } from "../services/settings";
import { connectCloud, disconnectCloud, getCloudStatus, setCloudPassphrase, testCloudConnection, type CloudStatus } from "../services/sync";
import { isTauriRuntime } from "../services/terminal";
import { StorageInfo } from "./StorageInfo";
import { modifierLabel } from "../data/presentation";

export type SettingsSection = "account" | "privacy" | "general" | "cloud";

const defaults: AppSettings = { captureTerminalEvents: true, retentionDays: 90, theme: "system", cloudSyncEnabled: false, contextCarryoverEnabled: true, cloudProvider: "", googleClientId: "", onedriveClientId: "", cloudAccount: "" };

const SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: `${modifierLabel} + K`, description: "Focar os comandos do aplicativo no terminal ativo" },
  { keys: `${modifierLabel} + N`, description: "Abrir um novo terminal (até 6 por projeto)" },
  { keys: `${modifierLabel} + ,`, description: "Abrir Configurações" },
  { keys: "Esc", description: "Fechar a janela em foco (Configurações, Transferir contexto, detalhes de sessão)" }
];

const PROVIDERS = [
  { id: "google", label: "Google Drive" },
  { id: "onedrive", label: "OneDrive" }
] as const;

export function SettingsDialog({ open, onClose, onSettingsSaved, initialSection = "account" }: { open: boolean; initialSection?: SettingsSection; onClose(): void; onSettingsSaved?(settings: AppSettings): void }) {
  const language = useLanguage();
  const openingLanguage = useRef(language);
  useEffect(() => {
    if (!open) return;
    openingLanguage.current = getLanguage();
    return () => setLanguage(openingLanguage.current, false);
  }, [open]);
  const [settings, setSettings] = useState(defaults);
  const [section, setSection] = useState<"account" | "privacy" | "general" | "cloud">("account");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("idle");
  const [cloudStatus, setCloudStatus] = useState<CloudStatus | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [credentialStatus, setCredentialStatus] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [oauthBusy, setOauthBusy] = useState(false);

  useEffect(() => { if (open) setSection(initialSection); }, [open, initialSection]);

  useEffect(() => {
    if (!open || !isTauriRuntime()) return;
    let current = true;
    setStatus("loading");
    Promise.all([getAppSettings(), getCloudStatus().catch(() => null)]).then(([value, cloud]) => {
      if (current) { setSettings(value); setCloudStatus(cloud); setStatus("idle"); }
    }).catch(() => { if (current) setStatus("error"); });
    return () => { current = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  async function save() {
    if (!isTauriRuntime()) return;
    setStatus("saving");
    try { const saved = await updateAppSettings(settings); setSettings(saved); setStatus("saved"); setLanguage(language); openingLanguage.current = language; onSettingsSaved?.(saved); }
    catch { setStatus("error"); }
  }

  function setTheme(theme: ThemePreference) { setSettings((current) => ({ ...current, theme })); }

  async function saveCloudSection() {
    if (!isTauriRuntime()) return;
    if (passphrase && passphrase !== passphraseConfirm) { setCredentialStatus("As duas frases de criptografia digitadas são diferentes."); return; }
    setCredentialStatus("Salvando…");
    try {
      const saved = await updateAppSettings(settings);
      setSettings(saved);
      onSettingsSaved?.(saved);
      if (passphrase) {
        await setCloudPassphrase(passphrase);
        setPassphrase(""); setPassphraseConfirm("");
      }
      setCredentialStatus("Configuração da nuvem salva.");
      setCloudStatus(await getCloudStatus());
    } catch (error) { setCredentialStatus(String(error)); }
  }

  async function connectAccount() {
    if (!isTauriRuntime()) return;
    setOauthBusy(true);
    setCredentialStatus("Abrindo o navegador para login…");
    try {
      // Salva o Client ID escolhido antes de abrir o OAuth.
      const saved = await updateAppSettings(settings);
      setSettings(saved);
      const account = await connectCloud();
      setCredentialStatus(`Conta conectada: ${account}.`);
      setCloudStatus(await getCloudStatus());
      setSettings((current) => ({ ...current, cloudAccount: account }));
    } catch (error) { setCredentialStatus(String(error)); }
    finally { setOauthBusy(false); }
  }

  async function disconnectAccount() {
    setCredentialStatus("Desconectando…");
    try {
      await disconnectCloud();
      setCredentialStatus("Conta desconectada — os tokens foram removidos do chaveiro.");
      setCloudStatus(await getCloudStatus());
      setSettings((current) => ({ ...current, cloudAccount: "" }));
    } catch (error) { setCredentialStatus(String(error)); }
  }

  async function testConnection() {
    setConnectionStatus("Testando…");
    try { setConnectionStatus(await testCloudConnection()); }
    catch (error) { setConnectionStatus(String(error)); }
  }

  if (!open) return null;
  const oauthProvider = settings.cloudProvider === "google"
    ? { clientIdKey: "googleClientId" as const, name: "Google Drive", guide: "console.cloud.google.com → APIs e serviços → Tela de permissão OAuth (Externo, app próprio) → Credenciais → Criar ID do cliente → App para computador. Escopos não precisam ser configurados manualmente — o Eureka42 pede drive.appdata + e-mail no login." }
    : settings.cloudProvider === "onedrive"
      ? { clientIdKey: "onedriveClientId" as const, name: "OneDrive", guide: "entra.microsoft.com → Entra ID (ou Registros de aplicativo) → Novo registro → Plataforma → Aplicativo móvel e desktop → URI de redirecionamento http://127.0.0.1 → copie o ID do aplicativo (cliente). Escopos não precisam ser configurados manualmente — o Eureka42 pede Files.ReadWrite.AppFolder + e-mail no login." }
      : null;

  return <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header><div><span>{t("Eureka42")}</span><h2 id="settings-title">{t("Configurações")}</h2></div><button className="settings-close" onClick={onClose} aria-label={t("Fechar configurações")}>{t("×")}</button></header>
      <div className="settings-body">
        <nav aria-label={t("Seções das configurações")}>
          <button className={section === "account" ? "active" : ""} onClick={() => setSection("account")}>{t("Conta")}</button>
          <button className={section === "privacy" ? "active" : ""} onClick={() => setSection("privacy")}>{t("Privacidade")}</button>
          <button className={section === "cloud" ? "active" : ""} onClick={() => setSection("cloud")}>{t("Nuvem")}</button>
          <button className={section === "general" ? "active" : ""} onClick={() => setSection("general")}>{t("Geral")}</button>
        </nav>
        <div className="settings-content">
          {section === "account" ? <>
            <div className="local-profile"><div className="profile-mark">{t("L")}</div><div><strong>{t("Modo local")}</strong><p>{t("Nenhuma conta é necessária. Seus agentes e dados permanecem neste computador.")}</p></div><span>{t("ATIVO")}</span></div>
            <div className="settings-card"><div><strong>{t("Continuar em outro computador")}</strong><p>{t("Memória, tarefas, contexto, histórico e arquivos do projeto podem sincronizar pela sua própria nuvem — Google Drive ou OneDrive. Mesma conta em outra máquina = mesmo trabalho, sem servidor nosso.")}</p></div><button className="secondary-button" onClick={() => setSection("cloud")}>{t("Configurar nuvem")}</button></div>
            <StorageInfo /><p className="settings-note">{t("O código continua sendo sincronizado pelo seu provedor Git. Credenciais dos agentes nunca são tocadas pelo Eureka42.")}</p>
          </> : null}
          {section === "privacy" ? <>
            <h3>{t("Contexto entre conversas")}</h3>
            <label className="settings-toggle"><div><strong>{t("Carregar contexto de uma conversa para outra")}</strong><p>{t("Mantém ")}<code>{t(".eureka42/contexto.md")}</code>{t(" no projeto atualizado (memória + tarefas + conversas recentes) e injeta esse contexto nas novas sessões do Claude Code — validado via ")}<code>{t("--append-system-prompt")}</code>.</p></div><input type="checkbox" checked={settings.contextCarryoverEnabled} onChange={(event) => setSettings((current) => ({ ...current, contextCarryoverEnabled: event.target.checked }))} /></label>
            <p className="settings-note">{t("Nos demais agentes, o contexto fica disponível no arquivo — aponte ou cole no início da conversa. Nenhum conteúdo capturado do terminal entra no contexto.")}</p>
            <h3 className="settings-section-gap">{t("Histórico local")}</h3>
            <label className="settings-toggle"><div><strong>{t("Capturar eventos do terminal")}</strong><p>{t("Salva entrada e saída brutas no SQLite local para histórico e retomada.")}</p></div><input type="checkbox" checked={settings.captureTerminalEvents} onChange={(event) => setSettings((current) => ({ ...current, captureTerminalEvents: event.target.checked }))} /></label>
            <label className="settings-field"><span>{t("Retenção planejada")}</span><select value={settings.retentionDays} onChange={(event) => setSettings((current) => ({ ...current, retentionDays: Number(event.target.value) }))}><option value={30}>{t("30 dias")}</option><option value={90}>{t("90 dias")}</option><option value={365}>{t("1 ano")}</option><option value={3650}>{t("Sem limpeza automática")}</option></select></label>
            <p className="settings-note">{t("A retenção já é salva como preferência; a limpeza automática será ativada em uma etapa posterior.")}</p>
          </> : null}
          {section === "cloud" ? <>
            <h3>{t("Sincronização via nuvem")}</h3>
            <p className="settings-note">{t("Escolha ")}<em>{t("uma")}</em>{t(" nuvem — a conta que você já tem é a identidade: ao abrir o Eureka42 em outro computador com a mesma conta e sincronizar, você recupera histórico, contexto e arquivos dos projetos. Tudo é cifrado antes de sair desta máquina; nem o provedor vê o conteúdo. Histórico de terminal e arquivos de projeto ficam de fora por padrão (ative por projeto). ")}<strong>{t("Nenhuma fica pré-selecionada")}</strong>{t(" — a escolha é sempre sua, e o app funciona 100% local sem nenhuma.")}</p>
            <div className="theme-picker" role="radiogroup" aria-label={t("Provedor de nuvem")}>
              {PROVIDERS.map((provider) => <button key={provider.id} role="radio" aria-checked={settings.cloudProvider === provider.id} className={settings.cloudProvider === provider.id ? "theme-option theme-option--active" : "theme-option"} onClick={() => setSettings((current) => ({ ...current, cloudProvider: provider.id }))}>{provider.label}</button>)}
            </div>
            {oauthProvider === null ? <p className="settings-note">{t("Nenhuma nuvem selecionada — modo local puro. Escolha Google Drive ou OneDrive acima para configurar a conexão quando quiser.")}</p> : <>
            <label className="settings-toggle"><div><strong>{t("Ativar sincronização")}</strong><p>{t("Ao abrir um projeto, traz dados mais novos da nuvem; ao trocar de projeto, envia o que mudou aqui.")}</p></div><input type="checkbox" checked={settings.cloudSyncEnabled} onChange={(event) => setSettings((current) => ({ ...current, cloudSyncEnabled: event.target.checked }))} /></label>
            <p className="settings-note"><strong>{t("Como obter o Client ID (")}{oauthProvider.name}):</strong> {oauthProvider.guide}</p>
            <label className="settings-field"><span>{t("Client ID")}</span><input className="settings-text-input" value={settings[oauthProvider.clientIdKey]} onChange={(event) => setSettings((current) => ({ ...current, [oauthProvider.clientIdKey]: event.target.value }))} placeholder={settings.cloudProvider === "google" ? t("xxxx.apps.googleusercontent.com") : "00000000-0000-0000-0000-000000000000"} /></label>
            <div className="settings-card">
              <div><strong>{cloudStatus?.configured && settings.cloudAccount ? t("Conta conectada: {0}", {0: settings.cloudAccount}) : t("Conta não conectada nesta máquina.")}</strong><p>{t("O login abre no navegador; os tokens ficam só no chaveiro do sistema.")}</p></div>
              <div className="settings-card-actions">
                {cloudStatus?.configured ? <button className="secondary-button" onClick={() => void disconnectAccount()}>{t("Desconectar")}</button> : null}
                <button className="primary-button" onClick={() => void connectAccount()} disabled={oauthBusy || !settings[oauthProvider.clientIdKey].trim()}>{oauthBusy ? t("Aguardando login…") : t("Conectar conta")}</button>
              </div>
            </div>
            </>}
            <h3 className="settings-section-gap">{t("Criptografia (fica só no chaveiro do sistema)")}</h3>
            <p className="settings-note">{cloudStatus?.hasPassphrase ? t("Frase de criptografia já configurada nesta máquina.") : t("Ainda não configurada nesta máquina.")}{t(" A frase de criptografia é diferente de qualquer senha — ela nunca é enviada a lugar nenhum, só usada aqui para cifrar/decifrar. Deixe os campos em branco se só quiser atualizar a configuração sem trocar a frase já salva.")}</p>
            <label className="settings-field"><span>{t("Frase de criptografia")}</span><input className="settings-text-input" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder={t("Mínimo 8 caracteres")} /></label>
            <label className="settings-field"><span>{t("Confirmar frase de criptografia")}</span><input className="settings-text-input" type="password" value={passphraseConfirm} onChange={(event) => setPassphraseConfirm(event.target.value)} /></label>
            <div className="settings-card">
              <div><strong>{credentialStatus || "Um único clique salva provedor, Client ID, sincronização e frase de criptografia — nunca só parte da configuração."}</strong></div>
              <div className="settings-card-actions">
                <button className="primary-button" onClick={() => void saveCloudSection()}>{t("Salvar configuração da nuvem")}</button>
              </div>
            </div>
            <div className="settings-card">
              <div><strong>{connectionStatus || "Testa se o app consegue falar com a nuvem configurada (use depois de salvar)."}</strong></div>
              <button className="secondary-button" onClick={() => void testConnection()}>{t("Testar conexão")}</button>
            </div>
          </> : null}
          {section === "general" ? <>
            <label className="settings-field"><span>{t("Idioma")}</span><select aria-label={t("Idioma")} value={language} onChange={event => setLanguage(event.target.value as Language, false)}>{LANGUAGES.map(([code, label]) => <option key={code} value={code} lang={code}>{t(label)}</option>)}</select></label>
            <h3>{t("Aparência")}</h3>
            <div className="theme-picker" role="radiogroup" aria-label={t("Tema")}>
              {([["system", "Sistema"], ["light", "Claro"], ["dark", "Escuro"]] as const).map(([value, label]) => <button key={value} role="radio" aria-checked={settings.theme === value} className={settings.theme === value ? "theme-option theme-option--active" : "theme-option"} onClick={() => setTheme(value)}>{t(label)}</button>)}
            </div>
            <p className="settings-note">{t("\"Sistema\" segue o modo claro/escuro do computador. O terminal continua com fundo escuro nos três modos para preservar o contraste das CLIs.")}</p>
            <h3 className="settings-section-gap">{t("Atalhos de teclado")}</h3>
            <ul className="shortcut-list">{SHORTCUTS.map((shortcut) => <li key={shortcut.keys}><kbd>{shortcut.keys}</kbd><span>{t(shortcut.description)}</span></li>)}</ul>
            <div className="settings-row"><div><strong>{t("Processamento")}</strong><p>{t("Os agentes são executados localmente por suas CLIs oficiais.")}</p></div><span>{t("Local")}</span></div>
          </> : null}
        </div>
      </div>
      <footer><span>{status === "saved" ? t("Configurações salvas") : status === "error" ? t("Não foi possível salvar") : status === "loading" ? t("Carregando…") : t("Alterações permanecem neste dispositivo")}</span><div><button className="secondary-button" onClick={onClose}>{t("Cancelar")}</button><button className="primary-button" onClick={save} disabled={status === "saving" || status === "loading"}>{status === "saving" ? t("Salvando…") : t("Salvar")}</button></div></footer>
    </section>
  </div>;
}
