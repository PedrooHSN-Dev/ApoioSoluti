// Apoio Soluti v4 — ferramentas de atendimento do Suporte B2C.
// Desenvolvido por Vitor Azevedo (v1 e v2).
// Reescrito e mantido por Vinícius Zoccoli e Pedro H. S. Nascimento (v3 em diante).

importScripts(
  './arrow.js',
  // tabela dos sistemas, rotina do dia, abertura do dia e e-mail pelo Outlook
  '../data/sistemas.js',
  // destinos do menu do botao direito
  '../common/sites-busca.js',
  '../common/rotina-dia.js',
  './abertura-dia.js',
  './email-outlook.js'
);

const PAGINAS_BLOQUEADAS = /^(chrome|edge|about|devtools|view-source|chrome-extension|edge-extension|moz-extension):|^https:\/\/(chromewebstore\.google\.com|microsoftedge\.microsoft\.com)/i;

function podeUsar(url) {
  return Boolean(url) && !PAGINAS_BLOQUEADAS.test(url);
}

const ARQUIVOS_CONTENT = [
  "src/common/macros.js",
  "src/content/equipe.js",
  "src/content/content.js",
  "src/content/visualizador.js"
];

function toVarint(val) {
  let bytes = [];
  while (val > 127) {
    bytes.push((val & 0x7F) | 0x80);
    val >>>= 7;
  }
  bytes.push(val);
  return bytes;
}

function encodeString(str) {
  const bytes = new TextEncoder().encode(str);
  return [...toVarint(bytes.length), ...bytes];
}

function buildWidgetState(id, type, val) {
  const idBytes = [0x0A, ...encodeString(id)];
  let valBytes = [];
  
  if (type === 'int') {
    valBytes = [0x28, ...toVarint(val)]; // field 5
  } else if (type === 'string') {
    valBytes = [0x32, ...encodeString(val)]; // field 6
  } else if (type === 'trigger') {
    valBytes = [0x10, val ? 1 : 0]; // field 2
  }
  
  const payload = [...idBytes, ...valBytes];
  return [0x0A, ...toVarint(payload.length), ...payload];
}

function buildBackMsg(sessionId, cpfCnpj) {
  // IDs exatos dos inputs no seu Databricks
  const radioId = '$$ID-ed08728521ac97b9c787b6458fe5c32d-None';
  const inputId = '$$ID-9bf7704f81035a0c1dd5869e9f15e337-None';
  const periodoId = '$$ID-f7ba3404bc21064042376b1db44d38ce-None';
  const btnId = '$$ID-57751a2638b17770b1019ed6ba02d751-None';

  const cleanDoc = cpfCnpj.replace(/\D/g, '');
  
  const w1 = buildWidgetState(radioId, 'int', 4); // 4 = CNPJ
  const w2 = buildWidgetState(inputId, 'string', cleanDoc);
  const w3 = buildWidgetState(periodoId, 'int', 8); // 8 = 5 anos
  const w4 = buildWidgetState(btnId, 'trigger', 1); // Clique no botão

  const widgetStatesBytes = [...w1, ...w2, ...w3, ...w4];

  // Montagem do RerunScriptMsg
  const f2 = [0x12, ...toVarint(widgetStatesBytes.length), ...widgetStatesBytes];
  const f3 = [0x1A, ...encodeString(sessionId)];
  const f4 = [0x22, 0x00];
  const f5 = [0x2A, 0x00];

  const rerunScriptBytes = [0x0A, 0x00, ...f2, ...f3, ...f4, ...f5];

  // Tag 11 (BackMsg -> rerun_script) = 0x5A
  return new Uint8Array([0x5A, ...toVarint(rerunScriptBytes.length), ...rerunScriptBytes]);
}

// =====================================================================
// 2. COMUNICAÇÃO WEBSOCKET E EXTRAÇÃO DA TABELA (Sem libs externas!)
// =====================================================================

// Formata epoch em milissegundos (como vem do Databricks pras colunas
// DATA_*) no mesmo padrão "dd/mm/aaaa hh:mm" que já é usado pro resto da
// extensão, em vez de deixar o número cru aparecer na tela.
function formatarEpocaMs(ms) {
  const data = new Date(ms);
  if (Number.isNaN(data.getTime())) return String(ms);
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function extrairTabelaArrow(bufferArrow) {
  // Transforma o binário em texto
  const textoCru = new TextDecoder('utf-8').decode(bufferArrow);

  // Caça exatamente onde a tabela JSON começa e termina no meio do lixo binário
  const inicioTabela = textoCru.indexOf('[{"SKU"');
  if (inicioTabela === -1) return [];

  let textoJSON = textoCru.slice(inicioTabela);
  const fimTabela = textoJSON.lastIndexOf('}]');
  if (fimTabela === -1) return [];

  textoJSON = textoJSON.slice(0, fimTabela + 2);

  try {
    return JSON.parse(textoJSON);
  } catch (err) {
    throw new Error("Erro ao interpretar os dados da tabela.");
  }
}

async function buscarDatabricks(cpfCnpj) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://data-app-609763180630129.9.azure.databricksapps.com/_stcore/stream', ['streamlit']);
    ws.binaryType = 'arraybuffer';

    let sessionId = null;

    ws.onopen = () => {
      // Acorda o servidor com a mensagem inicial
      const initMsg = Uint8Array.from(atob('WggKABIAGgAiAA=='), c => c.charCodeAt(0));
      ws.send(initMsg);
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') return;

      const buffer = new Uint8Array(event.data);

      // Etapa A: Capturar a Hash da Sessão
      if (!sessionId) {
        const text = new TextDecoder().decode(buffer);
        const match = text.match(/[a-f0-9]{32}/);
        if (match) {
          sessionId = match[0];
          ws.send(buildBackMsg(sessionId, cpfCnpj));
        }
        return;
      }

      // Etapa B: Isolar a tabela na resposta do servidor
      let arrowStart = -1;
      for (let i = 0; i < buffer.length - 4; i++) {
        if (buffer[i] === 0xFF && buffer[i+1] === 0xFF && buffer[i+2] === 0xFF && buffer[i+3] === 0xFF) {
          arrowStart = i;
          break;
        }
      }

      if (arrowStart !== -1) {
        try {
          const arrowBuffer = buffer.slice(arrowStart);
          
          // Usa o Apache Arrow para traduzir o binário
          const table = Arrow.tableFromIPC(arrowBuffer);
          
          // Converte para JSON e converte BigInts e Datas para string (para não dar erro no envio pro Popup)
          const dadosJson = table.toArray().map(row => {
            const obj = row.toJSON();
            for (let key in obj) {
              if (obj[key] !== null) {
                if (typeof obj[key] === 'bigint' || typeof obj[key] === 'number') {
                  // As colunas DATA_* chegam como int64/BigInt em epoch
                  // milissegundos (não como Date), por isso apareciam como
                  // números crus ("1784038003000") na extensão. Só as
                  // colunas de data são convertidas — os outros números
                  // (BigInt de outras colunas) continuam virando texto puro.
                  const numero = Number(obj[key]);
                  const pareceDataMs = /^DATA_/i.test(key) && numero > 0 && numero < 4102444800000;
                  if (pareceDataMs) {
                    // guarda o epoch original num campo "_ms" pra dar pra
                    // ordenar por data no popup sem ter que reinterpretar
                    // o texto formatado (dd/mm/aaaa não ordena como texto)
                    obj[`${key}_ms`] = numero;
                    obj[key] = formatarEpocaMs(numero);
                  } else {
                    obj[key] = obj[key].toString();
                  }
                } else if (obj[key] instanceof Date) {
                  // Ajusta a data visualmente
                  obj[`${key}_ms`] = obj[key].getTime();
                  obj[key] = obj[key].toLocaleString('pt-BR');
                }
              }
            }
            return obj;
          });

          ws.close();
          resolve({ sucesso: true, dados: dadosJson });
        } catch (err) {
          ws.close();
          reject({ erro: "Falha ao extrair tabela Arrow: " + err.message });
        }
      }
    };

    ws.onerror = () => {
      reject({ erro: "Erro na conexão WebSocket com o Databricks." });
    };

    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
      reject({ erro: "Tempo esgotado aguardando o Databricks." });
    }, 15000);
  });
}

