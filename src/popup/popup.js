// Apoio Soluti v4 — ferramentas de atendimento do Suporte B2C.
//
// Desenvolvido por Vitor Azevedo (v1 e v2).
// Reescrito e mantido por Vinícius Zoccoli e Pedro H. S. Nascimento (v3 em diante).

const EQUIPE = window.MACROS_EQUIPE || [];

let meusMacros = [];
let selecionado = null;

// selecao multipla na lista (inclusive macros da equipe), como no explorador
// de arquivos: clique simples, Ctrl+clique e Shift+clique. O ancora e o
// ultimo clicado sem Shift — e dele que o intervalo do Shift parte.
const macrosMarcados = new Set();
let ancoraMacro = null;
let ordemMacrosVisiveis = [];
// ids de macros da equipe que a pessoa excluiu (ver ApoioMacros.lerOcultos)
let macrosOcultos = [];

// a saudacao e a leitura/gravacao dos macros moram em src/common/macros.js,
// compartilhadas com o content script
const { resolverResposta } = window.ApoioMacros;

const $ = (id) => document.getElementById(id);

/* URL de cada plataforma que exige login. Usada pelo botão "Verificar
   login" que aparece junto do aviso quando a busca falha por
   sessão/login (ver erroParecomSessao). Facilita a verificação: em vez
   de o atendente ter que lembrar o endereço e abrir uma aba na mão, o
   aviso já oferece o atalho. */
const URL_PLATAFORMA = {
  sdeal: "https://sdeal.soluti.com.br",
  gestao: "https://solutivd.gestao.plus",
  wings: "https://wingsportal.com.br"
};

function gerarId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `macro-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizarUsuario(lista) {
  let precisaSalvar = false;

  const normalizados = (Array.isArray(lista) ? lista : [])
    .filter((item) => item && item.comando && item.resposta)
    .map((item) => {
      if (!item.id) precisaSalvar = true;

      return {
        id: item.id || gerarId(),
        comando: String(item.comando),
        resposta: String(item.resposta),
        origem: "usuario"
      };
    });

  return { normalizados, precisaSalvar };
}

function macrosDaEquipe() {
  const usados = new Set(
    meusMacros.map((item) => item.comando.toLowerCase())
  );

  return EQUIPE.filter(
    (item) => item && item.comando && item.resposta
  )
    .filter((item) => !macrosOcultos.includes(item.id || `equipe-${item.comando}`))
    .map((item) => ({
      id: item.id || `equipe-${item.comando}`,
      comando: String(item.comando),
      resposta: String(item.resposta),
      origem: "equipe",
      // comando pessoal com o mesmo nome tem prioridade na digitacao
      substituido: usados.has(String(item.comando).toLowerCase())
    }))
    .sort((a, b) => a.comando.localeCompare(b.comando, "pt-BR"));
}

function todosOsMacros() {
  return [...meusMacros, ...macrosDaEquipe()];
}

async function carregarMacros() {
  // migrar: true so aqui — ver o comentario em src/common/macros.js
  macrosOcultos = await window.ApoioMacros.lerOcultos();
  const guardados = await window.ApoioMacros.ler({ migrar: true });
  const { normalizados, precisaSalvar } = normalizarUsuario(guardados);

  meusMacros = normalizados;

  // recupera bases antigas gravadas sem id
  if (precisaSalvar) await salvarMacros();

  renderizarLista();
}

async function salvarMacros() {
  const sincronizou = await window.ApoioMacros.salvar(
    meusMacros.map(({ id, comando, resposta }) => ({ id, comando, resposta }))
  );

  // o aviso so aparece quando a gravacao no sync falha: os macros estao
  // salvos na maquina, mas nao vao acompanhar o usuario em outra
  $("avisoSync").classList.toggle("hidden", sincronizou !== false);
}

function abrirFormulario(macro = null) {
  $("formulario").classList.remove("hidden");

  $("macroId").value = macro?.id || "";
  $("comando").value = macro?.comando || "";
  $("resposta").value = macro?.resposta || "";

  $("comando").focus();
}

function fecharFormulario() {
  $("formulario").classList.add("hidden");
  $("macroId").value = "";
  $("comando").value = "";
  $("resposta").value = "";
}

async function salvarFormulario() {
  const id = $("macroId").value;
  const comando = $("comando").value.trim();
  const resposta = $("resposta").value.trim();

  if (!comando || !resposta) {
    alert("Preencha o comando e o resultado.");
    return;
  }

  const duplicado = meusMacros.some(
    (macro) =>
      macro.comando.toLowerCase() === comando.toLowerCase() &&
      macro.id !== id
  );

  if (duplicado) {
    alert("Você já tem um macro com esse comando.");
    return;
  }

  if (id) {
    const macro = meusMacros.find((item) => item.id === id);

    if (macro) {
      macro.comando = comando;
      macro.resposta = resposta;
    }
  } else {
    const novo = { id: gerarId(), comando, resposta, origem: "usuario" };
    meusMacros.push(novo);
    selecionado = novo.id;
    macrosMarcados.clear();
    macrosMarcados.add(novo.id);
    ancoraMacro = novo.id;
  }

  await salvarMacros();

  fecharFormulario();
  renderizarLista();
}

async function excluirMacro(id) {
  const macro = meusMacros.find((item) => item.id === id);

  if (!macro) return;

  if (!confirm(`Excluir o macro "${macro.comando}"?`)) {
    return;
  }

  meusMacros = meusMacros.filter((item) => item.id !== id);

  macrosMarcados.delete(id);
  if (selecionado === id) {
    selecionado = null;
  }

  await salvarMacros();
  renderizarLista();
}

function filtrar(lista) {
  const termo = $("busca").value.trim().toLowerCase();

  if (!termo) return [...lista];

  return lista.filter(
    (macro) =>
      macro.comando.toLowerCase().includes(termo) ||
      macro.resposta.toLowerCase().includes(termo)
  );
}

const ICONE_LAPIS =
  '<path d="M3 14.2V17h2.8l8.3-8.3-2.8-2.8L3 14.2zM17.7 6.1a.8.8 0 0 0 0-1.1l-1.7-1.7a.8.8 0 0 0-1.1 0l-1.4 1.4 2.8 2.8 1.4-1.4z"/>';

const ICONE_LIXEIRA =
  '<path d="M6.5 2.5h7v1.6h4v1.7h-15V4.1h4V2.5zM4.8 7.5h10.4l-.8 9.6a1.7 1.7 0 0 1-1.7 1.6H7.3a1.7 1.7 0 0 1-1.7-1.6l-.8-9.6zm3.1 2v7h1.6v-7H7.9zm3.3 0v7h1.6v-7h-1.6z"/>';

function criarBotaoIcone(classe, rotulo, caminho, aoClicar) {
  const botao = document.createElement("button");
  botao.className = `acao icone ${classe}`;
  botao.title = rotulo;
  botao.setAttribute("aria-label", rotulo);
  botao.innerHTML = `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">${caminho}</svg>`;
  botao.addEventListener("click", aoClicar);
  return botao;
}

function criarCabecalhoGrupo(texto) {
  const cabecalho = document.createElement("li");
  cabecalho.className = "grupo";
  cabecalho.textContent = texto;
  return cabecalho;
}

function criarItem(macro) {
  const item = document.createElement("li");
  item.className = "item";

  if (macrosMarcados.has(macro.id)) {
    item.classList.add("ativo");
  }

  const nome = document.createElement("span");
  nome.className = "comando";
  nome.textContent = macro.comando;
  item.appendChild(nome);

  if (macro.origem === "usuario") {
    const botoes = document.createElement("div");
    botoes.className = "acoes";

    const editar = criarBotaoIcone("editar", "Editar", ICONE_LAPIS, (evento) => {
      evento.stopPropagation();
      abrirFormulario(macro);
    });

    const excluir = criarBotaoIcone(
      "excluir",
      "Excluir",
      ICONE_LIXEIRA,
      (evento) => {
        evento.stopPropagation();
        excluirMacro(macro.id);
      }
    );

    botoes.appendChild(editar);
    botoes.appendChild(excluir);
    item.appendChild(botoes);
  } else if (macro.substituido) {
    const aviso = document.createElement("span");
    aviso.className = "tag-substituido";
    aviso.textContent = "substituído";
    item.appendChild(aviso);
  }

  item.addEventListener("click", (evento) => clicarMacro(macro.id, evento));

  return item;
}

function renderizarLista() {
  const lista = $("lista");
  lista.innerHTML = "";

  const meus = filtrar(meusMacros).sort((a, b) =>
    a.comando.localeCompare(b.comando, "pt-BR")
  );
  const equipe = filtrar(macrosDaEquipe());
  const total = meusMacros.length + macrosDaEquipe().length;

  // a ordem em que aparecem na tela e a do intervalo do Shift
  ordemMacrosVisiveis = [...meus, ...equipe].map((m) => m.id);

  // o que saiu da tela (busca mudou, macro apagado) sai da selecao: senao o
  // Excluir apagaria algo que a pessoa nao esta vendo
  const visiveis = new Set(ordemMacrosVisiveis);
  [...macrosMarcados].forEach((id) => {
    if (!visiveis.has(id)) macrosMarcados.delete(id);
  });
  if (!visiveis.has(ancoraMacro)) ancoraMacro = null;

  $("contador").textContent =
    `${meus.length + equipe.length}/${total} comando` +
    (total === 1 ? "" : "s");

  if (!meus.length && !equipe.length) {
    const vazio = document.createElement("li");
    vazio.className = "lista-vazia";
    vazio.textContent = $("busca").value.trim()
      ? "Nenhum comando corresponde à busca."
      : "Nenhum comando cadastrado. Clique em Criar para começar.";
    lista.appendChild(vazio);
    renderizarAvisoOcultos(lista);
    renderizarDetalhe();
    atualizarBotaoExcluir();
    return;
  }

  if (meus.length) {
    lista.appendChild(criarCabecalhoGrupo("Meus macros"));
    meus.forEach((macro) => lista.appendChild(criarItem(macro)));
  }

  if (equipe.length) {
    lista.appendChild(criarCabecalhoGrupo("Da equipe"));
    equipe.forEach((macro) => lista.appendChild(criarItem(macro)));
  }

  renderizarAvisoOcultos(lista);
  renderizarDetalhe();
  atualizarBotaoExcluir();
}

function renderizarDetalhe() {
  const detalhe = $("detalhe");
  detalhe.innerHTML = "";

  // sem essa checagem, selecionado null casaria com macro sem id
  if (macrosMarcados.size > 1) {
    detalhe.classList.add("vazio");
    detalhe.textContent = `${macrosMarcados.size} macros selecionados. Use Excluir para removê-los.`;
    return;
  }

  const macro = selecionado
    ? todosOsMacros().find((item) => item.id === selecionado)
    : null;

  if (!macro) {
    detalhe.classList.add("vazio");
    detalhe.textContent = "Selecione um comando para ver o resultado.";
    return;
  }

  detalhe.classList.remove("vazio");

  const topo = document.createElement("div");
  topo.className = "detalhe-topo";

  const titulo = document.createElement("div");
  titulo.className = "detalhe-titulo";

  const comando = document.createElement("strong");
  comando.textContent = macro.comando;
  titulo.appendChild(comando);

  if (macro.origem === "equipe") {
    const selo = document.createElement("span");
    selo.className = "selo";
    selo.textContent = "Da equipe";
    titulo.appendChild(selo);
  }

  const acoes = document.createElement("div");
  acoes.className = "detalhe-acoes";

  if (macro.origem === "equipe") {
    const copiarParaMim = document.createElement("button");
    copiarParaMim.textContent = "Editar cópia";
    copiarParaMim.className = "acao";
    copiarParaMim.addEventListener("click", () => {
      abrirFormulario({
        id: "",
        comando: macro.comando,
        resposta: macro.resposta
      });
    });
    acoes.appendChild(copiarParaMim);
  }

  const copiar = document.createElement("button");
  copiar.textContent = "Copiar";
  copiar.className = "acao copiar";

  copiar.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(resolverResposta(macro));
      copiar.textContent = "Copiado";
      setTimeout(() => {
        copiar.textContent = "Copiar";
      }, 1200);
    } catch {
      alert("Não foi possível copiar. Selecione o texto e use Ctrl+C.");
    }
  });

  acoes.appendChild(copiar);

  topo.appendChild(titulo);
  topo.appendChild(acoes);

  const texto = document.createElement("div");
  texto.className = "resposta";
  texto.textContent = resolverResposta(macro);

  detalhe.appendChild(topo);
  detalhe.appendChild(texto);

  if (macro.origem === "equipe" && macro.substituido) {
    const nota = document.createElement("p");
    nota.className = "nota";
    nota.textContent =
      "Você tem um macro pessoal com esse mesmo comando. O seu é o que será inserido ao digitar.";
    detalhe.appendChild(nota);
  }
}

$("novoBtn").addEventListener("click", () => {
  abrirFormulario();
});

$("cancelarBtn").addEventListener("click", () => {
  fecharFormulario();
});

$("salvarBtn").addEventListener("click", salvarFormulario);

$("busca").addEventListener("input", () => {
  renderizarLista();
});

/* Importar / exportar macros ---------------------------------------- */

/* Selecionar varios para excluir -------------------------------------
   Os macros pessoais sao apagados de verdade. Os da equipe moram no codigo
   da extensao e sao iguais para todo mundo: "excluir" um deles o esconde
   para esta pessoa (e no content script, para ele nao expandir mais), e o
   aviso no fim da lista permite trazer de volta.
   ------------------------------------------------------------------ */

// clique simples: so este. Ctrl (ou Cmd): acrescenta/tira este sem mexer nos
// outros. Shift: todos entre o ancora e este (com Ctrl junto, somando ao que
// ja estava marcado).
function clicarMacro(id, evento) {
  const soma = evento.ctrlKey || evento.metaKey;

  if (evento.shiftKey && ancoraMacro && ordemMacrosVisiveis.includes(ancoraMacro)) {
    const de = ordemMacrosVisiveis.indexOf(ancoraMacro);
    const ate = ordemMacrosVisiveis.indexOf(id);
    const [inicio, fim] = de < ate ? [de, ate] : [ate, de];

    if (!soma) macrosMarcados.clear();
    ordemMacrosVisiveis.slice(inicio, fim + 1).forEach((x) => macrosMarcados.add(x));
    // o ancora nao se move no Shift: clicar em outro ponto reajusta o intervalo
  } else if (soma) {
    if (macrosMarcados.has(id)) macrosMarcados.delete(id);
    else macrosMarcados.add(id);
    ancoraMacro = id;
  } else {
    macrosMarcados.clear();
    macrosMarcados.add(id);
    ancoraMacro = id;
  }

  // o painel de detalhe mostra o macro quando ha exatamente um selecionado
  selecionado = macrosMarcados.size === 1 ? [...macrosMarcados][0] : null;
  renderizarLista();
}

function atualizarBotaoExcluir() {
  const n = macrosMarcados.size;
  const botao = $("excluirSelecionadosBtn");
  botao.disabled = n === 0;
  botao.textContent = n > 1 ? `Excluir (${n})` : "Excluir";
}

async function excluirSelecionados() {
  const ids = [...macrosMarcados];
  const meus = ids.filter((id) => meusMacros.some((m) => m.id === id));
  const daEquipe = ids.filter(
    (id) => !meus.includes(id) && macrosDaEquipe().some((m) => m.id === id)
  );

  if (!meus.length && !daEquipe.length) return;

  const linhas = [];
  if (meus.length) linhas.push(`• ${meus.length} macro(s) seu(s) serão apagados.`);
  if (daEquipe.length) {
    linhas.push(
      `• ${daEquipe.length} macro(s) da equipe serão ocultados (deixam de aparecer e de ` +
      `expandir aqui; dá para restaurar no fim da lista).`
    );
  }

  if (!confirm(`Excluir os macros selecionados?\n\n${linhas.join("\n")}`)) return;

  if (meus.length) {
    meusMacros = meusMacros.filter((m) => !meus.includes(m.id));
    await salvarMacros();
  }

  if (daEquipe.length) {
    macrosOcultos = [...new Set([...macrosOcultos, ...daEquipe])];
    await window.ApoioMacros.salvarOcultos(macrosOcultos);
  }

  if (ids.includes(selecionado)) selecionado = null;

  macrosMarcados.clear();
  ancoraMacro = null;
  renderizarLista();
}

function renderizarAvisoOcultos(lista) {
  const existentes = new Set(EQUIPE.map((m) => m.id || `equipe-${m.comando}`));
  const n = macrosOcultos.filter((id) => existentes.has(id)).length;
  if (!n) return;

  const linha = document.createElement("li");
  linha.className = "lista-vazia ocultos-aviso";
  linha.appendChild(
    document.createTextNode(`${n} macro(s) da equipe oculto(s). `)
  );

  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "link-btn";
  botao.textContent = "Restaurar";
  botao.addEventListener("click", async () => {
    if (!confirm(`Restaurar os ${n} macros da equipe ocultos?`)) return;
    macrosOcultos = [];
    await window.ApoioMacros.salvarOcultos([]);
    renderizarLista();
  });
  linha.appendChild(botao);
  lista.appendChild(linha);
}

$("excluirSelecionadosBtn").addEventListener("click", excluirSelecionados);

// outra janela do popup, ou o sync, mexeu na lista de ocultos
window.ApoioMacros.aoMudarOcultos((ids) => {
  macrosOcultos = ids;
  renderizarLista();
});

