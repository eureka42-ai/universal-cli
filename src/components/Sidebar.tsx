import { t, getLanguage } from "../i18n";
import { displayPath } from "../data/presentation";
import { useState } from "react";
import type { ConnectedAgent } from "../services/agents";
import type { Project } from "../services/projects";
import { ToolIcon } from "./ToolIcon";
import { StatusDot } from "./StatusDot";

/** Histórico agregado de um projeto (sessões + última atividade). */
export type ProjectHistoryStats = { sessions: number; lastLabel: string; lastUsedAt: number };

type Props = { agents: ConnectedAgent[]; hasProject: boolean; projectStats: Record<string, ProjectHistoryStats>; projects: Project[]; selectedProjectId: string | null; onProjectSelect: (project: Project) => void; onAddProject: () => void; onFavorite: (project: Project) => void; onArchive: (project: Project) => void; onOpenStorage?: () => void };

function relativeTime(timestamp: number): string {
  if (!timestamp) return "";
  const elapsed = Math.max(0, Date.now() / 1000 - timestamp);
  const formatter = new Intl.RelativeTimeFormat(getLanguage(), { numeric: "auto", style: "short" });
  if (elapsed < 90) return formatter.format(0, "second");
  if (elapsed < 3600) return formatter.format(-Math.floor(elapsed / 60), "minute");
  if (elapsed < 86400) return formatter.format(-Math.floor(elapsed / 3600), "hour");
  if (elapsed < 2592000) return formatter.format(-Math.floor(elapsed / 86400), "day");
  return formatter.format(-Math.floor(elapsed / 2592000), "month");
}

function historyLine(stats: ProjectHistoryStats | undefined): string {
  if (!stats || stats.sessions === 0) return t("Sem sessões ainda");
  const when = relativeTime(stats.lastUsedAt);
  return `${stats.sessions === 1 ? t("1 sessão") : t("{0} sessões", {0: stats.sessions})}${stats.lastLabel ? t(" · última: {0}", {0: stats.lastLabel}) : ""}${when ? ` ${when}` : ""}`;
}

export function Sidebar({ agents, hasProject, projectStats, projects, selectedProjectId, onProjectSelect, onAddProject, onFavorite, onArchive, onOpenStorage }: Props) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleProjects = normalizedQuery ? projects.filter((project) => `${project.name} ${displayPath(project.path)}`.toLocaleLowerCase().includes(normalizedQuery)) : projects;
  return <aside className="sidebar" aria-label={t("Navegação do projeto")}>
    <section><div className="section-heading"><h2>{t("Projetos ")}<span className="section-count">{projects.length}</span></h2><button className="add-project-button" onClick={onAddProject} title={t("Abrir uma pasta como projeto")}>
      <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>{t("Novo projeto")}</button></div>
      <label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("Buscar projetos")} placeholder={t("Buscar projetos…")} /></label>
      <nav className="project-list">{visibleProjects.length === 0 ? <p className="empty-projects">{normalizedQuery ? t("Nenhum projeto corresponde à busca.") : t("Abra uma pasta para começar seu próximo projeto.")}</p> : visibleProjects.map((project) => <div className={project.id === selectedProjectId ? "project-row project-row--selected" : "project-row"} key={project.id}>
        <button className="project-main" onClick={() => onProjectSelect(project)}><span className="folder" aria-hidden="true" /><span><strong>{project.name}</strong><small>{displayPath(project.path)}</small><small className="project-history">{historyLine(projectStats[project.id])}</small></span></button>
        <button className="project-action" aria-label={project.isFavorite ? t("Desfavoritar {0}", {0: project.name}) : t("Favoritar {0}", {0: project.name})} onClick={() => onFavorite(project)}>{project.isFavorite ? "★" : "☆"}</button>
        <button className="project-action" aria-label={t("Arquivar {0}", {0: project.name})} onClick={() => onArchive(project)}>{t("×")}</button>
      </div>)}</nav></section>
    <section className="agents-panel"><h2>{t("Agentes")}</h2>
      {!hasProject ? <p className="empty-projects">{t("Abra um projeto para conectar agentes.")}</p> :
        agents.length === 0 ? <p className="empty-projects">{t("Nenhum agente conectado ainda — clique em ")}<strong>{t("Escolha seu agente")}</strong>{t(" no terminal.")}</p> :
        agents.map((agent) => <div className="agent-row" key={agent.id} title={agent.executable}>
          <StatusDot active={agent.running} />
          <span><strong>{agent.label}</strong><small>{agent.sessionCount === 1 ? t("1 sessão") : t("{0} sessões", {0: agent.sessionCount})} · {relativeTime(agent.lastUsedAt)}</small></span>
        </div>)}
    </section>
    {onOpenStorage ? <button className="sidebar-storage" onClick={onOpenStorage}><ToolIcon name="Memória" size={19} /><span><strong>{t("Onde ficam meus dados?")}</strong><small>{t("Armazenamento e continuidade")}</small></span><span aria-hidden="true">↗</span></button> : null}
  </aside>;
}