async function enviarParaAba(abaId, mensagem) {
  try {
    await chrome.tabs.sendMessage(abaId, mensagem, { frameId: 0 });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: abaId, frameIds: [0] },
      func: () => {
        window.__apoioSolutiCarregado = false;
        window.__apoioSolutiVisualizador = false;
      }
    });
    await chrome.scripting.executeScript({
      target: { tabId: abaId, frameIds: [0] },
      files: ARQUIVOS_CONTENT
    });
    await chrome.tabs.sendMessage(abaId, mensagem, { frameId: 0 });
  }
}

async function iniciarSelecao(aba) {
  await enviarParaAba(aba.id, { tipo: "iniciarSelecao" });
}

chrome.commands.onCommand.addListener(async (comando) => {
  if (comando === "abrir-janela") {
    await abrirApoioSolutiEmJanela();
    return;
  }
  if (comando !== "extrair-texto") return;

  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!aba || !podeUsar(aba.url)) {
    console.warn("Apoio Soluti: esta página não permite captura.");
    return;
  }

  garantirOffscreen().catch((erro) =>
    console.warn("Apoio Soluti: falha ao aquecer o OCR:", erro.message)
  );

  try {
    await iniciarSelecao(aba);
  } catch (erro) {
    console.error("Apoio Soluti: não foi possível iniciar a seleção:", erro);
  }
});

const URL_JANELA_APOIO_SOLUTI = chrome.runtime.getURL("src/popup/popup.html");

async function abrirApoioSolutiEmJanela() {
  const janelas = await chrome.windows.getAll({ populate: true });
  for (const janela of janelas) {
    const abaExistente = janela.tabs?.find((aba) =>
      aba.url?.startsWith(URL_JANELA_APOIO_SOLUTI)
    );
    if (abaExistente) {
      await chrome.windows.update(janela.id, { focused: true });
      return;
    }
  }
  await chrome.windows.create({
    url: `${URL_JANELA_APOIO_SOLUTI}?janela=1`,
    type: "popup",
    width: 640,
    height: 640
  });
}

let offscreenPromise = null;
function garantirOffscreen() {
  if (offscreenPromise) return offscreenPromise;
  offscreenPromise = chrome.offscreen.hasDocument().then((existe) => {
    if (existe) return;
    return chrome.offscreen.createDocument({
      url: "src/offscreen/offscreen.html",
      reasons: ["WORKERS"],
      justification: "Executa o OCR local sobre o recorte da tela."
    });
  });
  return offscreenPromise;
}

chrome.runtime.onInstalled.addListener(() => garantirOffscreen().catch(() => {}));
chrome.runtime.onStartup.addListener(() => garantirOffscreen().catch(() => {}));

async function reconhecer(captura) {
  await garantirOffscreen();
  const resposta = await chrome.runtime.sendMessage({
    tipo: "ocr",
    destino: "offscreen",
    dataUrl: captura.dataUrl,
    rect: captura.rect,
    dpr: captura.dpr
  });
  if (!resposta) throw new Error("Sem resposta do leitor de texto.");
  if (resposta.erro) throw new Error(resposta.erro);
  return { texto: resposta.texto };
}

async function reconhecerImagem({ src, rotacao, espelho }) {
  await garantirOffscreen();
  const resposta = await chrome.runtime.sendMessage({
    tipo: "ocrOriginal",
    destino: "offscreen",
    src,
    rotacao,
    espelho
  });
  if (!resposta) throw new Error("Sem resposta do leitor de texto.");
  if (resposta.erro) throw new Error(resposta.erro);
  return { texto: resposta.texto };
}

async function capturar(mensagem, remetente) {
  const abaId = remetente?.tab?.id;
  const janelaId = remetente?.tab?.windowId;
  const dataUrl = await chrome.tabs.captureVisibleTab(janelaId, { format: "png" });

  if (abaId !== undefined) {
    chrome.tabs.sendMessage(abaId, { tipo: "capturaPronta" }, { frameId: 0 }).catch(() => {});
  }
  return reconhecer({ dataUrl, rect: mensagem.rect, dpr: mensagem.dpr });
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.destino === "offscreen") return;

  if (mensagem?.tipo === "capturar") {
    capturar(mensagem, remetente)
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }
  if (mensagem?.tipo === "ocrImagem") {
    reconhecerImagem(mensagem)
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }
  if (mensagem?.tipo === "iniciarOcr") {
    iniciarOcrNaAbaAtiva()
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }
});

async function iniciarOcrNaAbaAtiva() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!aba || !podeUsar(aba.url)) return { erro: "Esta página não permite captura de tela." };

  garantirOffscreen().catch((erro) => console.warn("Apoio Soluti: falha ao aquecer o OCR:", erro.message));
  await iniciarSelecao(aba);
  return { ok: true };
}


/* ==================================================================
   AR e Solicitacoes
   ================================================================== */
const API_BUSCA_URLS = "https://arsoluti.acsoluti.com.br/pool/busca-urls";
const MENU_RAIZ = "apoio-soluti-raiz";
const MENU_BUSCAS = "apoio-soluti-buscas";
const MENU_LOJAS = "apoio-soluti-lojas";
const MENU_AMPLIAR = "apoio-soluti-ampliar-imagem";
const MENU_LER_IMAGEM = "apoio-soluti-ler-imagem";

// O `icons` que ficava aqui era do Firefox; o Chrome ignora a propriedade e
// os itens saíam sem ícone nenhum. Agora o emoji no próprio título faz esse
// papel, nos dois navegadores.
function criarItemMenu(propriedades) {
  chrome.contextMenus.create(propriedades);
}

/* O menu do botão direito -------------------------------------------------
   Tudo pendurado em "Apoio Soluti": antes eram cinco linhas nossas soltas no
   menu da página. Os destinos vêm das tabelas de common/sites-busca.js, que
   é o que deixa isto ser um laço em vez de uma chamada por item.

   A raiz atende seleção E imagem, e cada filho declara o seu contexto: com
   texto selecionado aparecem Buscas e Lojas, sobre uma imagem aparecem os
   dois itens de imagem.
   ----------------------------------------------------------------------- */
function montarMenus() {
  chrome.contextMenus.removeAll(() => {
    criarItemMenu({
      id: MENU_RAIZ,
      title: "Apoio Soluti",
      contexts: ["selection", "image"]
    });

    criarItemMenu({
      id: MENU_BUSCAS,
      parentId: MENU_RAIZ,
      title: "🔎 Buscas",
      contexts: ["selection"]
    });
    SITES_BUSCA.forEach((site) => {
      criarItemMenu({
        id: site.id,
        parentId: MENU_BUSCAS,
        title: `${site.emoji} ${site.nome}`,
        contexts: ["selection"]
      });
    });

    criarItemMenu({
      id: MENU_LOJAS,
      parentId: MENU_RAIZ,
      title: "🏪 Lojas",
      contexts: ["selection"]
    });
    LOJAS_BUSCA.forEach((loja) => {
      criarItemMenu({
        id: loja.id,
        parentId: MENU_LOJAS,
        title: `${loja.emoji} ${loja.nome}`,
        contexts: ["selection"]
      });
    });

    criarItemMenu({
      id: MENU_LER_IMAGEM,
      parentId: MENU_RAIZ,
      title: "🔤 Extrair texto desta imagem",
      contexts: ["image"]
    });
    criarItemMenu({
      id: MENU_AMPLIAR,
      parentId: MENU_RAIZ,
      title: "🔍 Ampliar imagem",
      contexts: ["image"]
    });
  });
}

chrome.runtime.onInstalled.addListener(montarMenus);

chrome.contextMenus.onClicked.addListener((info, aba) => {
  const id = info.menuItemId;

  if (id === MENU_AMPLIAR) return ampliarImagem(info.srcUrl, aba);
  if (id === MENU_LER_IMAGEM) return lerTextoDaImagem(info.srcUrl, aba);

  const loja = LOJAS_BUSCA.find((item) => item.id === id);
  if (loja) return abrirBusca(loja, info.selectionText);

  const site = SITES_BUSCA.find((item) => item.id === id);
  if (!site) return;

  // o código da solicitação vem às vezes em duas partes; as outras buscas
  // recebem a seleção inteira, que é nome, CPF/CNPJ ou voucher
  if (site.acao === "solicitacao") return abrirSolicitacao(limparCodigo(info.selectionText));
  if (site.acao === "ar") return abrirAR(limparCodigo(info.selectionText));
  return abrirBusca({ aba: site.aba, escopo: "" }, info.selectionText);
});

