import { t, getLanguage } from "../i18n";
import { displayPath, sessionStatusLabel } from "../data/presentation";
import { sessionDuration, sessionScreen, sessionText, terminalText } from "../data/historyPresentation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { exportTerminalSession, getTerminalSessionEvents, listTerminalSessions, type SessionSummary, type TerminalEvent } from "../services/history";
import { ToolIcon } from "./ToolIcon";

function dateLabel(timestamp: number) {
  const date = new Date(timestamp * 1000), today = new Date();
  if (date.toDateString() === today.toDateString()) return t("Hoje");
  today.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return t("Ontem");
  return date.toLocaleDateString(getLanguage(), { day: "numeric", month: "long", year: "numeric" });
}
function sizeLabel(bytes: number) { return bytes < 1024 ? bytes + " B" : (bytes / 1024).toLocaleString(getLanguage(), { maximumFractionDigits: 1 }) + " KB"; }
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const result = []; let start = 0; const lower = text.toLowerCase(), needle = query.toLowerCase();
  for (let count = 0; count < 1000; count++) {
    const index = lower.indexOf(needle, start);
    if (index < 0) break;
    result.push(text.slice(start, index), <mark key={index}>{text.slice(index, index + query.length)}</mark>); start = index + query.length;
  }
  result.push(text.slice(start)); return <>{result}</>;
}
export function HistoryPane({ projectId, active, agents = [] }: { projectId: string | null; active: boolean; agents?: { id: string; label: string }[] }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [agentId, setAgentId] = useState("");
  const [status, setStatus] = useState("");
  const [periodDays, setPeriodDays] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<SessionSummary | null>(null);
  const [events, setEvents] = useState<TerminalEvent[]>([]);
  const [detailStatus, setDetailStatus] = useState("");
  const [reading, setReading] = useState("");
  const [rendering, setRendering] = useState(false);
  const [view, setView] = useState<"reading" | "full">("reading");
  const [search, setSearch] = useState("");
  const detailRequest = useRef(0), listRequest = useRef(0);
  const detailRef = useRef<HTMLElement>(null), opener = useRef<HTMLElement | null>(null);
  const closeDetails = () => { detailRequest.current += 1; setSelected(null); opener.current?.focus(); };
  const [moreEvents, setMoreEvents] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const rawTranscript = useMemo(() => sessionText(events), [events]);
  const transcript = view === "reading" ? reading : rawTranscript;
  const agentLabel = (id: string) => agents.find(agent => agent.id === id)?.label ?? id;
  const deferredQuery = useDeferredValue(query);
  const startedAfter = useMemo(() => periodDays ? Math.floor(Date.now() / 1000) - periodDays * 86400 : 0, [periodDays]);
  const visibleAgents = Array.from(new Map([...sessions.map(session => ({ id: session.agentId, label: agentLabel(session.agentId) })), ...agents].map(agent => [agent.id, agent])).values());
  const groups = new Map<string, SessionSummary[]>();
  for (const session of sessions) { const day = dateLabel(session.startedAt); groups.set(day, [...groups.get(day) ?? [], session]); }
  const selectedIndex = selected ? sessions.findIndex(session => session.id === selected.id) : -1;
  const matches = search ? transcript.toLowerCase().split(search.toLowerCase()).length - 1 : 0;

  useEffect(() => {
    if (!selected) return;
    detailRef.current?.querySelector<HTMLButtonElement>(".settings-close")?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") closeDetails(); };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [selected?.id]);
  useEffect(() => {
    let current = true; setRendering(true);
    sessionScreen(events).then(text => { if (current) setReading(text); }).catch(() => { if (current) { setReading(rawTranscript); setView("full"); } }).finally(() => { if (current) setRendering(false); });
    return () => { current = false; };
  }, [events, rawTranscript]);
  useEffect(() => {
    if (!active || !projectId) return;
    const request = ++listRequest.current; setLoading(true); setLoadingMore(false);
    listTerminalSessions(projectId, { query: deferredQuery, agentId, status, startedAfter })
      .then(items => { if (request === listRequest.current) { setSessions(items); setHasMore(items.length === 50); setError(null); } })
      .catch(reason => { if (request === listRequest.current) setError(String(reason)); })
      .finally(() => { if (request === listRequest.current) setLoading(false); });
    return () => { listRequest.current += 1; };
  }, [active, projectId, deferredQuery, agentId, status, startedAfter, refresh]);
  async function loadMore() {
    if (!projectId || loadingMore || loading) return;
    const request = listRequest.current; setLoadingMore(true);
    try { const items = await listTerminalSessions(projectId, { query: deferredQuery, agentId, status, startedAfter }, 50, sessions.length);
      if (request === listRequest.current) { setSessions(current => [...current, ...items]); setHasMore(items.length === 50); setError(null); }
    } catch (reason) { if (request === listRequest.current) setError(String(reason)); }
    finally { if (request === listRequest.current) setLoadingMore(false); }
  }
  async function inspect(session: SessionSummary) {
    if (!selected) opener.current = document.activeElement as HTMLElement;
    const request = ++detailRequest.current; setSelected(session); setEvents([]); setReading(""); setSearch(""); setView("reading"); setMoreEvents(false); setLoadingEvents(true); setDetailStatus("");
    try { const items = await getTerminalSessionEvents(session.id); if (request === detailRequest.current) { setEvents(items); setMoreEvents(items.length === 200); } }
    catch (reason) { if (request === detailRequest.current) setDetailStatus(String(reason)); }
    finally { if (request === detailRequest.current) setLoadingEvents(false); }
  }
  async function loadEvents() {
    if (!selected || loadingEvents) return;
    const request = detailRequest.current; setLoadingEvents(true);
    try { const items = await getTerminalSessionEvents(selected.id, 200, events.length); if (request === detailRequest.current) { setEvents(current => [...current, ...items]); setMoreEvents(items.length === 200); } }
    catch (reason) { if (request === detailRequest.current) setDetailStatus(String(reason)); }
    finally { if (request === detailRequest.current) setLoadingEvents(false); }
  }
  async function copyTranscript() {
    const request = detailRequest.current;
    try { await navigator.clipboard.writeText(transcript); if (request === detailRequest.current) setDetailStatus(t("Registro copiado. Revise antes de compartilhar.")); }
    catch { if (request === detailRequest.current) setDetailStatus(t("Não foi possível copiar. Selecione o texto ou exporte o registro.")); }
  }
  async function exportAs(format: "md" | "json" | "txt") {
    if (!selected) return; const request = detailRequest.current; setDetailStatus(t("Exportando…"));
    try { const result = await exportTerminalSession(selected.id, format); if (request === detailRequest.current) setDetailStatus(t("Exportado em {0}", {0: displayPath(result.path)})); }
    catch (reason) { if (request === detailRequest.current) setDetailStatus(String(reason)); }
  }
  if (!active) return null;
  return <section className="history-pane" aria-label={t("Histórico de sessões")}>
    <header><div><span className="eyebrow">{t("SUAS SESSÕES, EM UM LUGAR")}</span><h2>{t("Histórico do projeto")}</h2><p>{t("Reabra um registro para acompanhar o que aconteceu, copiar ou exportar.")}</p></div><button className="secondary-button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{loading ? t("Carregando…") : t("Atualizar")}</button></header>
    <div className="history-filters"><label><span>{t("Buscar no registro")}</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Uma palavra, arquivo ou resposta…")} /></label><label><span>{t("Agente")}</span><select value={agentId} onChange={event => setAgentId(event.target.value)}><option value="">{t("Todos")}</option>{visibleAgents.map(agent => <option key={agent.id} value={agent.id}>{agent.label}</option>)}</select></label><label><span>{t("Estado")}</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="">{t("Todos")}</option>{["RUNNING", "EXITED", "TERMINATED", "INTERRUPTED", "FAILED"].map(value => <option key={value} value={value}>{sessionStatusLabel(value)}</option>)}</select></label><label><span>{t("Período")}</span><select value={periodDays} onChange={event => setPeriodDays(Number(event.target.value))}><option value={0}>{t("Todo período")}</option><option value={1}>{t("Últimas 24 horas")}</option><option value={7}>{t("Últimos 7 dias")}</option><option value={30}>{t("Últimos 30 dias")}</option></select></label></div>
    <div className="history-list-caption"><span>{t("{0} sessões", {0: sessions.length})}{hasMore ? "+" : ""}</span>{query || agentId || status || periodDays ? <button onClick={() => { setQuery(""); setAgentId(""); setStatus(""); setPeriodDays(0); }}>{t("Limpar filtros")}</button> : null}</div>
    {error ? <p className="history-error" role="alert">{error}</p> : null}
    {!projectId ? <div className="history-empty-card"><ToolIcon name="Histórico" size={30} /><h3>{t("Abra um projeto para consultar o histórico.")}</h3></div> : sessions.length === 0 ? <div className="history-empty-card"><ToolIcon name="Histórico" size={30} /><h3>{loading ? t("Carregando…") : t("Nenhuma sessão encontrada")}</h3><p>{t("Conecte um agente no Terminal ou tente limpar os filtros.")}</p></div> : <div className="session-list">{Array.from(groups, ([day, items]) => <section className="session-day" key={day}><h3>{day}<span>{items.length}</span></h3>{items.map(session => <button className="session-row" key={session.id} onClick={() => void inspect(session)}><span className="session-agent-mark" aria-hidden="true">{agentLabel(session.agentId).slice(0, 1)}</span><span className="session-row-main"><strong>{agentLabel(session.agentId)}</strong><small>{new Date(session.startedAt * 1000).toLocaleTimeString(getLanguage(), {hour:"2-digit",minute:"2-digit"})} · {session.endedAt ? sessionDuration(session.startedAt, session.endedAt) : t("Em andamento")} · {sizeLabel(session.capturedBytes)}</small></span><span className={"history-status history-status--" + session.status.toLowerCase()}><i />{sessionStatusLabel(session.status)}</span><span className="session-open" aria-hidden="true">↗</span></button>)}</section>)}{hasMore ? <button className="history-more" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? t("Carregando…") : t("Carregar mais")}</button> : null}</div>}
    {selected ? <div className="settings-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeDetails(); }}><section ref={detailRef} className="session-detail" role="dialog" aria-modal="true" aria-label={t("Registro da sessão")} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const nodes = Array.from(detailRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input,summary") ?? []); const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <header><div><span className="eyebrow">{t("REGISTRO DE SESSÃO")}</span><div className="session-detail-title"><h2>{agentLabel(selected.agentId)}</h2><span className={"history-status history-status--" + selected.status.toLowerCase()}><i />{sessionStatusLabel(selected.status)}</span></div><p>{new Date(selected.startedAt * 1000).toLocaleString(getLanguage())} · {sessionDuration(selected.startedAt, selected.endedAt)} · {sizeLabel(selected.capturedBytes)}</p></div><div className="session-detail-navigation"><button className="icon-button" aria-label={t("Sessão anterior")} disabled={selectedIndex >= sessions.length - 1} onClick={() => void inspect(sessions[selectedIndex + 1])}>←</button><button className="icon-button" aria-label={t("Próxima sessão")} disabled={selectedIndex <= 0} onClick={() => void inspect(sessions[selectedIndex - 1])}>→</button><button className="settings-close" onClick={closeDetails} aria-label={t("Fechar detalhes")}>×</button></div></header>
      <div className="session-reader-toolbar"><div role="tablist" aria-label={t("Visualização do registro")}><button role="tab" aria-selected={view === "reading"} onClick={() => setView("reading")}>{t("Leitura")}</button><button role="tab" aria-selected={view === "full"} onClick={() => setView("full")}>{t("Registro completo")}</button></div><label><span className="sr-only">{t("Buscar nesta sessão")}</span><input aria-label={t("Buscar nesta sessão")} placeholder={t("Buscar nesta sessão")} value={search} onChange={event => setSearch(event.target.value)} />{search ? <small>{matches}</small> : null}</label></div>
      <div className="event-stream"><p className="history-capture-note">{view === "reading" ? t("Redesenhos do terminal são consolidados nesta leitura. O registro completo permanece disponível.") : t("Registro do terminal, que pode conter repetições da interface do agente. A captura depende das configurações de privacidade.")}</p><pre className="history-transcript" aria-label={t("Registro de terminal")}><Highlight text={transcript || (loadingEvents || rendering ? t("Carregando…") : t("Nenhuma saída capturada nesta sessão."))} query={search} /></pre>{moreEvents ? <button className="secondary-button" disabled={loadingEvents} onClick={() => void loadEvents()}>{loadingEvents ? t("Carregando…") : t("Carregar mais registros")}</button> : null}<details className="session-technical"><summary>{t("Detalhes técnicos (")}{events.length}{t(" eventos carregados)")}</summary><p>{t("Sessão")} {selected.id}</p><code>{displayPath(selected.workingDirectory)}</code>{events.map(event => <article key={event.id}><small>{event.direction} · {new Date(event.createdAt * 1000).toLocaleTimeString(getLanguage())}</small><pre>{terminalText(event.text)}</pre></article>)}</details></div>
      <footer><span role="status">{detailStatus || (moreEvents ? t("Há mais registros nesta sessão. Carregue o restante para ler tudo.") : t("Exportações aplicam redação básica; revise antes de compartilhar."))}</span><div><button className="secondary-button" disabled={!transcript || rendering} onClick={() => void copyTranscript()}>{t("Copiar registro")}</button><button className="secondary-button" onClick={() => void exportAs("txt")}>TXT</button><button className="secondary-button" onClick={() => void exportAs("json")}>JSON</button><button className="primary-button" onClick={() => void exportAs("md")}>Markdown</button></div></footer>
    </section></div> : null}
  </section>;
}