function exportarMacros() {
  if (!meusMacros.length) {
    alert("Você ainda não tem macros para exportar.");
    return;
  }

  const dados = {
    versao: chrome.runtime.getManifest().version,
    exportadoEm: new Date().toISOString(),
    macros: meusMacros.map(({ comando, resposta }) => ({ comando, resposta }))
  };

  const blob = new Blob([JSON.stringify(dados, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `apoio-soluti-macros-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();

  URL.revokeObjectURL(url);
}

function extrairMacrosImportados(json) {
  const lista = Array.isArray(json) ? json : json?.macros;
  if (!Array.isArray(lista)) return null;

  return lista.filter(
    (item) =>
      item &&
      typeof item.comando === "string" &&
      item.comando.trim() &&
      typeof item.resposta === "string" &&
      item.resposta.trim()
  );
}

async function importarMacros(arquivo) {
  let texto;
  try {
    texto = await arquivo.text();
  } catch {
    alert("Não foi possível ler o arquivo.");
    return;
  }

  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    alert("Arquivo inválido: não é um JSON válido.");
    return;
  }

  const importados = extrairMacrosImportados(json);

  if (!importados) {
    alert("Arquivo inválido: formato de macros não reconhecido.");
    return;
  }

  if (!importados.length) {
    alert("Nenhum macro válido encontrado no arquivo.");
    return;
  }

  let novos = 0;
  let atualizados = 0;

  importados.forEach((item) => {
    const comando = item.comando.trim();
    const resposta = item.resposta.trim();

    // importados sempre entram como macro pessoal, mesmo que tenham vindo
    // de um macro "da equipe" exportado por outra pessoa
    const existente = meusMacros.find(
      (macro) => macro.comando.toLowerCase() === comando.toLowerCase()
    );

    if (existente) {
      existente.resposta = resposta;
      atualizados += 1;
    } else {
      meusMacros.push({ id: gerarId(), comando, resposta, origem: "usuario" });
      novos += 1;
    }
  });

  await salvarMacros();
  renderizarLista();

  alert(`Importação concluída: ${novos} novo(s), ${atualizados} atualizado(s).`);
}

$("exportarMacrosBtn").addEventListener("click", exportarMacros);

$("importarMacrosBtn").addEventListener("click", () => {
  $("importarMacrosInput").click();
});

$("importarMacrosInput").addEventListener("change", async (evento) => {
  const [arquivo] = evento.target.files;
  evento.target.value = "";
  if (arquivo) await importarMacros(arquivo);
});

// outra janela do popup, outro dispositivo pelo sync, ou o proprio content
// script: qualquer mudanca redesenha a lista
window.ApoioMacros.aoMudar((lista) => {
  const { normalizados } = normalizarUsuario(lista);
  meusMacros = normalizados;
  renderizarLista();
});

$("versao").textContent = `v${chrome.runtime.getManifest().version}`;

/* Tema ------------------------------------------------------------
   Sem escolha salva, o popup segue o navegador. O botao grava uma
   escolha explicita, que passa a ganhar do sistema.

   Por que localStorage e nao chrome.storage: a leitura precisa acontecer
   ANTES da primeira pintura, senao o popup pisca no tema errado a cada
   abertura. chrome.storage e assincrono; localStorage e sincrono, e quem
   aplica e o src/popup/tema.js, carregado no <head>.
   ------------------------------------------------------------------ */

function temaEfetivo() {
  const escolhido = document.documentElement.dataset.tema;
  if (escolhido) return escolhido;

  return matchMedia("(prefers-color-scheme: dark)").matches
    ? "escuro"
    : "claro";
}

$("temaBtn").addEventListener("click", () => {
  const novo = temaEfetivo() === "escuro" ? "claro" : "escuro";

  document.documentElement.dataset.tema = novo;

  try {
    localStorage.setItem("tema", novo);
  } catch {
    // modo privado ou armazenamento bloqueado: a escolha vale so nesta janela
  }
});

$("abrirJanelaBtn").addEventListener("click", async () => {
  try {
    await chrome.runtime.sendMessage({ tipo: "abrirApoioSolutiEmJanela" });
    // não precisa fechar nada aqui: se o clique veio do popup da barra de
    // ferramentas, ele fecha sozinho assim que a nova janela rouba o foco
  } catch {
    // background pode estar reiniciando o service worker; sem problema,
    // a proxima tentativa funciona normalmente
  }
});

/* Abas ------------------------------------------------------------- */

const abas = document.querySelectorAll(".aba");
const paineis = {
  dia: $("painel-dia"),
  emails: $("painel-emails"),
  macros: $("painel-macros"),
  unificada: $("painel-unificada"),
  solicitacao: $("painel-solicitacao"),
  databricks: $("painel-databricks"),
  sdeal: $("painel-sdeal"),
  gestao: $("painel-gestao"),
  wings: $("painel-wings"),
  ocr: $("painel-ocr"),
  atender: $("painel-atender")
};

// Badge vermelho no icone da aba: acende quando uma busca falha (ex:
// sessao expirada) pra quem trocar de aba sem ler o aviso nao perder o
// erro. Some quando o usuario volta pra aba, ou quando uma busca
// seguinte da certo.
const ABA_BADGE_ERRO = {
  databricks: "abaErroDatabricks",
  sdeal: "abaErroSdeal",
  gestao: "abaErroGestao",
  wings: "abaErroWings"  
};

function marcarErroNaAba(nome) {
  const id = ABA_BADGE_ERRO[nome];
  if (!id) return;
  $(id).classList.remove("hidden");
}

function limparErroNaAba(nome) {
  const id = ABA_BADGE_ERRO[nome];
  if (!id) return;
  $(id).classList.add("hidden");
}

/* Indicador de sessão (ponto verde/cinza) ---------------------------
   Mostra se ja tem sessao ativa em S.Deal/Gestão+/Wings sem precisar
   buscar pra descobrir: o background consulta os cookies desses
   dominios assim que o popup abre. Depois disso, cada busca atualiza o
   ponto na hora — sucesso confirma sessao ativa, e um erro que fala em
   sessao/login expirado apaga o ponto verde de novo.
   ---------------------------------------------------------------------- */

const ABA_BADGE_SESSAO = {
  sdeal: "abaSessaoSdeal",
  gestao: "abaSessaoGestao",
  wings: "abaSessaoWings"
};

function marcarSessao(nome, ativa) {
  const id = ABA_BADGE_SESSAO[nome];
  if (!id) return;

  const ponto = $(id);
  ponto.classList.toggle("sessao-ok", Boolean(ativa));
  ponto.title = ativa
    ? "Sessão ativa"
    : "Sem sessão ativa (ou ainda não verificada)";
}

function erroParecomSessao(texto) {
  const t = (texto || "").toLowerCase();
  return t.includes("sessão") || t.includes("sessao") || t.includes("logado");
}

async function atualizarIndicadoresDeSessao() {
  try {
    const resultado = await chrome.runtime.sendMessage({ tipo: "verificarSessoes" });
    if (!resultado) return;
    Object.entries(resultado).forEach(([nome, ativa]) => marcarSessao(nome, ativa));
    ultimoStatusSessao = resultado;
    renderizarSessoesUnificado();
  } catch {
    // background reiniciando o service worker: os pontos ficam como
    // estao ate a proxima checagem, sem travar o resto do popup
  }
}

// Plataformas com login/sessão que a Busca unificada também consulta.
// S.Deal fica de fora daqui (não faz parte da busca unificada); Databricks
// fica de fora porque não usa cookie de sessão (ver DOMINIOS_SESSAO no
// background.js).
const PLATAFORMAS_COM_LOGIN_NA_BUSCA_UNIFICADA = [
  { chave: "gestao", nome: "Gestão+" },
  { chave: "wings", nome: "Wings" }
];

let ultimoStatusSessao = {};

function renderizarSessoesUnificado() {
  const container = $("sessoesUnificado");
  if (!container) return;

  container.innerHTML = "";

  PLATAFORMAS_COM_LOGIN_NA_BUSCA_UNIFICADA.forEach(({ chave, nome }) => {
    const ativa = Boolean(ultimoStatusSessao[chave]);

    const chip = document.createElement("span");
    chip.className = "unificado-sessao-chip" + (ativa ? " ok" : "");

    const ponto = document.createElement("span");
    ponto.className = "unificado-sessao-ponto";

    const rotulo = document.createElement("span");
    rotulo.textContent = nome;

    chip.appendChild(ponto);
    chip.appendChild(rotulo);

    if (!ativa) {
      const botaoLogin = document.createElement("button");
      botaoLogin.type = "button";
      botaoLogin.className = "unificado-sessao-login";
      botaoLogin.textContent = "Fazer login";
      botaoLogin.title = "Abrir " + nome + " em uma nova aba para fazer login";
      botaoLogin.addEventListener("click", () => {
        chrome.tabs.create({ url: URL_PLATAFORMA[chave] });
      });
      chip.appendChild(botaoLogin);
    }

    container.appendChild(chip);
  });
}

atualizarIndicadoresDeSessao();

function trocarAba(nome) {
  abas.forEach((aba) => {
    const ativa = aba.dataset.aba === nome;
    aba.classList.toggle("ativa", ativa);
    aba.setAttribute("aria-selected", ativa ? "true" : "false");
  });

  // ao entrar na aba o atendente ja viu o problema; o badge some
  limparErroNaAba(nome);

  Object.entries(paineis).forEach(([chave, painel]) => {
    painel.classList.toggle("hidden", chave !== nome);
  });

  const foco = {
    macros: "busca",
    emails: "destinatarioEmail",
    unificada: "documentoUnificado",
    solicitacao: "codigoSolicitacao",
    databricks: "documentoDatabricks",
    sdeal: "codigoVoucherSDeal",
    gestao: "documentoGestao",
    wings: "documentoWings",
    atender: escopoAtual === "lojas" ? "buscaLoja" : "buscaParceiro"
  }[nome];

  const campo = foco && $(foco);
  if (campo) campo.focus();

  if (nome === "ocr") carregarAtalho();
  if (nome === "atender") prepararEscopoAtual();
  if (nome === "unificada") atualizarIndicadoresDeSessao();
}



// carrega a lista do escopo aberto. Lojas e parceiros tem preparacoes
// independentes e so a do escopo visivel precisa acontecer.
function prepararEscopoAtual() {
  if (escopoAtual === "lojas") {
    prepararLojas();
    return;
  }

  prepararParceiros().catch((erro) => {
    $("parceirosContador").textContent =
      "Não foi possível carregar a lista de parceiros.";
    console.error("Apoio Soluti: parceiros:", erro);
  });
}

abas.forEach((aba) => {
  aba.addEventListener("click", () => trocarAba(aba.dataset.aba));
});

/* Barra lateral: expandir/recolher -----------------------------------
   Recolhida por padrão (só ícones). O botão no topo alterna pra mostrar
   os nomes e os rótulos de grupo (ver .barra-expandida no popup.css). A
   escolha fica salva no localStorage — mesma ideia do tema em tema.js:
   síncrono, pra não ter flash da barra recolhida abrindo já expandida.
   A classe é aplicada de novo aqui (não só em tema.js) porque esse
   listener de clique só existe depois que popup.js carrega. */
const CHAVE_BARRA_EXPANDIDA = "barraExpandida";

function aplicarBarraExpandida(expandida) {
  document.documentElement.classList.toggle("barra-expandida", expandida);
  $("barraToggleBtn").setAttribute("aria-expanded", expandida ? "true" : "false");
}

function alternarBarraLateral() {
  const expandida = !document.documentElement.classList.contains("barra-expandida");
  aplicarBarraExpandida(expandida);
  try {
    localStorage.setItem(CHAVE_BARRA_EXPANDIDA, expandida ? "1" : "0");
  } catch {
    // localStorage bloqueado: a escolha vale só pra essa abertura do popup
  }
}

aplicarBarraExpandida(document.documentElement.classList.contains("barra-expandida"));
$("barraToggleBtn").addEventListener("click", alternarBarraLateral);

// Ctrl+Tab / Ctrl+Shift+Tab troca de aba sem sair do popup — util pra
// quem alterna bastante entre S.Deal/Gestão+/Wings no mesmo atendimento.
// Só entra em ação com Ctrl (sem Alt), pra não brigar com Tab puro, que
// continua navegando entre os campos normalmente.
document.addEventListener("keydown", (evento) => {
  if (!evento.ctrlKey || evento.key !== "Tab" || evento.altKey) return;

  evento.preventDefault();

  // consulta de novo: a ordem das abas pode ter sido mudada arrastando
  const listaAbas = Array.from(document.querySelectorAll(".aba"));
  const atual = listaAbas.findIndex((aba) => aba.classList.contains("ativa"));
  const passo = evento.shiftKey ? -1 : 1;
  const proximo = (atual + passo + listaAbas.length) % listaAbas.length;

  trocarAba(listaAbas[proximo].dataset.aba);
});

/* Avisos das ferramentas ------------------------------------------- */

const avisoTimers = new WeakMap();

function mostrarAviso(elemento, texto, tipo, plataforma) {
  elemento.textContent = "";
  elemento.className = `ferramenta-aviso ${tipo || ""}`.trim();

  const textoEl = document.createElement("span");
  textoEl.className = "ferramenta-aviso-texto";
  textoEl.textContent = texto;
  elemento.appendChild(textoEl);

  const url = plataforma && URL_PLATAFORMA[plataforma];
  if (url) {
    const botaoAbrir = document.createElement("button");
    botaoAbrir.type = "button";
    botaoAbrir.className = "ferramenta-aviso-abrir";
    botaoAbrir.textContent = "Verificar login";
    botaoAbrir.title = "Abrir a plataforma em uma nova aba para verificar o login";
    botaoAbrir.addEventListener("click", () => chrome.tabs.create({ url }));
    elemento.appendChild(botaoAbrir);
  }

  clearTimeout(avisoTimers.get(elemento));

  if (tipo === "ok") {
    const timer = setTimeout(() => {
      elemento.textContent = "";
      elemento.className = "ferramenta-aviso";
    }, 4000);
    avisoTimers.set(elemento, timer);
  }
}

/* Validação de CPF/CNPJ antes de buscar -------------------------------
   Gestão+, Wings e Databricks buscam por CPF/CNPJ (S.Deal busca por
   número de voucher, então fica de fora). Documento com dígito
   verificador errado nunca vai voltar com resultado — então em vez de
   deixar a busca ir até o fim pra só então mostrar "Nenhum resultado.",
   a gente já avisa no blur/Enter do campo, antes de chamar o background.
   ---------------------------------------------------------------------- */

const { documentoValido, tipoDocumento } = window.ApoioValidacao;

// Só bloqueia quando o documento está COMPLETO (11 ou 14 dígitos) e o
// dígito verificador não bate. Documento incompleto não é "inválido",
// é "ainda digitando" — não faz sentido avisar nem travar nesse caso.
function documentoInvalidoParaBuscar(valor) {
  return documentoValido(valor) === false;
}

function avisarDocumentoInvalido(aviso, valor) {
  const tipo = tipoDocumento(valor) || "documento";
  mostrarAviso(aviso, `${tipo} inválido — confira o número digitado.`, "erro");
}

// Feedback visual no próprio campo (borda vermelha), independente da
// busca já ter sido disparada ou não — ajuda a notar o erro de digitação
// antes mesmo de apertar Enter ou clicar em Buscar.
function marcarCampoDocumento(campo) {
  campo.addEventListener("input", () => campo.classList.remove("campo-invalido"));
  campo.addEventListener("blur", () => {
    campo.classList.toggle("campo-invalido", documentoInvalidoParaBuscar(campo.value));
  });
}

/* Histórico de buscas recentes ---------------------------------------
   Cada aba de busca (Solicitação, S.Deal, Gestão+, Wings) guarda os
   últimos valores buscados com sucesso, por escopo, no chrome.storage.local
   — assim sobrevive entre aberturas do popup. Clicar num item recente
   preenche o campo e (se a aba definir) já dispara a busca de novo.
   ---------------------------------------------------------------------- */

const HISTORICO_CHAVE = "historicoBuscas";
const HISTORICO_LIMITE = 8;
const HISTORICO_CONFIG = {};

async function obterTodoHistorico() {
  try {
    const guardado = await chrome.storage.local.get(HISTORICO_CHAVE);
    return guardado[HISTORICO_CHAVE] || {};
  } catch {
    return {};
  }
}

async function salvarNoHistorico(escopo, valor, rotulo) {
  if (!valor) return;

  try {
    const tudo = await obterTodoHistorico();
    const lista = (tudo[escopo] || []).filter((item) => item.valor !== valor);
    lista.unshift({ valor, rotulo: rotulo || null, data: Date.now() });
    tudo[escopo] = lista.slice(0, HISTORICO_LIMITE);
    await chrome.storage.local.set({ [HISTORICO_CHAVE]: tudo });
    renderizarHistorico(escopo);
  } catch {
    // sem espaco ou storage indisponivel: segue sem historico, sem travar a busca
  }
}

async function removerDoHistorico(escopo, valor) {
  try {
    const tudo = await obterTodoHistorico();
    tudo[escopo] = (tudo[escopo] || []).filter((item) => item.valor !== valor);
    await chrome.storage.local.set({ [HISTORICO_CHAVE]: tudo });
    renderizarHistorico(escopo);
  } catch {}
}

// registra onde cada historico deve desenhar e o que fazer ao clicar num
// item — chame uma vez por aba de busca, na inicializacao
function registrarHistorico(escopo, { containerId, campoId, aoSelecionar }) {
  HISTORICO_CONFIG[escopo] = { containerId, campoId, aoSelecionar };
  renderizarHistorico(escopo);
}

async function renderizarHistorico(escopo) {
  const config = HISTORICO_CONFIG[escopo];
  if (!config) return;

  const container = $(config.containerId);
  if (!container) return;

  const tudo = await obterTodoHistorico();
  const lista = tudo[escopo] || [];

  container.innerHTML = "";

  if (!lista.length) {
    container.classList.add("hidden");
    return;
  }

  const rotuloTitulo = document.createElement("span");
  rotuloTitulo.className = "historico-rotulo";
  rotuloTitulo.textContent = "Recentes:";
  container.appendChild(rotuloTitulo);

  lista.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "historico-chip";

    const botaoValor = document.createElement("button");
    botaoValor.type = "button";
    botaoValor.className = "historico-chip-valor";
    botaoValor.textContent = item.rotulo || item.valor;
    botaoValor.title = "Buscar de novo";
    botaoValor.addEventListener("click", () => {
      const campo = $(config.campoId);
      if (campo) campo.value = item.valor;
      config.aoSelecionar?.(item.valor);
    });

    const botaoRemover = document.createElement("button");
    botaoRemover.type = "button";
    botaoRemover.className = "historico-chip-remover";
    botaoRemover.textContent = "×";
    botaoRemover.title = "Remover do histórico";
    botaoRemover.addEventListener("click", () => removerDoHistorico(escopo, item.valor));

    chip.appendChild(botaoValor);
    chip.appendChild(botaoRemover);
    container.appendChild(chip);
  });

  container.classList.remove("hidden");
}

/* Solicitacao ------------------------------------------------------
   Um campo, dois destinos. Eram duas abas com o mesmo placeholder, e o
   servico por tras e o mesmo que o menu de contexto usa: em vez de
   refazer o fetch e o window.open aqui, os botoes mandam a mensagem para
   o background (uma implementacao so, e as abas abrem por
   chrome.tabs.create, mais confiavel que window.open a partir de um
   popup que esta prestes a fechar).
   ------------------------------------------------------------------ */

async function pedirAberturaAoBackground(tipo, idBotao, textos) {
  const campo = $("codigoSolicitacao");
  const botao = $(idBotao);
  const aviso = $("avisoSolicitacao");

  const codigo = campo.value.trim();

  if (!codigo) {
    mostrarAviso(aviso, "Digite o código da solicitação.", "erro");
    campo.focus();
    return;
  }

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Abrindo...";
  mostrarAviso(aviso, textos.buscando, "");

  try {
    const resposta = await chrome.runtime.sendMessage({ tipo, codigo });

    if (!resposta || resposta.erro) {
      mostrarAviso(aviso, resposta?.erro || "Nenhum resultado.", "erro");
      return;
    }

    mostrarAviso(aviso, textos.pronto(resposta.quantidade || 1), "ok");
    salvarNoHistorico("solicitacao", codigo);
  } catch {
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

function abrirSiteDaAr() {
  return pedirAberturaAoBackground("abrirAR", "abrirArBtn", {
    buscando: "Buscando...",
    pronto: (n) =>
      n > 1 ? `Aberto em ${n} novas abas.` : "Aberto em nova aba."
  });
}

function abrirSolicitacaoNaAr() {
  return pedirAberturaAoBackground("abrirSolicitacao", "abrirSolicitacaoBtn", {
    buscando: "Abrindo solicitação...",
    pronto: () => "Aguarde o carregamento..."
  });
}

$("abrirArBtn").addEventListener("click", abrirSiteDaAr);
$("abrirSolicitacaoBtn").addEventListener("click", abrirSolicitacaoNaAr);

// Enter abre a solicitação — é a ação mais usada aqui; "Abrir site da AR"
// continua disponível pelo botão, só não é mais o padrão do Enter.
$("codigoSolicitacao").addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") $("abrirSolicitacaoBtn").click();
});

registrarHistorico("solicitacao", {
  containerId: "historicoSolicitacao",
  campoId: "codigoSolicitacao"
  // sem aoSelecionar: só preenche o campo, porque aqui tem 2 destinos
  // possíveis (AR ou solicitação) e quem decide qual é o atendente
});

/* S.Deal -------------------------------------------------------------
   Busca de voucher no S.Deal (sistema legado). O popup so manda o
   numero para o background e mostra o que voltar — toda a sequencia de
   requisicoes e a sessao logada (via aba real) ficam la, do mesmo jeito
   que "Solicitacao" faz para abrir AR.
   ---------------------------------------------------------------------- */

// Sobe este número sempre que o formato do que o background extrai do
// S.Deal mudar (novo campo, chave corrigida, etc.) — cache salvo com uma
// versão antiga é ignorado, senão o resultado "correto" ficaria preso
// atrás do cache velho pelo resto da sessão do navegador.
const CACHE_VERSAO_SDEAL = 2;

// ordem e rotulos de exibicao — segue a mesma ordem do formulário real do
// S.Deal (Informações / Informações Adicionais). "situacaoVoucher" fica de
// fora porque vai sozinha no cabeçalho do cartão de resultado, e o código
// da solicitação (com o botão "Abrir no SisAR") é tratado à parte, logo
// no topo, porque é uma ação e não só uma linha de leitura.
const CAMPOS_SDEAL = [
  { chave: "idVoucher", rotulo: "Identificador" },
  { chave: "nomeCLiente", rotulo: "Cliente" },
  { chave: "perfilVoucher", rotulo: "Perfil" },
  { chave: "habilitado", rotulo: "Habilitado" },
  { chave: "negociacao", rotulo: "Negociação" },
  { chave: "global", rotulo: "Importação AR" },
  { chave: "empenho", rotulo: "Empenho" },
  { chave: "produto", rotulo: "Produto atual" },
  { chave: "produto1", rotulo: "Produto anterior" },
  { chave: "alocado", rotulo: "Alocado para" },
  { chave: "sugestaoUso", rotulo: "Sugestão de uso" },
  { chave: "Serial", rotulo: "Serial Renovação" },
  { chave: "emitidoPara", rotulo: "Emitido para" },
  { chave: "dataEmissao", rotulo: "Data de Aprovação" },
  { chave: "dataEmissao1", rotulo: "Data de emissão" },
  { chave: "dataVencimento", rotulo: "Data de vencimento" }
];

// o background devolve datas como { __data, ano, mes, dia } (vieram como
// "new Date(...)" na resposta do S.Deal) — aqui viram "dd/mm/aaaa"
function formatarValorSDeal(valor) {
  if (valor && typeof valor === "object" && valor.__data) {
    const dia = String(valor.dia).padStart(2, "0");
    const mes = String(valor.mes).padStart(2, "0");
    return `${dia}/${mes}/${valor.ano}`;
  }
  return valor;
}

function situacaoVoucherEhAlerta(texto) {
  const t = (texto || "").toLowerCase();
  return (
    t.includes("utilizado") ||
    t.includes("revogad") ||
    t.includes("expirad") ||
    t.includes("cancelad")
  );
}

// O S.Deal manda o código da solicitação por um caminho diferente do
// resto dos campos (não é um "ebfFormChangeComponentValue" — é um
// "d.c_818716.setValue(...)" à parte), então o background já isola isso
// e entrega pronto em dados.codSolicitacao. As outras chaves aqui ficam
// só como rede de segurança, caso o S.Deal mude o formato.
const CHAVES_COD_SOLICITACAO_SDEAL = [
  "codSolicitacao",
  "codigoSolicitacao",
  "codSolic",
  "solicitacao"
];

function extrairCodSolicitacaoSDeal(dados) {
  for (const chave of CHAVES_COD_SOLICITACAO_SDEAL) {
    const valor = dados[chave];
    if (valor && typeof valor === "string") return valor.trim();
  }
  return null;
}

// Reaproveita o mesmo mensageiro que a aba "Solicitação" usa pra abrir
// direto no SisAR — o background já sabe montar a URL a partir do código.
async function abrirCodigoNoSisAR(codigo, botao, aviso) {
  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Abrindo...";

  try {
    const resposta = await chrome.runtime.sendMessage({ tipo: "abrirSolicitacao", codigo });
    if (!resposta || resposta.erro) {
      mostrarAviso(aviso, resposta?.erro || "Não foi possível abrir no SisAR.", "erro");
      return;
    }
    mostrarAviso(aviso, "Aberto no SisAR.", "ok");
  } catch {
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

let ultimaBuscaSDeal = null;

function renderizarResultadoSDeal(dados, voucher) {
  ultimaBuscaSDeal = { dados, voucher };

  const situacao = $("sdealSituacao");
  situacao.textContent = dados.situacaoVoucher || "Situação não informada";
  situacao.classList.toggle("alerta", situacaoVoucherEhAlerta(dados.situacaoVoucher));

  const linhas = $("sdealLinhas");
  linhas.innerHTML = "";

  const codSolicitacao = extrairCodSolicitacaoSDeal(dados);
  if (codSolicitacao) {
    const linha = document.createElement("div");
    linha.className = "sdeal-linha";

    const r = document.createElement("span");
    r.className = "sdeal-rotulo";
    r.textContent = "Cód. Solicitação";

    const acoes = document.createElement("span");
    acoes.style.display = "flex";
    acoes.style.alignItems = "center";
    acoes.style.gap = "8px";

    const v = document.createElement("span");
    v.className = "sdeal-valor";
    v.textContent = codSolicitacao;

    const botaoSisar = document.createElement("button");
    botaoSisar.type = "button";
    botaoSisar.className = "sisar-btn";
    botaoSisar.textContent = "Abrir no SisAR";
    botaoSisar.addEventListener("click", () =>
      abrirCodigoNoSisAR(codSolicitacao, botaoSisar, $("avisoSDeal"))
    );

    acoes.appendChild(v);
    acoes.appendChild(botaoSisar);
    linha.appendChild(r);
    linha.appendChild(acoes);
    linhas.appendChild(linha);
  }

  CAMPOS_SDEAL.forEach(({ chave, rotulo }) => {
    const valor = formatarValorSDeal(dados[chave]);
    if (!valor) return;

    const linha = document.createElement("div");
    linha.className = "sdeal-linha";

    // "dataVencimento" vem como { __data, ano, mes, dia } — dá pra montar
    // um Date de verdade a partir disso pra calcular quantos dias faltam,
    // sem depender do texto já formatado em "dd/mm/aaaa".
    if (chave === "dataVencimento") {
      const bruto = dados[chave];
      const dataReal = bruto?.__data ? new Date(bruto.ano, bruto.mes - 1, bruto.dia) : null;
      if (vencimentoProximo(dataReal)) linha.classList.add("alerta-aviso");
    }

    const r = document.createElement("span");
    r.className = "sdeal-rotulo";
    r.textContent = rotulo;

    const v = document.createElement("span");
    v.className = "sdeal-valor";
    v.textContent = valor;

    linha.appendChild(r);
    linha.appendChild(v);
    linhas.appendChild(linha);
  });

  $("resultadoSDeal").classList.remove("hidden");
}

async function buscarVoucherSDeal(forcarAtualizacao = false) {
  const campo = $("codigoVoucherSDeal");
  const botao = $("buscarVoucherBtn");
  const aviso = $("avisoSDeal");
  const voucher = campo.value.trim();

  if (!voucher) {
    mostrarAviso(aviso, "Digite o número do voucher.", "erro");
    campo.focus();
    return;
  }

  $("resultadoSDeal").classList.add("hidden");
  $("atualizarSDealBtn").classList.add("hidden");

  // --- TENTA O CACHE ---
  // Versionado: buscas em cache de antes da extração do código de
  // solicitação (ou da correção de acentuação) ficariam presas com os
  // dados velhos pro resto da sessão do navegador se a gente confiasse
  // em qualquer cache antigo. Com a versão marcada, cache de um formato
  // anterior é tratado como cache miss e busca de novo.
  // "forcarAtualizacao" (botão "Atualizar busca") pula o cache de propósito,
  // pra quando o atendente quer confirmar o estado mais recente do voucher.
  if (!forcarAtualizacao) {
    const emCache = await obterCache("sdeal", voucher);
    if (emCache && emCache.v === CACHE_VERSAO_SDEAL) {
      console.log("[ApoioSoluti][S.Deal] resultado do cache:", emCache.dados);
      console.log("[ApoioSoluti][S.Deal] codSolicitacao (cache):", extrairCodSolicitacaoSDeal(emCache.dados));
      renderizarResultadoSDeal(emCache.dados, voucher);
      mostrarAviso(aviso, "Busca carregada do cache (rápida).", "ok");
      $("atualizarSDealBtn").classList.remove("hidden");
      salvarNoHistorico("sdeal", voucher, emCache.dados?.nomeCLiente ? `${voucher} — ${emCache.dados.nomeCLiente}` : voucher);
      return;
    }
  }

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Buscando...";
  mostrarAviso(aviso, "Buscando no S.Deal...", "");

  try {
    const resposta = await chrome.runtime.sendMessage({ tipo: "buscarVoucherSDeal", voucher });

    // Log de depuração: confere no console do popup (clique com o botão
    // direito na janela do Apoio Soluti > Inspecionar) o que voltou do
    // background e se o código de solicitação veio junto. O background
    // também loga a parte dele — esse log ali só aparece no console do
    // service worker (chrome://extensions > Apoio Soluti > "service worker").
    console.log("[ApoioSoluti][S.Deal] resposta do background:", resposta);
    if (resposta?.dados) {
      console.log("[ApoioSoluti][S.Deal] codSolicitacao (busca nova):", extrairCodSolicitacaoSDeal(resposta.dados));
    }

    if (!resposta || resposta.erro) {
      const ehSessao = erroParecomSessao(resposta?.erro);
      mostrarAviso(aviso, resposta?.erro || "Nenhum resultado.", "erro", ehSessao ? "sdeal" : null);
      marcarErroNaAba("sdeal");
      if (ehSessao) marcarSessao("sdeal", false);
      return;
    }

    renderizarResultadoSDeal(resposta.dados, voucher);
    mostrarAviso(aviso, forcarAtualizacao ? "Busca atualizada." : "Busca concluída.", "ok");

    // --- SALVA NO CACHE ---
    salvarCache("sdeal", voucher, { dados: resposta.dados, v: CACHE_VERSAO_SDEAL });

    limparErroNaAba("sdeal");
    marcarSessao("sdeal", true);
    salvarNoHistorico("sdeal", voucher, resposta.dados?.nomeCLiente ? `${voucher} — ${resposta.dados.nomeCLiente}` : voucher);
  } catch (erro) {
    console.error("[ApoioSoluti][S.Deal] falha ao falar com a extensão:", erro);
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
    marcarErroNaAba("sdeal");
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

function atualizarBuscaSDeal() {
  return buscarVoucherSDeal(true);
}

function copiarResultadoSDeal() {
  if (!ultimaBuscaSDeal) return;

  const { dados, voucher } = ultimaBuscaSDeal;
  const linhas = [`Voucher: ${voucher}`, `Situação: ${dados.situacaoVoucher || "—"}`];

  const codSolicitacao = extrairCodSolicitacaoSDeal(dados);
  if (codSolicitacao) linhas.push(`Cód. Solicitação: ${codSolicitacao}`);

  CAMPOS_SDEAL.forEach(({ chave, rotulo }) => {
    const valor = formatarValorSDeal(dados[chave]);
    if (valor) linhas.push(`${rotulo}: ${valor}`);
  });

  navigator.clipboard
    .writeText(linhas.join("\n"))
    .then(() => mostrarAviso($("avisoSDeal"), "Copiado.", "ok"))
    .catch(() => mostrarAviso($("avisoSDeal"), "Não foi possível copiar.", "erro"));
}

$("buscarVoucherBtn").addEventListener("click", () => buscarVoucherSDeal());
$("copiarSDealBtn").addEventListener("click", copiarResultadoSDeal);
$("atualizarSDealBtn").addEventListener("click", atualizarBuscaSDeal);

$("codigoVoucherSDeal").addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") buscarVoucherSDeal();
});

registrarHistorico("sdeal", {
  containerId: "historicoSDeal",
  campoId: "codigoVoucherSDeal",
  aoSelecionar: () => buscarVoucherSDeal()
});

/* Gestão+ --------------------------------------------------------------
   Busca o historico de movimentacoes/vendas de um parceiro no
   solutivd.gestao.plus a partir do CPF/CNPJ. Mesmo esquema do S.Deal:
   o popup so manda o documento; a sessao logada (via aba real) e a
   sequencia de requisicoes ficam no background.
   ---------------------------------------------------------------------- */

// tenta alguns nomes de campo comuns para cada dado, ja que nao vimos o
// corpo real da resposta do Gestão+ — so a URL da requisicao
function primeiroValor(objeto, chaves) {
  for (const chave of chaves) {
    const valor = objeto?.[chave];
    if (valor !== undefined && valor !== null && valor !== "") return valor;
  }
  return null;
}

let ultimaBuscaGestao = null;

function renderizarResultadoGestao(parceiro, movimentacoes, documento) {
  ultimaBuscaGestao = { parceiro, movimentacoes, documento };

  const nome = primeiroValor(parceiro, ["nome", "razaoSocial", "nomeFantasia"]);
  $("gestaoParceiroNome").textContent = nome
    ? `${nome} (#${parceiro.id})`
    : `Parceiro #${parceiro.id}`;

  const email = primeiroValor(parceiro, ["email", "emailCadastro", "emailContato"]);
  $("gestaoParceiroEmail").textContent = email || "—";

  const lista = $("gestaoMovimentacoes");
  lista.innerHTML = "";

  if (!movimentacoes.length) {
    const vazio = document.createElement("div");
    vazio.className = "gestao-vazio";
    vazio.textContent = "Nenhuma movimentação/venda encontrada para esse parceiro.";
    lista.appendChild(vazio);
  } else {
    movimentacoes.forEach((mov) => {
      const codigo = primeiroValor(mov, ["codigo", "code"]);
      const voucher = primeiroValor(mov, ["voucher", "numeroVoucher"]);
      const data = primeiroValor(mov, ["dataNegociacao", "dataFaturamento"]);
      const total = primeiroValor(mov, ["valorTotal"]);

      const linha = document.createElement("div");
      linha.className = "gestao-movimentacao";
      linha.title = "Ver detalhes do pedido";

      const topo = document.createElement("div");
      topo.className = "gestao-mov-topo";

      const id = document.createElement("span");
      id.className = "gestao-mov-id";
      id.textContent = `#${mov.id}`;

      const detalhe = document.createElement("span");
      detalhe.className = "gestao-mov-detalhe";
      detalhe.textContent = [codigo, voucher].filter(Boolean).join(" · ") || "—";

      topo.appendChild(id);
      topo.appendChild(detalhe);

      const meta = document.createElement("div");
      meta.className = "gestao-mov-meta";
      meta.textContent = [data ? formatarData(data) : null, total ? formatarMoeda(total) : null]
        .filter(Boolean)
        .join("  ·  ");

      linha.appendChild(topo);
      if (meta.textContent) linha.appendChild(meta);
      linha.addEventListener("click", () => buscarDetalhePedido(mov.id));
      lista.appendChild(linha);
    });
  }

  $("detalhePedido").classList.add("hidden");
  $("resultadoGestao").classList.remove("hidden");
}

/* Detalhe do pedido (movimentação) -------------------------------------- */

function formatarMoeda(valor) {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return valor || "—";
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(campoData) {
  const bruto = campoData?.date || campoData;
  if (!bruto) return "—";
  const data = new Date(String(bruto).replace(" ", "T") + "Z");
  if (Number.isNaN(data.getTime())) return String(bruto);
  return data.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function embutido(objeto, chave) {
  return objeto?._embedded?.[chave] || null;
}

let ultimoPedidoGestao = null;
let pedidoFechadoPeloUsuario = false;

function renderizarDetalhePedido(pedido, itens, historico) {
  ultimoPedidoGestao = { pedido, itens, historico };

  const tipoMovimentacao = embutido(pedido, "tipoMovimentacao");
  const tipoDeNegociacao = embutido(pedido, "tipoDeNegociacao");
  const parceiro = embutido(pedido, "parceiro");
  const unidade = embutido(pedido, "unidade");
  const vendedor = embutido(pedido, "vendedor");

  $("pedidoTitulo").textContent = pedido.codigo
    ? `Pedido ${pedido.codigo} (#${pedido.id})`
    : `Pedido #${pedido.id}`;

  // Badges de situação: mostra só o que veio preenchido
  const badges = $("pedidoBadges");
  badges.innerHTML = "";
  const situacoes = [
    ["Financeiro", pedido.situacaoFinanceiro],
    ["NF", pedido.situacaoNf],
    ["Entrega", pedido.situacaoEntrega]
  ];
  situacoes.forEach(([rotulo, valor]) => {
    if (!valor) return;
    const badge = document.createElement("span");
    badge.className = "gestao-pedido-badge";
    if (/cancel|revogad|estorn/i.test(valor)) badge.classList.add("alerta");
    badge.textContent = `${rotulo}: ${valor}`;
    badges.appendChild(badge);
  });

  $("pedidoParceiro").textContent = parceiro
    ? `${parceiro.nome || parceiro.razaoSocial || "—"} (#${parceiro.id})`
    : "—";
  $("pedidoEmail").textContent = parceiro?.email || "—";
  $("pedidoFormaPagamento").textContent = tipoDeNegociacao?.descricao || "—";
  $("pedidoTipoMovimentacao").textContent = tipoMovimentacao?.descricao || "—";
  $("pedidoUnidade").textContent = unidade?.descricao || "—";
  $("pedidoVendedor").textContent = vendedor?.nome || "—";
  $("pedidoDataNegociacao").textContent = formatarData(pedido.dataNegociacao);
  $("pedidoDataFaturamento").textContent = formatarData(pedido.dataFaturamento);
  $("pedidoCodigoExterno").textContent = pedido.codigoExterno || "—";

  // Itens
  const listaItens = $("pedidoItens");
  listaItens.innerHTML = "";
  if (!itens.length) {
    const vazio = document.createElement("div");
    vazio.className = "gestao-vazio";
    vazio.textContent = "Nenhum item encontrado.";
    listaItens.appendChild(vazio);
  } else {
    itens.forEach((item) => {
      const produto = embutido(item, "produto");

      const linha = document.createElement("div");
      linha.className = "gestao-pedido-item";

      const nome = document.createElement("span");
      nome.className = "gestao-pedido-item-nome";
      nome.textContent = produto?.descricao || item.descricao || "Item";

      const qtdValor = document.createElement("span");
      qtdValor.className = "gestao-pedido-item-linha";
      qtdValor.textContent = `Qtd: ${item.quantidade ?? "—"}  ·  Unitário: ${formatarMoeda(item.valorUnitario)}`;

      const subtotal = document.createElement("span");
      subtotal.className = "gestao-pedido-item-linha";
      const descontoItem = Number(item.valorDesconto || 0) > 0
        ? `  ·  Desconto: ${formatarMoeda(item.valorDesconto)}`
        : "";
      subtotal.textContent = `Subtotal: ${formatarMoeda(item.subTotal)}${descontoItem}`;

      linha.appendChild(nome);
      linha.appendChild(qtdValor);
      linha.appendChild(subtotal);
      listaItens.appendChild(linha);
    });
  }

  // Totais
  $("pedidoDesconto").textContent = formatarMoeda(pedido.valorDesconto);
  $("pedidoFrete").textContent = formatarMoeda(pedido.valorFrete);
  $("pedidoRetido").textContent = formatarMoeda(pedido.valorRetido);
  $("pedidoTotal").textContent = formatarMoeda(pedido.valorTotal);

  // Histórico / situação — ordenado do mais antigo pro mais recente, só
  // com entradas que tem uma "situacao" (as de auditoria interna, tipo
  // "Alteração de item", ficam de fora pra não poluir)
  const listaHistorico = $("pedidoHistorico");
  listaHistorico.innerHTML = "";

  const historicoRelevante = (historico || [])
    .filter((h) => h.situacao || h.descricao)
    .sort((a, b) => new Date(a.data?.date || 0) - new Date(b.data?.date || 0));

  if (!historicoRelevante.length) {
    const vazio = document.createElement("div");
    vazio.className = "gestao-vazio";
    vazio.textContent = "Nenhum histórico encontrado.";
    listaHistorico.appendChild(vazio);
  } else {
    historicoRelevante.forEach((h) => {
      const linha = document.createElement("div");
      linha.className = "gestao-pedido-historico-item";

      const cabecalho = document.createElement("div");
      cabecalho.className = "gestao-pedido-historico-cabecalho";

      const situacao = document.createElement("span");
      situacao.className = "gestao-pedido-historico-situacao";
      situacao.textContent = h.situacao || "Registro";
      cabecalho.appendChild(situacao);

      if (h.codigo) {
        const codigoSolicitacao = document.createElement("span");
        codigoSolicitacao.className = "gestao-pedido-historico-codigo";
        codigoSolicitacao.textContent = `Cód. solicitação: ${h.codigo}`;
        cabecalho.appendChild(codigoSolicitacao);
      }

      const descricao = document.createElement("span");
      descricao.className = "gestao-pedido-historico-descricao";
      descricao.textContent = h.descricao || "—";

      const data = document.createElement("span");
      data.className = "gestao-pedido-historico-data";
      data.textContent = formatarData(h.data);

      linha.appendChild(cabecalho);
      linha.appendChild(descricao);
      linha.appendChild(data);
      listaHistorico.appendChild(linha);
    });
  }

  $("detalhePedido").classList.remove("hidden");
  $("detalhePedido").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function buscarDetalhePedido(movimentacaoId, forcarAtualizacao = false) {
  const aviso = $("avisoPedido");
  mostrarAviso(aviso, "Buscando dados do pedido...", "");
  $("detalhePedido").classList.add("hidden");
  $("atualizarPedidoBtn").classList.add("hidden");
  pedidoFechadoPeloUsuario = false;

  // --- TENTA O CACHE ---
  if (!forcarAtualizacao) {
    const emCache = await obterCache("gestaoDetalhePedido", String(movimentacaoId));
    if (emCache) {
      limparErroNaAba("gestao");
      renderizarDetalhePedido(emCache.pedido, emCache.itens, emCache.historico);
      salvarEstadoGestaoNaSessao();
      mostrarAviso(aviso, "Detalhes do pedido carregados do cache.", "ok");
      $("atualizarPedidoBtn").classList.remove("hidden");
      if ($("copiarPedidoAoAbrir").checked) copiarDetalhePedido();
      return;
    }
  }

  try {
    const resposta = await chrome.runtime.sendMessage({ tipo: "buscarPedidoGestaoPlus", movimentacaoId });
    if (!resposta || resposta.erro) {
      const ehSessao = erroParecomSessao(resposta?.erro);
      mostrarAviso(aviso, resposta?.erro || "Não foi possível buscar o pedido.", "erro", ehSessao ? "gestao" : null);
      marcarErroNaAba("gestao");
      if (ehSessao) marcarSessao("gestao", false);
      return;
    }

    limparErroNaAba("gestao");
    marcarSessao("gestao", true);
    renderizarDetalhePedido(resposta.pedido, resposta.itens || [], resposta.historico || []);
    salvarEstadoGestaoNaSessao();
    mostrarAviso(aviso, forcarAtualizacao ? "Pedido atualizado." : "Pedido carregado.", "ok");

    // --- SALVA NO CACHE ---
    salvarCache("gestaoDetalhePedido", String(movimentacaoId), { 
      pedido: resposta.pedido, itens: resposta.itens || [], historico: resposta.historico || [] 
    });

    if ($("copiarPedidoAoAbrir").checked) copiarDetalhePedido();
  } catch {
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
    marcarErroNaAba("gestao");
  }
}

function atualizarBuscaPedidoDetalhe() {
  if (!ultimoPedidoGestao?.pedido?.id) return;
  return buscarDetalhePedido(ultimoPedidoGestao.pedido.id, true);
}
$("atualizarPedidoBtn").addEventListener("click", atualizarBuscaPedidoDetalhe);

function copiarDetalhePedido() {
  if (!ultimoPedidoGestao) return;
  const { pedido, itens, historico } = ultimoPedidoGestao;
  const parceiro = embutido(pedido, "parceiro");
  const tipoDeNegociacao = embutido(pedido, "tipoDeNegociacao");

  const linhas = [
    `Pedido: ${pedido.codigo || "—"} (#${pedido.id})`,
    `Parceiro: ${parceiro?.nome || "—"}${parceiro?.email ? ` <${parceiro.email}>` : ""}`,
    `Forma de pagamento: ${tipoDeNegociacao?.descricao || "—"}`,
    `Situação financeiro: ${pedido.situacaoFinanceiro || "—"}`,
    `Situação NF: ${pedido.situacaoNf || "—"}`,
    `Situação entrega: ${pedido.situacaoEntrega || "—"}`,
    `Negociado em: ${formatarData(pedido.dataNegociacao)}`,
    `Faturado em: ${formatarData(pedido.dataFaturamento)}`,
    "",
    "Itens:"
  ];

  itens.forEach((item) => {
    const produto = embutido(item, "produto");
    linhas.push(
      `- ${produto?.descricao || "Item"} | Qtd ${item.quantidade ?? "—"} | ` +
      `Unitário ${formatarMoeda(item.valorUnitario)} | Subtotal ${formatarMoeda(item.subTotal)}`
    );
  });

  linhas.push(
    "",
    `Desconto: ${formatarMoeda(pedido.valorDesconto)}`,
    `Frete: ${formatarMoeda(pedido.valorFrete)}`,
    `Total: ${formatarMoeda(pedido.valorTotal)}`,
    "",
    "Histórico:"
  );

  historico
    .filter((h) => h.situacao || h.descricao)
    .sort((a, b) => new Date(a.data?.date || 0) - new Date(b.data?.date || 0))
    .forEach((h) => {
      const codigoSolicitacao = h.codigo ? ` (cód. solicitação: ${h.codigo})` : "";
      linhas.push(`- [${formatarData(h.data)}] ${h.situacao || "Registro"}${codigoSolicitacao}: ${h.descricao || "—"}`);
    });

  navigator.clipboard
    .writeText(linhas.join("\n"))
    .then(() => mostrarAviso($("avisoPedido"), "Copiado.", "ok"))
    .catch(() => mostrarAviso($("avisoPedido"), "Não foi possível copiar.", "erro"));
}

$("copiarPedidoBtn").addEventListener("click", copiarDetalhePedido);
$("fecharPedidoBtn").addEventListener("click", () => {
  $("detalhePedido").classList.add("hidden");
  pedidoFechadoPeloUsuario = true;
  // fechou de proposito: nao faz sentido esse pedido reaparecer sozinho
  // na proxima vez que o popup abrir
  if (chrome.storage.session) {
    chrome.storage.session.remove(ESTADO_GESTAO_SESSAO_CHAVE).catch(() => {});
  }
});

/* Toggle "copiar ao abrir" ------------------------------------------
   Preferencia do atendente, guardada entre aberturas do popup. Quando
   ligada, buscarDetalhePedido() copia o pedido pro clipboard assim que
   ele termina de carregar, sem precisar clicar em "Copiar".
   ---------------------------------------------------------------------- */

const COPIAR_AO_ABRIR_CHAVE = "copiarPedidoAoAbrir";

(async function carregarPreferenciaCopiarAoAbrir() {
  try {
    const guardado = await chrome.storage.local.get(COPIAR_AO_ABRIR_CHAVE);
    $("copiarPedidoAoAbrir").checked = Boolean(guardado[COPIAR_AO_ABRIR_CHAVE]);
  } catch {
    // sem storage disponivel: fica desligado, sem travar o resto do popup
  }
})();

$("copiarPedidoAoAbrir").addEventListener("change", (evento) => {
  chrome.storage.local
    .set({ [COPIAR_AO_ABRIR_CHAVE]: evento.target.checked })
    .catch(() => {});
});

/* Busca direta por número do pedido, sem precisar do CPF/CNPJ ---------- */

let ultimaListaBuscaPedido = null;

function renderizarListaBuscaPedido(movimentacoes) {
  ultimaListaBuscaPedido = { movimentacoes };

  const container = $("resultadoBuscaPedido");
  const lista = $("listaBuscaPedido");
  lista.innerHTML = "";

  movimentacoes.forEach((mov) => {
    const codigo = primeiroValor(mov, ["codigo", "code"]);
    const voucher = primeiroValor(mov, ["voucher", "numeroVoucher"]);
    const data = primeiroValor(mov, ["dataNegociacao", "dataFaturamento"]);
    const total = primeiroValor(mov, ["valorTotal"]);
    const parceiro = embutido(mov, "parceiro");

    const linha = document.createElement("div");
    linha.className = "gestao-movimentacao";
    linha.title = "Ver detalhes do pedido";

    const topo = document.createElement("div");
    topo.className = "gestao-mov-topo";

    const id = document.createElement("span");
    id.className = "gestao-mov-id";
    id.textContent = `#${mov.id}`;

    const detalhe = document.createElement("span");
    detalhe.className = "gestao-mov-detalhe";
    detalhe.textContent = [codigo, voucher].filter(Boolean).join(" · ") || "—";

    topo.appendChild(id);
    topo.appendChild(detalhe);

    const meta = document.createElement("div");
    meta.className = "gestao-mov-meta";
    meta.textContent = [
      parceiro?.nome,
      data ? formatarData(data) : null,
      total ? formatarMoeda(total) : null
    ]
      .filter(Boolean)
      .join("  ·  ");

    linha.appendChild(topo);
    if (meta.textContent) linha.appendChild(meta);
    linha.addEventListener("click", () => buscarDetalhePedido(mov.id));
    lista.appendChild(linha);
  });

  container.classList.remove("hidden");
}

async function buscarPedidoPorNumero(forcarAtualizacao = false) {
  const campo = $("numeroPedidoGestao");
  const botao = $("buscarPedidoNumeroBtn");
  const aviso = $("avisoBuscaPedido");
  const numero = campo.value.trim();

  if (!numero) {
    mostrarAviso(aviso, "Digite o número do pedido.", "erro");
    campo.focus();
    return;
  }

  $("resultadoBuscaPedido").classList.add("hidden");
  $("atualizarBuscaPedidoBtn").classList.add("hidden");
  $("detalhePedido").classList.add("hidden");

  // --- TENTA O CACHE ---
  if (!forcarAtualizacao) {
    const emCache = await obterCache("gestaoBuscaPedido", numero);
    if (emCache) {
      if (emCache.movimentacoes.length === 1) {
        mostrarAviso(aviso, "Pedido encontrado (cache).", "ok");
        salvarNoHistorico("gestaoPedido", numero, emCache.movimentacoes[0].codigo || numero);
        await buscarDetalhePedido(emCache.movimentacoes[0].id);
      } else {
        mostrarAviso(aviso, `${emCache.movimentacoes.length} pedidos em cache. Escolha um.`, "ok");
        $("atualizarBuscaPedidoBtn").classList.remove("hidden");
        salvarNoHistorico("gestaoPedido", numero);
        renderizarListaBuscaPedido(emCache.movimentacoes);
        salvarEstadoGestaoNaSessao();
      }
      return;
    }
  }

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Buscando...";
  mostrarAviso(aviso, "Buscando pedido...", "");

  try {
    const resposta = await chrome.runtime.sendMessage({ tipo: "buscarPedidoPorCodigoGestaoPlus", codigo: numero });
    if (!resposta || resposta.erro) {
      const ehSessao = erroParecomSessao(resposta?.erro);
      mostrarAviso(aviso, resposta?.erro || "Nenhum pedido encontrado.", "erro", ehSessao ? "gestao" : null);
      marcarErroNaAba("gestao");
      if (ehSessao) marcarSessao("gestao", false);
      return;
    }

    limparErroNaAba("gestao");
    marcarSessao("gestao", true);
    const movimentacoes = resposta.movimentacoes || [];

    // --- SALVA NO CACHE ---
    salvarCache("gestaoBuscaPedido", numero, { movimentacoes });

    if (movimentacoes.length === 1) {
      mostrarAviso(aviso, "Pedido encontrado.", "ok");
      salvarNoHistorico("gestaoPedido", numero, movimentacoes[0].codigo || numero);
      await buscarDetalhePedido(movimentacoes[0].id, forcarAtualizacao);
      return;
    }

    mostrarAviso(aviso, forcarAtualizacao ? "Busca atualizada." : `${movimentacoes.length} pedidos encontrados. Escolha um.`, "ok");
    salvarNoHistorico("gestaoPedido", numero);
    renderizarListaBuscaPedido(movimentacoes);
    salvarEstadoGestaoNaSessao();
  } catch {
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
    marcarErroNaAba("gestao");
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

function atualizarBuscaPedido() {
  return buscarPedidoPorNumero(true);
}

$("buscarPedidoNumeroBtn").addEventListener("click", () => buscarPedidoPorNumero());
$("numeroPedidoGestao").addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") buscarPedidoPorNumero();
});
$("atualizarBuscaPedidoBtn").addEventListener("click", atualizarBuscaPedido);

registrarHistorico("gestaoPedido", {
  containerId: "historicoGestaoPedido",
  campoId: "numeroPedidoGestao",
  aoSelecionar: () => buscarPedidoPorNumero()
});

async function buscarHistoricoGestao(forcarAtualizacao = false) {
  const campo = $("documentoGestao");
  const botao = $("buscarGestaoBtn");
  const aviso = $("avisoGestao");
  const documento = campo.value.trim();

  if (!documento) {
    mostrarAviso(aviso, "Digite o CPF ou CNPJ do parceiro.", "erro");
    campo.focus();
    return;
  }

  if (documentoInvalidoParaBuscar(documento)) {
    avisarDocumentoInvalido(aviso, documento);
    campo.classList.add("campo-invalido");
    campo.focus();
    return;
  }

  $("resultadoGestao").classList.add("hidden");
  $("atualizarGestaoBtn").classList.add("hidden");

  // --- TENTA O CACHE ---
  if (!forcarAtualizacao) {
    const emCache = await obterCache("gestaoDocumento", documento);
    if (emCache) {
      renderizarResultadoGestao(emCache.parceiro, emCache.movimentacoes, documento);
      mostrarAviso(aviso, "Busca carregada do cache (rápida).", "ok");
      $("atualizarGestaoBtn").classList.remove("hidden");
      salvarEstadoGestaoNaSessao();
      const nomeParceiro = primeiroValor(emCache.parceiro, ["nome", "razaoSocial", "nomeFantasia"]);
      salvarNoHistorico("gestaoDocumento", documento, nomeParceiro ? `${nomeParceiro} — ${documento}` : documento);
      return;
    }
  }

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Buscando...";
  mostrarAviso(aviso, "Buscando no Gestão+...", "");

  try {
    const resposta = await chrome.runtime.sendMessage({ tipo: "buscarHistoricoGestaoPlus", cpfCnpj: documento });
    if (!resposta || resposta.erro) {
      const ehSessao = erroParecomSessao(resposta?.erro);
      mostrarAviso(aviso, resposta?.erro || "Nenhum resultado.", "erro", ehSessao ? "gestao" : null);
      marcarErroNaAba("gestao");
      if (ehSessao) marcarSessao("gestao", false);
      return;
    }

    renderizarResultadoGestao(resposta.parceiro, resposta.movimentacoes || [], documento);
    mostrarAviso(aviso, forcarAtualizacao ? "Busca atualizada." : "Busca concluída.", "ok");
    
    // --- SALVA NO CACHE ---
    salvarCache("gestaoDocumento", documento, { parceiro: resposta.parceiro, movimentacoes: resposta.movimentacoes || [] });

    limparErroNaAba("gestao");
    marcarSessao("gestao", true);
    salvarEstadoGestaoNaSessao();

    const nomeParceiro = primeiroValor(resposta.parceiro, ["nome", "razaoSocial", "nomeFantasia"]);
    salvarNoHistorico("gestaoDocumento", documento, nomeParceiro ? `${nomeParceiro} — ${documento}` : documento);
  } catch {
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
    marcarErroNaAba("gestao");
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

function atualizarBuscaGestao() {
  return buscarHistoricoGestao(true);
}
$("atualizarGestaoBtn").addEventListener("click", atualizarBuscaGestao);

function copiarResultadoGestao() {
  if (!ultimaBuscaGestao) return;

  const { parceiro, movimentacoes, documento } = ultimaBuscaGestao;
  const nome = primeiroValor(parceiro, ["nome", "razaoSocial", "nomeFantasia"]);
  const email = primeiroValor(parceiro, ["email", "emailCadastro", "emailContato"]);

  const linhas = [
    `Documento: ${documento}`,
    `Parceiro: ${nome || "—"} (#${parceiro.id})`,
    `E-mail: ${email || "—"}`,
    ""
  ];

  movimentacoes.forEach((mov) => {
    const codigo = primeiroValor(mov, ["codigo", "code"]);
    const voucher = primeiroValor(mov, ["voucher", "numeroVoucher"]);
    linhas.push(`#${mov.id} — ${[codigo, voucher].filter(Boolean).join(" · ") || "—"}`);
  });

  navigator.clipboard
    .writeText(linhas.join("\n"))
    .then(() => mostrarAviso($("avisoGestao"), "Copiado.", "ok"))
    .catch(() => mostrarAviso($("avisoGestao"), "Não foi possível copiar.", "erro"));
}

marcarCampoDocumento($("documentoGestao"));

$("buscarGestaoBtn").addEventListener("click", () => buscarHistoricoGestao());
$("copiarGestaoBtn").addEventListener("click", copiarResultadoGestao);

$("documentoGestao").addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") buscarHistoricoGestao();
});

/* Manter o resultado do Gestão+ vivo entre aberturas do popup ---------
   O popup e uma pagina que recarrega do zero toda vez que fecha e abre
   de novo (inclusive quando fecha sozinho, por perder o foco pra outra
   aba do navegador) — então até aqui, trocar de aba pra checar outra
   coisa e voltar perdia o pedido/parceiro que estava na tela, sobrando
   só o valor no histórico de busca (que exige buscar de novo).

   chrome.storage.session guarda o ultimo resultado mostrado enquanto o
   navegador ficar aberto, sem tocar disco, e a gente restaura ele
   direto na tela ao abrir o popup — sem gastar uma busca nova.
   ---------------------------------------------------------------------- */

const ESTADO_GESTAO_SESSAO_CHAVE = "ultimoEstadoGestao";

async function salvarEstadoGestaoNaSessao() {
  if (!chrome.storage.session) return; // navegador antigo: segue sem cache

  let estado = null;

  if (!$("detalhePedido").classList.contains("hidden") && ultimoPedidoGestao) {
    estado = { tipo: "pedido", dados: ultimoPedidoGestao };
  } else if (!$("resultadoGestao").classList.contains("hidden") && ultimaBuscaGestao) {
    estado = { tipo: "parceiro", dados: ultimaBuscaGestao };
  } else if (!$("resultadoBuscaPedido").classList.contains("hidden") && ultimaListaBuscaPedido) {
    estado = { tipo: "lista", dados: ultimaListaBuscaPedido };
  }

  if (!estado) return;

  try {
    await chrome.storage.session.set({ [ESTADO_GESTAO_SESSAO_CHAVE]: estado });
  } catch {
    // sem espaco ou storage indisponivel: segue so sem a restauracao
  }
}

async function restaurarEstadoGestaoDaSessao() {
  if (!chrome.storage.session) return;

  try {
    const guardado = await chrome.storage.session.get(ESTADO_GESTAO_SESSAO_CHAVE);
    const estado = guardado[ESTADO_GESTAO_SESSAO_CHAVE];
    if (!estado) return;

    if (estado.tipo === "pedido") {
      const { pedido, itens, historico } = estado.dados;
      renderizarDetalhePedido(pedido, itens, historico);
    } else if (estado.tipo === "parceiro") {
      const { parceiro, movimentacoes, documento } = estado.dados;
      renderizarResultadoGestao(parceiro, movimentacoes, documento);
    } else if (estado.tipo === "lista") {
      renderizarListaBuscaPedido(estado.dados.movimentacoes);
    }
  } catch {
    // sem cache pra restaurar: painel continua vazio, como hoje
  }
}

restaurarEstadoGestaoDaSessao();

registrarHistorico("gestaoDocumento", {
  containerId: "historicoGestaoDocumento",
  campoId: "documentoGestao",
  aoSelecionar: () => buscarHistoricoGestao()
});

/* Wings --------------------------------------------------------------
   Busca dados de faturamento (assinatura/autenticações) e o perfil
   completo do usuário no billing.vaultid.com.br, usando a sessão
   logada do Wings Portal. Mesmo esquema do Gestão+/S.Deal.
   ---------------------------------------------------------------------- */

// o background devolve datas como {date: "aaaa-mm-dd hh:mm:ss.uuuuuu", ...}
function formatarDataWings(campoData) {
  const bruto = campoData?.date;
  if (!bruto) return null;

  const m = bruto.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return bruto;

  const [, ano, mes, dia, hora, minuto] = m;
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

let ultimaBuscaWings = null;

// seções recolhíveis do Wings — o usuário escolhe o que quer abrir
document.querySelectorAll(".wings-secao-cabecalho").forEach((botao) => {
  botao.addEventListener("click", () => {
    const alvo = $(botao.dataset.alvo);
    if (!alvo) return;

    const abrindo = alvo.classList.contains("hidden");
    alvo.classList.toggle("hidden", !abrindo);
    botao.setAttribute("aria-expanded", String(abrindo));
  });
});

function recolherSecoesWings() {
  document.querySelectorAll(".wings-secao-cabecalho").forEach((botao) => {
    botao.setAttribute("aria-expanded", "false");
    $(botao.dataset.alvo)?.classList.add("hidden");
  });
}

// cria as linhas rótulo/valor dentro de um container (reaproveitado nas
// seções Usuário/Validade/Emissão); pula campos vazios/nulos
// "alerta" pinta a linha de vermelho (problema já confirmado, tipo
// "Bloqueado: Sim" ou situação cancelada). "aviso" pinta de amarelo
// (ainda não é problema, mas merece atenção — ex: certificado vencendo
// em poucos dias). Cada campo pode declarar sua própria condição via
// `alerta: true` ou `aviso: true`, calculada por quem chama.
function preencherLinhasChaveValor(container, campos) {
  container.innerHTML = "";

  const visiveis = campos.filter(
    ({ valor }) => valor !== undefined && valor !== null && valor !== ""
  );

  if (!visiveis.length) {
    const vazio = document.createElement("div");
    vazio.className = "gestao-vazio";
    vazio.textContent = "Sem informações disponíveis.";
    container.appendChild(vazio);
    return;
  }

  visiveis.forEach(({ rotulo, valor, alerta, aviso }) => {
    const linha = document.createElement("div");
    linha.className = "sdeal-linha";
    if (alerta) linha.classList.add("alerta");
    else if (aviso) linha.classList.add("alerta-aviso");

    const r = document.createElement("span");
    r.className = "sdeal-rotulo";
    r.textContent = rotulo;

    const v = document.createElement("span");
    v.className = "sdeal-valor";
    v.textContent = valor;

    linha.appendChild(r);
    linha.appendChild(v);
    container.appendChild(linha);
  });
}

// Dias inteiros até uma data de vencimento (aceita string/objeto de data
// do Wings ou do S.Deal, negativo se já venceu, null se não deu pra ler).
// Usado tanto pro aviso amarelo (perto de vencer) quanto, no futuro, pra
// qualquer outro cálculo de prazo que apareça.
const DIAS_AVISO_VENCIMENTO = 15;

function diasParaVencer(data) {
  if (!data) return null;
  const alvo = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(alvo.getTime())) return null;

  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const inicioAlvo = new Date(alvo.getFullYear(), alvo.getMonth(), alvo.getDate());

  return Math.round((inicioAlvo - inicioHoje) / (1000 * 60 * 60 * 24));
}

// true só quando o vencimento está chegando (0 a 15 dias) — já vencido
// não conta aqui, porque isso já vira alerta vermelho por outro caminho
// (situação "expirado"/"cancelado"), não precisa duplicar em amarelo.
function vencimentoProximo(data) {
  const dias = diasParaVencer(data);
  return dias !== null && dias >= 0 && dias <= DIAS_AVISO_VENCIMENTO;
}

function renderizarResultadoWings(userRetail, deepDetail, documento) {
  ultimaBuscaWings = { userRetail, deepDetail, documento };
  recolherSecoesWings();

  $("wingsUsuarioNome").textContent = userRetail.name
    ? `${userRetail.name} (#${userRetail.id})`
    : `Usuário #${userRetail.id}`;

  // linhas do topo (dados de faturamento vindos do user-retail)
  const regras = userRetail.billingLimits?.limitRules || {};
  preencherLinhasChaveValor($("wingsLinhas"), [
    { rotulo: "Documento", valor: userRetail.username },
    { rotulo: "Email", valor: userRetail.email },
    { rotulo: "Telefone", valor: userRetail.phoneNumber },
    { rotulo: "Tipo de usuário", valor: userRetail.userType },
    { rotulo: "Assinatura", valor: regras.signature },
    { rotulo: "Autenticações", valor: regras.login },
    { rotulo: "Vencimento", valor: formatarDataWings(regras.dueDate) }
  ]);

  // seção "Usuário" — bird.user[0]
  const usuario = deepDetail?.user?.[0] || {};
  preencherLinhasChaveValor($("wingsUsuario"), [
    { rotulo: "ID", valor: usuario.id },
    { rotulo: "Usuário (login)", valor: usuario.username },
    { rotulo: "Nome", valor: usuario.name },
    { rotulo: "Email", valor: usuario.email },
    { rotulo: "Telefone", valor: usuario.phoneNumber },
    { rotulo: "Sincronização HSM", valor: formatarDataWings(usuario.dateHsmSync) },
    { rotulo: "Novo usuário", valor: usuario.isNew === undefined ? null : usuario.isNew ? "Sim" : "Não" }
  ]);

  // seção "Validade" — bird.hsmObject[0]
  const hsm = deepDetail?.hsmObject?.[0] || {};
  preencherLinhasChaveValor($("wingsValidade"), [
    { rotulo: "ID", valor: hsm.id },
    { rotulo: "Alias", valor: hsm.alias },
    { rotulo: "Criado em", valor: formatarDataWings(hsm.dateCreate) },
    { rotulo: "Expira em", valor: formatarDataWings(hsm.expireTime), aviso: vencimentoProximo(hsm.expireTime) },
    { rotulo: "Válido", valor: hsm.isValid === undefined ? null : hsm.isValid ? "Sim" : "Não", alerta: hsm.isValid === false }
  ]);

  // seção "Emissão" — bird.emission[] (pode ter mais de uma emissão)
  const emissoes = (deepDetail?.emission || []).filter(
    (item) => item && typeof item === "object" && !Array.isArray(item)
  );
  const containerEmissoes = $("wingsEmissoes");
  containerEmissoes.innerHTML = "";
  $("wingsEmissoesContagem").textContent = emissoes.length ? ` (${emissoes.length})` : "";

  if (!emissoes.length) {
    const vazio = document.createElement("div");
    vazio.className = "gestao-vazio";
    vazio.textContent = "Nenhuma emissão encontrada.";
    containerEmissoes.appendChild(vazio);
  } else {
    emissoes.forEach((emissao) => {
      const certificado = emissao.data?.certificado || {};
      const dadosEmissao = emissao.data?.emissao || {};

      const cartao = document.createElement("div");
      cartao.className = "wings-emissao sdeal-linhas";
      containerEmissoes.appendChild(cartao);

      preencherLinhasChaveValor(cartao, [
        { rotulo: "ID", valor: emissao.id },
        { rotulo: "Status", valor: emissao.status },
        { rotulo: "Início", valor: formatarDataWings(emissao.dateStart) },
        { rotulo: "Fim", valor: formatarDataWings(emissao.dateEnd), aviso: vencimentoProximo(emissao.dateEnd) },
        { rotulo: "Bloqueado", valor: emissao.locked ? "Sim" : "Não", alerta: Boolean(emissao.locked) },
        { rotulo: "Certificado", valor: certificado.nome },
        { rotulo: "Categoria", valor: certificado.categoria },
        { rotulo: "Perfil", valor: certificado.perfiliti },
        { rotulo: "Mídia", valor: certificado.midia },
        { rotulo: "Política", valor: certificado.politica },
        { rotulo: "Validade (meses)", valor: certificado.validade },
        { rotulo: "SKU", valor: certificado.sku },
        { rotulo: "Status da emissão", valor: dadosEmissao.status },
        { rotulo: "Observação", valor: dadosEmissao.obs },
        { rotulo: "Data/hora", valor: emissao.data?.datetime }
      ]);

      // Linha do "Código" (código de solicitação) montada à parte, com
      // botão de abrir no SisAR ao lado — mesmo padrão do S.Deal e do
      // Databricks. preencherLinhasChaveValor não suporta ações por
      // linha, então essa entra depois, na 2ª posição (logo após ID).
      if (emissao.code) {
        const linhaCodigo = document.createElement("div");
        linhaCodigo.className = "sdeal-linha";

        const rotuloCodigo = document.createElement("span");
        rotuloCodigo.className = "sdeal-rotulo";
        rotuloCodigo.textContent = "Código";

        const acoesCodigo = document.createElement("span");
        acoesCodigo.style.display = "flex";
        acoesCodigo.style.alignItems = "center";
        acoesCodigo.style.gap = "8px";

        const valorCodigo = document.createElement("span");
        valorCodigo.className = "sdeal-valor";
        valorCodigo.textContent = emissao.code;

        const btnSisarCodigo = document.createElement("button");
        btnSisarCodigo.type = "button";
        btnSisarCodigo.className = "sisar-btn";
        btnSisarCodigo.textContent = "Abrir no SisAR";
        btnSisarCodigo.addEventListener("click", () =>
          abrirCodigoNoSisAR(emissao.code, btnSisarCodigo, $("avisoWings"))
        );

        acoesCodigo.appendChild(valorCodigo);
        acoesCodigo.appendChild(btnSisarCodigo);
        linhaCodigo.appendChild(rotuloCodigo);
        linhaCodigo.appendChild(acoesCodigo);
        cartao.insertBefore(linhaCodigo, cartao.children[1] || null);
      }
    });
  }

  // seção "Eventos" — bird.event[]
  const eventos = deepDetail?.event || [];
  const listaEventos = $("wingsEventos");
  listaEventos.innerHTML = "";
  $("wingsEventosContagem").textContent = eventos.length ? ` (${eventos.length})` : "";

  if (!eventos.length) {
    const vazio = document.createElement("div");
    vazio.className = "gestao-vazio";
    vazio.textContent = "Nenhum evento recente encontrado.";
    listaEventos.appendChild(vazio);
  } else {
    eventos.forEach((evento) => {
      const linha = document.createElement("div");
      linha.className = "gestao-movimentacao";

      const data = document.createElement("span");
      data.className = "gestao-mov-id";
      data.textContent = formatarDataWings(evento.dateStart) || "—";

      const detalhe = document.createElement("span");
      detalhe.className = "gestao-mov-detalhe";
      detalhe.textContent = evento.comments || `Código ${evento.code}`;

      linha.appendChild(data);
      linha.appendChild(detalhe);
      listaEventos.appendChild(linha);
    });
  }

  $("resultadoWings").classList.remove("hidden");
}

async function buscarWings(forcarAtualizacao = false) {
  const campo = $("documentoWings");
  const botao = $("buscarWingsBtn");
  const aviso = $("avisoWings");
  const documento = campo.value.trim();

  if (!documento) {
    mostrarAviso(aviso, "Digite o CPF ou CNPJ do usuário.", "erro");
    campo.focus();
    return;
  }

  if (documentoInvalidoParaBuscar(documento)) {
    avisarDocumentoInvalido(aviso, documento);
    campo.classList.add("campo-invalido");
    campo.focus();
    return;
  }

  $("resultadoWings").classList.add("hidden");
  $("atualizarWingsBtn").classList.add("hidden");

  // --- TENTA O CACHE ---
  if (!forcarAtualizacao) {
    const emCache = await obterCache("wings", documento);
    if (emCache) {
      renderizarResultadoWings(emCache.userRetail, emCache.deepDetail, documento);
      mostrarAviso(aviso, "Busca carregada do cache (rápida).", "ok");
      $("atualizarWingsBtn").classList.remove("hidden");
      salvarNoHistorico("wings", documento, emCache.userRetail?.name ? `${emCache.userRetail.name} — ${documento}` : documento);
      return;
    }
  }

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Buscando...";
  mostrarAviso(aviso, "Buscando no Wings...", "");

  try {
    const resposta = await chrome.runtime.sendMessage({ tipo: "buscarWings", cpfCnpj: documento });
    if (!resposta || resposta.erro) {
      const ehSessao = erroParecomSessao(resposta?.erro);
      mostrarAviso(aviso, resposta?.erro || "Nenhum resultado.", "erro", ehSessao ? "wings" : null);
      marcarErroNaAba("wings");
      if (ehSessao) marcarSessao("wings", false);
      return;
    }

    renderizarResultadoWings(resposta.userRetail, resposta.deepDetail, documento);
    mostrarAviso(aviso, forcarAtualizacao ? "Busca atualizada." : "Busca concluída.", "ok");
    
    // --- SALVA NO CACHE ---
    salvarCache("wings", documento, { userRetail: resposta.userRetail, deepDetail: resposta.deepDetail });

    limparErroNaAba("wings");
    marcarSessao("wings", true);
    salvarNoHistorico("wings", documento, resposta.userRetail?.name ? `${resposta.userRetail.name} — ${documento}` : documento);
  } catch {
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
    marcarErroNaAba("wings");
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

function atualizarBuscaWings() {
  return buscarWings(true);
}
$("atualizarWingsBtn").addEventListener("click", atualizarBuscaWings);

function copiarResultadoWings() {
  if (!ultimaBuscaWings) return;

  const { userRetail, deepDetail, documento } = ultimaBuscaWings;
  const regras = userRetail.billingLimits?.limitRules || {};
  const usuario = deepDetail?.user?.[0] || {};
  const hsm = deepDetail?.hsmObject?.[0] || {};
  const emissoes = deepDetail?.emission || [];
  const eventos = deepDetail?.event || [];

  const linhas = [
    `Documento: ${documento}`,
    `Nome: ${userRetail.name || "—"} (#${userRetail.id})`,
    `Email: ${userRetail.email || "—"}`,
    `Telefone: ${userRetail.phoneNumber || "—"}`,
    `Assinatura: ${regras.signature ?? "—"}`,
    `Autenticações: ${regras.login ?? "—"}`,
    `Vencimento: ${formatarDataWings(regras.dueDate) || "—"}`,
    "",
    "Usuário:",
    `  ID: ${usuario.id ?? "—"}`,
    `  Login: ${usuario.username || "—"}`,
    `  Nome: ${usuario.name || "—"}`,
    `  Email: ${usuario.email || "—"}`,
    `  Telefone: ${usuario.phoneNumber || "—"}`,
    `  Sincronização HSM: ${formatarDataWings(usuario.dateHsmSync) || "—"}`,
    "",
    "Validade:",
    `  ID: ${hsm.id ?? "—"}`,
    `  Alias: ${hsm.alias || "—"}`,
    `  Criado em: ${formatarDataWings(hsm.dateCreate) || "—"}`,
    `  Expira em: ${formatarDataWings(hsm.expireTime) || "—"}`,
    `  Válido: ${hsm.isValid ? "Sim" : "Não"}`,
    "",
    "Emissão:"
  ];

  if (!emissoes.length) {
    linhas.push("  Nenhuma emissão encontrada.");
  } else {
    emissoes.forEach((emissao, indice) => {
      const certificado = emissao.data?.certificado || {};
      const dadosEmissao = emissao.data?.emissao || {};
      linhas.push(
        `  [${indice + 1}] ${certificado.nome || "—"} — código ${emissao.code || "—"}`,
        `      Início: ${formatarDataWings(emissao.dateStart) || "—"} | Fim: ${formatarDataWings(emissao.dateEnd) || "—"}`,
        `      Status: ${emissao.status ?? "—"} | Status emissão: ${dadosEmissao.status ?? "—"} | Obs: ${dadosEmissao.obs || "—"}`
      );
    });
  }

  linhas.push("", "Eventos:");

  if (!eventos.length) {
    linhas.push("  Nenhum evento encontrado.");
  } else {
    eventos.forEach((evento) => {
      linhas.push(
        `  ${formatarDataWings(evento.dateStart) || "—"} — ${evento.comments || `Código ${evento.code}`}`
      );
    });
  }

  navigator.clipboard
    .writeText(linhas.join("\n"))
    .then(() => mostrarAviso($("avisoWings"), "Copiado.", "ok"))
    .catch(() => mostrarAviso($("avisoWings"), "Não foi possível copiar.", "erro"));
}

marcarCampoDocumento($("documentoWings"));

$("buscarWingsBtn").addEventListener("click", () => buscarWings());
$("copiarWingsBtn").addEventListener("click", copiarResultadoWings);

$("documentoWings").addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") buscarWings();
});

registrarHistorico("wings", {
  containerId: "historicoWings",
  campoId: "documentoWings",
  aoSelecionar: () => buscarWings()
});

/* Captura (OCR) ---------------------------------------------------- */

// endereco da tela de atalhos, conforme o navegador
function urlAtalhos() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "edge://extensions/shortcuts";
  if (/OPR\//.test(ua)) return "opera://settings/keyboardShortcuts";
  return "chrome://extensions/shortcuts";
}

async function carregarAtalho() {
  const valor = $("atalhoValor");

  try {
    const comandos = await chrome.commands.getAll();
    const ocr = comandos.find((c) => c.name === "extrair-texto");

    if (ocr && ocr.shortcut) {
      valor.textContent = ocr.shortcut;
      valor.classList.remove("vazio");
    } else {
      valor.textContent = "Nenhum atalho definido";
      valor.classList.add("vazio");
    }
  } catch {
    valor.textContent = "Não foi possível ler o atalho";
    valor.classList.add("vazio");
  }
}

$("capturarAgoraBtn").addEventListener("click", async () => {
  const aviso = $("avisoOcr");

  try {
    const resposta = await chrome.runtime.sendMessage({ tipo: "iniciarOcr" });

    if (resposta?.erro) {
      mostrarAviso(aviso, resposta.erro, "erro");
      return;
    }
  } catch {
    mostrarAviso(aviso, "Não foi possível iniciar a captura.", "erro");
    return;
  }

  // o popup precisa sair da frente: a selecao acontece na pagina, e o
  // primeiro clique nela seria gasto so para fechar este popup
  window.close();
});

$("trocarAtalhoBtn").addEventListener("click", async () => {
  const endereco = urlAtalhos();
  const aviso = $("avisoOcr");

  try {
    await navigator.clipboard.writeText(endereco);
    mostrarAviso(
      aviso,
      `Endereço copiado: ${endereco} — cole na barra de endereços.`,
      "ok"
    );
  } catch {
    mostrarAviso(aviso, `Acesse ${endereco} na barra de endereços.`, "");
  }
});

/* Lojas Soluti --------------------------------------------- */

let lojasPreparado = false;
let indiceLojas = [];
let lojasFiltradas = [];

async function prepararLojas() {
  const primeiraVez = !lojasPreparado;
  lojasPreparado = true;

  const dados = await obterLojas();
  montarIndiceLojas(dados.lojas);

  if (!primeiraVez) {
    renderizarLojas();
    atualizarCarimboLojas(dados.atualizadoEm);
    return;
  }

  const ufs = [...new Set(indiceLojas.map((r) => r.uf).filter(Boolean))].sort();
  const select = $("filtroUfLoja");
  ufs.forEach((uf) => {
    const opcao = document.createElement("option");
    opcao.value = uf;
    opcao.textContent = uf;
    select.appendChild(opcao);
  });

  $("buscaLoja").addEventListener("input", renderizarLojas);
  $("filtroUfLoja").addEventListener("change", renderizarLojas);
  $("atualizarLojasBtn").addEventListener("click", atualizarLojasManual);

  // com cartoes marcados o botao copia so eles; sem nenhum, copia o resultado
  // inteiro da busca atual
  $("copiarTodasLojas").addEventListener("click", () => {
    const marcadas = [...selecoes.loja.values()];

    copiarTodas(
      marcadas.length ? marcadas : lojasFiltradas.map(textoLoja),
      $("copiarTodasLojas"),
      sincronizarSelecaoLojas
    );
  });

  $("limparSelecaoLojas").addEventListener("click", () => {
    selecoes.loja.clear();
    renderizarLojas();
  });

  renderizarLojas();
  atualizarCarimboLojas(dados.atualizadoEm);
}

async function obterLojas() {
  try {
    const guardado = await chrome.storage.local.get([
      "lojas",
      "lojasAtualizadoEm"
    ]);

    // usa o que o background baixou; se ainda nao baixou, o fallback embutido
    if (Array.isArray(guardado.lojas) && guardado.lojas.length) {
      return {
        lojas: guardado.lojas,
        atualizadoEm: guardado.lojasAtualizadoEm || null
      };
    }
  } catch {}

  return { lojas: window.LOJAS_SOLUTI || [], atualizadoEm: null };
}

function montarIndiceLojas(lista) {
  indiceLojas = (lista || []).map((r, i) => ({
    ...r,
    _id: `loja-${i}`,
    chave: semAcento(`${r.loja} ${r.regiao} ${r.uf} ${r.end} ${r.email}`)
  }));
}

// A raspagem do site da Soluti pode falhar em silencio e deixar a lista
// velha na tela sem ninguem notar. A data fica visivel ao lado do contador,
// com a idade em dias quando ja passou do esperado (a busca e diaria).
function atualizarCarimboLojas(quando) {
  const btn = $("atualizarLojasBtn");
  const carimbo = $("lojasCarimbo");

  if (!quando) {
    btn.title = "Buscar a lista mais recente no site da Soluti";
    carimbo.textContent = "lista embutida";
    return;
  }

  const d = new Date(quando);
  const data = d.toLocaleDateString("pt-BR");
  const hora = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });

  const dias = Math.floor((Date.now() - quando) / 86400000);

  btn.title = `Última atualização: ${data} ${hora}`;
  carimbo.textContent =
    dias >= 3 ? `atualizada em ${data} (${dias} dias)` : `atualizada em ${data}`;
}

async function atualizarLojasManual() {
  const btn = $("atualizarLojasBtn");
  const rotulo = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Atualizando...";

  try {
    const resposta = await chrome.runtime.sendMessage({
      tipo: "atualizarLojas"
    });

    if (!resposta || resposta.erro) {
      btn.textContent = "Falhou";
      btn.title = resposta?.erro || "Não foi possível atualizar.";
      setTimeout(() => (btn.textContent = rotulo), 2000);
    } else {
      const dados = await obterLojas();
      montarIndiceLojas(dados.lojas);
      // a lista mudou: as marcacoes antigas nao correspondem mais aos cartoes
      selecoes.loja.clear();
      renderizarLojas();
      atualizarCarimboLojas(dados.atualizadoEm);
      btn.textContent = "Atualizado";
      setTimeout(() => (btn.textContent = rotulo), 1600);
    }
  } catch (erro) {
    btn.textContent = "Falhou";
    btn.title = erro.message || "Erro ao atualizar.";
    setTimeout(() => (btn.textContent = rotulo), 2000);
  } finally {
    btn.disabled = false;
  }
}

function renderizarLojas() {
  const termo = semAcento($("buscaLoja").value.trim());
  const uf = $("filtroUfLoja").value;
  const lista = $("listaLojas");
  const contador = $("lojasContador");

  const termos = termo.split(/\s+/).filter(Boolean);

  const achados = indiceLojas.filter((r) => {
    if (uf && r.uf !== uf) return false;
    return termos.every((t) => r.chave.includes(t));
  });

  lojasFiltradas = achados;
  sincronizarSelecaoLojas();

  lista.innerHTML = "";

  if (!achados.length) {
    contador.textContent = "Nenhuma loja encontrada.";
    const vazio = document.createElement("li");
    vazio.className = "parceiro-vazio";
    vazio.textContent = "Ajuste a busca ou o filtro de UF.";
    lista.appendChild(vazio);
    return;
  }

  const total = indiceLojas.length;
  contador.textContent =
    achados.length === total
      ? `${total} lojas Soluti`
      : `${achados.length} de ${total} lojas`;

  const fragmento = document.createDocumentFragment();
  achados.forEach((r) => fragmento.appendChild(criarCartaoLoja(r)));
  lista.appendChild(fragmento);
}

/* Cartoes clicaveis (copiar ao clicar) ----------------------------- */

function textoLoja(r) {
  const linhas = [r.loja];
  if (r.regiao) linhas.push(r.regiao + (r.uf ? ` - ${r.uf}` : ""));
  if (r.end) linhas.push(r.end);
  if (r.fechado) linhas.push("Temporariamente fechada");
  if (r.func) linhas.push(`Funcionamento: ${r.func}`);
  if (r.almoco) linhas.push(`Almoço: ${r.almoco}`);
  if (r.email) linhas.push(r.email);
  return linhas.join("\n");
}

function unidadeVisivel(r) {
  return semAcento(r.unidade) === semAcento(r.ar) ? "" : r.unidade;
}

function bairroVisivel(r) {
  return r.bairro && r.bairro !== r.municipio ? r.bairro : "";
}

function linhaLocalNacional(r) {
  const bairro = bairroVisivel(r);
  return bairro ? `${r.municipio} — ${bairro}` : r.municipio;
}

function regiaoVisivel(r) {
  return r.regiao !== r.cidade ? r.regiao : "";
}

function linhaLocalIntl(r) {
  return [r.cidade, regiaoVisivel(r), r.bairro].filter(Boolean).join(" — ");
}

function linhaEnderecoNacional(r) {
  return r.cep ? `${r.endereco} — CEP ${r.cep}` : r.endereco;
}

function linhaEnderecoIntl(r) {
  return r.codigo_postal ? `${r.endereco} — ${r.codigo_postal}` : r.endereco;
}

function textoEtiquetado(pares) {
  return pares
    .filter(([, valor]) => valor)
    .map(([etiqueta, valor]) => `${etiqueta}: ${valor}`)
    .join("\n");
}

function textoParceiroNacional(r) {
  return textoEtiquetado([
    ["AR", r.ar],
    ["Unidade", unidadeVisivel(r)],
    ["Cidade", `${r.municipio} (${r.uf})`],
    ["Bairro", bairroVisivel(r)],
    ["Endereço", r.endereco],
    ["CEP", r.cep],
    ["Telefone", formatarTelefone(r.telefone)],
    ["E-mail", r.email]
  ]);
}

function textoParceiroIntl(r) {
  return textoEtiquetado([
    ["AR", r.ar],
    ["Unidade", unidadeVisivel(r)],
    ["País", r.pais],
    ["Cidade", r.cidade],
    ["Região", regiaoVisivel(r)],
    ["Bairro", r.bairro],
    ["Endereço", r.endereco],
    ["Código postal", r.codigo_postal],
    ["Telefone", r.telefone],
    ["E-mail", r.email]
  ]);
}

/* Selecao de cartoes ------------------------------------------------
   Clicar no cartao marca/desmarca; o botao de copia dentro dele copia
   so aquele. O texto ja formatado vai junto no mapa de selecao, para o
   "Copiar selecionadas" continuar funcionando depois que a busca mudar
   e o cartao sair da tela.
   ------------------------------------------------------------------ */

const selecoes = {
  loja: new Map(),
  nacional: new Map(),
  intl: new Map()
};

const ICONE_COPIAR =
  '<path d="M7.2 2.5h7.3c.9 0 1.6.7 1.6 1.6v7.4h-1.7V4.2H7.2V2.5z"/>' +
  '<path d="M4 5.8h7.5c1 0 1.7.8 1.7 1.7v8.3c0 1-.8 1.7-1.7 1.7H4c-1 0-1.7-.8-1.7-1.7V7.5c0-1 .8-1.7 1.7-1.7zm0 1.7v8.3h7.5V7.5H4z"/>';

function piscarCopiado(item) {
  item.classList.add("copiado");

  const selo = document.createElement("span");
  selo.className = "selo-copiado";
  selo.textContent = "Copiado";
  item.appendChild(selo);

  setTimeout(() => {
    item.classList.remove("copiado");
    selo.remove();
  }, 900);
}

function criarBotaoCopiarCartao(item, texto) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "cartao-copiar";
  botao.title = "Copiar só este";
  botao.setAttribute("aria-label", "Copiar este cartão");
  botao.innerHTML =
    `<svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true">${ICONE_COPIAR}</svg>`;

  botao.addEventListener("click", async (evento) => {
    // o clique no cartao alterna a selecao: aqui a acao e so copiar
    evento.stopPropagation();

    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      return;
    }

    piscarCopiado(item);
  });

  return botao;
}

function sincronizarSelecao(grupo) {
  if (grupo === "loja") sincronizarSelecaoLojas();
  else sincronizarSelecaoParceiros();
}

function tornarSelecionavel(item, grupo, registro, texto) {
  const selecao = selecoes[grupo];

  item.classList.add("copiavel");
  item.title = "Clique para selecionar";

  // o cartao e um controle de verdade, nao so uma area clicavel: entra na
  // ordem de tabulacao e responde a Enter/Espaco como qualquer botao
  item.setAttribute("role", "button");
  item.tabIndex = 0;

  function refletir(marcado) {
    item.classList.toggle("selecionado", marcado);
    item.setAttribute("aria-pressed", marcado ? "true" : "false");
  }

  refletir(selecao.has(registro._id));

  function alternar() {
    const marcado = selecao.has(registro._id);

    if (marcado) selecao.delete(registro._id);
    else selecao.set(registro._id, texto);

    refletir(!marcado);
    sincronizarSelecao(grupo);
  }

  item.addEventListener("click", alternar);

  item.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    // sem isso o Espaco rolaria a lista junto
    evento.preventDefault();
    alternar();
  });
}

// monta o canto direito do cabecalho do cartao: copiar + a etiqueta
// (UF, pais ou situacao da loja)
function montarTopoCartao(topo, item, texto, etiqueta) {
  const acoes = document.createElement("div");
  acoes.className = "parceiro-topo-acoes";

  acoes.appendChild(criarBotaoCopiarCartao(item, texto));
  acoes.appendChild(etiqueta);

  topo.appendChild(acoes);
}

function sincronizarSelecaoLojas() {
  const total = selecoes.loja.size;
  const etiqueta = $("lojasSelecao");
  const botao = $("copiarTodasLojas");

  etiqueta.textContent = total
    ? `${total} selecionada${total === 1 ? "" : "s"}`
    : "";
  etiqueta.classList.toggle("hidden", !total);
  $("limparSelecaoLojas").classList.toggle("hidden", !total);

  botao.textContent = total ? `Copiar selecionadas (${total})` : "Copiar todas";
  botao.disabled = total ? false : !lojasFiltradas.length;
}

function grupoParceiroAtual() {
  return escopoAtual === "internacional" ? "intl" : "nacional";
}

function sincronizarSelecaoParceiros() {
  const total = selecoes[grupoParceiroAtual()].size;
  const etiqueta = $("parceirosSelecao");
  const botao = $("copiarTodasParceiros");

  etiqueta.textContent = total
    ? `${total} selecionada${total === 1 ? "" : "s"}`
    : "";
  etiqueta.classList.toggle("hidden", !total);
  $("limparSelecaoParceiros").classList.toggle("hidden", !total);

  botao.textContent = total ? `Copiar selecionadas (${total})` : "Copiar todas";
  botao.disabled = total ? false : !parceirosFiltrados.length;
}

// acima disso a copia pede confirmacao: sem busca nem selecao, "Copiar
// todas" leva a lista inteira (milhares de parceiros) para a area de
// transferencia num clique so
const LIMITE_COPIA_SEM_AVISO = 50;

// copia varios itens de uma vez, separados por linha em branco.
// restaurar() recalcula o rotulo em vez de devolver o antigo: a selecao
// pode ter mudado durante o aviso de "Copiadas"
async function copiarTodas(textos, botao, restaurar) {
  if (!textos.length) return;

  if (
    textos.length > LIMITE_COPIA_SEM_AVISO &&
    !confirm(`Copiar ${textos.length} registros de uma vez?`)
  ) {
    return;
  }

  const rotulo = botao.textContent;
  const conteudo = textos.join("\n\n");

  try {
    await navigator.clipboard.writeText(conteudo);
    botao.textContent = `Copiadas (${textos.length})`;
  } catch {
    botao.textContent = "Falhou";
  }

  setTimeout(() => {
    if (restaurar) restaurar();
    else botao.textContent = rotulo;
  }, 1600);
}

function criarCartaoLoja(r) {
  const item = document.createElement("li");
  item.className = "parceiro";

  const texto = textoLoja(r);

  const topo = document.createElement("div");
  topo.className = "parceiro-topo";

  const nome = document.createElement("span");
  nome.className = "parceiro-nome";
  nome.textContent = r.loja;

  const status = document.createElement("span");
  status.className = `loja-status ${r.fechado ? "fechada" : "aberta"}`;
  status.textContent = r.fechado ? "Fechada" : r.uf || "Loja";

  topo.appendChild(nome);
  montarTopoCartao(topo, item, texto, status);
  item.appendChild(topo);

  const local = document.createElement("div");
  local.className = "parceiro-local";
  local.textContent = r.regiao;
  item.appendChild(local);

  const end = document.createElement("div");
  end.className = "parceiro-end";
  end.textContent = r.end;
  item.appendChild(end);

  if (r.fechado) {
    const aviso = document.createElement("div");
    aviso.className = "parceiro-end";
    aviso.style.color = "#b42318";
    aviso.style.marginTop = "5px";
    aviso.textContent = "Temporariamente fechada";
    item.appendChild(aviso);
  }

  const horarios = document.createElement("div");
  horarios.className = "loja-horarios";

  if (r.func) {
    const f = document.createElement("span");
    f.innerHTML = "<b>Funcionamento:</b> ";
    f.appendChild(document.createTextNode(r.func));
    horarios.appendChild(f);
  }

  if (r.almoco) {
    const a = document.createElement("span");
    a.innerHTML = "<b>Almoço:</b> ";
    a.appendChild(document.createTextNode(r.almoco));
    horarios.appendChild(a);
  }

  if (horarios.children.length) item.appendChild(horarios);

  if (r.email) {
    const rodape = document.createElement("div");
    rodape.className = "parceiro-rodape loja-email";

    const email = document.createElement("span");
    email.className = "parceiro-tel";
    email.textContent = r.email;
    rodape.appendChild(email);

    item.appendChild(rodape);
  }

  tornarSelecionavel(item, "loja", r, texto);
  return item;
}

/* Parceiros (busca de ARs) ----------------------------------------- */

const MAX_RESULTADOS = 60;

// As duas listas sao .json no mesmo formato ({ meta, registros }) e so sao
// buscadas quando a aba de parceiros e aberta pela primeira vez.
const ARQUIVO_PARCEIROS_NACIONAIS = "../data/parceiros-nacionais.json";
const ARQUIVO_PARCEIROS_INTL = "../data/parceiros-internacionais.json";

let parceirosPromessa = null;
let parceirosCarregando = false;
let controlesParceirosLigados = false;
let indiceNacional = [];
let indiceIntl = [];
// tres posicoes: "lojas" | "nacional" | "internacional". As duas ultimas
// compartilham a lista de parceiros; a primeira tem lista propria.
let escopoAtual = "lojas";
let parceirosFiltrados = [];
let formatadorParceiroAtual = null;

function semAcento(texto) {
  return (texto || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function prepararParceiros() {
  if (!parceirosPromessa) {
    parceirosPromessa = montarParceiros().catch((erro) => {
      // deixa a proxima visita a aba tentar de novo
      parceirosPromessa = null;
      throw erro;
    });
  }

  return parceirosPromessa;
}

async function montarParceiros() {
  ligarControlesParceiros();

  parceirosCarregando = true;
  renderizarParceiros();

  let nacional = [];
  let intl = [];

  try {
    [nacional, intl] = await Promise.all([
      buscarRegistros(ARQUIVO_PARCEIROS_NACIONAIS),
      buscarRegistros(ARQUIVO_PARCEIROS_INTL)
    ]);
  } finally {
    parceirosCarregando = false;
  }

  // pre-normaliza uma vez: a busca depois e so um includes no campo "chave"
  indiceNacional = nacional.map((r, i) => ({
    ...r,
    _id: `nac-${i}`,
    chave: chaveBusca([
      r.ar, r.unidade, r.uf, r.municipio, r.bairro,
      r.endereco, r.cep, r.telefone, r.email
    ])
  }));

  indiceIntl = intl.map((r, i) => ({
    ...r,
    _id: `intl-${i}`,
    chave: chaveBusca([
      r.ar, r.unidade, r.pais, r.cidade, r.regiao,
      r.bairro, r.endereco, r.codigo_postal, r.telefone, r.email
    ])
  }));

  const ufs = [...new Set(nacional.map((r) => r.uf))].sort();
  const select = $("filtroUf");
  ufs.forEach((uf) => {
    const opcao = document.createElement("option");
    opcao.value = uf;
    opcao.textContent = uf;
    select.appendChild(opcao);
  });

  renderizarParceiros();
}

// ligados antes do fetch: quem abre a aba ja pode digitar e trocar de escopo
// enquanto a lista carrega
function ligarControlesParceiros() {
  if (controlesParceirosLigados) return;
  controlesParceirosLigados = true;

  $("buscaParceiro").addEventListener("input", renderizarParceiros);
  $("filtroUf").addEventListener("change", renderizarParceiros);

  $("copiarTodasParceiros").addEventListener("click", () => {
    const marcados = [...selecoes[grupoParceiroAtual()].values()];

    copiarTodas(
      marcados.length
        ? marcados
        : parceirosFiltrados.map((r) => formatadorParceiroAtual(r)),
      $("copiarTodasParceiros"),
      sincronizarSelecaoParceiros
    );
  });

  // limpa so o escopo aberto: nacional e internacional tem selecoes proprias
  $("limparSelecaoParceiros").addEventListener("click", () => {
    selecoes[grupoParceiroAtual()].clear();
    renderizarParceiros();
  });
}

/* Os tres botoes de escopo sao ligados aqui, no nivel do modulo, e NAO
   junto com o resto dos controles de parceiros. Ficando la, eles so
   ganhavam ouvinte depois que a lista de parceiros carregasse — e ela so
   carrega quando o escopo ja saiu de "lojas", que e o escopo inicial.
   Resultado: os botoes de nacional/internacional nao respondiam ao clique,
   e nao havia como sair de "lojas". */
$("escopoLojas").addEventListener("click", () => trocarEscopo("lojas"));
$("escopoNacional").addEventListener("click", () => trocarEscopo("nacional"));
$("escopoInternacional").addEventListener("click", () =>
  trocarEscopo("internacional")
);

function trocarEscopo(escopo) {
  if (escopo === escopoAtual) return;
  escopoAtual = escopo;

  const ehLojas = escopo === "lojas";
  const nacional = escopo === "nacional";

  $("escopoLojas").classList.toggle("ativo", ehLojas);
  $("escopoNacional").classList.toggle("ativo", nacional);
  $("escopoInternacional").classList.toggle("ativo", escopo === "internacional");

  $("bloco-lojas").classList.toggle("hidden", !ehLojas);
  $("bloco-parceiros").classList.toggle("hidden", ehLojas);

  if (ehLojas) {
    prepararLojas();
    $("buscaLoja").focus();
    return;
  }

  // UF so faz sentido no nacional
  $("filtroUf").style.display = nacional ? "" : "none";
  if (!nacional) $("filtroUf").value = "";

  $("buscaParceiro").placeholder = nacional
    ? "Buscar AR, município, bairro, telefone..."
    : "Buscar AR, país, responsável...";

  $("buscaParceiro").value = "";
  $("buscaParceiro").focus();

  prepararEscopoAtual();
  renderizarParceiros();
}

function formatarTelefone(tel) {
  const d = (tel || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel || "";
}

function renderizarParceiros() {
  if (escopoAtual === "nacional") {
    renderizarListaParceiros(indiceNacional, criarCartaoNacional, $("filtroUf").value);
  } else {
    renderizarListaParceiros(indiceIntl, criarCartaoIntl, "");
  }
}

function renderizarListaParceiros(indice, criarCartao, uf) {
  const termo = semAcento($("buscaParceiro").value.trim());
  const lista = $("listaParceiros");
  const contador = $("parceirosContador");

  const termos = termo.split(/\s+/).filter(Boolean);

  const achados = indice.filter((r) => {
    if (uf && r.uf !== uf) return false;
    return termos.every((t) => r.chave.includes(t));
  });

  // guarda para o "Copiar todas" (todos os filtrados, nao so os exibidos)
  parceirosFiltrados = achados;
  formatadorParceiroAtual =
    escopoAtual === "nacional" ? textoParceiroNacional : textoParceiroIntl;
  sincronizarSelecaoParceiros();

  const total = achados.length;
  const mostrados = achados.slice(0, MAX_RESULTADOS);

  lista.innerHTML = "";

  if (!total) {
    const vazio = document.createElement("li");
    vazio.className = "parceiro-vazio";

    if (parceirosCarregando) {
      contador.textContent = "Carregando parceiros...";
      vazio.textContent = "Um instante.";
    } else {
      contador.textContent = "Nenhuma AR encontrada.";
      vazio.textContent = "Ajuste a busca ou o filtro.";
    }

    lista.appendChild(vazio);
    return;
  }

  contador.textContent =
    total > MAX_RESULTADOS
      ? `${total} ARs — mostrando as ${MAX_RESULTADOS} primeiras`
      : `${total} ${total === 1 ? "AR encontrada" : "ARs encontradas"}`;

  const fragmento = document.createDocumentFragment();
  mostrados.forEach((r) => fragmento.appendChild(criarCartao(r)));

  if (total > MAX_RESULTADOS) {
    const mais = document.createElement("li");
    mais.className = "parceiro-mais";
    mais.textContent = "Refine a busca para ver as demais.";
    fragmento.appendChild(mais);
  }

  lista.appendChild(fragmento);
}

function criarCartaoNacional(r) {
  const item = document.createElement("li");
  item.className = "parceiro";

  const texto = textoParceiroNacional(r);

  const topo = document.createElement("div");
  topo.className = "parceiro-topo";

  const nome = document.createElement("span");
  nome.className = "parceiro-nome";
  nome.textContent = r.ar;

  const uf = document.createElement("span");
  uf.className = "parceiro-uf";
  uf.textContent = r.uf;

  topo.appendChild(nome);
  montarTopoCartao(topo, item, texto, uf);
  item.appendChild(topo);

  adicionarUnidade(item, r);
  adicionarLocalEndereco(item, linhaLocalNacional(r), linhaEnderecoNacional(r));
  adicionarRodape(item, formatarTelefone(r.telefone), r.email);

  tornarSelecionavel(item, "nacional", r, texto);
  return item;
}

function criarCartaoIntl(r) {
  const item = document.createElement("li");
  item.className = "parceiro";

  const texto = textoParceiroIntl(r);

  const topo = document.createElement("div");
  topo.className = "parceiro-topo";

  const nome = document.createElement("span");
  nome.className = "parceiro-nome";
  nome.textContent = r.ar;

  const pais = document.createElement("span");
  pais.className = "parceiro-pais";
  pais.textContent = r.pais;

  topo.appendChild(nome);
  montarTopoCartao(topo, item, texto, pais);
  item.appendChild(topo);

  adicionarUnidade(item, r);
  adicionarLocalEndereco(item, linhaLocalIntl(r), linhaEnderecoIntl(r));
  adicionarRodape(item, r.telefone, r.email);

  tornarSelecionavel(item, "intl", r, texto);
  return item;
}

async function buscarRegistros(arquivo) {
  const resposta = await fetch(arquivo);
  if (!resposta.ok) throw new Error(`${arquivo} respondeu ${resposta.status}`);

  const conteudo = await resposta.json();
  return conteudo.registros;
}

function chaveBusca(campos) {
  const digitos = campos
    .filter((campo) => campo && /\d/.test(campo))
    .map((campo) => campo.replace(/\D/g, ""));

  return semAcento([...campos, ...digitos].filter(Boolean).join(" "));
}

function adicionarUnidade(item, r) {
  const unidade = unidadeVisivel(r);
  if (!unidade) return;

  const linha = document.createElement("div");
  linha.className = "parceiro-unidade";
  linha.textContent = unidade;
  item.appendChild(linha);
}

function adicionarLocalEndereco(item, local, endereco) {
  const linhaLocal = document.createElement("div");
  linhaLocal.className = "parceiro-local";
  linhaLocal.textContent = local;
  item.appendChild(linhaLocal);

  const linhaEndereco = document.createElement("div");
  linhaEndereco.className = "parceiro-end";
  linhaEndereco.textContent = endereco;
  item.appendChild(linhaEndereco);
}

function adicionarRodape(item, telefone, email) {
  const rodape = document.createElement("div");
  rodape.className = "parceiro-rodape";

  const tel = document.createElement("span");
  tel.className = "parceiro-tel";
  tel.textContent = telefone || "Sem telefone";
  rodape.appendChild(tel);

  item.appendChild(rodape);

  if (!email) return;

  const faixaEmail = document.createElement("div");
  faixaEmail.className = "parceiro-rodape cartao-email";

  const endereco = document.createElement("span");
  endereco.className = "parceiro-tel";
  endereco.textContent = email;
  faixaEmail.appendChild(endereco);

  item.appendChild(faixaEmail);
}


/* Busca vinda do menu de contexto ----------------------------------
   O background guarda o pedido no storage de sessao antes de abrir o
   popup (openPopup nao aceita parametros). Quando ele nao consegue abrir
   o popup, a mesma pagina vira uma janelinha e o pedido chega pela URL.
   ------------------------------------------------------------------ */

async function lerBuscaPendente() {
  // o pedido guardado e sempre descartado: se ficar para tras, reaparece
  // na proxima vez que o popup for aberto na mao
  let guardado = null;

  try {
    const dados = await chrome.storage.session.get("buscaPendente");
    guardado = dados.buscaPendente || null;
    await chrome.storage.session.remove("buscaPendente");
  } catch {}

  const parametros = new URLSearchParams(location.search);

  if (parametros.get("aba")) {
    return {
      aba: parametros.get("aba"),
      escopo: parametros.get("escopo") || "",
      termo: parametros.get("q") || ""
    };
  }

  // pedido velho: o popup foi aberto por conta propria bem depois
  if (guardado && Date.now() - guardado.quando < 60000) return guardado;

  return null;
}

async function aplicarBuscaPendente() {
  const pedido = await lerBuscaPendente();
  if (!pedido?.termo) return;

  // lojas e parceiros agora moram na mesma aba: o pedido escolhe o escopo.
  // O escopo vem antes da aba para nao carregar a lista errada no caminho.
  if (pedido.aba === "lojas") {
    // preenche antes: prepararLojas() renderiza lendo o campo
    $("buscaLoja").value = pedido.termo;
    trocarEscopo("lojas");
    trocarAba("atender");
    $("buscaLoja").select();
    return;
  }

  if (pedido.aba !== "parceiros") return;

  trocarEscopo(
    pedido.escopo === "internacional" ? "internacional" : "nacional"
  );
  trocarAba("atender");

  // o termo so pode ser aplicado depois que a lista existir
  try {
    await prepararParceiros();
  } catch {
    return;
  }

  // depois do trocarEscopo, que limpa o campo
  $("buscaParceiro").value = pedido.termo;
  $("buscaParceiro").select();
  renderizarParceiros();
}

/* ==================================================================
   Gerenciador de Cache Rápido (Últimas 5 Buscas)
   ================================================================== */
const CACHE_MAX_SIZE = 5;

async function obterCache(escopo, termo) {
  if (!chrome.storage.session) return null;
  try {
    const guardado = await chrome.storage.session.get("cacheBuscasRapidas");
    const cache = guardado.cacheBuscasRapidas || {};
    const lista = cache[escopo] || [];
    
    const index = lista.findIndex(i => i.termo === termo);
    if (index !== -1) {
      const item = lista[index];
      // Se já está no cache e não for o primeiro (index 0), puxa pro topo da fila
      if (index > 0) {
        lista.splice(index, 1);
        lista.unshift(item);
        cache[escopo] = lista;
        await chrome.storage.session.set({ cacheBuscasRapidas: cache });
      }
      return item.dados;
    }
  } catch (e) {}
  return null;
}

async function salvarCache(escopo, termo, dados) {
  if (!chrome.storage.session) return;
  try {
    const guardado = await chrome.storage.session.get("cacheBuscasRapidas");
    const cache = guardado.cacheBuscasRapidas || {};
    let lista = cache[escopo] || [];
    
    // Remove se já existe para recolocar no topo sem duplicar
    lista = lista.filter(i => i.termo !== termo);
    lista.unshift({ termo, dados });
    
    // Corta o array para manter apenas os 3 mais recentes
    if (lista.length > CACHE_MAX_SIZE) {
      lista = lista.slice(0, CACHE_MAX_SIZE);
    }
    
    cache[escopo] = lista;
    await chrome.storage.session.set({ cacheBuscasRapidas: cache });
  } catch (e) {}
}

// Acima disso, os cartões já ficam bem colapsados por padrão — clientes
// com muitas solicitações estavam poluindo o painel inteiro sem dar pra
// rolar nem separar o que interessa.
const DATABRICKS_LIMITE_AUTO_COLAPSO = 4;

let ultimaListaDatabricks = [];
const databricksAbertos = new Set(); // guarda os códigos expandidos manualmente
let ordenacaoDatabricks = "solicitacao_desc";

function textoBuscavelDatabricks(item) {
  return [
    item.COD_SOLICITACAO,
    item.SITUACAO_DA_SOLICITACAO,
    item.TITULAR,
    item.PRODUTO,
    item.AR_EMISSOR
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function ordenarListaDatabricks(lista, ordenacao) {
  const copia = [...lista];
  copia.sort((a, b) => {
    const msA = a.DATA_SOLICITACAO_ms ?? 0;
    const msB = b.DATA_SOLICITACAO_ms ?? 0;
    return ordenacao === "solicitacao_asc" ? msA - msB : msB - msA;
  });
  return copia;
}

function renderizarResultadoDatabricks(lista, documento) {
  // Mais recente primeiro é o padrão (a solicitação mais nova costuma ser
  // a que interessa no atendimento), mas o atendente pode inverter.
  ultimaListaDatabricks = ordenarListaDatabricks(lista || [], ordenacaoDatabricks);
  databricksAbertos.clear();

  const filtro = $("filtroDatabricks");
  const ordenar = $("ordenarDatabricks");
  filtro.value = "";
  ordenar.value = ordenacaoDatabricks;
  const temMaisDeUm = ultimaListaDatabricks.length > 1;
  filtro.classList.toggle("hidden", !temMaisDeUm);
  ordenar.classList.toggle("hidden", !temMaisDeUm);

  desenharCardsDatabricks("");
}

function desenharCardsDatabricks(termoFiltro) {
  const container = $("resultadoDatabricks");
  const resumo = $("databricksResumo");
  const resumoTexto = $("databricksResumoTexto");
  container.innerHTML = "";

  if (!ultimaListaDatabricks.length) {
    const vazio = document.createElement("div");
    vazio.className = "gestao-vazio";
    vazio.textContent = "Nenhuma solicitação encontrada no Databricks para este documento.";
    container.appendChild(vazio);
    container.classList.remove("hidden");
    resumo.classList.add("hidden");
    return;
  }

  const termo = (termoFiltro || "").trim().toLowerCase();
  const listaFiltrada = termo
    ? ultimaListaDatabricks.filter((item) => textoBuscavelDatabricks(item).includes(termo))
    : ultimaListaDatabricks;

  resumo.classList.remove("hidden");
  resumoTexto.textContent = termo
    ? `${listaFiltrada.length} de ${ultimaListaDatabricks.length} solicitações`
    : `${ultimaListaDatabricks.length} solicitações encontradas`;

  if (!listaFiltrada.length) {
    const vazio = document.createElement("div");
    vazio.className = "gestao-vazio";
    vazio.textContent = "Nenhuma solicitação bate com esse filtro.";
    container.appendChild(vazio);
    container.classList.remove("hidden");
    return;
  }

  // Colapsa automaticamente quando tem muita coisa na lista; menos que
  // isso, mostra tudo aberto (não precisa de clique extra pra ver 2 ou 3).
  const colapsarPorPadrao = ultimaListaDatabricks.length > DATABRICKS_LIMITE_AUTO_COLAPSO;

  listaFiltrada.forEach((item) => {
    const codigo = item.COD_SOLICITACAO;
    const aberto = databricksAbertos.has(codigo) || (!colapsarPorPadrao && !databricksAbertos.has(`fechado:${codigo}`));

    const card = document.createElement("div");
    card.className = "databricks-card" + (aberto ? " aberto" : "");

    // Cabeçalho — sempre visível, clique expande/recolhe
    const cabecalho = document.createElement("div");
    cabecalho.className = "databricks-card-cabecalho";

    const seta = document.createElement("span");
    seta.className = "databricks-card-seta";
    seta.textContent = "▶";

    const titulo = document.createElement("div");
    titulo.className = "databricks-card-titulo";

    const situacao = document.createElement("span");
    situacao.className = "databricks-card-situacao";
    if (/revogad|cancelad|expirad/i.test(item.SITUACAO_DA_SOLICITACAO)) {
      situacao.classList.add("alerta");
    }
    situacao.textContent = `${codigo || "—"} - ${item.SITUACAO_DA_SOLICITACAO || "Situação não informada"}`;

    const titular = document.createElement("span");
    titular.className = "databricks-card-titular";
    titular.textContent = [item.TITULAR, item.PRODUTO].filter(Boolean).join(" · ");

    titulo.appendChild(situacao);
    titulo.appendChild(titular);

    // Data de solicitação visível já no cabeçalho — antes só aparecia
    // depois de abrir o card.
    const dataCabecalho = document.createElement("span");
    dataCabecalho.className = "databricks-card-data";
    dataCabecalho.textContent = item.DATA_SOLICITACAO || "";

    const acoes = document.createElement("div");
    acoes.className = "databricks-card-acoes";

    const btnCopiar = document.createElement("button");
    btnCopiar.type = "button";
    btnCopiar.className = "link-btn";
    btnCopiar.textContent = "Copiar";
    btnCopiar.addEventListener("click", (evento) => {
      evento.stopPropagation();
      const texto = `Cod: ${codigo} | Situação: ${item.SITUACAO_DA_SOLICITACAO}\nTitular: ${item.TITULAR}\nProduto: ${item.PRODUTO}\nAprovação: ${item.DATA_APROVACAO || "N/A"}\nEmissão: ${item.DATA_EMISSAO || "N/A"}`;
      navigator.clipboard.writeText(texto).then(() => {
        btnCopiar.textContent = "Copiado";
        setTimeout(() => (btnCopiar.textContent = "Copiar"), 1500);
      });
    });

    acoes.appendChild(btnCopiar);

    if (codigo) {
      const btnSisar = document.createElement("button");
      btnSisar.type = "button";
      btnSisar.className = "sisar-btn";
      btnSisar.textContent = "Abrir no SisAR";
      btnSisar.addEventListener("click", (evento) => {
        evento.stopPropagation();
        abrirCodigoNoSisAR(codigo, btnSisar, $("avisoDatabricks"));
      });
      acoes.appendChild(btnSisar);
    }

    cabecalho.appendChild(seta);
    cabecalho.appendChild(titulo);
    if (item.DATA_SOLICITACAO) cabecalho.appendChild(dataCabecalho);
    cabecalho.appendChild(acoes);
    cabecalho.addEventListener("click", () => {
      const agoraAberto = card.classList.toggle("aberto");
      if (agoraAberto) {
        databricksAbertos.add(codigo);
        databricksAbertos.delete(`fechado:${codigo}`);
      } else {
        databricksAbertos.delete(codigo);
        databricksAbertos.add(`fechado:${codigo}`);
      }
    });

    card.appendChild(cabecalho);

    // Corpo — só some do DOM visualmente (display:none via CSS), mantendo
    // o card montado pra não perder o estado ao rolar a lista.
    const corpo = document.createElement("div");
    corpo.className = "databricks-card-corpo";

    const linhas = document.createElement("div");
    linhas.className = "databricks-linhas";

    const campos = [
      { rotulo: "Titular", valor: item.TITULAR },
      { rotulo: "Produto", valor: item.PRODUTO },
      { rotulo: "AR Emissora", valor: item.AR_EMISSOR },
      { rotulo: "Data de Solic.", valor: item.DATA_SOLICITACAO },
      { rotulo: "Data de Aprovação", valor: item.DATA_APROVACAO },
      { rotulo: "Data de Emissão", valor: item.DATA_EMISSAO },
      { rotulo: "Vencimento", valor: item.DATA_VENCIMENTO }
    ];

    campos.forEach((campo) => {
      if (!campo.valor) return;
      const linha = document.createElement("div");
      linha.className = "databricks-linha";
      const r = document.createElement("span");
      r.className = "sdeal-rotulo";
      r.textContent = campo.rotulo;
      const v = document.createElement("span");
      v.className = "sdeal-valor";
      v.textContent = campo.valor;
      linha.appendChild(r);
      linha.appendChild(v);
      linhas.appendChild(linha);
    });

    corpo.appendChild(linhas);
    card.appendChild(corpo);
    container.appendChild(card);
  });

  container.classList.remove("hidden");
}

$("filtroDatabricks").addEventListener("input", (evento) => {
  desenharCardsDatabricks(evento.target.value);
});

$("ordenarDatabricks").addEventListener("change", (evento) => {
  ordenacaoDatabricks = evento.target.value;
  ultimaListaDatabricks = ordenarListaDatabricks(ultimaListaDatabricks, ordenacaoDatabricks);
  desenharCardsDatabricks($("filtroDatabricks").value);
});

async function buscarDatabricks(forcarAtualizacao = false) {
  const campo = $("documentoDatabricks");
  const botao = $("buscarDatabricksBtn");
  const aviso = $("avisoDatabricks");
  const documento = campo.value.replace(/\D/g, ''); // Limpa pontuação

  if (!documento) {
    mostrarAviso(aviso, "Digite o CPF ou CNPJ.", "erro");
    campo.focus();
    return;
  }

  if (documentoInvalidoParaBuscar(documento)) {
    avisarDocumentoInvalido(aviso, documento);
    campo.classList.add("campo-invalido");
    campo.focus();
    return;
  }

  $("resultadoDatabricks").classList.add("hidden");
  $("atualizarDatabricksBtn").classList.add("hidden");
  
  // Tenta o cache (reaproveitando sua estrutura de cache rápido)
  if (!forcarAtualizacao) {
    const emCache = await obterCache("databricks", documento);
    if (emCache) {
      renderizarResultadoDatabricks(emCache.lista, documento);
      mostrarAviso(aviso, "Busca carregada do cache.", "ok");
      $("atualizarDatabricksBtn").classList.remove("hidden");
      salvarNoHistorico("databricks", documento);
      return;
    }
  }

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Buscando...";
  mostrarAviso(aviso, "Conectando ao Databricks...", "");

  try {
    const resposta = await chrome.runtime.sendMessage({ tipo: "buscarDatabricks", cpfCnpj: documento });
    if (!resposta || resposta.erro) {
      mostrarAviso(aviso, resposta?.erro || "Nenhum resultado.", "erro");
      marcarErroNaAba("databricks");
      return;
    }

    renderizarResultadoDatabricks(resposta.dados, documento);
    mostrarAviso(aviso, forcarAtualizacao ? "Busca atualizada." : "Busca concluída.", "ok");
    
    salvarCache("databricks", documento, { lista: resposta.dados });
    limparErroNaAba("databricks");
    salvarNoHistorico("databricks", documento);
  } catch {
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
    marcarErroNaAba("databricks");
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

marcarCampoDocumento($("documentoDatabricks"));

$("buscarDatabricksBtn").addEventListener("click", () => buscarDatabricks());
$("documentoDatabricks").addEventListener("keydown", (e) => {
  if (e.key === "Enter") buscarDatabricks();
});
$("atualizarDatabricksBtn").addEventListener("click", () => buscarDatabricks(true));

registrarHistorico("databricks", {
  containerId: "historicoDatabricks",
  campoId: "documentoDatabricks",
  aoSelecionar: () => buscarDatabricks()
});

/* Busca unificada -------------------------------------------------------
   Digita o CPF/CNPJ uma vez só e dispara Gestão+, Wings e Databricks em
   paralelo. O S.Deal fica de fora porque busca por número de voucher, não
   por CPF/CNPJ — não tem como entrar nessa busca unificada.

   Em vez de duplicar a lógica de cada busca (cache, sessão, histórico,
   renderização), essa função só preenche o campo de cada aba e chama a
   própria função de busca daquela aba — assim qualquer mudança futura em
   uma delas (novo campo, novo tratamento de erro) vale automaticamente
   pra busca unificada também, sem precisar lembrar de atualizar em dois
   lugares.
   ------------------------------------------------------------------- */

const PLATAFORMAS_BUSCA_UNIFICADA = [
  { nome: "Gestão+", aba: "gestao", campoId: "documentoGestao", avisoId: "avisoGestao", executar: () => buscarHistoricoGestao() },
  { nome: "Wings", aba: "wings", campoId: "documentoWings", avisoId: "avisoWings", executar: () => buscarWings() },
  { nome: "Databricks", aba: "databricks", campoId: "documentoDatabricks", avisoId: "avisoDatabricks", executar: () => buscarDatabricks() }
];

async function buscarUnificado() {
  const campo = $("documentoUnificado");
  const aviso = $("avisoUnificado");
  const resumo = $("resumoUnificado");
  const botao = $("buscarUnificadoBtn");
  const documento = campo.value.trim();

  if (!documento) {
    mostrarAviso(aviso, "Digite o CPF ou CNPJ.", "erro");
    campo.focus();
    return;
  }

  if (documentoInvalidoParaBuscar(documento)) {
    avisarDocumentoInvalido(aviso, documento);
    campo.classList.add("campo-invalido");
    campo.focus();
    return;
  }

  campo.classList.remove("campo-invalido");
  resumo.classList.add("hidden");
  resumo.innerHTML = "";

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Buscando...";
  mostrarAviso(aviso, "Buscando no Gestão+, Wings e Databricks...", "");

  // preenche o campo de cada aba com o mesmo documento, pra reaproveitar
  // a função de busca de cada uma tal como ela já funciona sozinha
  PLATAFORMAS_BUSCA_UNIFICADA.forEach((p) => { $(p.campoId).value = documento; });

  const resultados = await Promise.allSettled(
    PLATAFORMAS_BUSCA_UNIFICADA.map((p) => p.executar())
  );

  resumo.innerHTML = "";
  PLATAFORMAS_BUSCA_UNIFICADA.forEach((p, indice) => {
    const falhouNaChamada = resultados[indice].status === "rejected";
    const avisoDaAba = $(p.avisoId);
    const deuErro = falhouNaChamada || avisoDaAba.classList.contains("erro");
    const textoAvisoDaAba = avisoDaAba.querySelector(".ferramenta-aviso-texto")?.textContent;
    // "erro de sessão" (não logado) é diferente de "não achou nada" —
    // só o primeiro caso ganha um atalho de login, senão o botão viraria
    // ruído em toda busca sem resultado.
    const urlLogin = deuErro && erroParecomSessao(textoAvisoDaAba) && URL_PLATAFORMA[p.aba];

    // div em vez de button porque tem um botão de login dentro — button
    // dentro de button é HTML inválido e quebra o clique dos dois.
    const linha = document.createElement("div");
    linha.className = "unificado-linha" + (deuErro ? " erro" : " ok");

    const info = document.createElement("button");
    info.type = "button";
    info.className = "unificado-linha-info";
    info.title = "Ver detalhes na aba " + p.nome;
    info.addEventListener("click", () => trocarAba(p.aba));

    const nome = document.createElement("span");
    nome.className = "unificado-nome";
    nome.textContent = p.nome;

    const status = document.createElement("span");
    status.className = "unificado-status";
    status.textContent = deuErro ? (textoAvisoDaAba || "Nenhum resultado.") : "Encontrado";

    info.appendChild(nome);
    info.appendChild(status);
    linha.appendChild(info);

    if (urlLogin) {
      const botaoLogin = document.createElement("button");
      botaoLogin.type = "button";
      botaoLogin.className = "unificado-linha-login";
      botaoLogin.textContent = "Fazer login";
      botaoLogin.title = "Abrir " + p.nome + " em uma nova aba para fazer login";
      botaoLogin.addEventListener("click", (evento) => {
        evento.stopPropagation();
        chrome.tabs.create({ url: urlLogin });
      });
      linha.appendChild(botaoLogin);
    }

    resumo.appendChild(linha);
  });

  resumo.classList.remove("hidden");

  const algumEncontrado = PLATAFORMAS_BUSCA_UNIFICADA.some(
    (p) => !$(p.avisoId).classList.contains("erro")
  );
  mostrarAviso(
    aviso,
    algumEncontrado
      ? "Busca concluída — clique numa plataforma abaixo pra ver o detalhe."
      : "Nenhuma das três encontrou resultado.",
    algumEncontrado ? "ok" : "erro"
  );

  botao.disabled = false;
  botao.textContent = rotulo;
}

marcarCampoDocumento($("documentoUnificado"));
$("buscarUnificadoBtn").addEventListener("click", buscarUnificado);
$("documentoUnificado").addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") buscarUnificado();
});

carregarMacros();
aplicarBuscaPendente();