async function abrirBusca(destino, selecao) {
  const termo = (selecao || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!termo) return;
  const pedido = { aba: destino.aba, escopo: destino.escopo, termo, quando: Date.now() };

  try {
    await chrome.storage.session.set({ buscaPendente: pedido });
    await chrome.action.openPopup();
  } catch {
    const parametros = new URLSearchParams({ aba: pedido.aba, q: termo });
    if (pedido.escopo) parametros.set("escopo", pedido.escopo);
    await chrome.windows.create({
      url: chrome.runtime.getURL(`src/popup/popup.html?${parametros}`),
      type: "popup", width: 640, height: 660
    });
  }
}

async function ampliarImagem(src, aba) {
  if (!src || !aba?.id) return;
  garantirOffscreen().catch(() => {});
  try {
    await enviarParaAba(aba.id, { tipo: "abrirVisualizador", src });
  } catch (erro) {
    console.error("Apoio Soluti: não foi possível ampliar a imagem:", erro);
  }
}

async function lerTextoDaImagem(src, aba) {
  if (!src || !aba?.id) return;
  if (!podeUsar(aba.url)) return;

  const mostrar = async (dados) => {
    try { await enviarParaAba(aba.id, { tipo: "resultadoOcr", dados }); } catch {}
  };

  await mostrar({ carregando: true });
  try {
    const { texto } = await reconhecerImagem({ src });
    await mostrar({ texto: texto || "Nenhum texto reconhecido nessa imagem." });
  } catch (erro) {
    await mostrar({ erro: erro.message || String(erro) });
  }
}

function limparCodigo(texto) {
  // O código de emissão do BirdID às vezes vem com duas partes separadas
  // por espaço (ex.: "11DE250509413831 00025530692869"). Para buscar no
  // SisAR usamos só a primeira parte, então pegamos apenas o primeiro
  // "token" em vez de simplesmente remover os espaços (o que colaria as
  // duas partes e quebraria a busca).
  return (texto || "").trim().split(/\s+/)[0] || "";
}

async function consultarUrls(codigo) {
  const resposta = await fetch(`${API_BUSCA_URLS}?solicitacao=${encodeURIComponent(codigo)}`);
  if (!resposta.ok) throw new Error(`A API respondeu ${resposta.status}.`);
  return resposta.json();
}

async function abrirSolicitacao(codigo) {
  if (!codigo) return { erro: "Nenhum código informado." };
  try {
    const json = await consultarUrls(codigo);
    const subdomain = json?.data?.ar_subdomain;
    if (!subdomain) return { erro: "Subdomínio não encontrado para esse código." };

    const filtros = encodeURIComponent(JSON.stringify({ codigo, idCDsolicitacao: "" }));
    const gridURL = `https://${subdomain}.acsoluti.com.br/certdig/gridlocalizar?filtros=${filtros}`;
    await chrome.tabs.create({ url: gridURL, active: true });
    return { ok: true, quantidade: 1 };
  } catch (erro) {
    return { erro: "Não foi possível abrir a solicitação. Verifique o código." };
  }
}

async function abrirAR(codigo) {
  if (!codigo) return { erro: "Nenhum código informado." };
  try {
    const json = await consultarUrls(codigo);
    if (json.status !== "success" || !json.data?.urls?.length) return { erro: "Nenhum site de AR encontrado." };

    const urls = [...new Set(json.data.urls)];
    urls.forEach((url, indice) => chrome.tabs.create({ url, active: indice === 0 }));
    return { ok: true, quantidade: urls.length };
  } catch (erro) {
    return { erro: "Não foi possível abrir o site da AR." };
  }
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "abrirSolicitacao") {
    abrirSolicitacao(limparCodigo(mensagem.codigo)).then(responder).catch(e => responder({ erro: e.message || String(e) }));
    return true;
  }
  if (mensagem?.tipo === "abrirAR") {
    abrirAR(limparCodigo(mensagem.codigo)).then(responder).catch(e => responder({ erro: e.message || String(e) }));
    return true;
  }
});


/* ==================================================================
   Andamento da solicitação (aba "Andamento" do popup)
   Reúne, na AR dona do código, o que a página de andamento mostra:
   o resumo do grid de busca, o HTML do andamento e os três grids/consultas
   que a página carrega por AJAX (histórico, pessoas envolvidas, documentos
   anexos). Tudo roda com a sessão que o atendente já tem no navegador
   (credentials: "include"); nada é guardado aqui.

   O service worker não tem DOMParser, então devolve o HTML cru e o popup
   faz a leitura (src/common/andamento-parser.js).
   ================================================================== */
const ANDAMENTO_TIMEOUT_MS = 25000;
const ANDAMENTO_GRID_LINHAS = 100;

async function buscarNaAr(url, opcoes = {}) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), ANDAMENTO_TIMEOUT_MS);
  try {
    const resposta = await fetch(url, { credentials: "include", signal: controle.signal, ...opcoes });
    const texto = await resposta.text();
    return { status: resposta.status, texto };
  } finally {
    clearTimeout(timer);
  }
}

function lerJsonDaAr(texto) {
  let t = (texto || "").trim();
  const comentado = t.match(/^\/\*([\s\S]*)\*\/$/); // dojo às vezes embrulha em /* */
  if (comentado) t = comentado[1].trim();
  try { return JSON.parse(t); } catch { return undefined; }
}

async function consultarAndamento(codigo, idEscolhido) {
  if (!codigo) return { erro: "Digite o código da solicitação." };

  let subdominio;
  try {
    const json = await consultarUrls(codigo);
    subdominio = json?.data?.ar_subdomain;
  } catch (erro) {
    return { erro: "Não foi possível descobrir a AR desse código. Confira o código e a conexão." };
  }
  if (!subdominio) return { erro: "Subdomínio não encontrado para esse código." };

  const base = `https://${subdominio}.acsoluti.com.br`;
  const loginUrl = `${base}/auth/precertdig`;

  const filtros = encodeURIComponent(JSON.stringify({ codigo, idCDsolicitacao: "" }));
  let grid;
  try {
    grid = await buscarNaAr(`${base}/certdig/gridlocalizar?filtros=${filtros}`);
  } catch (erro) {
    return { erro: `Sem resposta da AR (${subdominio}). Tente de novo em instantes.`, subdominio };
  }

  const gridJson = lerJsonDaAr(grid.texto);
  // Sem sessão a AR devolve a página de login (HTML) em vez do JSON do grid.
  if (gridJson === undefined) return { sessaoExpirada: true, subdominio, loginUrl };

  // o grid pode trazer posições vazias (null) no meio da lista: descartar
  const itens = Array.isArray(gridJson?.items)
    ? gridJson.items.filter((i) => i && typeof i === "object")
    : null;
  if (!itens) return { erro: "A AR respondeu em um formato inesperado.", subdominio };
  if (!itens.length) return { erro: `Nenhuma solicitação com esse código na AR ${subdominio}.`, subdominio };

  const id = String(idEscolhido || itens[0].idCDsolicitacao || "");
  if (!id) return { erro: "A AR não informou o número interno da solicitação.", subdominio };

  const url = (caminho) => `${base}${caminho}`;
  const ajax = {
    accept: "*/*",
    "content-type": "application/x-www-form-urlencoded",
    "x-requested-with": "XMLHttpRequest"
  };
  const parametros = `idsolicitacao=${encodeURIComponent(id)}&start=0&count=${ANDAMENTO_GRID_LINHAS}`;

  const [andamento, historico, pessoas, documentos] = await Promise.allSettled([
    buscarNaAr(url(`/certdig/andamento/id/${encodeURIComponent(id)}`)),
    buscarNaAr(url(`/certdig/gridhistorico?${parametros}`), { headers: ajax }),
    buscarNaAr(url(`/certdig/gridpessoasenvolvidas?${parametros}`), { headers: ajax }),
    buscarNaAr(url(`/certdig/valida-documentos-anexos/id/${encodeURIComponent(id)}`), {
      method: "POST",
      headers: { ...ajax, accept: "application/json, text/javascript, */*; q=0.01" },
      body: "json=true"
    })
  ]);

  const pegar = (r, comoJson) => {
    if (r.status !== "fulfilled") return { erro: "Sem resposta." };
    if (r.value.status >= 400) return { erro: `A AR respondeu ${r.value.status}.` };
    if (!comoJson) return { texto: r.value.texto };
    const json = lerJsonDaAr(r.value.texto);
    return json === undefined ? { erro: "Resposta não reconhecida (sessão expirada?)." } : { json };
  };

  return {
    ok: true,
    subdominio,
    id,
    urlAndamento: url(`/certdig/andamento/id/${encodeURIComponent(id)}`),
    itens,
    andamento: pegar(andamento, false),
    historico: pegar(historico, true),
    pessoas: pegar(pessoas, true),
    documentos: pegar(documentos, true)
  };
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo !== "consultarAndamento") return;
  consultarAndamento(limparCodigo(mensagem.codigo), mensagem.id)
    .then(responder)
    .catch((e) => responder({ erro: e.message || String(e) }));
  return true;
});


