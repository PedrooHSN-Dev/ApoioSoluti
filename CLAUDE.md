# Apoio Soluti — contexto para o Claude Code

Extensão de navegador (Chrome, Manifest V3, sem build: arquivos carregados direto como "extensão sem pacote") que ajuda o atendimento B2C da Soluti. Versão atual: ver `manifest.json` (5.4). Idioma da interface, dos comentários e das conversas: **português do Brasil**. Siga o estilo dos arquivos vizinhos (comentários explicando o porquê, nomes em português).

## Regras de trabalho
- Depois de mudar algo, o usuário precisa **recarregar a extensão em `chrome://extensions`**: o popup lê os arquivos do disco a cada abertura, mas o service worker (`src/background/background.js`) só atualiza ao recarregar. Erro "A extensão não respondeu" costuma ser isso.
- Suba a versão no `manifest.json` a cada entrega (o rodapé do popup mostra a versão, serve para confirmar que carregou).
- Nunca use `innerHTML` com texto vindo de sites: sempre `textContent` (ver `src/popup/aba-andamento.js`).
- Dados de clientes (nome, CPF, e-mail, telefone) e tokens do login (`auth=`, `retorno=` nas URLs de login) **não** devem ser gravados em arquivos, commits, testes ou anotações. Em testes use dados falsos.
- Não adicionar dependências nem etapa de build. `host_permissions` já é `<all_urls>`.
- Não apagar arquivos de `src/data/` (inclusive `parceiros-dados.json` e `parceiros-intl.js`): o usuário usa os dados dos parceiros na aba Lojas, mesmo quando a busca por nome do arquivo não acha referência.
- Commits e PRs: em português, sem citar o Claude (nada de "Co-Authored-By: Claude", link de sessão ou "Generated with Claude Code") e escritos para quem não acompanhou a conversa entender. Padrão do PR:
  - **Título:** curto, dizendo o que muda para o usuário (ex.: "Consulta da solicitação dentro do popup").
  - **O que mudou:** lista do que a pessoa vai notar na extensão.
  - **Por quê:** o motivo da mudança, em uma ou duas frases.
  - **Como testar:** passos no Chrome (recarregar em `chrome://extensions`, qual aba abrir, o que conferir).
  - **Versão:** a versão do `manifest.json` da entrega.

## Estrutura
- `src/popup/` — interface. `popup.html` (abas na barra lateral + painéis), `popup.js` (principal, ~136 KB, define `$`, `mostrarAviso`, `salvarNoHistorico`, `registrarHistorico`, `trocarAba`…), `aba-*.js` (abas separadas, scripts clássicos que usam os globais do `popup.js`), `popup.css` (tokens de cor no topo, tema escuro).
- `src/background/` — service worker: atalhos, menus de contexto, buscas (Databricks, Wings, Gestão Online, S.Deal), abertura do dia, e-mail Outlook e a consulta da solicitação.
- `src/content/` — scripts injetados nas páginas (macros, captura/OCR, visualizador, grid do acsoluti).
- `src/common/` — código compartilhado, incluindo `andamento-parser.js`.
- `src/data/`, `src/offscreen/`, `lib/` (Tesseract).
- Mapa completo das abas e atalhos: ver as anotações do projeto "Apoio Soluti" no claude.ai (`claude/anotacoes-extensao.md`).

## Aba Solicitação e a consulta da solicitação (v5.4)
Tela: campo do código + **Consultar** (Enter também), e abaixo "Abrir solicitação" e "Abrir site da AR" (abrem a AR em nova aba). A consulta mostra o conteúdo dentro do popup, em cartões recolhíveis; o painel rola (`#painel-solicitacao` com `overflow-y: auto`).

