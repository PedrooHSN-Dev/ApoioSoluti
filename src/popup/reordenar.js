/* Arrastar para reordenar -------------------------------------------
   Serve as duas listas que se reordenam: os cartoes da aba Comecar (na
   vertical) e as proprias abas da extensao (na horizontal).

   Usa o arrasto nativo do HTML (draggable + dragstart/dragover/dragend)
   em vez de mousedown/mousemove: o navegador cuida da imagem arrastada,
   do cancelamento com Esc e de nao brigar com o clique dos controles que
   existem DENTRO do item (a caixa de marcar, o botao de remover).

   Quem chama marca cada item com data-ordem=<id>; ao soltar, recebe a
   lista de ids na ordem nova. A reordenacao do DOM acontece durante o
   arrasto, para o item ser visto no lugar antes de ser solto.
   ------------------------------------------------------------------ */

function tornarReordenavel(container, { eixo = "y", aoReordenar }) {
  let arrastado = null;
  let mexeu = false;

  function itemDe(alvo) {
    return alvo?.closest?.("[data-ordem]") || null;
  }

  container.addEventListener("dragstart", (evento) => {
    const item = itemDe(evento.target);
    if (!item) return;

    arrastado = item;
    mexeu = false;
    item.classList.add("arrastando");
    evento.dataTransfer.effectAllowed = "move";

    // sem escrever nada aqui, alguns navegadores nem comecam o arrasto
    evento.dataTransfer.setData("text/plain", item.dataset.ordem);
  });

  container.addEventListener("dragover", (evento) => {
    if (!arrastado) return;

    // sem isto o navegador recusa o solte e o arrasto volta do nada
    evento.preventDefault();

    const alvo = itemDe(evento.target);
    if (!alvo || alvo === arrastado) return;

    // passou da metade do vizinho: entra depois dele. A metade (e nao a
    // borda) evita o item piscar entre duas posicoes no meio do caminho.
    const caixa = alvo.getBoundingClientRect();
    const depois =
      eixo === "x"
        ? evento.clientX > caixa.left + caixa.width / 2
        : evento.clientY > caixa.top + caixa.height / 2;

    container.insertBefore(arrastado, depois ? alvo.nextSibling : alvo);
    mexeu = true;
  });

  container.addEventListener("drop", (evento) => evento.preventDefault());

  container.addEventListener("dragend", () => {
    if (!arrastado) return;

    arrastado.classList.remove("arrastando");
    arrastado = null;

    if (!mexeu) return;

    aoReordenar(
      Array.from(container.querySelectorAll("[data-ordem]")).map(
        (item) => item.dataset.ordem
      )
    );
  });
}