/* ==================================================================
   S.Deal - busca de voucher (Silencioso em Background)
   ================================================================== */
const SDEAL_ORIGEM = "https://sdeal.soluti.com.br";

async function buscarVoucherSDeal(numeroVoucher) {
  if (!numeroVoucher) return { erro: "Digite o número do voucher." };

  const base = "https://sdeal.soluti.com.br/GVS";
  const guid = "{B88CD30B-9E3E-433A-8D40-ED95AEC9CD3E}";
  const formID = "464569235";
  const headersComuns = { accept: "*/*", "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" };

  try {
    // Dispara a sequência de requisições direto do background. 
    // O { credentials: "include" } puxa os cookies de sessão ativos no seu navegador automaticamente.
    await fetch(`${base}/wfrcore?action=ruleopenform&sys=GVS&guid=${encodeURIComponent(guid)}`, { headers: headersComuns, credentials: "include" });
    await fetch(`${base}/form.do?sys=GVS&formID=${formID}&param=include&align=0&filter=&goto=0&WFRInput818663=`, { headers: headersComuns, credentials: "include" });
    await fetch(`${base}/gridEdit.do?sys=GVS&action=gridEdit&param=refresh&formID=${formID}&comID=821586&gridComID=-1&gt=-1&WFRInput818663=${encodeURIComponent(numeroVoucher)}`, { headers: headersComuns, credentials: "include" });

    // O POST de "Pesquisar voucher" feito pelo navegador de verdade NÃO manda
    // só o número do voucher — ele manda o estado inteiro dos ~200 campos do
    // formulário (a maioria em branco, algumas legendas fixas do formulário
    // e uns links de imagem fixos por formID). Foi assim que a gente achou o
    // problema do código de solicitação: com um POST "magro" (só
    // F_1_818663), 43 dos 44 campos voltam certinho, mas o campo do código
    // de solicitação (818716) simplesmente não é reenviado pelo servidor —
    // aparentemente ele só reenvia esse campo quando o valor que o cliente
    // diz já ter (F_96/F_97_818716) é diferente do que o servidor calculou,
    // e sem esses ~200 campos no POST esse componente nem entra na conta.
    // Por isso replicamos aqui o corpo inteiro (com F_96/F_97_818716 em
    // branco, como estaria numa busca "do zero", sem valor salvo ainda).
    const galeriaBase = `openImageStreamFromGalery.do?sys=GVS&formID=${formID}&guid=%7bEB56B2D5-FFF5-43CC-87DF-679DF438F11A%7d`;
    const galeriaExtra = `openImageStreamFromGalery.do?sys=GVS&guid=%7BF3D6145D-2A85-4D14-93A4-70862D16E62A%7D`;
    const corpo = new URLSearchParams({
      action: "executeRule",
      pType: "2",
      ruleName: "Pesquisar voucher",
      sys: "GVS",
      formID,
      parentRID: "",
      P_0: "",
      F_0_818690: galeriaBase,
      F_1_818663: numeroVoucher,
      F_2_818721: "",
      F_3_821484: "",
      F_4_820976: galeriaBase,
      F_5_820989: galeriaBase,
      F_6_821016: galeriaBase,
      F_7_820900: galeriaBase,
      F_8_821038: galeriaBase,
      F_9_821587: galeriaBase,
      F_10_821586: "",
      F_11_839816: galeriaExtra,
      F_12_1294041: galeriaExtra,
      F_30_821493: "",
      F_31_818681: "",
      F_32_818719: "",
      F_35_818700: "",
      F_36_818699: "Identificador",
      F_39_818701: "",
      F_40_818702: "Voucher",
      F_43_818724: "",
      F_44_818725: "Perfil",
      F_47_818704: "",
      F_48_818703: "Habilitado",
      F_51_818705: "",
      F_52_818706: "Situação",
      F_55_818670: "",
      F_56_818669: "Cliente",
      F_59_818672: "",
      F_60_818671: "Negociação",
      F_63_819950: "",
      F_64_819951: "Importação AR",
      F_67_818674: "",
      F_68_818673: "Empenho",
      F_71_818687: "",
      F_72_818686: "Produto atual",
      F_75_819993: "",
      F_76_819994: "Produto anterior",
      F_79_818689: "Alocado para",
      F_80_818688: "",
      F_83_818676: "",
      F_84_818675: "Sugestão de uso",
      F_87_820540: "",
      F_88_820539: "Serial Renovação",
      F_91_818713: "",
      F_92_818714: "Emitido para",
      F_95_821590: "",
      F_96_818716: "",
      F_97_818716: "",
      F_98_818715: "Cód. Solicitação",
      F_101_818717: "",
      F_102_818718: "Data de Aprovação",
      F_103_819952: "",
      F_104_819953: "",
      F_105_819954: "",
      F_106_820405: "",
      F_107_820406: "",
      F_111_820899: "Data de Vencimento",
      F_112_820990: "",
      F_115_820896: "Cidade Solicitação",
      F_116_821029: "",
      F_119_820891: "",
      F_120_820890: "Estado Solicitação",
      F_123_820894: "",
      F_124_820895: "Data da Emissão",
      F_127_820893: "",
      F_128_820892: "Data da Revogação",
      F_131_820909: "",
      F_132_820910: "Status Solicitação",
      F_135_820905: "",
      F_136_820908: "RG",
      F_139_820889: "",
      F_140_820888: "Telefone",
      F_143_820906: "",
      F_144_820907: "Email",
      F_147_820903: "",
      F_148_820904: "Matricula JUS",
      F_151_820887: "",
      F_152_820886: "Lotação JUS",
      F_155_820901: "Cargo JUS",
      F_156_820902: "",
      F_159_820944: "",
      F_160_820943: "Data Autoriz. SGOV",
      F_163_820946: "",
      F_164_820945: "Data Requisi. SGOV",
      F_167_820948: "",
      F_168_820947: "Lotação SGOV",
      F_171_820950: "",
      F_172_820949: "Protocolo SGOV",
      F_175_820952: "",
      F_176_820951: "Cidade SGOV",
      F_179_820953: "Estado SGOV",
      F_180_820954: "",
      F_183_821597: "Dt Criação Solici.",
      F_184_821598: "",
      F_187_821034: "Data de Agendamento",
      F_188_821035: "",
      F_191_821037: "Origem Solicitação",
      F_192_821036: "",
      F_195_821078: "Nome AR",
      F_196_821079: "",
      F_199_821218: "Sugestao Restrita",
      F_200_821219: "",
      F_203_821224: "CPF Sugestão",
      F_204_821225: "",
      F_207_821222: "CNPJ Sugestão",
      F_208_821223: "",
      F_211_821220: "Codigo de Venda",
      F_212_821221: "",
      F_215_821226: "Integração",
      F_216_821227: "",
      F_219_821497: "Status Spro",
      F_220_821498: "",
      F_221_821588: "Histórico de Revogação do Voucher"
    });
    const resposta = await fetch(`${base}/executeRule.do`, {
      method: "POST",
      headers: { ...headersComuns, accept: "application/javascript,*/*;q=0.9", "content-type": "application/x-www-form-urlencoded" },
      credentials: "include", 
      body: corpo.toString()
    });

    // Se a requisição redirecionar para uma página de login, a sessão expirou
    if (resposta.url && resposta.url.includes("login")) {
      return { erro: "Sessão expirada. Faça login no site do S.Deal e tente novamente." };
    }

    // O S.Deal responde em ISO-8859-1 (Latin-1), não UTF-8. Usar
    // resposta.text() direto decodifica errado e todo acento vira "�"
    // ("já" -> "j�", "Aliança" -> "Alian�a"). Lendo os bytes crus e
    // decodificando explicitamente como Latin-1 resolve.
    const bytes = await resposta.arrayBuffer();
    const texto = new TextDecoder("iso-8859-1").decode(bytes);
    const dados = {};
    const regex = /ebfFormChangeComponentValue\('[^']+','([^']+)',\s*(.*?)\);/g;
    let m;
    
    while ((m = regex.exec(texto)) !== null) {
      const chave = m[1];
      let valor = m[2].trim();
      if (valor.startsWith("'") && valor.endsWith("'")) {
        valor = valor.slice(1, -1);
      } else if (/^new Date\(/.test(valor)) {
        const numeros = valor.match(/-?\d+/g);
        if (numeros && numeros.length >= 3) {
          valor = { __data: true, ano: Number(numeros[0]), mes: Number(numeros[1]) + 1, dia: Number(numeros[2]) };
        }
      } else if (valor === "") {
        valor = "";
      }
      dados[chave] = valor;
    }

    // O código da solicitação NÃO vem junto com o resto (não é um
    // "ebfFormChangeComponentValue"): quando o voucher já foi usado, o
    // S.Deal manda ele à parte, como "d.c_818716.setValue('...')". Sem
    // capturar isso, o campo simplesmente não existia no objeto de
    // resposta — por isso o botão "Abrir no SisAR" nunca aparecia.
    const regexCodSolicitacao = /d\.c_818716\.setValue\('([^']*)'\)/g;
    let mCod;
    while ((mCod = regexCodSolicitacao.exec(texto)) !== null) {
      if (mCod[1]) dados.codSolicitacao = mCod[1];
    }

    // Rede de segurança: se por algum motivo o ID do componente não for
    // "818716" nesse ambiente/sessão (formID diferente, versão diferente
    // do S.Deal, etc.), tenta achar QUALQUER "d.c_<numero>.setValue('...')"
    // com um valor no formato de código de solicitação (só letras/números,
    // 10+ caracteres) antes de desistir.
    if (!dados.codSolicitacao) {
      const regexCodSolicitacaoGenerico = /d\.c_\d+\.setValue\('([A-Za-z0-9]{10,})'\)/g;
      let mCodGenerico;
      while ((mCodGenerico = regexCodSolicitacaoGenerico.exec(texto)) !== null) {
        dados.codSolicitacao = mCodGenerico[1];
      }
    }

    // Nada de console.log com `dados` aqui: a resposta do S.Deal traz nome
    // do cliente e voucher, e o console do service worker fica aberto a
    // quem olhar a tela. O aviso abaixo não mostra dado nenhum.
    if (!dados.codSolicitacao) {
      // Não achou "d.c_818716.setValue(...)" no texto. Ou o voucher não
      // está "já utilizado" (aí o S.Deal realmente não manda esse dado),
      // ou o ID do componente "c_818716" mudou nesse ambiente/sessão.
      const achouAlgumSetValue = /d\.c_\d+\.setValue\('[^']*'\)/.test(texto);
      console.warn(
        "[ApoioSoluti][S.Deal] codSolicitacao NÃO foi encontrado no response.",
        achouAlgumSetValue
          ? "Existe um \"d.c_<numero>.setValue(...)\" no texto, mas com um ID de componente diferente de 818716 — pode ser isso."
          : "Não existe nenhum \"d.c_<numero>.setValue(...)\" no texto — nesse caso o S.Deal simplesmente não mandou o código pra esse voucher."
      );
    }

    if (!Object.keys(dados).length) return { erro: "Não veio nenhum dado do S.Deal. Confirme se você está logado." };
    
    const temAlgumValor = Object.values(dados).some((v) => v !== "");
    if (!temAlgumValor) return { erro: "Nenhum voucher encontrado com esse número." };
    
    return { ok: true, dados };
  } catch (erro) {
    return { erro: "Erro de conexão ao buscar o voucher. Confirme se você está logado no S.Deal." };
  }
}

// Ouvinte do Popup mantém-se idêntico
chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "buscarVoucherSDeal") {
    buscarVoucherSDeal(limparCodigo(mensagem.voucher)).then(responder).catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }
});

