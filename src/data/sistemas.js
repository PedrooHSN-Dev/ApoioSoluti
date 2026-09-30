// Os sistemas do atendimento, num lugar só.
//
// Esta tabela responde a três perguntas que antes estavam espalhadas:
// onde cada sistema mora (era `GESTAO` no gestao-plus.js, `WINGS` no
// wings.js, `SDEAL_BASE` no sdeal.js), como saber se há sessão ativa nele
// (era `DOMINIOS_SESSAO` no sistemas-sessao.js) e o que abrir no começo do
// dia (não existia).
//
// Carregada pelo popup e pelo background, por isso `const` solto em vez de
// `window.X`: no service worker não existe `window`.
//
// CAMPOS
//   id         chave curta; é o que o resto do código usa
//   nome       como aparece na tela
//   origem     o site, sem caminho — usado para achar a aba já aberta
//   origens    opcional: outros endereços pelos quais o MESMO sistema
//              atende. Sem isso, a aba já aberta num deles não é
//              encontrada e a rotina abre uma segunda.
//   urlInicial o que abrir; para quem usa token, a tela que o grava
//   cookie     domínio do cookie de sessão, ou uma lista deles
//              (null = não dá para checar)
//   chave      onde o token fica no storage.session (null = não usa token)
//   entra      como a extensão entra: "cookie", "token" ou "sso"
//   naRotina   entra na abertura do dia por padrão
//
// SOBRE `entra`: é o que diz se um dia dá para preencher login sozinho.
// "sso" (Entra ID) não tem formulário de usuário/senha para preencher —
// redireciona e, em geral, pede MFA. Só "cookie" e "token" são candidatos,
// e é em `precisaDeLogin()`, no abertura-dia.js, que o cofre de senhas
// entraria, se um dia entrar.

const SISTEMAS = [
  {
    id: "outlook",
    nome: "Outlook Web",
    origem: "https://outlook.office.com",
    urlInicial: "https://outlook.office.com/mail/",

    // O Microsoft 365 serve a MESMA caixa por vários endereços, e qual
    // deles fica na barra depende do tenant e de por onde você entrou
    // (office.com redireciona para office365.com com frequência). Com um
    // só na lista, a rotina não achava a aba aberta e abria outra.
    // Se a sua ficar num endereço que não está aqui, acrescente-o.
    origens: [
      "https://outlook.office.com",
      "https://outlook.office365.com",
      "https://outlook.live.com",
      "https://outlook.com"
    ],
    cookie: ["outlook.office.com", "outlook.office365.com", "outlook.live.com"],
    chave: null,
    entra: "sso",
    naRotina: true
  },
  {
    id: "databricks",
    nome: "Databricks",
    origem: "https://data-app-609763180630129.9.azure.databricksapps.com",
    urlInicial: "https://data-app-609763180630129.9.azure.databricksapps.com/",
    cookie: "databricksapps.com",
    chave: null,
    entra: "sso",
    naRotina: true
  },
  {
    id: "wings",
    nome: "Wings Portal",
    origem: "https://wingsportal.com.br",
    urlInicial: "https://wingsportal.com.br/#/users-retail",
    cookie: "wingsportal.com.br",
    chave: "token_wings",
    entra: "token",
    naRotina: true
  },
  {
    id: "gestao",
    nome: "GO",
    origem: "https://solutivd.gestao.plus",
    urlInicial: "https://solutivd.gestao.plus/ui/manager",
    cookie: "solutivd.gestao.plus",
    chave: "token_gestao",
    entra: "token",
    naRotina: true
  },
  {
    id: "sdeal",
    nome: "S.Deal",
    origem: "https://sdeal.soluti.com.br",
    urlInicial: "https://sdeal.soluti.com.br/GVS",
    cookie: "sdeal.soluti.com.br",
    chave: null,
    entra: "cookie",
    naRotina: true
  },
  {
    id: "ar",
    nome: "AR Soluti",
    // A AR de verdade tem um subdomínio por unidade, e quem descobre qual é
    // a API busca-urls, a partir do código da solicitação (ar-solicitacao.js).
    // Para a abertura do dia vale o portal; troque aqui se a sua rotina
    // começa em outro endereço.
    origem: "https://arsoluti.acsoluti.com.br",
    urlInicial: "https://arsoluti.acsoluti.com.br/",
    cookie: "acsoluti.com.br",
    chave: null,
    entra: "cookie",
    naRotina: true
  }
];

function sistemaPorId(id) {
  return SISTEMAS.find((sistema) => sistema.id === id) || null;
}
