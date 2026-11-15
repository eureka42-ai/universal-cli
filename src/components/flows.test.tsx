// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GitPane } from "./GitPane";
import { HandoffDialog } from "./HandoffDialog";
import { TerminalPane } from "./TerminalPane";
import { HistoryPane } from "./HistoryPane";
import { TasksPane } from "./TasksPane";
import type { Agent } from "../data/workspace";

const mock = vi.hoisted(() => ({
  git: vi.fn(), prepare: vi.fn(), read: vi.fn(), open: vi.fn(), copy: vi.fn(),
  launch: vi.fn(), close: vi.fn(), listen: vi.fn(), add: vi.fn(), detect: vi.fn(),
  write: vi.fn(), sessions: vi.fn(), events: vi.fn(), export: vi.fn(), tasks: vi.fn(), addTask: vi.fn(), toggle: vi.fn(),
  output: undefined as undefined | ((event: { sessionId: string; data: number[] }) => void),
  exit: undefined as undefined | ((event: { sessionId: string }) => void)
}));
vi.mock("../services/workspace", () => ({ getGitStatus: mock.git, listProjectTasks: mock.tasks, addProjectTask: mock.addTask, setProjectTaskCompleted: mock.toggle }));
vi.mock("../services/handoff", () => ({ prepareHandoff: mock.prepare, readHandoffContext: mock.read, openHandoffFolder: mock.open }));
vi.mock("../services/agents", () => ({ addCustomAgent: mock.add, detectInstalledAgents: mock.detect }));
vi.mock("../services/history", () => ({ listTerminalSessions: mock.sessions, getTerminalSessionEvents: mock.events, exportTerminalSession: mock.export }));
vi.mock("../services/terminal", () => ({ isTauriRuntime: () => true, launchTerminal: mock.launch, closeTerminal: mock.close, sendTerminalInput: vi.fn(), resizeTerminal: vi.fn(), listenToTerminal: mock.listen }));
vi.mock("@xterm/xterm", () => ({ Terminal: class {
  cols = 80; rows = 24; loadAddon() {} open() {} writeln() {} reset() {} focus() {} dispose() {}
  write(data: Uint8Array) { mock.write(data); }
  onData() { return { dispose() {} }; }
} }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
const agents: Agent[] = [{ id: "codex", label: "Codex", version: null, available: true, supportsResume: true }, { id: "gemini", label: "Gemini", version: null, available: true }];
const started = { sessionId: "session-test", agentId: "codex", workingDirectory: "C:/projeto", resumed: false };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mock.copy } });
  mock.copy.mockResolvedValue(undefined); mock.close.mockResolvedValue(undefined);
  mock.launch.mockResolvedValue(started);
  mock.listen.mockImplementation(async (output, exit) => { mock.output = output; mock.exit = exit; return () => {}; });
  mock.prepare.mockResolvedValue({ id: "package-1", status: "READY", packagePath: "C:/pacotes/1", targetAgent: "gemini", warnings: [] });
  mock.read.mockResolvedValue("Contexto de teste CAFE-42"); mock.open.mockResolvedValue(undefined);
  mock.sessions.mockResolvedValue([]); mock.events.mockResolvedValue([]); mock.tasks.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function terminal(connected = false) {
  const onAgentStarted = vi.fn();
  render(<TerminalPane agents={agents} connectedAgents={connected ? [{ id: "codex", label: "Codex", executable: "codex", sessionCount: 1, lastUsedAt: 1, running: false }] : []} workingDirectory="C:/projeto" active onAgentStarted={onAgentStarted} />);
  await waitFor(() => expect(mock.listen).toHaveBeenCalled());
  return onAgentStarted;
}
async function connect(name = "Codex") {
  fireEvent.click(screen.getByRole("button", { name: "Escolha seu agente" }));
  fireEvent.click(screen.getByRole("button", { name: new RegExp("^(Conectar|Abrir) " + name + "$") }));
  await waitFor(() => expect(mock.launch).toHaveBeenCalled());
}

