// Aba Começar o dia: põe os sistemas do atendimento no ar de uma vez, e é
// onde a lista do que abre é montada.
//
// A lista mistura os sistemas de src/dados/sistemas.js com os endereços que
// você acrescentar. Os dois podem sair; a diferença é que o sistema da
// tabela volta com "Restaurar", e o endereço seu, não. Quem guarda e junta
// as duas origens é o src/comum/rotina-dia.js; quem abre é o background.

// como a extensão entra em cada sistema, em uma palavra. Vale para saber o
// que esperar: "SSO" é a Microsoft/Azure pedindo login (e possivelmente
// MFA), e não tem como a extensão adiantar isso.
const ROTULO_ENTRADA = {
  cookie: "Login no site",
  token: "Login no site",
  sso: "SSO",
  livre: "Só abre"
};

// três tracinhos: o sinal universal de "isto se arrasta"
const ICONE_PEGADA =
  '<path d="M4 6.4h12M4 10h12M4 13.6h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>';

let itensDaRotina = [];

/* Lista -------------------------------------------------------------- */

// O que está na tela. Os sistemas removidos continuam em itensDaRotina (é o
// que impede a lista de trazê-los de volta), mas não se desenham nem contam.
function itensVisiveis() {
  return itensDaRotina.filter((item) => !ehItemRemovido(item));
}

// Põe itensDaRotina na ordem dos ids recebidos. Os ids vêm da tela, então
// os removidos não estão entre eles: vão para o fim, em vez de sumirem.
function aplicarOrdem(ids) {
  const porId = new Map(itensDaRotina.map((item) => [item.id, item]));
  const naTela = new Set(ids);

  itensDaRotina = [
    ...ids.map((id) => porId.get(id)).filter(Boolean),
    ...itensDaRotina.filter((item) => !naTela.has(item.id))
  ];
}

// Reordena a lista guardada para bater com a ordem em que os cartões
// ficaram na tela. Não redesenha: o DOM já está na ordem certa, e
// redesenhar aqui faria o cartão recém-solto piscar.
function reordenarRotina(ids) {
  aplicarOrdem(ids);
  salvarRotina(itensDaRotina);
}

// Alt+setas move o cartão em foco. O arrasto é o caminho normal, mas ele
// não existe para quem navega por teclado — e aí a ordem ficaria travada.
function moverPorTeclado(id, passo) {
  const visiveis = itensVisiveis();
  const de = visiveis.findIndex((item) => item.id === id);
  const para = de + passo;
  if (de < 0 || para < 0 || para >= visiveis.length) return;

  const [item] = visiveis.splice(de, 1);
  visiveis.splice(para, 0, item);

  aplicarOrdem(visiveis.map((visivel) => visivel.id));
  salvarRotina(itensDaRotina);
  desenharRotina();
  $(`diaCartao-${id}`)?.focus();
}

function removerItem(id) {
  const item = itensDaRotina.find((guardado) => guardado.id === id);
  const nome = sistemaDoItem(item)?.nome || "O endereço";

  itensDaRotina = removerDaRotina(itensDaRotina, id);
  salvarRotina(itensDaRotina);
  desenharRotina();

  mostrarAviso(
    $("avisoDia"),
    ehItemExtra(item)
      ? `"${nome}" saiu da lista.`
      : `"${nome}" saiu da lista — "Restaurar" traz de volta.`,
    "ok"
  );
}

function restaurarPadroes() {
  itensDaRotina = restaurarPadroesDaRotina(itensDaRotina);
  salvarRotina(itensDaRotina);
  desenharRotina();
  mostrarAviso($("avisoDia"), "Os sistemas da extensão voltaram para a lista.", "ok");
}