/* ==================================================================
   Gerenciador Central de Tokens de Sessão (Gestão Online e Wings)
   ================================================================== */

/* Blinda qualquer promessa que possa travar pra sempre (ex: uma aba
   já aberta que ficou num estado esquisito e faz o chrome.scripting
   nunca responder). Sem isso, a busca inteira fica presa em
   "Buscando..." sem nunca mostrar erro nenhum — com isso, no pior
   caso ela falha depois de um tempo com uma mensagem clara. */
function comLimiteDeTempo(promessa, timeoutMs, mensagemErro) {
  return Promise.race([
    promessa,
    new Promise((_, reject) => setTimeout(() => reject(new Error(mensagemErro)), timeoutMs))
  ]);
}

function aguardarAbaPronta(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let terminou = false;
    const timer = setTimeout(() => {
      if (terminou) return;
      terminou = true;
      chrome.tabs.onUpdated.removeListener(ouvinte);
      reject(new Error("A página demorou demais para carregar."));
    }, timeoutMs);

    function paginaValida(aba) {
      return Boolean(aba && aba.status === "complete" && aba.url && !aba.url.startsWith("about:") && !aba.url.startsWith("chrome:") && !aba.url.startsWith("chrome-error:"));
    }

    function finalizar() {
      if (terminou) return;
      terminou = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(ouvinte);
      setTimeout(resolve, 400);
    }

    function ouvinte(id, info, aba) {
      if (id === tabId && info.status === "complete" && paginaValida(aba)) finalizar();
    }
    chrome.tabs.onUpdated.addListener(ouvinte);
    chrome.tabs.get(tabId).then((aba) => { if (paginaValida(aba)) finalizar(); }).catch(() => {});
  });
}

function extrairTokenDoStorage() {
  const candidatos = [];
  const reTokenCru = /^[a-f0-9]{30,64}$/i;
  
  function procurarEmObjeto(obj, profundidade) {
    if (!obj || typeof obj !== "object" || profundidade > 4) return;
    for (const chave of Object.keys(obj)) {
      const valor = obj[chave];
      if (typeof valor === "string" && /token/i.test(chave) && valor.length > 15) {
        candidatos.push(valor);
      } else if (valor && typeof valor === "object") {
        procurarEmObjeto(valor, profundidade + 1);
      }
    }
  }
  
  function vasculhar(valorBruto) {
    if (typeof valorBruto !== "string" || !valorBruto) return;
    if (reTokenCru.test(valorBruto)) return candidatos.push(valorBruto);
    try { procurarEmObjeto(JSON.parse(valorBruto), 0); } catch {}
  }
  
  for (const armazenamento of [localStorage, sessionStorage]) {
    for (let i = 0; i < armazenamento.length; i++) {
      vasculhar(armazenamento.getItem(armazenamento.key(i)));
    }
  }
  return candidatos[0] || null;
}

async function obterTokenDaSessaoOuAba(origemUrl, urlInicial, storageKey) {
  // 1. Verifica memória
  const cache = await chrome.storage.session.get(storageKey);
  if (cache[storageKey]) return cache[storageKey];

  // 2. Busca aba já aberta do sistema
  const abertas = await chrome.tabs.query({ url: `${origemUrl}/*` });
  if (abertas.length > 0) {
    try {
      // comLimiteDeTempo evita travar para sempre se essa aba já aberta
      // estiver suspensa/dormente (ex: "Modo de eficiência" do Edge) —
      // sem isso, executeScript pode nunca responder. Se der timeout,
      // caímos no fallback abaixo em vez de travar a busca inteira.
      const [{ result }] = await comLimiteDeTempo(
        chrome.scripting.executeScript({ target: { tabId: abertas[0].id }, func: extrairTokenDoStorage }),
        12000,
        "TIMEOUT_ABA_ABERTA"
      );
      if (result) {
        await chrome.storage.session.set({ [storageKey]: result });
        return result;
      }
    } catch (erro) {
      console.warn(`[ApoioSoluti] aba aberta de ${origemUrl} não respondeu, tentando aba nova:`, erro.message);
    }
  }

  // 3. Fallback: abre aba oculta caso não haja nada (ou a aba aberta esteja travada)
  const novaAba = await chrome.tabs.create({ url: urlInicial, active: false });
  await aguardarAbaPronta(novaAba.id);
  const [{ result }] = await comLimiteDeTempo(
    chrome.scripting.executeScript({ target: { tabId: novaAba.id }, func: extrairTokenDoStorage }),
    12000,
    "A aba nova não respondeu a tempo (pode ter sido suspensa pelo navegador)."
  );
  chrome.tabs.remove(novaAba.id).catch(() => {});

  if (result) {
    await chrome.storage.session.set({ [storageKey]: result });
    return result;
  }
  return null;
}


