// Reordenar as abas do menu lateral arrastando (ou Alt + setas com a aba em
// foco). Vale dentro de um grupo e entre grupos (Início / Atendimento /
// Buscas).
//
// A ordem fica em localStorage (síncrono: aplicada antes do usuário ver a
// barra) e também em chrome.storage, para viajar pelo sync entre máquinas.
// Abas que não constam na ordem salva (uma aba nova da extensão) ficam no fim
// do grupo de origem; ids salvos que não existem mais são ignorados.

(() => {
  const CHAVE = "ordemAbas";
  const nav = document.querySelector(".barra-lateral");
  if (!nav) return;

  const grupos = [...nav.querySelectorAll(".grupo-abas")];
  const todas = () => [...nav.querySelectorAll(".aba")];

  grupos.forEach((grupo, i) => {
    grupo.querySelectorAll(".aba").forEach((aba) => {
      aba.dataset.grupoOriginal = String(i);
      aba.draggable = true;
    });
  });

  const ordemAtual = () =>
    grupos.map((g) => [...g.querySelectorAll(".aba")].map((a) => a.dataset.aba));

  const ordemPadrao = ordemAtual();

  // O numero de grupos faz parte do formato. Quando ele muda no HTML (os
  // dois grupos "Rápido/Ferramentas" viraram tres), uma ordem salva no
  // formato velho encaixaria as abas nos grupos errados e deixaria o grupo
  // novo vazio — melhor ignora-la e valer o padrao novo.
  function valida(salvo) {
    return (
      Array.isArray(salvo) &&
      salvo.length === grupos.length &&
      salvo.every((g) => Array.isArray(g) && g.every((id) => typeof id === "string"))
    );
  }

  function aplicar(salvo) {
    if (!valida(salvo)) return;

    const porId = new Map(todas().map((a) => [a.dataset.aba, a]));
    const usadas = new Set();

    salvo.slice(0, grupos.length).forEach((ids, i) => {
      ids.forEach((id) => {
        const aba = porId.get(id);
        if (!aba || usadas.has(id)) return;
        grupos[i].appendChild(aba);
        usadas.add(id);
      });
    });

    // as que a ordem salva nao conhece voltam ao fim do grupo de origem
    todas().forEach((aba) => {
      if (usadas.has(aba.dataset.aba)) return;
      grupos[Number(aba.dataset.grupoOriginal)].appendChild(aba);
    });
  }

  /* Gravar / ler ----------------------------------------------------- */

  async function salvar() {
    const texto = JSON.stringify(ordemAtual());

    try {
      localStorage.setItem(CHAVE, texto);
    } catch {}

    const valor = ordemAtual();
    try {
      await chrome.storage.local.set({ [CHAVE]: valor });
    } catch {}
    try {
      await chrome.storage.sync.set({ [CHAVE]: valor });
    } catch {}
  }

  async function restaurar() {
    aplicar(ordemPadrao);
    try {
      localStorage.removeItem(CHAVE);
    } catch {}
    try {
      await chrome.storage.local.remove(CHAVE);
    } catch {}
    try {
      await chrome.storage.sync.remove(CHAVE);
    } catch {}
  }

  // 1) instantaneo, do localStorage
  try {
    aplicar(JSON.parse(localStorage.getItem(CHAVE)));
  } catch {}

  // 2) o que veio pelo sync (outra maquina) vale se for diferente
  (async () => {
    let guardado = null;
    for (const area of [chrome.storage.sync, chrome.storage.local]) {
      try {
        const v = (await area.get(CHAVE))[CHAVE];
        if (valida(v)) {
          guardado = v;
          break;
        }
      } catch {}
    }

    if (guardado && JSON.stringify(guardado) !== JSON.stringify(ordemAtual())) {
      aplicar(guardado);
      try {
        localStorage.setItem(CHAVE, JSON.stringify(ordemAtual()));
      } catch {}
    }
  })();

  try {
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if ((area === "sync" || area === "local") && mudancas[CHAVE]) {
        const novo = mudancas[CHAVE].newValue;
        if (valida(novo) && JSON.stringify(novo) !== JSON.stringify(ordemAtual())) {
          aplicar(novo);
        } else if (novo === undefined) {
          aplicar(ordemPadrao);
        }
      }
    });
  } catch {}

  /* Arrastar --------------------------------------------------------- */

  let arrastada = null;
  let antes = "";

  nav.addEventListener("dragstart", (evento) => {
    const aba = evento.target.closest?.(".aba");
    if (!aba) return;

    arrastada = aba;
    antes = JSON.stringify(ordemAtual());
    aba.classList.add("arrastando");
    evento.dataTransfer.effectAllowed = "move";
    // sem escrever algo, alguns navegadores nem comecam o arrasto
    evento.dataTransfer.setData("text/plain", aba.dataset.aba);
  });

  nav.addEventListener("dragover", (evento) => {
    if (!arrastada) return;
    evento.preventDefault();

    const alvo = evento.target.closest?.(".aba");

    if (alvo) {
      if (alvo === arrastada) return;
      // passou da metade do vizinho: entra depois dele
      const caixa = alvo.getBoundingClientRect();
      const depois = evento.clientY > caixa.top + caixa.height / 2;
      alvo.parentNode.insertBefore(arrastada, depois ? alvo.nextSibling : alvo);
      return;
    }

    // solto no rotulo/vao de um grupo: vai para o fim dele
    const grupo = evento.target.closest?.(".grupo-abas");
    if (grupo && arrastada.parentNode !== grupo) grupo.appendChild(arrastada);
  });

  nav.addEventListener("drop", (evento) => evento.preventDefault());

  nav.addEventListener("dragend", () => {
    if (!arrastada) return;
    arrastada.classList.remove("arrastando");
    arrastada = null;

    if (JSON.stringify(ordemAtual()) !== antes) salvar();
  });

  /* Teclado: Alt + setas ---------------------------------------------- */

  nav.addEventListener("keydown", (evento) => {
    const aba = evento.target.closest?.(".aba");
    if (!aba || !evento.altKey) return;
    if (evento.key !== "ArrowUp" && evento.key !== "ArrowDown") return;

    evento.preventDefault();
    const subir = evento.key === "ArrowUp";
    const irmao = subir ? aba.previousElementSibling : aba.nextElementSibling;
    const i = grupos.indexOf(aba.parentNode);

    if (irmao?.classList.contains("aba")) {
      aba.parentNode.insertBefore(aba, subir ? irmao : irmao.nextSibling);
    } else {
      // no limite do grupo: passa para o vizinho
      const destino = grupos[i + (subir ? -1 : 1)];
      if (!destino) return;
      if (subir) destino.appendChild(aba);
      else destino.insertBefore(aba, destino.querySelector(".aba"));
    }

    aba.focus();
    salvar();
  });

  $("restaurarAbasBtn")?.addEventListener("click", restaurar);
})();