function criarLinhaDaRotina(item) {
  const sistema = sistemaDoItem(item);
  if (!sistema) return null;

  const linha = document.createElement("div");
  linha.className = "dia-sistema";
  linha.id = `diaCartao-${item.id}`;

  // o próprio cartão é a pegada: arrastar de qualquer ponto dele funciona,
  // e o traço à esquerda só avisa que dá
  linha.draggable = true;
  linha.dataset.ordem = item.id;
  linha.tabIndex = 0;
  linha.title = "Arraste para mudar a ordem (ou Alt + setas)";

  linha.addEventListener("keydown", (evento) => {
    if (!evento.altKey) return;
    if (evento.key !== "ArrowUp" && evento.key !== "ArrowDown") return;

    evento.preventDefault();
    moverPorTeclado(item.id, evento.key === "ArrowUp" ? -1 : 1);
  });

  const ordem = document.createElement("span");
  ordem.className = "dia-pegada";
  ordem.setAttribute("aria-hidden", "true");
  ordem.innerHTML =
    `<svg viewBox="0 0 20 20" width="13" height="13" fill="none">${ICONE_PEGADA}</svg>`;

  const caixa = document.createElement("input");
  caixa.type = "checkbox";
  caixa.checked = item.ligado;
  caixa.id = `diaLigado-${item.id}`;
  caixa.addEventListener("change", () => {
    item.ligado = caixa.checked;
    salvarRotina(itensDaRotina);
    atualizarContagemDoDia();
  });

  const texto = document.createElement("label");
  texto.className = "dia-sistema-texto";
  texto.htmlFor = caixa.id;

  const nome = document.createElement("span");
  nome.className = "dia-sistema-nome";
  nome.textContent = sistema.nome;

  const origem = document.createElement("span");
  origem.className = "dia-sistema-origem";
  origem.textContent = sistema.urlInicial.replace(/^https?:\/\//, "");
  origem.title = sistema.urlInicial;

  texto.appendChild(nome);
  texto.appendChild(origem);

  // o ponto de sessão começa neutro ("ainda não sei") e é pintado pela
  // checagem de cookie, que chega depois
  const sessao = document.createElement("span");
  sessao.className = "dia-sessao";
  sessao.id = `diaSessao-${item.id}`;
  sessao.textContent = ROTULO_ENTRADA[sistema.entra] || "";
  sessao.title = "Sessão ainda não verificada";

  linha.appendChild(ordem);
  linha.appendChild(caixa);
  linha.appendChild(texto);
  linha.appendChild(sessao);

  // O sistema da tabela também sai. Tirá-lo daqui não mexe nas abas de
  // consulta — elas leem src/dados/sistemas.js direto, não esta lista —,
  // então o estrago possível é só ele não abrir de manhã, e "Restaurar"
  // desfaz. Por isso a diferença fica no texto do botão, não na existência
  // dele: o que você acrescentou some de vez.
  linha.appendChild(
    criarBotaoIcone(
      "remover",
      ehItemExtra(item) ? "Remover da lista" : "Tirar da lista (dá para restaurar)",
      ICONE_LIXEIRA,
      () => removerItem(item.id)
    )
  );

  return linha;
}

function desenharRotina() {
  const lista = $("diaSistemas");
  lista.innerHTML = "";

  itensVisiveis().forEach((item) => {
    const linha = criarLinhaDaRotina(item);
    if (linha) lista.appendChild(linha);
  });

  // sem nada removido o botão não tem o que fazer, e some
  $("restaurarPadroesBtn").classList.toggle(
    "hidden",
    !itensDaRotina.some(ehItemRemovido)
  );

  atualizarContagemDoDia();
  pintarSessoesDoDia();
}

function atualizarContagemDoDia() {
  const total = itensVisiveis().filter((item) => item.ligado).length;

  $("diaContador").textContent =
    total === 1 ? "1 endereço na rotina" : `${total} endereços na rotina`;
  $("comecarDiaBtn").disabled = total === 0;
}

async function pintarSessoesDoDia(forcar = false) {
  let sessoes = {};

  try {
    sessoes = (await chrome.runtime.sendMessage({ tipo: "verificarSessoes", forcar })) || {};
  } catch {
    return; // service worker reiniciando: os rótulos ficam como estão
  }

  itensVisiveis().forEach((item) => {
    const alvo = $(`diaSessao-${item.id}`);
    const sistema = sistemaDoItem(item);
    if (!alvo || !sistema) return;

    // sem cookie declarado a extensão não tem como saber: fica neutro, em
    // vez de mentir um "sem sessão"
    if (!(item.id in sessoes)) {
      alvo.classList.remove("sessao-ok");
      alvo.title =
        sistema.entra === "livre"
          ? "Endereço acrescentado por você: a extensão só abre"
          : "Sessão não verificada (abra o sistema para o login aparecer aqui)";
      return;
    }

    const ativa = sessoes[item.id];
    alvo.classList.toggle("sessao-ok", ativa);
    alvo.textContent = ativa ? "Sessão ativa" : ROTULO_ENTRADA[sistema.entra] || "Sem sessão";
    alvo.title = ativa ? "Sessão ativa" : "Vai precisar de login";
  });
}

async function montarPainelDoDia() {
  itensDaRotina = await lerRotina();
  desenharRotina();
}

tornarReordenavel($("diaSistemas"), {
  eixo: "y",
  aoReordenar: reordenarRotina
});

/* Acrescentar endereço ----------------------------------------------- */

function fecharFormularioDia() {
  $("formularioDia").classList.add("hidden");
  $("diaNovoNome").value = "";
  $("diaNovaUrl").value = "";
}

function adicionarEndereco() {
  const aviso = $("avisoDia");
  const item = novoItemExtra($("diaNovoNome").value, $("diaNovaUrl").value);

  if (!item) {
    mostrarAviso(aviso, "Endereço inválido. Use um endereço http ou https.", "erro");
    $("diaNovaUrl").focus();
    return;
  }

  itensDaRotina.push(item);
  salvarRotina(itensDaRotina);
  fecharFormularioDia();
  desenharRotina();
  mostrarAviso(aviso, `"${item.nome}" entrou na rotina.`, "ok");
}

$("novoEnderecoBtn").addEventListener("click", () => {
  $("formularioDia").classList.remove("hidden");
  $("diaNovoNome").focus();
});

$("restaurarPadroesBtn").addEventListener("click", restaurarPadroes);
$("cancelarEnderecoBtn").addEventListener("click", fecharFormularioDia);
$("salvarEnderecoBtn").addEventListener("click", adicionarEndereco);

$("diaNovaUrl").addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") adicionarEndereco();
});

