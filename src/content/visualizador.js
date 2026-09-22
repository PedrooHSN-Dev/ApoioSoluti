// Apoio Soluti v4 — ferramentas de atendimento do Suporte B2C.
//
// Desenvolvido por Vitor Azevedo (v1 e v2).
// Reescrito e mantido por Vinícius Zoccoli e Pedro H. S. Nascimento (v3 em diante).

// Visualizador de imagem da propria pagina (botao direito > "Ampliar imagem").
//
// Por que nao usar o "Mais ferramentas > Ampliar imagem" do Edge: aquele zoom e
// UI do navegador, desenhada FORA do documento. O chrome.tabs.captureVisibleTab
// so enxerga o conteudo da aba, entao o print sai com a pagina original por
// baixo e a captura de texto le a coisa errada. Aqui a imagem ampliada e um
// elemento normal do DOM, entao entra no print e o OCR funciona.
//
// Depende de window.__apoioSoluti (exposto pelo content.js) para a selecao
// de area e a captura.

if (!window.__apoioSolutiVisualizador) {
  window.__apoioSolutiVisualizador = true;

  const ID_VISUALIZADOR = "apoio-soluti-visualizador";
  // id da camada de selecao criada pelo content.js: enquanto ela existir o
  // visualizador nao reage ao teclado (o Esc pertence a selecao)
  const ID_CAMADA_SELECAO = "apoio-soluti-camada";

  const ESCALA_MIN = 0.05;
  const ESCALA_MAX = 40;
  const PASSO_ZOOM = 1.2;

  let atual = null;

  function proximoQuadro() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  // com um elemento em fullscreen nativo o navegador so renderiza o que
  // estiver dentro dele: qualquer coisa fora fica invisivel mesmo com
  // z-index maximo
  function raizDeAnexo() {
    return document.fullscreenElement || document.documentElement;
  }

  function fechar() {
    if (!atual) return;
    document.removeEventListener("keydown", atual.aoTeclar, true);
    window.removeEventListener("resize", atual.aoRedimensionar);
    atual.host.remove();
    atual = null;
  }

  function abrir(src) {
    if (!src) return;
    fechar();

    const host = document.createElement("div");
    host.id = ID_VISUALIZADOR;
    host.style.cssText =
      "all: initial; position: fixed; inset: 0; z-index: 2147483646;";

    const raiz = host.attachShadow({ mode: "open" });
    raiz.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: "Segoe UI", Arial, sans-serif; }

        .palco {
          position: fixed;
          inset: 0;
          overflow: hidden;
          cursor: grab;
        }
        .palco.arrastando { cursor: grabbing; }

        .fundo {
          position: absolute;
          inset: 0;
          background: rgba(10, 14, 12, 0.92);
        }

        .figura {
          position: absolute;
          top: 50%;
          left: 50%;
          max-width: none;
          max-height: none;
          transform-origin: center center;
          image-rendering: auto;
          user-select: none;
          -webkit-user-drag: none;
        }

        .barra {
          position: fixed;
          top: 14px;
          left: 50%;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 8px;
          transform: translateX(-50%);
          color: #eef2f5;
          background: rgba(18, 24, 21, 0.94);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
          white-space: nowrap;
        }
        .barra.oculta { visibility: hidden; }

        button {
          min-width: 32px;
          height: 30px;
          padding: 0 9px;
          color: #eef2f5;
          background: transparent;
          border: 0;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
        }
        button:hover { background: rgba(255, 255, 255, 0.14); }
        button.ativo { color: #0b1410; background: #2bf14d; }
        button.principal {
          background: #0f7a3f;
          font-size: 12.5px;
          font-weight: 600;
        }
        button.principal:hover { background: #14a253; }
        button.texto { font-size: 12.5px; font-weight: 600; }
        .zoom { min-width: 56px; font-size: 12px; font-variant-numeric: tabular-nums; }

        .sep {
          width: 1px;
          height: 20px;
          margin: 0 3px;
          background: rgba(255, 255, 255, 0.16);
        }

        .aviso {
          position: fixed;
          bottom: 18px;
          left: 50%;
          padding: 7px 14px;
          transform: translateX(-50%);
          color: #eef2f5;
          background: rgba(18, 24, 21, 0.9);
          border-radius: 999px;
          font-size: 12.5px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.25s;
        }
        .aviso.visivel { opacity: 1; }
      </style>

      <div class="palco">
        <div class="fundo"></div>
        <img class="figura" alt="">
      </div>

      <div class="barra">
        <button data-acao="menos" title="Diminuir (tecla -)">−</button>
        <button class="zoom" data-acao="cem" title="Tamanho real (tecla 1)">100%</button>
        <button data-acao="mais" title="Aumentar (tecla +)">+</button>
        <span class="sep"></span>
        <button class="texto" data-acao="ajustar" title="Ajustar à tela (tecla 0)">Ajustar</button>
        <button data-acao="girar-esq" title="Girar à esquerda (tecla R)">↺</button>
        <button data-acao="girar-dir" title="Girar à direita (Shift+R)">↻</button>
        <button data-acao="espelhar" title="Espelhar na horizontal (tecla E)">⇄</button>
        <button data-acao="contraste" title="Alto contraste — ajuda o OCR (tecla C)">◐</button>
        <span class="sep"></span>
        <button class="principal" data-acao="selecionar" title="Arrastar sobre um trecho e extrair o texto">Extrair texto</button>
        <button class="texto" data-acao="tudo" title="Extrair o texto da imagem inteira, na resolução original">Ler tudo</button>
        <span class="sep"></span>
        <button data-acao="fechar" title="Fechar (Esc)">✕</button>
      </div>

      <div class="aviso"></div>
    `;

    raizDeAnexo().appendChild(host);

    const palco = raiz.querySelector(".palco");
    const fundo = raiz.querySelector(".fundo");
    const figura = raiz.querySelector(".figura");
    const barra = raiz.querySelector(".barra");
    const aviso = raiz.querySelector(".aviso");
    const rotuloZoom = raiz.querySelector(".zoom");

    let escala = 1;
    let rotacao = 0;
    let espelho = 1;
    let contraste = false;
    let deslocX = 0;
    let deslocY = 0;

    let avisoTimer = null;

    function mostrarAviso(mensagem, duracao = 2200) {
      aviso.textContent = mensagem;
      aviso.classList.add("visivel");
      clearTimeout(avisoTimer);
      avisoTimer = setTimeout(() => aviso.classList.remove("visivel"), duracao);
    }

    function aplicar() {
      figura.style.transform =
        `translate(calc(-50% + ${deslocX}px), calc(-50% + ${deslocY}px)) ` +
        `scale(${escala}) rotate(${rotacao}deg) scaleX(${espelho})`;
      figura.style.filter = contraste
        ? "grayscale(1) contrast(1.7) brightness(1.06)"
        : "none";
      rotuloZoom.textContent = `${Math.round(escala * 100)}%`;
    }

    function limitar(valor) {
      return Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, valor));
    }

    // mantem fixo o ponto sob o cursor: converte a posicao da tela para o
    // sistema da imagem, reaplica com a nova escala e corrige o deslocamento
    function zoomPara(novaEscala, telaX, telaY) {
      const alvo = limitar(novaEscala);
      if (alvo === escala) return;

      const centroX = window.innerWidth / 2;
      const centroY = window.innerHeight / 2;
      const fator = alvo / escala;

      deslocX = telaX - centroX - (telaX - centroX - deslocX) * fator;
      deslocY = telaY - centroY - (telaY - centroY - deslocY) * fator;
      escala = alvo;
      aplicar();
    }

    function zoomNoCentro(fator) {
      zoomPara(escala * fator, window.innerWidth / 2, window.innerHeight / 2);
    }

    function ajustar() {
      const girado = rotacao % 180 !== 0;
      const largura = girado ? figura.naturalHeight : figura.naturalWidth;
      const altura = girado ? figura.naturalWidth : figura.naturalHeight;
      if (!largura || !altura) return;

      // sobra para a barra em cima e o aviso embaixo
      const disponivelX = Math.max(80, window.innerWidth - 56);
      const disponivelY = Math.max(80, window.innerHeight - 120);

      // sem teto em 1: imagem pequena tem que crescer, e esse o objetivo
      escala = limitar(Math.min(disponivelX / largura, disponivelY / altura));
      deslocX = 0;
      deslocY = 0;
      aplicar();
    }

    function tamanhoReal() {
      escala = 1;
      deslocX = 0;
      deslocY = 0;
      aplicar();
    }

    function girar(graus) {
      rotacao = (rotacao + graus + 360) % 360;
      deslocX = 0;
      deslocY = 0;
      aplicar();
    }

    /* ---------- captura de texto ---------- */

    function ocultarBarra() {
      barra.classList.add("oculta");
    }

    function mostrarBarra() {
      barra.classList.remove("oculta");
    }

    function api() {
      const ponte = window.__apoioSoluti;
      if (!ponte) {
        mostrarAviso("Recarregue a página para extrair o texto.", 3200);
        return null;
      }
      return ponte;
    }

    async function extrairSelecionando() {
      const ponte = api();
      if (!ponte) return;

      // a barra e conteudo da pagina: entraria no print se o usuario
      // selecionasse um trecho por baixo dela
      ocultarBarra();
      await proximoQuadro();

      if (!ponte.iniciarSelecao({ aoFinalizar: mostrarBarra })) mostrarBarra();
    }

    async function lerTudo() {
      const ponte = api();
      if (!ponte) return;

      // Caminho bom: os bytes originais da imagem, na resolucao nativa. Nao
      // depende do zoom nem do que esta visivel, entao imagem pequena para de
      // ser lida como borrao ampliado. A barra pode continuar na tela: nada
      // aqui e fotografado.
      if (ponte.lerImagemOriginal) {
        const leu = await ponte.lerImagemOriginal(figura.src, {
          rotacao,
          espelho
        });
        if (leu) return;
      }

      // Fallback: fotografa a tela. Vale para imagem blob:/gerada pela propria
      // pagina, servidor que recusou o pedido, formato que o fetch nao alcanca.
      // getBoundingClientRect ja considera zoom e rotacao; recorta no viewport
      // porque o print so tem a parte visivel da aba
      const caixa = figura.getBoundingClientRect();
      const x = Math.max(0, caixa.left);
      const y = Math.max(0, caixa.top);
      const largura = Math.min(caixa.right, window.innerWidth) - x;
      const altura = Math.min(caixa.bottom, window.innerHeight) - y;

      if (largura < 8 || altura < 8) {
        mostrarAviso("Não há imagem visível para ler.");
        return;
      }

      ocultarBarra();
      await proximoQuadro();
      await proximoQuadro();

      ponte.capturarArea(
        { x, y, width: largura, height: altura },
        { aoFinalizar: mostrarBarra }
      );
    }

    /* ---------- barra ---------- */

    const ACOES = {
      menos: () => zoomNoCentro(1 / PASSO_ZOOM),
      mais: () => zoomNoCentro(PASSO_ZOOM),
      cem: tamanhoReal,
      ajustar,
      "girar-esq": () => girar(-90),
      "girar-dir": () => girar(90),
      espelhar: () => {
        espelho = -espelho;
        aplicar();
      },
      contraste: () => {
        contraste = !contraste;
        barra
          .querySelector('[data-acao="contraste"]')
          .classList.toggle("ativo", contraste);
        aplicar();
      },
      selecionar: extrairSelecionando,
      tudo: lerTudo,
      fechar
    };

    barra.addEventListener("click", (evento) => {
      const botao = evento.target.closest("button");
      if (!botao) return;
      ACOES[botao.dataset.acao]?.();
    });

    /* ---------- mouse ---------- */

    let arrastando = false;
    let moveu = false;
    let ultimoX = 0;
    let ultimoY = 0;
    let alvoInicial = null;

    palco.addEventListener("pointerdown", (evento) => {
      if (evento.button !== 0) return;
      evento.preventDefault();
      arrastando = true;
      moveu = false;
      ultimoX = evento.clientX;
      ultimoY = evento.clientY;
      // guardado agora porque o setPointerCapture abaixo passa a apontar
      // todos os eventos seguintes (inclusive o pointerup) para o palco
      alvoInicial = evento.composedPath()[0];
      palco.classList.add("arrastando");
      palco.setPointerCapture(evento.pointerId);
    });

    palco.addEventListener("pointermove", (evento) => {
      if (!arrastando) return;
      const dx = evento.clientX - ultimoX;
      const dy = evento.clientY - ultimoY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moveu = true;
      ultimoX = evento.clientX;
      ultimoY = evento.clientY;
      deslocX += dx;
      deslocY += dy;
      aplicar();
    });

    palco.addEventListener("pointerup", () => {
      if (!arrastando) return;
      arrastando = false;
      palco.classList.remove("arrastando");

      // clique limpo no fundo fecha; sobre a imagem, nao
      if (!moveu && alvoInicial === fundo) fechar();
    });

    palco.addEventListener("pointercancel", () => {
      arrastando = false;
      palco.classList.remove("arrastando");
    });

    palco.addEventListener(
      "wheel",
      (evento) => {
        evento.preventDefault();
        const fator = evento.deltaY < 0 ? PASSO_ZOOM : 1 / PASSO_ZOOM;
        zoomPara(escala * fator, evento.clientX, evento.clientY);
      },
      { passive: false }
    );

    figura.addEventListener("dblclick", (evento) => {
      evento.preventDefault();
      if (escala < 1) zoomPara(1, evento.clientX, evento.clientY);
      else ajustar();
    });

    /* ---------- teclado ---------- */

    function aoTeclar(evento) {
      // durante a selecao de area o Esc e as teclas pertencem a camada do OCR
      if (document.getElementById(ID_CAMADA_SELECAO)) return;

      // o texto extraido aparece num textarea editavel por cima do
      // visualizador: la as teclas sao do usuario, nao atalhos
      const alvo = evento.composedPath?.()[0];
      if (
        alvo?.isContentEditable ||
        /^(input|textarea|select)$/i.test(alvo?.tagName || "")
      ) {
        return;
      }

      const acoes = {
        Escape: fechar,
        "+": () => zoomNoCentro(PASSO_ZOOM),
        "=": () => zoomNoCentro(PASSO_ZOOM),
        "-": () => zoomNoCentro(1 / PASSO_ZOOM),
        _: () => zoomNoCentro(1 / PASSO_ZOOM),
        "0": ajustar,
        "1": tamanhoReal,
        e: () => ACOES.espelhar(),
        c: () => ACOES.contraste(),
        ArrowLeft: () => {
          deslocX += 60;
          aplicar();
        },
        ArrowRight: () => {
          deslocX -= 60;
          aplicar();
        },
        ArrowUp: () => {
          deslocY += 60;
          aplicar();
        },
        ArrowDown: () => {
          deslocY -= 60;
          aplicar();
        }
      };

      const tecla = evento.key;
      const acao =
        tecla.toLowerCase() === "r"
          ? () => girar(evento.shiftKey ? 90 : -90)
          : acoes[tecla] || acoes[tecla.toLowerCase()];

      if (!acao) return;

      evento.preventDefault();
      evento.stopPropagation();
      acao();
    }

    function aoRedimensionar() {
      // reajusta so quando a imagem esta no enquadramento inicial
      if (deslocX === 0 && deslocY === 0) ajustar();
    }

    document.addEventListener("keydown", aoTeclar, true);
    window.addEventListener("resize", aoRedimensionar);

    atual = { host, aoTeclar, aoRedimensionar };

    figura.addEventListener("load", () => {
      ajustar();
      mostrarAviso("Role para ampliar · arraste para mover · Esc fecha", 3000);
    });

    figura.addEventListener("error", () => {
      mostrarAviso("Não foi possível carregar essa imagem.", 4000);
    });

    figura.draggable = false;
    figura.src = src;

    // imagem ja em cache pode nao disparar load
    if (figura.complete && figura.naturalWidth) ajustar();
  }

  chrome.runtime.onMessage.addListener((mensagem) => {
    if (mensagem?.tipo === "abrirVisualizador") abrir(mensagem.src);
  });
}
