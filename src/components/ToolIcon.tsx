export function ToolIcon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    Terminal: <><path d="m5 6 5 6-5 6M13 18h6" /></>,
    Histórico: <><path d="M4 8a9 9 0 1 1-1 8M4 3v5h5M12 7v5l3 2" /></>,
    Memória: <><path d="M12 5v15M12 5C9 3 5 3 3 4v14c3-1 6-1 9 2 3-3 6-3 9-2V4c-2-1-6-1-9 1Z" /></>,
    Git: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M6 7v10M18 7c0 6-12 3-12 9" /></>,
    Tarefas: <><path d="m3 6 2 2 3-4M11 6h10M3 13h5v5H3zM11 15h10" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.Terminal}</svg>;
}
