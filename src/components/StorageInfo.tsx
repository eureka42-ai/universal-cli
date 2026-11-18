import { t } from "../i18n";
import { useEffect, useState } from "react";
import { isTauriRuntime } from "../services/terminal";
import { displayPath } from "../data/presentation";

export function StorageInfo() {
  const [path, setPath] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let current = true;
    import("@tauri-apps/api/path").then(api => api.appDataDir()).then(value => {
      if (current) setPath(displayPath(value));
    }).catch(() => { if (current) setStatus(t("Não foi possível consultar a pasta de dados.")); });
    return () => { current = false; };
  }, []);
  async function copy() {
    try { await navigator.clipboard.writeText(path); setStatus(t("Caminho copiado.")); }
    catch { setStatus(t("Selecione e copie o caminho exibido.")); }
  }
  return <section className="storage-card" aria-label={t("Onde ficam seus dados")}>
    <div className="storage-card-heading"><span className="storage-card-symbol" aria-hidden="true">42</span><div><h3>{t("Seu trabalho fica com você")}</h3><p>{t("Histórico, memória e tarefas são salvos neste computador.")}</p></div></div>
    {path ? <div className="storage-path"><code>{path}</code><button className="secondary-button" onClick={() => void copy()}>{t("Copiar caminho")}</button></div> : null}
    <p>{t("O banco ")}<code>{t("hostdrive.sqlite")}</code>{t(" guarda os registros do aplicativo. No projeto, ")}<code>{t(".eureka42/contexto.md")}</code>{t(" reúne a memória e os próximos passos.")}</p>
    <small>{t("Para recuperar o trabalho em outra máquina, configure sua conta na seção Nuvem e escolha o que sincronizar.")}</small>
    {status ? <p role="status">{status}</p> : null}
  </section>;
}
