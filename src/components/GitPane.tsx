import { t } from "../i18n";
import { useEffect, useState } from "react";
import { getGitStatus, type GitStatus } from "../services/workspace";

export function GitPane({ projectId, active }: { projectId: string | null; active: boolean }) {
  const [state, setState] = useState<GitStatus | null>(null); const [error, setError] = useState("");
  useEffect(() => { if (!active) return; setState(null); setError(""); if (!projectId) return; let current = true; getGitStatus(projectId).then((value) => { if (current) setState(value); }).catch((reason) => { if (current) setError(String(reason)); }); return () => { current = false; }; }, [active, projectId]);
  if (!active) return null;
  return <section className="tool-pane"><header><div><h2>{t("Git")}</h2><p>{t("Leitura local; o aplicativo não faz commit, stash ou reset.")}</p></div><span>{error ? t("ERRO") : !projectId ? t("SEM PROJETO") : !state ? t("CONSULTANDO") : !state.available ? t("INDISPONÍVEL") : state.dirty ? t("ALTERAÇÕES") : t("LIMPO")}</span></header>{error ? <p className="history-error" role="alert">{error}</p> : !projectId ? <p className="history-empty">{t("Abra um projeto para consultar o Git.")}</p> : state && !state.available ? <p className="history-empty">{state.error}</p> : state ? <><div className="git-summary"><div><small>{t("BRANCH")}</small><strong>{state.branch ?? "detached"}</strong></div><div><small>{t("HEAD")}</small><code>{state.head ?? "—"}</code></div><div><small>{t("ESTADO")}</small><strong>{state.dirty ? t("Com alterações") : t("Limpo")}</strong></div></div><pre className="git-changes">{state.changes.length ? state.changes.join("\n") : t("Nenhuma alteração local.")}</pre></> : <p className="history-empty">{t("Consultando…")}</p>}</section>;
}
