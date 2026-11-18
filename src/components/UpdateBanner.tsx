import { t } from "../i18n";
import { useState } from "react";
import { downloadAndInstallUpdate, type UpdateInfo } from "../services/updater";

export function UpdateBanner({ update, onDismiss }: { update: UpdateInfo; onDismiss(): void }) {
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<{ downloaded: number; total: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function install() {
    setInstalling(true); setError(null);
    try { await downloadAndInstallUpdate((downloaded, total) => setProgress({ downloaded, total })); }
    catch (reason) { setInstalling(false); setError(String(reason)); }
  }

  const percent = progress?.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;

  return <div className="update-banner" role="status">
    <div className="update-banner-text">
      <strong>{t("Nova versão disponível: ")}{update.version}</strong>
      {update.body ? <p>{update.body}</p> : null}
      {installing ? <p>{percent !== null ? t("Baixando… {0}%", {0: percent}) : t("Baixando atualização…")}</p> : null}
      {error ? <p className="update-banner-error">{error}</p> : null}
    </div>
    <div className="update-banner-actions">
      {!installing ? <button className="secondary-button" onClick={onDismiss}>{t("Depois")}</button> : null}
      <button className="primary-button" onClick={install} disabled={installing}>{installing ? t("Instalando…") : t("Atualizar agora")}</button>
    </div>
  </div>;
}