describe("conexão de agentes", () => {
  it("inicia a primeira conversa sem tentar retomar uma sessão inexistente", async () => {
    await terminal(); await connect();
    expect(mock.launch).toHaveBeenCalledWith("codex", "C:/projeto", 80, 24, false);
  });
  it("preserva saída e término recebidos antes da resposta do lançamento", async () => {
    mock.launch.mockImplementationOnce(async () => { mock.output?.({ sessionId: started.sessionId, data: [79, 75] }); mock.exit?.({ sessionId: started.sessionId }); return started; });
    await terminal(); await connect();
    await waitFor(() => expect(mock.write).toHaveBeenCalledWith(new Uint8Array([79, 75])));
    expect(screen.queryByRole("button", { name: "Encerrar sessão" })).toBeNull();
  });
  it("não troca o agente nem inicia outro processo com uma sessão ativa", async () => {
    await terminal(); await connect();
    await screen.findByRole("button", { name: "Encerrar sessão" });
    fireEvent.click(screen.getByRole("button", { name: "Escolha seu agente" }));
    const other = screen.getByRole("button", { name: /^Conectar Gemini$/ });
    expect((other as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(other); expect(mock.launch).toHaveBeenCalledTimes(1);
  });
  it("mostra falha acessível e atualiza o histórico após um lançamento rejeitado", async () => {
    mock.launch.mockRejectedValueOnce("Win32 error 193");
    const refresh = await terminal(); await connect();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Win32 error 193"));
    expect(refresh).toHaveBeenCalled();
  });
  it("conecta uma CLI personalizada recém-cadastrada", async () => {
    mock.add.mockResolvedValueOnce({ id: "minha-cli", label: "Minha CLI", executable: "C:/agente.exe", available: true, version: null });
    await terminal(); fireEvent.click(screen.getByRole("button", { name: "Escolha seu agente" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nome do agente" }), { target: { value: "Minha CLI" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Comando executável do agente" }), { target: { value: "C:/agente.exe" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar e conectar" }));
    await waitFor(() => expect(mock.launch).toHaveBeenCalledWith("minha-cli", "C:/projeto", 80, 24, false));
  });
});

describe("transferência explícita", () => {
  it("seleciona uma rota válida, permite revisar/copiar e não transmite automaticamente", async () => {
    render(<HandoffDialog open projectId="p1" agents={agents} onClose={() => {}} />);
    expect((screen.getByRole("combobox", { name: "Destino" }) as HTMLSelectElement).value).toBe("gemini");
    fireEvent.click(screen.getByRole("button", { name: "Criar pacote" }));
    await screen.findByRole("button", { name: "Copiar contexto" });
    expect(mock.prepare).toHaveBeenCalledWith("p1", "codex", "gemini");
    expect((screen.getByRole("textbox", { name: "Prévia do contexto" }) as HTMLTextAreaElement).value).toContain("CAFE-42");
    expect(screen.getByText("O contexto ainda não foi enviado ao agente.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copiar contexto" }));
    await waitFor(() => expect(mock.copy).toHaveBeenCalledWith("Contexto de teste CAFE-42"));
    fireEvent.click(screen.getByRole("button", { name: "Abrir pasta" }));
    await waitFor(() => expect(mock.open).toHaveBeenCalledWith("package-1"));
  });
  it("bloqueia pacote sem dois agentes e invalida a prévia ao mudar a rota", async () => {
    const view = render(<HandoffDialog open projectId="p1" agents={[agents[0]]} onClose={() => {}} />);
    expect((screen.getByRole("button", { name: "Criar pacote" }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<HandoffDialog open projectId="p1" agents={agents} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Criar pacote" })); await screen.findByRole("button", { name: "Copiar contexto" });
    fireEvent.change(screen.getByRole("combobox", { name: "Destino" }), { target: { value: "codex" } });
    expect(screen.queryByRole("button", { name: "Copiar contexto" })).toBeNull();
    expect((screen.getByRole("button", { name: "Criar pacote" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

it("Git indisponível não aparece como limpo; um erro antigo desaparece ao trocar o projeto", async () => {
  mock.git.mockRejectedValueOnce("erro antigo").mockResolvedValueOnce({ available: false, dirty: false, branch: null, head: null, changes: [], error: "Sem repositório Git" });
  const view = render(<GitPane active projectId="p1" />);
  await screen.findByRole("alert"); view.rerender(<GitPane active projectId="p2" />);
  await screen.findByText("Sem repositório Git");
  expect(screen.queryByText("LIMPO")).toBeNull(); expect(screen.queryByRole("alert")).toBeNull();
});
it("Histórico permite filtrar Gemini e falhas de inicialização", async () => {
  render(<HistoryPane active projectId="p1" agents={agents} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Agente" }), { target: { value: "gemini" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Estado" }), { target: { value: "FAILED" } });
  await waitFor(() => expect(mock.sessions).toHaveBeenLastCalledWith("p1", expect.objectContaining({ agentId: "gemini", status: "FAILED" })));
});
it("Histórico abre leitura simples, mantém detalhes técnicos recolhidos e carrega o restante", async () => {
  mock.sessions.mockResolvedValueOnce([{ id: "history-1", projectId: "p1", agentId: "gemini", workingDirectory: "C:/projeto", status: "EXITED", startedAt: 1, endedAt: 2, eventCount: 201, capturedBytes: 1200 }]);
  mock.events.mockResolvedValueOnce(Array.from({ length: 200 }, (_, id) => ({ id, direction: "OUTPUT", text: id === 0 ? "\x1b[32mCAFE-42\x1b[0m" : "", createdAt: 1 })))
    .mockResolvedValueOnce([{ id: 201, direction: "OUTPUT", text: " fim do registro", createdAt: 2 }]);
  render(<HistoryPane active projectId="p1" agents={agents} />);
  fireEvent.click(await screen.findByRole("button", { name: /Gemini/ }));
  await waitFor(() => expect(screen.getByLabelText("Registro de terminal").textContent).toBe("CAFE-42"));
  expect(document.querySelector("details")?.open).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Carregar mais registros" }));
  await waitFor(() => expect(mock.events).toHaveBeenLastCalledWith("history-1", 200, 200));
  await waitFor(() => expect(screen.getByLabelText("Registro de terminal").textContent).toContain("fim do registro"));
  fireEvent.click(screen.getByRole("button", { name: "Copiar registro" }));
  await waitFor(() => expect(mock.copy).toHaveBeenCalledWith("CAFE-42 fim do registro"));
});
it("Tarefas usa proveniência legível e permite concluir um item", async () => {
  mock.tasks.mockResolvedValueOnce([{ id: "t1", title: "Verificar continuidade", completed: false, provenance: "USER_CONFIRMED", createdAt: 1, updatedAt: 1 }]); mock.toggle.mockResolvedValueOnce(undefined);
  render(<TasksPane active projectId="p1" />);
  await screen.findByText("Confirmado por você"); fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(() => expect(mock.toggle).toHaveBeenCalledWith("t1", true));
  await waitFor(() => expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true));
});

it("Histórico consolida redesenhos e preserva a opção de registro completo", async () => {
  mock.sessions.mockResolvedValueOnce([{ id: "history-screen", projectId: "p1", agentId: "gemini", workingDirectory: "C:/projeto", status: "EXITED", startedAt: 1, endedAt: 2, eventCount: 1, capturedBytes: 100 }]);
  mock.events.mockResolvedValueOnce([{ id: 1, direction: "OUTPUT", text: "Processando 10%\r\x1b[2KConcluído CAFE-42", createdAt: 1 }]);
  render(<HistoryPane active projectId="p1" agents={agents} />);
  fireEvent.click(await screen.findByRole("button", {name:/Gemini/}));
  await waitFor(() => expect(screen.getByLabelText("Registro de terminal").textContent).toBe("Concluído CAFE-42"));
  fireEvent.change(screen.getByRole("textbox",{name:"Buscar nesta sessão"}),{target:{value:"CAFE-42"}});
  expect(document.querySelector("mark")?.textContent).toBe("CAFE-42");
  fireEvent.click(screen.getByRole("tab",{name:"Registro completo"}));
  expect(screen.getByLabelText("Registro de terminal").textContent).toContain("Processando 10%");
});
it("Histórico ignora falha de paginação antiga após navegar para outra sessão", async () => {
  const session=(id:string)=>({ id, projectId:"p1",agentId:"gemini",workingDirectory:"C:/projeto",status:"EXITED",startedAt:1,endedAt:2,eventCount:201,capturedBytes:100 });
  let rejectPage:(error:Error)=>void=()=>{};
  mock.sessions.mockResolvedValueOnce([session("first"),session("second")]);
  mock.events.mockResolvedValueOnce(Array.from({length:200},(_,id)=>({id,text:id===0?"primeira":"",direction:"OUTPUT",createdAt:1})))
    .mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectPage=reject;}))
    .mockResolvedValueOnce([{id:1,text:"segunda",direction:"OUTPUT",createdAt:1}]);
  render(<HistoryPane active projectId="p1" agents={agents}/>);
  fireEvent.click((await screen.findAllByRole("button",{name:/Gemini/}))[0]);
  fireEvent.click(await screen.findByRole("button",{name:"Carregar mais registros"}));
  fireEvent.click(screen.getByRole("button",{name:"Sessão anterior"}));
  await waitFor(()=>expect(screen.getByLabelText("Registro de terminal").textContent).toBe("segunda"));
  rejectPage(new Error("stale page error"));
  await waitFor(()=>expect(screen.getByRole("status").textContent).not.toContain("stale page error"));
});
