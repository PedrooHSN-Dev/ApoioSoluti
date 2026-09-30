// Apoio Soluti v4 — ferramentas de atendimento do Suporte B2C.
//
// Desenvolvido por Vitor Azevedo (v1 e v2).
// Reescrito e mantido por Vinícius Zoccoli e Pedro H. S. Nascimento (v3 em diante).

if (!window.__apoioSolutiCarregado) {
  window.__apoioSolutiCarregado = true;

  const TIPOS_TEXTO = new Set([
    "text",
    "search",
    "url",
    "tel",
    "email",
    ""
  ]);

  const EQUIPE = window.MACROS_EQUIPE || [];

  let macros = [];
  let ultimosDoUsuario = [];
  let ocultos = [];
  let aplicando = false;

  function normalizar(lista, origem) {
    if (!Array.isArray(lista)) return [];

    return lista
      .filter((item) => item && item.comando && item.resposta)
      .map((item) => ({
        id: item.id || `${origem}-${item.comando}`,
        comando: String(item.comando),
        resposta: String(item.resposta),
        origem
      }));
  }

  function montarLista(macrosUsuario) {
    ultimosDoUsuario = macrosUsuario;
    const usuario = normalizar(macrosUsuario, "usuario");
    const usados = new Set(usuario.map((item) => item.comando.toLowerCase()));

    // macro pessoal com o mesmo comando tem prioridade sobre o da equipe
    // os que a pessoa "excluiu" da equipe (ocultos) tambem saem
    const equipe = normalizar(EQUIPE, "equipe").filter(
      (item) =>
        !usados.has(item.comando.toLowerCase()) && !ocultos.includes(item.id)
    );

    const lista = [...usuario, ...equipe];

    // garante que .ini exista mesmo se nao estiver na lista, para a saudacao
    // por horario sempre funcionar. Resposta vazia vira "Bom dia!/..." no
    // resolverResposta.
    const temIni = lista.some((m) => m.comando.toLowerCase() === ".ini");
    if (!temIni) {
      lista.push({
        id: "builtin-ini",
        comando: ".ini",
        resposta: "",
        origem: "equipe"
      });
    }

    return lista.sort((a, b) => b.comando.length - a.comando.length);
  }

  const { resolverResposta } = window.ApoioMacros;

  async function carregarMacros() {
    try {
      ocultos = await window.ApoioMacros.lerOcultos();
      macros = montarLista(await window.ApoioMacros.ler());
    } catch (erro) {
      console.error("Apoio Soluti: erro ao carregar macros:", erro);
      macros = montarLista([]);
    }
  }

  window.ApoioMacros.aoMudar((lista) => {
    macros = montarLista(lista);
  });

  window.ApoioMacros.aoMudarOcultos((ids) => {
    ocultos = ids;
    macros = montarLista(ultimosDoUsuario);
  });

  function ehLimite(caractere) {
    return caractere === undefined || /\s/.test(caractere);
  }

  function encontrarMacro(textoAntesDoCursor) {
    if (!textoAntesDoCursor) return null;

    const alvo = textoAntesDoCursor.toLowerCase();

    for (const macro of macros) {
      const comando = macro.comando.toLowerCase();

      if (!alvo.endsWith(comando)) continue;

      const anterior = alvo[alvo.length - comando.length - 1];
      if (ehLimite(anterior)) return macro;
    }

    return null;
  }

  function ehCampoTexto(elemento) {
    if (!elemento || elemento.nodeType !== Node.ELEMENT_NODE) return false;
    if (elemento.isContentEditable) return true;

    const tag = elemento.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag !== "INPUT") return false;

    return TIPOS_TEXTO.has((elemento.type || "").toLowerCase());
  }

  function definirValorNativo(elemento, valor) {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(elemento),
      "value"
    )?.set;

    if (setter) {
      setter.call(elemento, valor);
    } else {
      elemento.value = valor;
    }

    elemento.dispatchEvent(new Event("input", { bubbles: true }));
    elemento.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function tratarCampoSimples(elemento) {
    const cursor = elemento.selectionStart;
    if (cursor === null || cursor !== elemento.selectionEnd) return;

    const antes = elemento.value.slice(0, cursor);
    const macro = encontrarMacro(antes);
    if (!macro) return;

    const inicio = cursor - macro.comando.length;

    elemento.setSelectionRange(inicio, cursor);

    const resposta = resolverResposta(macro);

    // execCommand mantem o historico de desfazer e avisa React/Vue corretamente
    const inserido = document.execCommand("insertText", false, resposta);

    if (!inserido) {
      const novoValor =
        elemento.value.slice(0, inicio) +
        resposta +
        elemento.value.slice(cursor);

      definirValorNativo(elemento, novoValor);

      const posicao = inicio + resposta.length;
      elemento.setSelectionRange(posicao, posicao);
    }
  }

  function obterSelecao(elemento) {
    const raiz = elemento.getRootNode();

    if (raiz && typeof raiz.getSelection === "function") {
      return raiz.getSelection();
    }

    return document.getSelection();
  }

  function tratarEditavel(elemento) {
    const selecao = obterSelecao(elemento);
    if (!selecao || !selecao.isCollapsed || selecao.rangeCount === 0) return;

    const range = selecao.getRangeAt(0);
    const no = range.startContainer;
    if (no.nodeType !== Node.TEXT_NODE) return;

    const antes = no.textContent.slice(0, range.startOffset);
    const macro = encontrarMacro(antes);
    if (!macro) return;

    const inicio = range.startOffset - macro.comando.length;
    if (inicio < 0) return;

    const selecaoComando = document.createRange();
    selecaoComando.setStart(no, inicio);
    selecaoComando.setEnd(no, range.startOffset);

    selecao.removeAllRanges();
    selecao.addRange(selecaoComando);

    // insertText passa pelo beforeinput, entao Lexical, ProseMirror,
    // Draft e Slate atualizam o proprio modelo interno
    document.execCommand("insertText", false, resolverResposta(macro));
  }

  document.addEventListener(
    "input",
    (evento) => {
      if (aplicando || !macros.length) return;

      const alvo = evento.composedPath?.()[0] || evento.target;
      if (!ehCampoTexto(alvo)) return;

      aplicando = true;

      try {
        if (alvo.isContentEditable) {
          tratarEditavel(alvo);
        } else {
          tratarCampoSimples(alvo);
        }
      } catch (erro) {
        console.error("Apoio Soluti: erro ao aplicar macro:", erro);
      } finally {
        aplicando = false;
      }
    },
    true
  );

  carregarMacros();


  /* ------------------------------------------------------------------
     Extrair texto da tela (Ctrl+M)
     ------------------------------------------------------------------ */

  const CAIXA_ID = "apoio-soluti-camada";
  const CARTAO_ID = "apoio-soluti-cartao";

  const ESTILO_BASE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Segoe UI", Arial, sans-serif; }
  `;

  let camada = null;
  let cartao = null;

  // quem pediu a selecao (ex.: o visualizador de imagem) pode querer saber
  // que o print ja foi tirado, para voltar a mostrar a propria interface
  let aoFinalizarSelecao = null;

  // true entre o envio do pedido de captura e a confirmacao do print
  let esperandoPrint = false;

  function removerCamada() {
    camada?.remove();
    camada = null;
  }

  function finalizarSelecao() {
    removerCamada();

    const retorno = aoFinalizarSelecao;
    aoFinalizarSelecao = null;
    retorno?.();
  }

  function fecharCartao() {
    cartao?.remove();
    cartao = null;
  }

  // com um elemento em fullscreen nativo (comum em zoom/lightbox de imagem),
  // o navegador so renderiza o que estiver dentro dele: qualquer coisa fora
  // fica invisivel mesmo com z-index maximo. Por isso a camada precisa ser
  // anexada dentro do proprio elemento em fullscreen quando ele existir.
  function raizDeAnexo() {
    return document.fullscreenElement || document.documentElement;
  }

  function criarHost(id) {
    const host = document.createElement("div");
    host.id = id;
    host.style.cssText =
      "all: initial; position: fixed; z-index: 2147483647;";
    raizDeAnexo().appendChild(host);
    return host.attachShadow({ mode: "open" });
  }

  // devolve false quando ja havia uma selecao em andamento, para quem chamou
  // poder restaurar a propria interface (o aoFinalizar nunca sera chamado)
  function iniciarSelecao(opcoes) {
    if (camada) return false;
    fecharCartao();

    aoFinalizarSelecao = opcoes?.aoFinalizar || null;

    const host = document.createElement("div");
    host.id = CAIXA_ID;
    host.style.cssText =
      "all: initial; position: fixed; inset: 0; z-index: 2147483647;";

    const raiz = host.attachShadow({ mode: "open" });
    raiz.innerHTML = `
      <style>
        ${ESTILO_BASE}
        .tela {
          position: fixed;
          inset: 0;
          cursor: crosshair;
          background: rgba(15, 23, 20, 0.28);
        }
        .dica {
          position: fixed;
          top: 18px;
          left: 50%;
          transform: translateX(-50%);
          padding: 8px 15px;
          color: white;
          background: rgba(17, 24, 21, 0.88);
          border-radius: 999px;
          font-size: 13px;
          white-space: nowrap;
        }
        .selecao {
          position: fixed;
          display: none;
          border: 2px solid #2bf14d;
          background: transparent;
          box-shadow: 0 0 0 9999px rgba(15, 23, 20, 0.28);
        }
      </style>
      <div class="tela"></div>
      <div class="dica">Arraste para selecionar a área. Esc cancela.</div>
      <div class="selecao"></div>
    `;

    raizDeAnexo().appendChild(host);
    camada = host;

    const tela = raiz.querySelector(".tela");
    const marcador = raiz.querySelector(".selecao");
    const dica = raiz.querySelector(".dica");

    let inicioX = 0;
    let inicioY = 0;
    let arrastando = false;

    function desenhar(evento) {
      const x = Math.min(inicioX, evento.clientX);
      const y = Math.min(inicioY, evento.clientY);
      const largura = Math.abs(evento.clientX - inicioX);
      const altura = Math.abs(evento.clientY - inicioY);

      marcador.style.display = "block";
      marcador.style.left = `${x}px`;
      marcador.style.top = `${y}px`;
      marcador.style.width = `${largura}px`;
      marcador.style.height = `${altura}px`;

      return { x, y, width: largura, height: altura };
    }

    function cancelar() {
      document.removeEventListener("keydown", aoTeclar, true);
      finalizarSelecao();
    }

    function aoTeclar(evento) {
      if (evento.key !== "Escape") return;
      evento.preventDefault();
      evento.stopPropagation();
      cancelar();
    }

    tela.addEventListener("mousedown", (evento) => {
      if (evento.button !== 0) return;
      evento.preventDefault();
      arrastando = true;
      inicioX = evento.clientX;
      inicioY = evento.clientY;
      // a moldura some junto com a tela: o retangulo passa a dar o contraste
      tela.style.background = "transparent";
      desenhar(evento);
    });

    tela.addEventListener("mousemove", (evento) => {
      if (!arrastando) return;
      desenhar(evento);
    });

    tela.addEventListener("mouseup", async (evento) => {
      if (!arrastando) return;
      arrastando = false;

      const area = desenhar(evento);

      document.removeEventListener("keydown", aoTeclar, true);

      if (area.width < 8 || area.height < 8) {
        finalizarSelecao();
        return;
      }

      dica.textContent = "Lendo o texto...";
      marcador.style.display = "none";

      // a camada precisa sumir do print antes da captura
      camada.style.visibility = "hidden";
      await proximoQuadro();
      await proximoQuadro();

      await capturarArea(area);
    });

    document.addEventListener("keydown", aoTeclar, true);
    return true;
  }

  // Pede o print ao background e mostra o resultado. A camada de selecao (e a
  // interface de quem pediu a captura) so pode voltar a aparecer depois que o
  // background confirmar o print — senao o proprio cartao "Lendo o texto..."
  // entra na imagem e vira ruido pro OCR.
  async function capturarArea(rect, opcoes = {}) {
    if (opcoes.aoFinalizar) aoFinalizarSelecao = opcoes.aoFinalizar;

    esperandoPrint = true;

    try {
      const resposta = await chrome.runtime.sendMessage({
        tipo: "capturar",
        rect,
        dpr: window.devicePixelRatio || 1
      });

      esperandoPrint = false;
      finalizarSelecao();
      tratarResposta(resposta);
    } catch (erro) {
      esperandoPrint = false;
      finalizarSelecao();
      mostrarCartao({ erro: erro.message || String(erro) });
    }
  }

  function aoPrintPronto() {
    if (!esperandoPrint) return;
    esperandoPrint = false;

    finalizarSelecao();
    mostrarCartao({ carregando: true });
  }

  function proximoQuadro() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function tratarResposta(resposta) {
    if (!resposta) {
      mostrarCartao({ erro: "Sem resposta da extensão." });
      return;
    }

    if (resposta.erro) {
      mostrarCartao({ erro: resposta.erro });
      return;
    }

    mostrarCartao({
      texto: resposta.texto || "Nenhum texto reconhecido nessa área."
    });
  }

  function mostrarCartao({ texto = "", carregando = false, erro = "" }) {
    fecharCartao();

    const raiz = criarHost(CARTAO_ID);
    cartao = raiz.host;
    cartao.style.cssText +=
      "right: 18px; bottom: 18px; width: 380px; max-width: calc(100vw - 36px);";

    raiz.innerHTML = `
      <style>
        ${ESTILO_BASE}
        .cartao {
          padding: 13px 14px 12px;
          color: #1a2027;
          background: white;
          border: 1px solid #d9e0e6;
          border-radius: 12px;
          box-shadow: 0 12px 34px rgba(16, 24, 32, 0.22);
          font-size: 13px;
        }
        .topo {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 9px;
        }
        .titulo {
          color: #0f7a3f;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }
        .fechar {
          padding: 2px 6px;
          color: #6b7480;
          background: transparent;
          border: 0;
          border-radius: 6px;
          cursor: pointer;
          font-size: 17px;
          line-height: 1;
        }
        .fechar:hover { background: #f0f3f6; }
        textarea {
          width: 100%;
          min-height: 96px;
          max-height: 220px;
          padding: 9px 10px;
          color: #1a2027;
          background: #fbfcfd;
          border: 1px solid #d9e0e6;
          border-radius: 8px;
          outline: none;
          resize: vertical;
          font-family: Consolas, "Courier New", monospace;
          font-size: 12.5px;
          line-height: 1.45;
        }
        textarea:focus { border-color: #0f7a3f; }
        .estado {
          padding: 14px 4px;
          color: #6b7480;
          text-align: center;
        }
        .erro { color: #b42318; }
        .botoes { display: flex; gap: 7px; margin-top: 10px; }
        button.acao {
          flex: 1;
          padding: 8px 10px;
          border: 0;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12.5px;
          font-weight: 600;
        }
        .principal { color: white; background: #0f7a3f; }
        .principal:hover { background: #0b5c2f; }
        .neutro {
          color: #303740;
          background: white;
          border: 1px solid #d9e0e6;
        }
        .neutro:hover { background: #f6f8fa; }
      </style>

      <div class="cartao">
        <div class="topo">
          <span class="titulo">Texto da tela</span>
          <button class="fechar" title="Fechar">&times;</button>
        </div>
        <div class="corpo"></div>
      </div>
    `;

    raiz.querySelector(".fechar").addEventListener("click", fecharCartao);

    const corpo = raiz.querySelector(".corpo");

    if (carregando) {
      corpo.innerHTML = '<div class="estado">Lendo o texto...</div>';
      return;
    }

    if (erro) {
      corpo.innerHTML = `<div class="estado erro"></div>`;
      corpo.querySelector(".estado").textContent = erro;
      return;
    }

    const area = document.createElement("textarea");
    area.value = texto;
    area.spellcheck = false;

    const botoes = document.createElement("div");
    botoes.className = "botoes";

    const copiar = document.createElement("button");
    copiar.className = "acao principal";
    copiar.textContent = "Copiar";
    copiar.addEventListener("click", () => copiarTexto(area, copiar));

    botoes.appendChild(copiar);

    corpo.appendChild(area);
    corpo.appendChild(botoes);

    area.focus();
    area.select();
  }

  async function copiarTexto(area, botao) {
    const original = botao.textContent;

    try {
      await navigator.clipboard.writeText(area.value);
    } catch {
      // sem permissao de clipboard na pagina: cai para o metodo antigo
      area.select();
      document.execCommand("copy");
    }

    botao.textContent = "Copiado";
    setTimeout(() => {
      botao.textContent = original;
    }, 1300);
  }

  // Le a imagem original em vez do print: os bytes vem do servidor, na
  // resolucao nativa. Devolve false quando nao deu (imagem blob: da propria
  // pagina, servidor fora do ar, formato que o navegador nao decodifica),
  // para quem chamou poder cair no print da tela. Nesse caso o cartao de
  // "Lendo..." e fechado antes, senao ele entraria no proprio print.
  async function lerImagemOriginal(src, opcoes = {}) {
    if (!src) return false;

    mostrarCartao({ carregando: true });

    let resposta;
    try {
      resposta = await chrome.runtime.sendMessage({
        tipo: "ocrImagem",
        src,
        rotacao: opcoes.rotacao || 0,
        espelho: opcoes.espelho || 1
      });
    } catch {
      resposta = null;
    }

    if (!resposta || resposta.erro) {
      fecharCartao();
      return false;
    }

    tratarResposta(resposta);
    return true;
  }

  chrome.runtime.onMessage.addListener((mensagem) => {
    if (mensagem?.tipo === "iniciarSelecao") iniciarSelecao();
    if (mensagem?.tipo === "capturaPronta") aoPrintPronto();
    // resultado de uma leitura que comecou fora da pagina (menu de contexto)
    if (mensagem?.tipo === "resultadoOcr") mostrarCartao(mensagem.dados || {});
    // recado de algo que comecou fora da pagina (atalho Ctrl+Shift+S): reusa o
    // cartao de leitura, que ja tem o estilo de erro
    if (mensagem?.tipo === "aviso") {
      mostrarCartao(
        mensagem.estilo === "ok"
          ? { texto: mensagem.texto || "" }
          : { erro: mensagem.texto || "" }
      );
    }
  });

  // ponte para o visualizador de imagem (src/content/visualizador.js), que
  // roda na mesma isolated world mas em outro arquivo
  window.__apoioSoluti = { iniciarSelecao, capturarArea, lerImagemOriginal };

}
