export type HandoffPackage = { id: string; status: string; packagePath: string; targetAgent: string; warnings: string[] };
export async function prepareHandoff(projectId: string, sourceAgent: string, targetAgent: string) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<HandoffPackage>("prepare_handoff", { projectId, sourceAgent, targetAgent });
}

export async function readHandoffContext(handoffId: string) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("read_handoff_context", { handoffId });
}

export async function openHandoffFolder(handoffId: string) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<void>("open_handoff_folder", { handoffId });
}