/* Abertura ------------------------------------------------------------ */

// o atalho pode ter sido trocado ou apagado na tela do navegador: a dica
// mostra o que está valendo agora, não o sugerido
async function carregarAtalhoDoDia() {
  const alvo = $("atalhoDia");

  try {
    const comandos = await chrome.commands.getAll();
    const atalho = comandos.find((c) => c.name === "comecar-o-dia");

    if (atalho?.shortcut) {
      alvo.textContent = atalho.shortcut;
      alvo.className = "atalho-inline";
      return;
    }
  } catch {}

  alvo.textContent = "o atalho (não definido)";
}

function resumoDaAbertura(resposta) {
  const partes = [];

  if (resposta.abertas) {
    partes.push(resposta.abertas === 1 ? "1 aba aberta" : `${resposta.abertas} abas abertas`);
  }

  if (resposta.reaproveitadas) {
    const n = resposta.reaproveitadas;
    partes.push(n === 1 ? "1 já estava aberta" : `${n} já estavam abertas`);
  }

  if (!partes.length) partes.push("Nada a abrir");

  let texto = `${partes.join(", ")}.`;

  if (resposta.semSessao?.length) {
    texto += ` Falta login em: ${resposta.semSessao.join(", ")}.`;
  }

  if (resposta.falharam?.length) {
    texto += ` Não consegui abrir: ${resposta.falharam.join(", ")}.`;
  }

  return texto;
}

async function comecarODia() {
  const botao = $("comecarDiaBtn");
  const aviso = $("avisoDia");

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Abrindo...";
  mostrarAviso(aviso, "Abrindo os sistemas...", "");

  try {
    const resposta = await chrome.runtime.sendMessage({ tipo: "abrirODia" });

    if (!resposta || resposta.erro) {
      mostrarAviso(aviso, resposta?.erro || "Não foi possível abrir.", "erro");
      return;
    }

    // "erro" não é a palavra certa para "falta login": não houve falha, há
    // uma pendência sua. Por isso o aviso só fica vermelho quando algo
    // realmente não abriu.
    mostrarAviso(
      aviso,
      resumoDaAbertura(resposta),
      resposta.falharam?.length ? "erro" : "ok"
    );

    pintarSessoesDoDia(true);
  } catch {
    mostrarAviso(aviso, "Não foi possível falar com a extensão.", "erro");
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

$("comecarDiaBtn").addEventListener("click", comecarODia);