/* ==================================================================
   Gestão Online (solutivd.gestao.plus)
   ================================================================== */
const GESTAO_ORIGEM = "https://solutivd.gestao.plus";
const GESTAO_URL_INICIAL = `${GESTAO_ORIGEM}/ui/manager`;

function limparDocumento(texto) { return (texto || "").replace(/\D+/g, ""); }
function limparCodigoPedido(texto) { return (texto || "").trim().replace(/\s+/g, ""); }

function extrairListaGestao(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  if (json._embedded && typeof json._embedded === "object") {
    for (const chave of Object.keys(json._embedded)) {
      if (Array.isArray(json._embedded[chave])) return json._embedded[chave];
    }
  }
  return json.data || json.items || json.rows || json.result || json.records || [];
}

async function fetchComTokenGestao(url) {
  let token = await obterTokenDaSessaoOuAba(GESTAO_ORIGEM, GESTAO_URL_INICIAL, "token_gestao");
  if (!token) throw new Error("TOKEN_NAO_ENCONTRADO");
  
  let headers = { accept: "application/json, text/plain, */*", authorization: `Bearer ${token}` };
  let resp = await fetch(url, { headers, credentials: "include" });
  
  if (resp.status === 401) {
    await chrome.storage.session.remove("token_gestao");
    token = await obterTokenDaSessaoOuAba(GESTAO_ORIGEM, GESTAO_URL_INICIAL, "token_gestao");
    if (!token) throw new Error("TOKEN_NAO_ENCONTRADO");
    headers.authorization = `Bearer ${token}`;
    resp = await fetch(url, { headers, credentials: "include" });
  }
  return resp;
}

async function buscarHistoricoGestaoPlus(cpfCnpj) {
  if (!cpfCnpj) return { erro: "Digite o CPF ou CNPJ." };
  try {
    const urlParceiro = `${GESTAO_ORIGEM}/parceiro?filter%5B0%5D%5Bfield%5D=cpfCnpj&filter%5B0%5D%5Btype%5D=eq&filter%5B0%5D%5Bvalue%5D=${encodeURIComponent(cpfCnpj)}&page=1&pageSize=25`;
    const respParceiro = await fetchComTokenGestao(urlParceiro);
    if (!respParceiro.ok) return { erro: `Erro ao buscar parceiro (HTTP ${respParceiro.status})` };
    
    const jsonParceiro = await respParceiro.json();
    const listaParceiro = extrairListaGestao(jsonParceiro);
    if (!listaParceiro.length) return { erro: "Nenhum parceiro encontrado com esse CPF/CNPJ.", bruto: JSON.stringify(jsonParceiro).slice(0, 4000) };
    const parceiro = listaParceiro[0];

    const urlMov = `${GESTAO_ORIGEM}/movimentacao?filter%5B0%5D%5Bfield%5D=tipo&filter%5B0%5D%5Btype%5D=eq&filter%5B0%5D%5Bvalue%5D=V&filter%5B1%5D%5Bfield%5D=status&filter%5B1%5D%5Btype%5D=in&filter%5B1%5D%5Bvalues%5D%5B0%5D=0&filter%5B1%5D%5Bvalues%5D%5B1%5D=1&filter%5B2%5D%5Bfield%5D=parceiro&filter%5B2%5D%5Btype%5D=eq&filter%5B2%5D%5Bvalue%5D=${parceiro.id}&order-by%5B0%5D%5Btype%5D=field&order-by%5B0%5D%5Bfield%5D=id&order-by%5B0%5D%5Bdirection%5D=desc&pageSize=25`;
    const respMov = await fetchComTokenGestao(urlMov);
    if (!respMov.ok) return { erro: `Erro ao buscar movimentações (HTTP ${respMov.status})`, parceiro };
    
    const jsonMov = await respMov.json();
    const movimentacoes = extrairListaGestao(jsonMov);
    return { ok: true, parceiro, movimentacoes, bruto: !movimentacoes.length ? JSON.stringify(jsonMov).slice(0, 4000) : undefined };
  } catch (erro) {
    if (erro.message === "TOKEN_NAO_ENCONTRADO") return { erro: "Sessão não encontrada no Gestão Online. Faça login no site." };
    return { erro: `Falha no Gestão Online (${erro.message}).` };
  }
}

async function buscarPedidoGestaoPlus(movimentacaoId) {
  if (!movimentacaoId) return { erro: "Pedido inválido." };
  try {
    const respPedido = await fetchComTokenGestao(`${GESTAO_ORIGEM}/movimentacao/${movimentacaoId}`);
    if (!respPedido.ok) return { erro: `Erro ao buscar pedido (HTTP ${respPedido.status})` };
    const pedido = await respPedido.json();

    const respItens = await fetchComTokenGestao(`${GESTAO_ORIGEM}/movimentacao-item?filter%5B0%5D%5Bfield%5D=movimentacao&filter%5B0%5D%5Btype%5D=eq&filter%5B0%5D%5Bvalue%5D=${movimentacaoId}&pageSize=999`);
    const itens = respItens.ok ? extrairListaGestao(await respItens.json()) : [];

    const respHistorico = await fetchComTokenGestao(`${GESTAO_ORIGEM}/movimentacao-historico?filter%5B0%5D%5Bfield%5D=movimentacao&filter%5B0%5D%5Btype%5D=eq&filter%5B0%5D%5Bvalue%5D=${movimentacaoId}&pageSize=999`);
    const historico = respHistorico.ok ? extrairListaGestao(await respHistorico.json()) : [];

    return { ok: true, pedido, itens, historico };
  } catch (erro) {
    if (erro.message === "TOKEN_NAO_ENCONTRADO") return { erro: "Sessão não encontrada no Gestão Online. Faça login no site." };
    return { erro: `Falha ao buscar pedido (${erro.message}).` };
  }
}

async function buscarPedidoPorCodigoGestaoPlus(codigo) {
  if (!codigo) return { erro: "Digite o número do pedido." };
  try {
    const urlBusca = `${GESTAO_ORIGEM}/movimentacao?filter%5B0%5D%5Bfield%5D=codigo&filter%5B0%5D%5Btype%5D=like&filter%5B0%5D%5Bvalue%5D=${encodeURIComponent("%" + codigo)}&filter%5B1%5D%5Bfield%5D=tipo&filter%5B1%5D%5Btype%5D=eq&filter%5B1%5D%5Bvalue%5D=V&filter%5B2%5D%5Bfield%5D=status&filter%5B2%5D%5Btype%5D=in&filter%5B2%5D%5Bvalues%5D%5B0%5D=0&filter%5B2%5D%5Bvalues%5D%5B1%5D=1&filter%5B2%5D%5Bvalues%5D%5B2%5D=2&order-by%5B0%5D%5Btype%5D=field&order-by%5B0%5D%5Bfield%5D=id&order-by%5B0%5D%5Bdirection%5D=desc&pageSize=25`;
    const resp = await fetchComTokenGestao(urlBusca);
    if (!resp.ok) return { erro: `Erro na busca por código (HTTP ${resp.status})` };
    
    const json = await resp.json();
    const movimentacoes = extrairListaGestao(json);
    if (!movimentacoes.length) return { erro: "Nenhum pedido encontrado com esse número.", movimentacoes: [] };
    return { ok: true, movimentacoes };
  } catch (erro) {
    if (erro.message === "TOKEN_NAO_ENCONTRADO") return { erro: "Sessão não encontrada no Gestão Online. Faça login no site." };
    return { erro: `Falha ao buscar por código (${erro.message}).` };
  }
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "abrirApoioSolutiEmJanela") { abrirApoioSolutiEmJanela().then(() => responder({ ok: true })).catch(e => responder({ erro: e.message || String(e) })); return true; }
  if (mensagem?.tipo === "buscarPedidoPorCodigoGestaoPlus") { buscarPedidoPorCodigoGestaoPlus(limparCodigoPedido(mensagem.codigo)).then(responder).catch(e => responder({ erro: e.message || String(e) })); return true; }
  if (mensagem?.tipo === "buscarPedidoGestaoPlus") { buscarPedidoGestaoPlus(mensagem.movimentacaoId).then(responder).catch(e => responder({ erro: e.message || String(e) })); return true; }
  if (mensagem?.tipo === "buscarHistoricoGestaoPlus") { buscarHistoricoGestaoPlus(limparDocumento(mensagem.cpfCnpj)).then(responder).catch(e => responder({ erro: e.message || String(e) })); return true; }
});


