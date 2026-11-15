import { t } from "../i18n";
/** Display-only normalization. Keep canonical paths unchanged in IPC/storage. */
export function displayPath(path: string): string {
  if (path.startsWith("\\\\?\\UNC\\")) return "\\\\" + path.slice(8);
  return path.startsWith("\\\\?\\") ? path.slice(4) : path;
}

export function provenanceLabel(value: string): string {
  return t(({ USER_CONFIRMED: "Confirmado por você", AGENT_REPORTED: "Informado pelo agente", FILE_VERIFIED: "Verificado em arquivo", GIT_VERIFIED: "Verificado no Git", SYSTEM_OBSERVED: "Observado pelo aplicativo", INFERRED: "Inferido" } as Record<string, string>)[value] ?? value);
}

export function sessionStatusLabel(value: string): string {
  return t(({ RUNNING: "Em andamento", EXITED: "Concluída", TERMINATED: "Encerrada", INTERRUPTED: "Interrompida", FAILED: "Falha ao iniciar" } as Record<string, string>)[value] ?? value);
}

export const modifierLabel = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";
