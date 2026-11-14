import { sessionStatusLabel } from "../data/presentation";
import { sessionText, terminalText } from "../data/historyPresentation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { exportTerminalSession, getTerminalSessionEvents, listTerminalSessions, type SessionSummary, type TerminalEvent } from "../services/history";

export function HistoryPane({ projectId, active, agents = [] }: { projectId: string | null; active: boolean; agents?: { id: string; label: string }[] }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [agentId, setAgentId] = useState("");
  const [status, setStatus] = useState("");
  const [periodDays, setPeriodDays] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<SessionSummary | null>(null);
  const [events, setEvents] = useState<TerminalEvent[]>([]);
  const [detailStatus, setDetailStatus] = useState("");
  const detailRequest = useRef(0);
  const listRequest = useRef(0);
  const closeDetails = () => { detailRequest.current += 1; setSelected(null); };
  const [moreEvents, setMoreEvents] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const transcript = useMemo(() => sessionText(events), [events]);
  const agentLabel = (id: string) => agents.find(agent => agent.id === id)?.label ?? id;
  const deferredQuery = useDeferredValue(query);
  const startedAfter = useMemo(() => periodDays ? Math.floor(Date.now() / 1000) - periodDays * 86400 : 0, [periodDays]);

  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeDetails(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selected]);

  useEffect(() => {
    if (!active || !projectId) return;
    let current = true;
    listRequest.current += 1;
    listTerminalSessions(projectId, { query: deferredQuery, agentId, status, startedAfter })
      .then((items) => { if (current) { setSessions(items); setHasMore(items.length === 50); setError(null); } })
      .catch((reason) => { if (current) setError(String(reason)); });
    return () => { current = false; };
  }, [active, projectId, deferredQuery, agentId, status, startedAfter]);

  async function loadMore() {
    if (!projectId || loadingMore) return;
    const request = listRequest.current;
    setLoadingMore(true);
    try {
      const items = await listTerminalSessions(projectId, { query: deferredQuery, agentId, status, startedAfter }, 50, sessions.length);
      if (request !== listRequest.current) return;
      setSessions((current) => [...current, ...items]);
      setHasMore(items.length === 50);
      setError(null);
    } catch (reason) { setError(String(reason)); }
    finally { setLoadingMore(false); }
  }
  async function inspect(session: SessionSummary) { const request = ++detailRequest.current; setSelected(session); setEvents([]); setMoreEvents(false); setLoadingEvents(true); setDetailStatus("Carregando registro…"); try { const items = await getTerminalSessionEvents(session.id); if (request !== detailRequest.current) return; setEvents(items); setMoreEvents(items.length === 200); setDetailStatus(""); } catch (reason) { if (request === detailRequest.current) setDetailStatus(String(reason)); } finally { if (request === detailRequest.current) setLoadingEvents(false); } }
  async function loadEvents() {
    if (!selected || loadingEvents) return;
    const request = detailRequest.current;
    setLoadingEvents(true);
    try { const items = await getTerminalSessionEvents(selected.id, 200, events.length); if (request !== detailRequest.current) return; setEvents(current => [...current, ...items]); setMoreEvents(items.length === 200); }
    catch (reason) { setDetailStatus(String(reason)); }
    finally { setLoadingEvents(false); }
  }
  async function copyTranscript() {
    try { await navigator.clipboard.writeText(transcript); setDetailStatus("Registro copiado. Revise antes de compartilhar."); }
    catch { setDetailStatus("Não foi possível copiar. Selecione o texto ou exporte o registro."); }
  }
  async function exportAs(format: "md" | "json" | "txt") { if (!selected) return; setDetailStatus("Exportando com redação básica…"); try { const result = await exportTerminalSession(selected.id, format); setDetailStatus(`Exportado em ${result.path}`); } catch (reason) { setDetailStatus(String(reason)); } }

  if (!active) return null;
  return <section className="history-pane" aria-label="Histórico de sessões"><header><div><h2>Histórico do projeto</h2><p>Escolha uma sessão para ler o registro do terminal ou exportá-lo.</p></div><span>{sessions.length}{hasMore ? "+" : ""} sessões listadas</span></header>
    <div className="history-filters"><label><span>Buscar no registro</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Uma palavra, arquivo ou resposta…" /></label><label><span>Agente</span><select value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">Todos</option>{Array.from(new Map([...agents, ...sessions.map(session => ({ id: session.agentId, label: session.agentId }))].map(agent => [agent.id, agent])).values()).map(agent => <option key={agent.id} value={agent.id}>{agent.label}</option>)}</select></label><label><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option><option value="FAILED">Falha ao iniciar</option><option value="RUNNING">Em andamento</option><option value="EXITED">Concluída</option><option value="TERMINATED">Encerrada</option><option value="INTERRUPTED">Interrompida</option></select></label><label><span>Período</span><select value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}><option value={0}>Todo período</option><option value={1}>Últimas 24 horas</option><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option></select></label></div>
    {query || agentId || status || periodDays ? <button className="secondary-button" onClick={() => { setQuery(""); setAgentId(""); setStatus(""); setPeriodDays(0); }}>Limpar filtros</button> : null}
    {error ? <p className="history-error" role="alert">{error}</p> : null}
    {!projectId ? <p className="history-empty">Abra um projeto para consultar o histórico.</p> : sessions.length === 0 ? <p className="history-empty">Nenhuma sessão encontrada. Conecte um agente no Terminal ou tente limpar os filtros.</p> : <><div className="session-list">{sessions.map((session) => <button className="session-row" key={session.id} onClick={() => inspect(session)}><span className={`session-state session-state--${session.status.toLowerCase()}`} /><div><strong>{agentLabel(session.agentId)}</strong><small>{new Date(session.startedAt * 1000).toLocaleString()}</small></div><span>{session.eventCount ? "Registro disponível" : "Sem conteúdo capturado"}</span><b>{sessionStatusLabel(session.status)}</b></button>)}</div>{hasMore ? <button className="history-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Carregando…" : "Carregar mais"}</button> : null}</>}
    {selected ? <div className="settings-backdrop"><section className="session-detail" role="dialog" aria-modal="true" aria-label="Registro da sessão"><header><div><span>{agentLabel(selected.agentId)} · {new Date(selected.startedAt * 1000).toLocaleString()}</span><h2>{sessionStatusLabel(selected.status)}</h2></div><button className="settings-close" onClick={closeDetails} aria-label="Fechar detalhes">×</button></header><div className="event-stream"><p className="history-capture-note">Registro do terminal, que pode conter repetições da interface do agente. A captura depende das configurações de privacidade.</p><pre className="history-transcript" aria-label="Registro de terminal">{transcript || (loadingEvents ? "Carregando…" : "Nenhuma saída capturada nesta sessão.")}</pre>{moreEvents ? <button className="secondary-button" disabled={loadingEvents} onClick={() => void loadEvents()}>{loadingEvents ? "Carregando…" : "Carregar mais registros"}</button> : null}<details><summary>Detalhes técnicos ({events.length} eventos carregados)</summary><p>Sessão {selected.id} · {selected.capturedBytes.toLocaleString()} bytes</p>{events.map((event) => <article key={event.id}><small>{event.direction} · {new Date(event.createdAt * 1000).toLocaleTimeString()}</small><pre>{terminalText(event.text)}</pre></article>)}</details></div><footer><span>{detailStatus || "Exportações aplicam redação básica; revise antes de compartilhar."}</span><div><button className="secondary-button" disabled={!transcript} onClick={() => void copyTranscript()}>Copiar registro</button><button className="secondary-button" onClick={() => exportAs("txt")}>TXT</button><button className="secondary-button" onClick={() => exportAs("json")}>JSON</button><button className="primary-button" onClick={() => exportAs("md")}>Markdown</button></div></footer></section></div> : null}
  </section>;
}
