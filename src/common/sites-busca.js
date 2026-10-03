// Apoio Soluti v5 — ferramentas de atendimento do Suporte B2C.
//
// Desenvolvido por Vitor Azevedo (v1 e v2).
// Reescrito e mantido por Vinícius Zoccoli e Pedro H. S. Nascimento (v3 em diante).

// Os destinos do menu do botão direito, numa tabela só.
//
// Antes eram três coisas separadas dentro do background.js: dois itens
// soltos no topo do menu ("Abrir solicitação na AR", "Abrir site da AR") e o
// objeto DESTINOS_BUSCA, com as lojas. Juntar aqui é o que deixa montarMenus()
// ser um laço em vez de uma sequência de chamadas escritas à mão.
//
// Carregada pelo background por importScripts, por isso `const` solto em vez
// de `window.X`: no service worker não existe `window`. Mesma razão de
// src/data/sistemas.js.
//
// CAMPOS
//   id     chave curta; é o id do item no menu de contexto
//   emoji  o que aparece antes do nome (o `icons` do contextMenus.create é
//          do Firefox — o Chrome ignora, e os itens saíam sem ícone nenhum)
//   nome   como aparece no menu
//   acao   "solicitacao" abre a solicitação na AR pelo código selecionado
//          "ar"          abre o site da AR da unidade
//          "popup"       abre o popup na aba `aba` e já dispara a busca
//   aba    para acao "popup": qual aba do popup abrir

const SITES_BUSCA = [
  { id: "busca-solicitacao", emoji: "📄", nome: "Solicitação", acao: "solicitacao" },
  { id: "busca-ar",          emoji: "🏢", nome: "Site AR",     acao: "ar" },
  { id: "busca-databricks",  emoji: "🧱", nome: "Databricks",  acao: "popup", aba: "databricks" },
  { id: "busca-wings",       emoji: "✈️", nome: "Wings",       acao: "popup", aba: "wings" },
  { id: "busca-gestao",      emoji: "📊", nome: "GO",          acao: "popup", aba: "gestao" },
  { id: "busca-sdeal",       emoji: "🎟️", nome: "Sdeal",       acao: "popup", aba: "sdeal" },
  { id: "busca-unificada",   emoji: "⚡", nome: "Unificada",   acao: "popup", aba: "unificada" }
];

// O submenu "Lojas" abre a aba Lojas do popup no escopo certo — é a mesma
// aba para os três, mudando só a lista que ela mostra.
//
// Nada de bandeira em emoji: o Segoe UI Emoji do Windows não desenha
// bandeiras, e 🇧🇷 sairia como as letras "BR" no meio do menu.
const LOJAS_BUSCA = [
  { id: "lojas-soluti",   emoji: "🟢", nome: "Soluti",                  aba: "lojas",     escopo: "" },
  { id: "lojas-nacional", emoji: "🤝", nome: "Parceiros Nacionais",     aba: "parceiros", escopo: "nacional" },
  { id: "lojas-intl",     emoji: "🌍", nome: "Parceiros Internacionais", aba: "parceiros", escopo: "internacional" }
];
