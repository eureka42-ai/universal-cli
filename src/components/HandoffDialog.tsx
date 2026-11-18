import { t } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { openHandoffFolder, prepareHandoff, readHandoffContext, type HandoffPackage } from "../services/handoff";
import { displayPath } from "../data/presentation";
import type { Agent } from "../data/workspace";

export function HandoffDialog({ open, projectId, agents, onClose }: { open: boolean; projectId: string | null; agents: Agent[]; onClose(): void }) {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [result, setResult] = useState<HandoffPackage | null>(null);
  const [context, setContext] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const request = useRef(0);
  const installed = agents.filter(agent => agent.available);
  const agentIds = installed.map(agent => agent.id).join("|");
  useEffect(() => {
    request.current += 1;
    setResult(null); setContext(""); setStatus(""); setPending(false);
    setSource(installed[0]?.id ?? ""); setTarget(installed[1]?.id ?? "");
    return () => { request.current += 1; };
  }, [open, projectId, agentIds]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);
  if (!open) return null;
  const validRoute = Boolean(projectId && source && target && source !== target && installed.some(agent => agent.id === source) && installed.some(agent => agent.id === target));
  function changeRoute(value: string, destination: boolean) {
    if (destination) setTarget(value); else setSource(value);
    setResult(null); setContext(""); setStatus(""); request.current += 1;
  }
  async function create() {
    if (!projectId || !validRoute || pending) return;
    const current = ++request.current;
    setPending(true); setStatus(t("Preparando pacote…")); setResult(null); setContext("");
    try {
      const value = await prepareHandoff(projectId, source, target);
      if (current !== request.current) return;
      setResult(value);
      try {
        const text = await readHandoffContext(value.id);
        if (current === request.current) setContext(text);
      } catch (error) { if (current === request.current) setStatus(String(error)); return; }
      if (current === request.current) setStatus(t("Revise a prévia. Depois, copie o contexto e forneça-o explicitamente ao agente de destino."));
    } catch (error) { if (current === request.current) setStatus(String(error)); }
    finally { if (current === request.current) setPending(false); }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setStatus(t("Copiado. O envio ao outro agente continua sob seu controle.")); }
    catch { setStatus(t("Não foi possível copiar. Selecione o texto na prévia ou abra a pasta do pacote.")); }
  }
  async function showFolder() {
    if (!result) return;
    try { await openHandoffFolder(result.id); } catch (error) { setStatus(String(error)); }
  }
  return <div className="settings-backdrop" role="presentation"><section className="handoff-dialog" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
    <header><div><span>{t("UAHP 1.0")}</span><h2 id="handoff-title">{t("Transferir contexto")}</h2></div><button className="settings-close" onClick={onClose} aria-label={t("Fechar transferência")}>{t("×")}</button></header>
    <div className="handoff-content"><p>{t("Prepare o contexto do projeto para continuar em outro agente.")}</p>
      {installed.length < 2 ? <p role="status">{t("Conecte ou cadastre pelo menos dois agentes para escolher uma origem e um destino.")}</p> : null}
      <div className="handoff-route"><label><span>{t("Origem")}</span><select value={source} disabled={pending} onChange={event => changeRoute(event.target.value, false)}>{installed.map(agent => <option value={agent.id} key={agent.id}>{agent.label}</option>)}</select></label><b>→</b><label><span>{t("Destino")}</span><select value={target} disabled={pending} onChange={event => changeRoute(event.target.value, true)}>{installed.map(agent => <option value={agent.id} key={agent.id}>{agent.label}</option>)}</select></label></div>
      <div className="handoff-scope"><strong>{t("Conteúdo incluído")}</strong><ul><li>{t("Diretório e informações do projeto")}</li><li>{t("Memória confirmada e tarefas locais")}</li><li>{t("Orientação para continuar o trabalho")}</li></ul><small>{t("Arquivos do projeto, chaves e credenciais não são coletados.")}</small></div>
      {result ? <div className="handoff-result"><strong>{t("Pacote pronto para revisão")}</strong><code>{displayPath(result.packagePath)}</code>{result.warnings.map(warning => <p key={warning}>⚠ {warning}</p>)}<div className="handoff-actions"><button className="secondary-button" onClick={() => void showFolder()}>{t("Abrir pasta")}</button><button className="secondary-button" onClick={() => void copy(displayPath(result.packagePath))}>{t("Copiar caminho")}</button></div>{context ? <><label htmlFor="handoff-preview">{t("Prévia do contexto")}</label><textarea id="handoff-preview" className="handoff-preview" readOnly value={context} /><button className="primary-button" onClick={() => void copy(context)}>{t("Copiar contexto")}</button></> : null}<p>{t("O contexto ainda não foi enviado ao agente.")}</p></div> : null}
      {status ? <p className="handoff-status" role="status">{status}</p> : null}
    </div><footer><button className="secondary-button" onClick={onClose}>{t("Fechar")}</button><button className="primary-button" onClick={() => void create()} disabled={!validRoute || pending}>{pending ? t("Preparando…") : result ? t("Criar outro pacote") : t("Criar pacote")}</button></footer>
  </section></div>;
}