/* ==================================================================
   Wings Portal
   ================================================================== */
const WINGS_ORIGEM = "https://wingsportal.com.br";
const WINGS_URL_INICIAL = `${WINGS_ORIGEM}/#/users-retail`;
const WINGS_API = "https://billing.vaultid.com.br";

function wingsExtrairLista(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  if (json._embedded && typeof json._embedded === "object") {
    for (const chave of Object.keys(json._embedded)) {
      if (Array.isArray(json._embedded[chave])) return json._embedded[chave];
    }
  }
  return json.data || json.items || json.rows || json.result || json.records || [];
}

async function fetchComTokenWings(url) {
  let token = await obterTokenDaSessaoOuAba(WINGS_ORIGEM, WINGS_URL_INICIAL, "token_wings");
  if (!token) throw new Error("TOKEN_NAO_ENCONTRADO");
  
  let headers = { accept: "application/json, text/plain, */*", authorization: `Bearer ${token}` };
  let resp = await fetch(url, { headers, credentials: "include" });
  
  if (resp.status === 401) {
    await chrome.storage.session.remove("token_wings");
    token = await obterTokenDaSessaoOuAba(WINGS_ORIGEM, WINGS_URL_INICIAL, "token_wings");
    if (!token) throw new Error("TOKEN_NAO_ENCONTRADO");
    headers.authorization = `Bearer ${token}`;
    resp = await fetch(url, { headers, credentials: "include" });
  }
  return resp;
}

async function buscarWings(documento) {
  if (!documento) return { erro: "Digite o CPF ou CNPJ." };
  try {
    const urlRetail = `${WINGS_API}/user-retail?page=1&search=${encodeURIComponent(documento)}`;
    const respRetail = await fetchComTokenWings(urlRetail);
    if (!respRetail.ok) return { erro: `Erro ao consultar o Wings (USER_RETAIL_HTTP_${respRetail.status}).` };
    
    const jsonRetail = await respRetail.json();
    const listaRetail = wingsExtrairLista(jsonRetail);
    if (!listaRetail.length) return { erro: "Nenhum usuário encontrado com esse CPF/CNPJ." };
    const userRetail = listaRetail[0];

    const urlDeepDetail = `${WINGS_API}/user-deep-detail/${encodeURIComponent(documento)}?events=10`;
    const respDeep = await fetchComTokenWings(urlDeepDetail);
    
    let deepDetail = null;
    let brutoDeep;
    if (respDeep.ok) {
      const jsonDeep = await respDeep.json();
      deepDetail = jsonDeep?.bird || null;
      if (!deepDetail) brutoDeep = JSON.stringify(jsonDeep).slice(0, 4000);
    } else {
      brutoDeep = `DEEP_DETAIL_HTTP_${respDeep.status}`;
    }
    
    return { ok: true, userRetail, deepDetail, brutoDeep };
  } catch (erro) {
    if (erro.message === "TOKEN_NAO_ENCONTRADO") return { erro: "Sessão não encontrada no Wings. Faça login no portal." };
    return { erro: `Não foi possível buscar no Wings (${erro.message}).` };
  }
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "buscarWings") {
    buscarWings(limparDocumento(mensagem.cpfCnpj)).then(responder).catch(e => responder({ erro: e.message || String(e) }));
    return true;
  }
});


/* ==================================================================
   Lojas Soluti (Mantido do Original)
   ================================================================== */
const URL_LOJAS = "https://soluti.com.br/lojas/";
const ALARME_LOJAS = "atualizar-lojas";
const UF_POR_REGIAO = {
  "goiânia": "GO", "aparecida de goiânia": "GO", "inhumas": "GO", "goiás": "GO",
  "sergipe": "SE", "mato grosso do sul": "MS", "brasília": "DF", "ceará": "CE",
  "salvador": "BA", "bahia": "BA", "pernambuco": "PE", "rio grande do norte": "RN",
  "piauí": "PI", "pará": "PA", "amazonas": "AM", "são paulo": "SP",
  "rio de janeiro": "RJ", "curitiba": "PR", "paraná": "PR",
  "belo horizonte": "MG", "contagem": "MG", "minas gerais": "MG"
};

function ufDaRegiao(regiao) { return UF_POR_REGIAO[(regiao || "").trim().toLowerCase()] || ""; }

function decodificarHtml(texto) {
  return (texto || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8211;/g, "-").replace(/&#8217;/g, "'").replace(/&ordm;/g, "º").replace(/&ordf;/g, "ª").replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&atilde;/g, "ã").replace(/&otilde;/g, "õ").replace(/&ccedil;/g, "ç").replace(/&acirc;/g, "â").replace(/&ecirc;/g, "ê").replace(/&ocirc;/g, "ô").replace(/&agrave;/g, "à").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();
}

function extrairLojas(html) {
  const lojas = [];
  const limpo = html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ");
  const inicio = limpo.indexOf("sempre perto");
  const fim = limpo.lastIndexOf("últimos dias");
  const trecho = inicio >= 0 ? limpo.slice(inicio, fim > inicio ? fim : undefined) : limpo;
  const partes = trecho.split(/<h2[^>]*>/i);
  const blocos = partes.slice(1);

  for (let i = 0; i < blocos.length; i++) {
    const bruto = blocos[i];
    const nome = decodificarHtml(bruto.split(/<\/h2>/i)[0]);
    if (!nome) continue;

    const corpo = bruto.slice(bruto.indexOf("</h2>") + 5);
    const paragrafos = corpo.split(/<\/?(?:p|div|span|br|a)[^>]*>/i).map((p) => decodificarHtml(p)).filter(Boolean);
    const maps = (corpo.match(/https?:\/\/(?:goo\.gl\/maps|maps\.app\.goo\.gl|share\.google)\/[^\s"'<)]+/i) || [])[0] || "";
    const email = (corpo.match(/[a-z0-9._%+-]+@soluti\.com\.br/i) || [])[0] || "";
    const fechado = /temporariamente fechado/i.test(corpo);
    const idxFunc = paragrafos.findIndex((p) => /horário de funcionamento/i.test(p));
    const idxAlmoco = paragrafos.findIndex((p) => /horário de almoço/i.test(p));
    
    const endParts = idxFunc > 0 ? paragrafos.slice(0, idxFunc) : paragrafos.slice(0, 1);
    const end = endParts.filter((p) => !/^loja|localização/i.test(p)).join(" ").trim();
    
    let func = "";
    if (idxFunc >= 0) {
      const ate = idxAlmoco > idxFunc ? idxAlmoco : paragrafos.length;
      for (const p of paragrafos.slice(idxFunc + 1, ate)) {
        if (/temporariamente fechado/i.test(p)) continue;
        if (/\d|não fecha/i.test(p)) { func = p; break; }
      }
    }
    
    let almoco = "";
    if (idxAlmoco >= 0) {
      for (const p of paragrafos.slice(idxAlmoco + 1)) {
        if (/@soluti|localização|temporariamente/i.test(p)) continue;
        if (/\d|não fecha/i.test(p)) { almoco = p; break; }
        break;
      }
    }

    const limpos = (partes[i] || "").split(/<\/?(?:p|div|span|br|a|h3)[^>]*>/i).map((p) => decodificarHtml(p)).filter(Boolean);
    const regiao = [...limpos].reverse().find((t) => t.length > 1 && t.length < 40) || "";

    lojas.push({ loja: nome, regiao, uf: ufDaRegiao(regiao), end, func, almoco, email, fechado, maps });
  }

  for (const l of lojas) {
    if (/^sergipe$/i.test(l.loja) && /aracaju/i.test(l.regiao)) {
      [l.loja, l.regiao] = [l.regiao, l.loja];
      l.uf = ufDaRegiao(l.regiao);
    }
  }

  return lojas.filter((l) => l.loja && l.maps && (l.func || l.almoco));
}

async function atualizarLojas() {
  const resposta = await fetch(URL_LOJAS, { headers: { "Accept": "text/html" }, credentials: "omit" });
  if (!resposta.ok) throw new Error(`A página respondeu ${resposta.status}.`);
  const html = await resposta.text();
  const lojas = extrairLojas(html);
  if (lojas.length < 5) throw new Error("A extração não encontrou lojas suficientes.");

  await chrome.storage.local.set({ lojas, lojasAtualizadoEm: Date.now() });
  return { ok: true, quantidade: lojas.length };
}

chrome.alarms.get(ALARME_LOJAS, (existente) => {
  if (existente) return;
  chrome.alarms.create(ALARME_LOJAS, { delayInMinutes: 1, periodInMinutes: 60 * 24 });
});

chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name === ALARME_LOJAS) atualizarLojas().catch(() => {});
});

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "atualizarLojas") {
    atualizarLojas().then(responder).catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }
});

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "buscarDatabricks") {
    buscarDatabricks(mensagem.cpfCnpj)
      .then(responder)
      .catch(e => responder({ erro: e.erro || e.message || String(e) }));
    return true; 
  }
});


