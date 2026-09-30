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

      // Escala da interface pelo tamanho da JANELA (outerWidth/outerHeight
      // nao mudam com o zoom, entao nao ha laco). A referencia e o layout
      // desenhado para ~1000x700; a ampliacao e suavizada (55% do que a
      // tela "pediria") e limitada a 1.4x, para nao virar letreiro.
      const escalar = () => {
        const base = Math.min(window.outerWidth / 1000, window.outerHeight / 700);
        const escala = Math.max(1, Math.min(1.4, 1 + (base - 1) * 0.55));
        document.documentElement.style.setProperty(
          "--escala-janela",
          (Math.round(escala * 20) / 20).toString()
        );
      };
      escalar();
      window.addEventListener("resize", escalar);
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
