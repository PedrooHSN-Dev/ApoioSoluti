// Abertura do dia: põe no ar, de uma vez, os sistemas do atendimento.
//
// Três regras que decidem quase tudo aqui:
//
//   1. NÃO DUPLICA. Se a aba do sistema já está aberta, ela é reaproveitada.
//      Sem isso, o segundo disparo do dia devolve doze abas.
//   2. NÃO FAZ LOGIN. A extensão abre e diz quem está sem sessão; quem
//      digita é você (com o preenchimento do navegador). Ver `precisaDeLogin`.
//   3. NÃO TENTA DE NOVO. Nada aqui repete sozinho. Login automático que
//      insiste bloqueia conta corporativa.

const GRUPO_ABERTURA = "Atendimento";

// O que entra, na ordem em que o atendente deixou. Quem monta a lista e
// resolve o formato é o src/comum/rotina-dia.js; aqui só se executa.
async function sistemasDaRotina() {
  const itens = await lerRotina();

  return itens
    .filter((item) => item.ligado)
    .map(sistemaDoItem)
    .filter(Boolean);
}

// Mesma página, ignorando ?query e #âncora: sites de documento carimbam a
// URL depois de carregada (o Notion põe ?pvs=4), e comparar a URL inteira
// abriria uma segunda aba da página que já está ali.
function mesmaPagina(urlAberta, urlPedida) {
  try {
    const aberta = new URL(urlAberta);
    const pedida = new URL(urlPedida);
    return aberta.origin === pedida.origin && aberta.pathname === pedida.pathname;
  } catch {
    return false;
  }
}

// Uma aba por sistema: a que já existe, ou uma nova. Devolve também se ela
// foi criada agora, que é o que a tela mostra no fim ("3 abertas, 2 já
// estavam").
//
// O que conta como "já existe" depende do que a coisa é. Sistema da tabela
// é um site: qualquer aba dele serve, porque o que se quer é a sessão
// logada. Endereço acrescentado por você é uma página: só a própria serve —
// senão, duas páginas do mesmo site (dois documentos do Notion, por
// exemplo) brigariam pela mesma aba e a segunda nunca abriria.
async function abaDoSistema(sistema) {
  // todos os endereços por onde este sistema pode estar aberto
  const padroes = (sistema.origens || [sistema.origem]).map((origem) => `${origem}/*`);
  const achadas = await Promise.all(
    padroes.map((url) => chrome.tabs.query({ url }).catch(() => []))
  );
  const abertas = achadas.flat();

  const jaAberta =
    sistema.mesmaAba === "url"
      ? abertas.find((aba) => mesmaPagina(aba.url, sistema.urlInicial))
      : abertas[0];

  if (jaAberta) {
    return { aba: jaAberta, criada: false };
  }

  const aba = await chrome.tabs.create({ url: sistema.urlInicial, active: false });
  return { aba, criada: true };
}

// Reaproveita o grupo "Atendimento" se ele já existir nesta janela: senão,
// cada disparo criaria um grupo novo com o mesmo nome ao lado do anterior.
async function agrupar(tabIds, windowId) {
  if (!chrome.tabGroups || !tabIds.length) return;

  try {
    const existentes = await chrome.tabGroups.query({ title: GRUPO_ABERTURA, windowId });
    const groupId = await chrome.tabs.group(
      existentes.length
        ? { tabIds, groupId: existentes[0].id }
        : { tabIds, createProperties: { windowId } }
    );

    await chrome.tabGroups.update(groupId, {
      title: GRUPO_ABERTURA,
      color: "green",
      collapsed: false
    });
  } catch (erro) {
    // agrupar é conforto, não a tarefa: as abas já estão abertas
    console.warn("Apoio Soluti: não consegui agrupar as abas:", erro.message);
  }
}

// O ponto único onde "precisa de login" é decidido — e onde um cofre de
// senhas entraria, se um dia entrar: hoje isto só responde a pergunta; com
// o cofre, os sistemas "cookie"/"token" ganhariam aqui um passo de
// preenchimento, e os "sso" continuariam como estão, porque não têm
// formulário para preencher.
function precisaDeLogin(sistema, sessoes) {
  if (!sistema.cookie && !sistema.chave) return false;
  // ausente = nao deu para verificar: nao acusa falta de login sem saber
  return sessoes[sistema.id] === false;
}

async function abrirODia() {
  const escolhidos = await sistemasDaRotina();

  if (!escolhidos.length) {
    return { erro: "Nenhum sistema marcado para a abertura do dia." };
  }

  const sessoes = await verificarSessoes(true);
  const abertos = [];

  for (const sistema of escolhidos) {
    try {
      const { aba, criada } = await abaDoSistema(sistema);
      abertos.push({
        sistema,
        abaId: aba.id,
        windowId: aba.windowId,
        criada,
        semSessao: precisaDeLogin(sistema, sessoes)
      });
    } catch (erro) {
      console.error(`Apoio Soluti: não consegui abrir ${sistema.nome}:`, erro);
      abertos.push({ sistema, falhou: true });
    }
  }

  const noAr = abertos.filter((item) => !item.falhou);

  if (noAr.length) {
    await agrupar(noAr.map((item) => item.abaId), noAr[0].windowId);

    // Foca a primeira que precisa de você. Se todas já têm sessão, a
    // primeira da lista basta — o dia começa com algo na tela.
    const alvo = noAr.find((item) => item.semSessao) || noAr[0];
    await chrome.tabs.update(alvo.abaId, { active: true }).catch(() => {});
    await chrome.windows.update(alvo.windowId, { focused: true }).catch(() => {});
  }

  return {
    ok: true,
    abertas: noAr.filter((item) => item.criada).length,
    reaproveitadas: noAr.filter((item) => !item.criada).length,
    semSessao: noAr.filter((item) => item.semSessao).map((item) => item.sistema.nome),
    falharam: abertos.filter((item) => item.falhou).map((item) => item.sistema.nome)
  };
}

chrome.commands.onCommand.addListener((comando) => {
  if (comando !== "comecar-o-dia") return;
  abrirODia().catch((erro) => console.error("Apoio Soluti: abertura do dia:", erro));
});

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "abrirODia") {
    abrirODia()
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }
});