/* ==================================================================
   Indicadores de sessão — baseados na tabela src/data/sistemas.js

   Ter cookie no dominio NAO quer dizer estar logado: visita anonima,
   rastreio e a propria ida ate a tela de login deixam cookie. Por isso
   cada sistema e verificado pelo que ele realmente faz:

   - cookie / sso: pede a tela inicial com os cookies do navegador. Sem
     sessao o sistema redireciona para outro dominio (login da Microsoft),
     para uma rota de login, ou mostra o formulario de senha.
   - token (Wings, GO): SPA, a tela inicial e a mesma logada ou nao. So
     vale um token de verdade, guardado ou lido de uma aba ja aberta.

   O resultado tem tres estados: true, false, e ausente = "nao da para
   saber agora" (falha de rede, ou sistema de token sem aba aberta). Quem
   le nao deve tratar ausente como "sem login".
   ================================================================== */
const SESSAO_CACHE_MS = 60000;
const SESSAO_CACHE_CHAVE = "sessoesVerificadas";
const SESSAO_TIMEOUT_MS = 7000;

function dominiosDoSistema(sistema) {
  return [].concat(sistema.cookie || []);
}

function hostDoSistema(host, sistema) {
  return dominiosDoSistema(sistema).some((d) => host === d || host.endsWith("." + d));
}

const ROTA_DE_LOGIN = /(^|[\/._-])(login|logon|signin|sign-in|entrar|autenticar|authorize|oauth2?)([\/._?-]|$)/i;

async function temCookie(sistema) {
  for (const dominio of dominiosDoSistema(sistema)) {
    const cookies = await chrome.cookies.getAll({ domain: dominio });
    if (cookies.length > 0) return true;
  }
  return false;
}

// le so o comeco da pagina: o formulario de login aparece cedo, e o HTML do
// Outlook logado e grande
async function lerComecoDaPagina(resposta, limite = 200000) {
  if (!resposta.body) return "";
  const leitor = resposta.body.getReader();
  const decodificador = new TextDecoder();
  let texto = "";
  try {
    while (texto.length < limite) {
      const { done, value } = await leitor.read();
      if (done) break;
      texto += decodificador.decode(value, { stream: true });
    }
  } finally {
    leitor.cancel().catch(() => {});
  }
  return texto;
}

async function sessaoPorSonda(sistema) {
  // sem nenhum cookie nao ha o que testar: poupa a requisicao
  if (!(await temCookie(sistema))) return false;

  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), SESSAO_TIMEOUT_MS);

  try {
    const resposta = await fetch(sistema.urlInicial, {
      credentials: "include",
      redirect: "follow",
      cache: "no-store",
      signal: controle.signal
    });

    const final = new URL(resposta.url);
    if (resposta.status === 401 || resposta.status === 403) return false;
    if (!resposta.ok) return undefined;
    if (!hostDoSistema(final.hostname, sistema)) return false;
    if (ROTA_DE_LOGIN.test(final.pathname)) return false;

    const comeco = await lerComecoDaPagina(resposta);
    if (/<input[^>]+type\s*=\s*["']?password/i.test(comeco)) return false;

    return true;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

// token expirado nao e sessao: se for JWT, confere o "exp"
function tokenAindaValido(token) {
  if (!token) return false;
  const partes = String(token).split(".");
  if (partes.length !== 3) return true;

  try {
    const carga = JSON.parse(atob(partes[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (carga.exp && carga.exp * 1000 < Date.now()) return false;
  } catch {}
  return true;
}

async function sessaoPorToken(sistema) {
  const guardado = (await chrome.storage.session.get(sistema.chave))[sistema.chave];
  if (guardado) {
    if (tokenAindaValido(guardado)) return true;
    await chrome.storage.session.remove(sistema.chave).catch(() => {});
  }

  const abertas = await chrome.tabs.query({ url: `${sistema.origem}/*` });
  // sem aba aberta nao da para olhar o storage do site: nao sei
  if (!abertas.length) return undefined;

  try {
    const [{ result }] = await comLimiteDeTempo(
      chrome.scripting.executeScript({ target: { tabId: abertas[0].id }, func: extrairTokenDoStorage }),
      4000,
      "TIMEOUT_ABA_ABERTA"
    );
    if (result && tokenAindaValido(result)) {
      await chrome.storage.session.set({ [sistema.chave]: result });
      return true;
    }
    return false;
  } catch {
    return undefined;
  }
}

async function verificarSessoes(forcar = false) {
  let cache = {};
  try {
    const dados = (await chrome.storage.session.get(SESSAO_CACHE_CHAVE))[SESSAO_CACHE_CHAVE];
    if (dados && Date.now() - dados.quando < SESSAO_CACHE_MS) cache = dados.valores || {};
  } catch {}

  const entradas = await Promise.all(
    SISTEMAS.filter((sistema) => sistema.cookie || sistema.chave).map(async (sistema) => {
      if (!forcar && sistema.id in cache) return [sistema.id, cache[sistema.id]];

      try {
        const ativa = sistema.entra === "token"
          ? await sessaoPorToken(sistema)
          : await sessaoPorSonda(sistema);
        return [sistema.id, ativa];
      } catch {
        return [sistema.id, undefined];
      }
    })
  );

  // so o que foi decidido entra na resposta e no cache
  const resultado = Object.fromEntries(entradas.filter(([, v]) => typeof v === "boolean"));

  try {
    await chrome.storage.session.set({
      [SESSAO_CACHE_CHAVE]: { quando: Date.now(), valores: resultado }
    });
  } catch {}

  return resultado;
}

// uma troca de sessao (login/logout) invalida o que foi lembrado
chrome.cookies?.onChanged?.addListener(() => {
  chrome.storage.session.remove(SESSAO_CACHE_CHAVE).catch(() => {});
});

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "verificarSessoes") {
    verificarSessoes(Boolean(mensagem.forcar)).then(responder).catch(() => responder({}));
    return true;
  }
});

/* ==================================================================
   Atalho Ctrl+Shift+S: abre a solicitação do código selecionado
   ================================================================== */
async function selecaoDaAba(abaId) {
  const resultados = await chrome.scripting.executeScript({
    target: { tabId: abaId, allFrames: true },
    func: () => (window.getSelection?.() || "").toString()
  });
  for (const { result } of resultados) {
    const texto = (result || "").trim();
    if (texto) return texto;
  }
  return "";
}

async function avisarNaAba(aba, texto, estilo = "erro") {
  if (!aba?.id || !podeUsar(aba.url)) return;
  try {
    await enviarParaAba(aba.id, { tipo: "aviso", texto, estilo });
  } catch (erro) {
    console.warn("Apoio Soluti: sem aviso na página:", erro.message);
  }
}

chrome.commands.onCommand.addListener(async (comando) => {
  if (comando !== "abrir-solicitacao") return;

  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!aba || !podeUsar(aba.url)) return;

  let selecao = "";
  try {
    selecao = await selecaoDaAba(aba.id);
  } catch (erro) {
    console.warn("Apoio Soluti: não consegui ler a seleção:", erro.message);
  }

  const codigo = limparCodigo(selecao);
  if (!codigo) {
    avisarNaAba(aba, "Selecione o código da solicitação e use o atalho de novo.");
    return;
  }

  const resposta = await abrirSolicitacao(codigo);
  if (resposta?.erro) avisarNaAba(aba, resposta.erro);
});
