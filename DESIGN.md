# Eureka42 — identidade e interface

Referência visual definida pelo usuário: https://eureka42.org/ (inspecionado em 2026-11-14).

## Marca

Inter, superfícies brancas, verde profundo #0B7A5C, texto #16202A, espaço generoso e contornos discretos. Usar o logotipo oficial adequado ao fundo. Sem degradês ou brilhos. Cores auxiliares distinguem Histórico, Memória, Git e Tarefas; verde indica a ação principal.

## Temas

Primeira execução usa Sistema, acompanhando prefers-color-scheme em tempo real. Claro e Escuro podem ser escolhidos e persistidos. Preferências existentes são respeitadas. O terminal conserva fundo escuro e a paleta própria das CLIs nos três modos. Tema escuro usa #0A0D13, superfícies #121722/#1A2130, texto #E9EDF2 e acento #34D6BC.

## Organização

Barra de marca 64px, sidebar 250px, navegação de ferramentas 84px, cabeçalho de projeto 84px. Trilho com ícones SVG e legendas. Área de trabalho mantém terminais ao trocar de ferramenta/projeto. Entre 900 e 1100px a navegação fica compacta, continua acessível e não desaparece.

Painéis usam títulos Inter 22px, texto 12–14px e medidas/caminhos em JetBrains Mono. Botões e campos têm raio de 8–10px; diálogos 18px. Estados vazios explicam o próximo passo e oferecem uma ação concreta.

## Comportamento e linguagem

Histórico é um registro do terminal: leitura limpa por padrão e eventos técnicos opcionais. Não apresentar isso como reconstrução semântica de conversa. Explicar armazenamento e sincronização com caminhos reais. Não confundir agente cadastrado com processo em execução nem disponibilidade com autenticação. Tema e idioma não traduzem ou alteram o conteúdo da CLI.

Manter rótulos acessíveis, foco visível, atalhos próprios da plataforma e prefers-reduced-motion. Texto do manifesto institucional em Sobre é preservado.
