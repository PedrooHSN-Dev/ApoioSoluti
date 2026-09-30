// A rotina da abertura do dia: o que abre, em que ordem.
//
// Guardada no storage.local, porque é escolha de quem usa e tem de
// sobreviver ao fechamento do navegador. Lida pelo popup (que a edita) e
// pelo background (que a executa) — por isso funções soltas em vez de
// `window.ApoioX`, como fazem os outros arquivos desta pasta: no service
// worker não existe `window`.
//
// A LISTA É UMA SÓ, misturando duas origens:
//
//   - os sistemas de src/dados/sistemas.js, que o resto da extensão também
//     usa para buscar (Gestão+, Wings...) e que por isso NÃO podem ser
//     apagados aqui, só desmarcados;
//   - os endereços que o atendente acrescenta, que são dele e sai quando
//     quiser.
//
// A ordem é a ordem do array. Item novo na tabela entra no fim, ligado ou
// não conforme o `naRotina` dele — assim acrescentar um sistema no código
// não apaga a ordem que o atendente já montou.

const ROTINA_CHAVE = "rotinaDoDia";

function gerarIdExtra() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `extra-${crypto.randomUUID()}`;
  }

  return `extra-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ehItemExtra(item) {
  return Boolean(item?.url);
}

// Sem esquema o navegador trataria "soluti.com.br" como caminho relativo.
// E só http/https: `javascript:` numa aba é execução de código, não é
// abrir um site.
function normalizarUrl(bruto) {
  const texto = (bruto || "").trim();
  if (!texto) return null;

  const comEsquema = /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;

  try {
    const url = new URL(comEsquema);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function novoItemExtra(nome, urlBruta) {
  const url = normalizarUrl(urlBruta);
  if (!url) return null;

  return {
    id: gerarIdExtra(),
    ligado: true,
    nome: (nome || "").trim() || new URL(url).hostname,
    url
  };
}

// Transforma um item da rotina no mesmo formato dos sistemas da tabela,
// para o resto do código não precisar saber de onde ele veio. O endereço
// acrescentado à mão não tem cookie nem token: a extensão abre e pronto,
// não tem como saber se há sessão.
function sistemaDoItem(item) {
  if (!ehItemExtra(item)) return sistemaPorId(item.id);

  return {
    id: item.id,
    nome: item.nome,
    origem: new URL(item.url).origin,
    urlInicial: item.url,
    cookie: null,
    chave: null,
    entra: "livre",
    naRotina: true,

    // A diferença que importa entre um sistema da tabela e um endereço
    // seu: o sistema é UM SITE (dá no mesmo em que tela dele você está,
    // porque o que interessa é a sessão), e o endereço é UMA PÁGINA. Num
    // site como o Notion, onde todas as páginas dividem a mesma origem,
    // casar por site faria a segunda página nunca abrir — a aba da
    // primeira já responderia por ela.
    mesmaAba: "url"
  };
}

// Junta o que está salvo com a tabela de hoje: some quem saiu da tabela,
// entra no fim quem é novo, e a ordem salva vale para o resto.
function juntarComATabela(salvos) {
  const itens = (Array.isArray(salvos) ? salvos : [])
    .filter((item) => ehItemExtra(item) || sistemaPorId(item.id))
    .map((item) => ({ ...item, ligado: item.ligado !== false }));

  const presentes = new Set(itens.map((item) => item.id));

  SISTEMAS.forEach((sistema) => {
    if (presentes.has(sistema.id)) return;
    itens.push({ id: sistema.id, ligado: Boolean(sistema.naRotina) });
  });

  return itens;
}

// ONDE MORA: sync primeiro, local sempre — a mesma divisão dos macros e
// dos modelos de e-mail. O sync leva a lista para as outras máquinas em que
// você estiver logado no navegador; o local é a cópia que não depende de
// rede, de cota, nem de estar logado, e é dela que se lê quando o sync não
// responde.
//
// Não precisa ser partida em pedaços como os macros: a lista inteira tem
// algumas centenas de bytes, bem abaixo do limite de 8KB por item do sync.

// uma recusa do sync (cota, sync desligado, sem conta) desliga as
// tentativas: insistir a cada edição só esbarraria no limite de gravações
// por minuto do próprio sync
let syncDaRotinaIndisponivel = false;

async function lerRotina() {
  if (!syncDaRotinaIndisponivel) {
    try {
      const doSync = await chrome.storage.sync.get(ROTINA_CHAVE);
      if (Array.isArray(doSync[ROTINA_CHAVE])) {
        return juntarComATabela(doSync[ROTINA_CHAVE]);
      }
    } catch {
      // sync indisponível: o local logo abaixo tem tudo
    }
  }

  try {
    const guardado = await chrome.storage.local.get(ROTINA_CHAVE);
    return juntarComATabela(guardado[ROTINA_CHAVE]);
  } catch {
    // sem storage nenhum: vale a tabela como ela está no código
    return juntarComATabela(null);
  }
}

async function salvarRotina(itens) {
  // o local primeiro, sempre: é a cópia que não depende de nada
  try {
    await chrome.storage.local.set({ [ROTINA_CHAVE]: itens });
  } catch {
    // sem espaço: a edição vale só até o popup fechar
    return false;
  }

  if (syncDaRotinaIndisponivel) return true;

  try {
    await chrome.storage.sync.set({ [ROTINA_CHAVE]: itens });
  } catch (erro) {
    syncDaRotinaIndisponivel = true;
    console.warn("Apoio Soluti: rotina do dia sem sincronização:", erro.message);

    // o local já tem tudo. Apagar a chave do sync evita o pior caso: uma
    // versão antiga de lá sobrescrevendo a boa na próxima leitura.
    try {
      await chrome.storage.sync.remove(ROTINA_CHAVE);
    } catch {}
  }

  return true;
}
