# Preferências locais e pacotes 0.2.0

## Idiomas

Lista confirmada visualmente em https://eureka42.org/ em 2026-11-14: Português, English, Italiano, Español, Français, Deutsch, Nederlands, Polski, Русский, Türkçe, العربية, हिन्दी, 日本語, 한국어, 中文. Catálogos JSON locais; sem tradução remota, novo servidor ou dependência de rede. Texto de projeto, arquivos, agentes e conteúdo de terminal não é traduzido. Fallback inglês para instruções ainda sem tradução. Manifesto em Sobre mantém redação institucional.

Idioma e conclusão do assistente ficam no armazenamento local da WebView, dentro dos dados deste aplicativo. Tema continua em app_settings do SQLite. A primeira configuração lê as preferências existentes antes de atualizar só o tema; não altera captura, contexto ou nuvem. Sistema acompanha eventos prefers-color-scheme; Claro/Escuro são escolhas fixas.

## Distribuição

Workflow packages.yml cria builds otimizados Windows (NSIS/MSI), Linux x64 (.deb/.AppImage) e macOS ARM64 (.app/.dmg, ZIP com metadados) a partir do mesmo commit. Pacotes são artefatos de CI, não publicação automática de release. O wrapper de console é incluído nos bundles Tauri. Updater artifacts desativados nesses pacotes de revisão; nenhuma chave de assinatura é copiada para a máquina. Não confundir build/inspeção com teste visual de outro SO.

## Evidência

28 testes frontend: inclui tradução/interpolação, seleção regional, RTL, persistência, primeira abertura, privacidade preservada, recuperação de gravação e acompanhamento do tema do SO. Teste local real ConPTY prova cwd após normalizar prefixo verbatim. A versão instalada originalmente e o executável de desenvolvimento foram exercitados no Windows. Detalhes e limitações em implementation-status.md.
