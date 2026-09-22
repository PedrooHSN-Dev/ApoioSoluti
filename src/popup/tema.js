// Apoio Soluti v4 — ferramentas de atendimento do Suporte B2C.
//
// Desenvolvido por Vitor Azevedo (v1 e v2).
// Reescrito e mantido por Vinícius Zoccoli e Pedro H. S. Nascimento (v3 em diante).

// Aplica o tema escolhido antes da primeira pintura.
//
// Roda no <head>, sem defer, de proposito: se esperasse o popup.js no fim do
// body, a pagina ja teria pintado no tema do sistema e o usuario veria um
// piscar a cada abertura. Por isso a escolha mora no localStorage (sincrono)
// e nao no chrome.storage (assincrono).
//
// Sem escolha salva, nada e marcado e o CSS segue o prefers-color-scheme.

(() => {
  try {
    const tema = localStorage.getItem("tema");

    if (tema === "claro" || tema === "escuro") {
      document.documentElement.dataset.tema = tema;
    }
  } catch {
    // armazenamento bloqueado: segue o tema do sistema
  }

  // Mesma logica, outro motivo: o popup da barra de ferramentas tem
  // tamanho fixo (o Chrome que manda), mas a janela separada e uma janela
  // de verdade que o usuario redimensiona/maximiza — e o CSS so deixa o
  // conteudo esticar quando ve essa marca. Vem do "?janela=1" que o
  // background.js gruda na URL ao abrir essa janela (abrirApoioSolutiEmJanela).
  try {
    if (new URLSearchParams(location.search).get("janela") === "1") {
      document.documentElement.classList.add("modo-janela");
    }
  } catch {
    // sem URL valida pra ler: segue com o tamanho fixo, sem travar nada
  }
  // Mesma lógica do tema, mesmo motivo: aplicar antes da primeira pintura
  // evita o flash de "recolhida por um instante, depois expande". A
  // classe é reaplicada em popup.js só pra ligar o clique do botão —
  // aqui é só a pintura inicial.
  try {
    if (localStorage.getItem("barraExpandida") === "1") {
      document.documentElement.classList.add("barra-expandida");
    }
  } catch {
    // localStorage bloqueado: a barra abre recolhida, sem travar nada
  }
})();