Fluxo: `aba-andamento.js` → `chrome.runtime.sendMessage({tipo:"consultarAndamento", codigo, id})` → `consultarAndamento()` no background:
1. Descobre a AR: `GET https://arsoluti.acsoluti.com.br/pool/busca-urls?solicitacao=<código>` → `data.ar_subdomain`. O código varia de AR para AR; é essa API que acha a AR certa (a mesma da aba Solicitação). Há muitas ARs (`<sub>.acsoluti.com.br`, ex.: arsoluti, ardigisec).
2. Com a sessão do navegador (`credentials:"include"`), na AR:
   - `GET /certdig/gridlocalizar?filtros={"codigo":"…","idCDsolicitacao":""}` → JSON dojo `{items:[…]}`. **A lista pode ter itens `null`** (descartar). Se a resposta não for JSON (veio HTML de login) = **sessão expirada**.
   - `GET /certdig/andamento/id/<idCDsolicitacao>` → HTML da página.
   - `GET /certdig/gridhistorico?idsolicitacao=<id>&start=0&count=100`, `GET /certdig/gridpessoasenvolvidas?…` → JSON (a página monta esses grids por JavaScript, não estão no HTML).
   - `POST /certdig/valida-documentos-anexos/id/<id>` com corpo `json=true` (headers `x-requested-with: XMLHttpRequest`).
3. O service worker não tem `DOMParser`: devolve o HTML cru e o **popup** lê com `AndamentoParser.extrairHtml` (`src/common/andamento-parser.js`).

Leitor do HTML (ajustado ao HTML real): usa a área de conteúdo (pai de `#dados`); `dl/dt/dd` → campos; `<strong>` solto → título de seção ("Solicitação", "Pedido Externo", "Pessoas envolvidas", "Documentação"); `.alert` → "Avisos"; primeiro `h2` → cabeçalho ("Solicitação X (Situação)"); ignora menu, coluna lateral ("Acesso Rápido", "Identificação"), modais, `dijit*`, `dojoxGrid`. Linhas `<dt></dt><dd><a>…</a></dd>` (botões de impressão) são descartadas. Tudo que não vira campo vai para "Texto completo da página".

Sessão expirada: a tela oferece "Entrar com certificado" = abrir `https://<sub>.acsoluti.com.br/auth/precertdig`. O login real é com certificado A3 (TLS mútuo em `login.acsoluti.com.br/public/ssl/logincert2.php`); o Chrome pede o certificado e o PIN do token, e **o PIN não dá para automatizar**. A política do Chrome `AutoSelectCertificateForUrls` com `https://login.acsoluti.com.br` elimina só a janela de escolha do certificado.

## Pendências e decisões abertas
- O usuário vai avaliar **quais seções da consulta são realmente úteis** e então enxugar (hoje mostra muita coisa: resumo da busca, avisos, dados, pedido externo, histórico, pessoas, documentos anexos, texto completo).
- Formato real dos JSONs de `gridhistorico`, `gridpessoasenvolvidas` e `valida-documentos-anexos` ainda não foi visto: são lidos de forma genérica (colunas = chaves do JSON). Ajustar quando o usuário mostrar exemplos (com dados falsos).
- O HTML usado para ajustar o leitor era o da página já renderizada pelo navegador; o HTML cru que a extensão baixa pode diferir um pouco.
- Ideia futura: incluir o login com certificado no "Começar o dia".
- Ideia futura: onboarding guiado na primeira execução (aba "Bem-vindo" hoje é texto estático).

## Como testar sem o Chrome
Não há suíte de testes no repositório. Para checar lógica de DOM/parser use `node` + `jsdom` (instalar fora da pasta da extensão): injete `global.DOMParser`, faça `require("./src/common/andamento-parser.js")` (o arquivo exporta com `module.exports` quando existe `module`) e rode `extrairHtml(html)`. Para a aba inteira, stubar `chrome.runtime.sendMessage`, `$`, `mostrarAviso`, `salvarNoHistorico` e avaliar `aba-andamento.js`. Teste final sempre no Chrome real, recarregando a extensão.
