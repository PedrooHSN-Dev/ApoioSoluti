// Apoio Soluti — leitor da página de andamento da solicitação (AR/acsoluti).
//
// Transforma o HTML de /certdig/andamento/id/<id> e os JSONs dos grids
// (histórico, pessoas envolvidas, documentos) em uma estrutura simples:
//
//   { secoes: [{ titulo, campos: [{ rotulo, valor }], tabelas: [{ colunas, linhas }], notas: [] }],
//     texto: "…todo o conteúdo visível, em linhas…" }
//
// Não conhece o layout exato da página: reconhece os padrões comuns (tabela de
// rótulo/valor, dl/dt/dd, <label>, "Rótulo: valor", tabelas com cabeçalho) e
// guarda TUDO o que não entendeu em `texto`, para nada se perder.
//
// Roda no popup (precisa de DOMParser; o service worker não tem). Não executa
// scripts nem carrega imagens: DOMParser devolve um documento inerte.

(function (raiz) {
  "use strict";

  const LIMITE_HTML = 3 * 1024 * 1024;

  const IGNORADAS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "LINK", "META", "HEAD", "SVG",
    "IFRAME", "OBJECT", "CANVAS", "BUTTON", "NAV", "FOOTER", "OPTION"
  ]);

  const BLOCOS = new Set([
    "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "DL", "DD", "DT",
    "FIELDSET", "FIGURE", "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER",
    "HR", "LI", "MAIN", "OL", "P", "PRE", "SECTION", "TABLE", "UL", "LEGEND",
    "CAPTION", "BODY", "BR", "TR"
  ]);

  const TITULOS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "LEGEND", "CAPTION"]);
  const CLASSE_TITULO = /(^|\s)(panel-heading|panel-title|secao-titulo|titulo|title)(\s|$)/i;
  const CLASSE_ROTULO = /(label|rotulo)/i;
  // menu, janelas modais e widgets do dojo (botões dijit e grids dojoxGrid já
  // montados): não são dados da solicitação. Os grids chegam à parte, em JSON.
  const CLASSE_MENU = /(navbar|menu|breadcrumb|sidebar|dijit|dojoxGrid|modal|preloader)/i;
  const ID_GRID = /^grid.*container$/i;
  const CLASSE_AVISO = /(^|\s)alert(\s|$)/i;
  const PAI_DE_TITULO = new Set(["DIV", "SECTION", "FORM", "FIELDSET", "MAIN", "ARTICLE", "BODY"]);
  const IRMAO_DE_TITULO = new Set(["DL", "DIV", "TABLE", "UL", "OL", "P", "FORM", "FIELDSET", "SECTION"]);

  const normalizar = (t) => String(t == null ? "" : t).replace(/[ \s]+/g, " ").trim();
  const semDoisPontos = (t) => normalizar(t).replace(/\s*:\s*$/, "");

  /* ---------------------------------------------------------------
     1. Campos de formulário viram texto (o valor digitado/selecionado
        é o que o atendente vê na tela).
     --------------------------------------------------------------- */
  function trocarPorTexto(doc, no, texto) {
    const span = doc.createElement("span");
    span.textContent = texto;
    if (no.id) span.id = no.id;
    no.replaceWith(span);
  }

  function prepararControles(doc) {
    doc.querySelectorAll("input").forEach((el) => {
      const tipo = (el.getAttribute("type") || "text").toLowerCase();
      if (["hidden", "button", "submit", "reset", "image", "file", "password"].includes(tipo)) {
        el.remove();
      } else if (tipo === "checkbox") {
        trocarPorTexto(doc, el, el.hasAttribute("checked") ? "Sim" : "Não");
      } else if (tipo === "radio") {
        if (el.hasAttribute("checked")) trocarPorTexto(doc, el, el.getAttribute("value") || "Sim");
        else el.remove();
      } else {
        trocarPorTexto(doc, el, el.getAttribute("value") || "");
      }
    });

    doc.querySelectorAll("textarea").forEach((el) => trocarPorTexto(doc, el, el.textContent || ""));

    doc.querySelectorAll("select").forEach((el) => {
      const opcoes = [...el.querySelectorAll("option")];
      const marcadas = opcoes.filter((o) => o.hasAttribute("selected"));
      const usar = marcadas.length ? marcadas : (el.hasAttribute("multiple") ? [] : opcoes.slice(0, 1));
      const texto = usar
        .map((o) => normalizar(o.textContent))
        .filter((t) => t && !/^(selecione|escolha|--+)/i.test(t))
        .join(", ");
      trocarPorTexto(doc, el, texto);
    });
  }

  /* ---------------------------------------------------------------
     2. Percorre o documento em ordem e gera "eventos".
     --------------------------------------------------------------- */
  function pareceRotulo(c) {
    return !!c && (c.th || c.negrito || c.classeRotulo || /:$/.test(c.texto)) && !!c.texto;
  }

  function lerCelula(cel) {
    const texto = normalizar(cel.textContent);
    const filhos = [...cel.children].filter((f) => normalizar(f.textContent));
    const negrito =
      filhos.length === 1 &&
      /^(B|STRONG|LABEL)$/.test(filhos[0].tagName) &&
      normalizar(filhos[0].textContent) === texto;
    return {
      texto,
      th: cel.tagName === "TH",
      negrito,
      classeRotulo: CLASSE_ROTULO.test(cel.getAttribute("class") || "")
    };
  }

  function lerLinhaDeTabela(tr) {
    const celulas = [...tr.children]
      .filter((c) => c.tagName === "TD" || c.tagName === "TH")
      .map(lerCelula);
    return celulas;
  }

  function linhasDaTabela(tabela) {
    // só as linhas desta tabela (não as de tabelas aninhadas)
    return [...tabela.querySelectorAll("tr")].filter((tr) => tr.closest("table") === tabela);
  }

  function eventosDeTabela(tabela, ev) {
    const trs = linhasDaTabela(tabela);
    const linhas = trs.map((tr) => ({
      celulas: lerLinhaDeTabela(tr),
      cabecalho: !!tr.closest("thead")
    })).filter((l) => l.celulas.length && l.celulas.some((c) => c.texto));

    if (!linhas.length) return;

    const legenda = tabela.querySelector(":scope > caption");
    if (legenda && normalizar(legenda.textContent)) {
      ev.push({ tipo: "titulo", texto: normalizar(legenda.textContent) });
    }

    const primeira = linhas[0];
    const ehCabecalho =
      primeira.celulas.length >= 2 &&
      (primeira.cabecalho || primeira.celulas.every((c) => c.th)) &&
      linhas.length >= 2;

    if (ehCabecalho) {
      const colunas = primeira.celulas.map((c) => c.texto);
      const corpo = linhas.slice(1).map((l) => l.celulas.map((c) => c.texto));
      if (corpo.length === 1) {
        // uma linha só vira lista de campos: é mais fácil de ler e copiar
        colunas.forEach((col, i) => {
          if (col || corpo[0][i]) ev.push({ tipo: "par", rotulo: semDoisPontos(col), valor: corpo[0][i] || "" });
        });
      } else {
        ev.push({ tipo: "tabela", colunas, linhas: corpo });
      }
      return;
    }

    linhas.forEach(({ celulas }) => {
      if (celulas.length === 1) {
        ev.push({ tipo: "texto", texto: celulas[0].texto });
        return;
      }

      // pares rótulo/valor lado a lado: [rótulo][valor][rótulo][valor]…
      if (celulas.length % 2 === 0 && celulas.every((c, i) => (i % 2 === 0 ? pareceRotulo(c) : true))) {
        for (let i = 0; i < celulas.length; i += 2) {
          if (celulas[i].texto || celulas[i + 1].texto) {
            ev.push({ tipo: "par", rotulo: semDoisPontos(celulas[i].texto), valor: celulas[i + 1].texto });
          }
        }
        return;
      }

      // [rótulo][valor com várias células]
      if (pareceRotulo(celulas[0])) {
        ev.push({
          tipo: "par",
          rotulo: semDoisPontos(celulas[0].texto),
          valor: celulas.slice(1).map((c) => c.texto).filter(Boolean).join(" | ")
        });
        return;
      }

      ev.push({ tipo: "texto", texto: celulas.map((c) => c.texto).filter(Boolean).join(" | ") });
    });
  }

  function eventosDeDl(dl, ev) {
    let rotulo = null;
    [...dl.children].forEach((f) => {
      if (f.tagName === "DT") {
        if (rotulo !== null) ev.push({ tipo: "par", rotulo, valor: "" });
        rotulo = semDoisPontos(f.textContent);
      } else if (f.tagName === "DD") {
        const valor = normalizar(f.textContent);
        const link = f.querySelector("a");
        const soLink = link && normalizar(link.textContent) === valor;
        // <dt></dt><dd><a>Imprimir ...</a></dd> é botão de ação, não dado
        if (rotulo || !soLink) ev.push({ tipo: "par", rotulo: rotulo || "", valor });
        rotulo = null;
      }
    });
    if (rotulo !== null) ev.push({ tipo: "par", rotulo, valor: "" });
  }

  function ehTituloSolto(no) {
    const pai = no.parentElement;
    const t = normalizar(no.textContent);
    if (!pai || !PAI_DE_TITULO.has(pai.tagName) || !t || t.length > 80) return false;
    const textoSolto = [...pai.childNodes].some((n) => n.nodeType === 3 && normalizar(n.nodeValue));
    const prox = no.nextElementSibling;
    return !textoSolto && !!prox && IRMAO_DE_TITULO.has(prox.tagName);
  }

  function coletar(doc, raiz) {
    const ev = [];
    const consumidos = new WeakSet();
    let buffer = "";
    let viuConteudo = false;

    const descarregar = () => {
      const t = normalizar(buffer);
      buffer = "";
      if (t) ev.push({ tipo: "texto", texto: t });
    };

    function visitar(no) {
      if (no.nodeType === 3) { // texto
        buffer += no.nodeValue;
        return;
      }
      if (no.nodeType !== 1 || consumidos.has(no)) return;

      const tag = no.tagName;
      if (IGNORADAS.has(tag)) return;
      if (no.hasAttribute("hidden") || /display\s*:\s*none/i.test(no.getAttribute("style") || "")) return;

      const classe = no.getAttribute("class") || "";
      if (CLASSE_MENU.test(classe) || ID_GRID.test(no.id || "") || no.getAttribute("role") === "navigation") return;

      if (CLASSE_AVISO.test(classe)) {
        const t = normalizar(no.textContent);
        if (t) {
          descarregar();
          ev.push({ tipo: "aviso", texto: t });
        }
        return;
      }

      if (tag === "TABLE") {
        descarregar();
        eventosDeTabela(no, ev);
        return;
      }

      if (tag === "DL") {
        descarregar();
        eventosDeDl(no, ev);
        return;
      }

      if (TITULOS.has(tag) || CLASSE_TITULO.test(classe) || ((tag === "STRONG" || tag === "B") && ehTituloSolto(no))) {
        const t = normalizar(no.textContent);
        if (t && t.length <= 120) {
          descarregar();
          // o primeiro h1/h2 da página ("Solicitação X (Situação)") é o cabeçalho
          if (!viuConteudo && (tag === "H1" || tag === "H2")) {
            ev.push({ tipo: "cabecalho", texto: t });
            viuConteudo = true;
          } else {
            ev.push({ tipo: "titulo", texto: semDoisPontos(t) });
          }
          return;
        }
      }

      if (tag === "LABEL") {
        const rotulo = semDoisPontos(no.textContent);
        if (!rotulo) return;

        let valor = "";
        const alvoId = no.getAttribute("for");
        const alvo = alvoId && doc.getElementById(alvoId);
        if (alvo && alvo !== no) {
          valor = normalizar(alvo.textContent);
          consumidos.add(alvo);
        } else if (no.nextElementSibling && !IGNORADAS.has(no.nextElementSibling.tagName)) {
          const irmao = no.nextElementSibling;
          if (irmao.tagName !== "LABEL") {
            valor = normalizar(irmao.textContent);
            consumidos.add(irmao);
          }
        }

        descarregar();
        ev.push({ tipo: "par", rotulo, valor });
        return;
      }

      const bloco = BLOCOS.has(tag);
      if (bloco) descarregar();
      if (tag === "BR") return;
      no.childNodes.forEach(visitar);
      if (bloco) descarregar();
    }

    visitar(raiz || doc.body || doc.documentElement);
    descarregar();
    return ev;
  }

  /* ---------------------------------------------------------------
     3. Eventos -> seções.
     --------------------------------------------------------------- */
  const SEM_TITULO = "Informações gerais";

  function separarRotuloValor(texto) {
    const m = texto.match(/^([^:]{2,50}?)\s*:\s+(\S.*)$/);
    if (!m) return null;
    const rotulo = m[1].trim();
    if (/^https?$/i.test(rotulo) || /[\/\\<>]/.test(rotulo)) return null;
    if (!/^[A-Za-zÀ-ÿ]/.test(rotulo)) return null;
    if (rotulo.split(/\s+/).length > 6) return null;
    return { rotulo, valor: m[2].trim() };
  }

  function montarSecoes(eventos) {
    const secoes = [];
    const avisos = secaoSimples("Avisos");
    let cabecalho = "";
    let atual = null;

    const nova = (titulo) => {
      atual = { titulo, campos: [], tabelas: [], notas: [] };
      secoes.push(atual);
      return atual;
    };
    const secao = () => atual || nova(SEM_TITULO);
    const vazia = (s) => !s.campos.length && !s.tabelas.length && !s.notas.length;

    eventos.forEach((e) => {
      if (e.tipo === "cabecalho") {
        cabecalho = e.texto;
      } else if (e.tipo === "aviso") {
        avisos.notas.push(e.texto);
      } else if (e.tipo === "titulo") {
        if (atual && vazia(atual)) atual.titulo = e.texto;
        else nova(e.texto);
      } else if (e.tipo === "par") {
        secao().campos.push({ rotulo: e.rotulo, valor: e.valor });
      } else if (e.tipo === "tabela") {
        secao().tabelas.push({ colunas: e.colunas, linhas: e.linhas });
      } else if (e.tipo === "texto") {
        const par = separarRotuloValor(e.texto);
        if (par) secao().campos.push(par);
        else secao().notas.push(e.texto);
      }
    });

    const lista = secoes.filter((s) => !vazia(s));
    if (avisos.notas.length) lista.unshift(avisos);
    return { secoes: lista, cabecalho };
  }

  function secaoSimples(titulo) {
    return { titulo, campos: [], tabelas: [], notas: [] };
  }

  function textoDosEventos(eventos) {
    const linhas = [];
    eventos.forEach((e) => {
      let l = "";
      if (e.tipo === "titulo") l = `\n${e.texto}`;
      else if (e.tipo === "cabecalho" || e.tipo === "aviso") l = e.texto;
      else if (e.tipo === "par") l = e.rotulo ? `${e.rotulo}: ${e.valor}` : e.valor;
      else if (e.tipo === "tabela") {
        l = [e.colunas.join(" | "), ...e.linhas.map((r) => r.join(" | "))].join("\n");
      } else l = e.texto;
      if (l && l !== linhas[linhas.length - 1]) linhas.push(l);
    });
    return linhas.join("\n").trim();
  }

  function extrairHtml(html) {
    const texto = String(html || "").slice(0, LIMITE_HTML);
    const doc = new DOMParser().parseFromString(texto, "text/html");
    prepararControles(doc);
    // a área de conteúdo é a que contém #dados (título, avisos e dados); o
    // que fica fora dela é o menu lateral e a identificação do usuário
    const dados = doc.getElementById("dados");
    const raiz = dados && dados.parentElement ? dados.parentElement : doc.body;
    const eventos = coletar(doc, raiz);
    const { secoes, cabecalho } = montarSecoes(eventos);
    return { secoes, cabecalho, texto: textoDosEventos(eventos) };
  }

  /* ---------------------------------------------------------------
     4. JSON dos grids (dojo) e das consultas AJAX.
     --------------------------------------------------------------- */
  function textoSimples(valor) {
    if (valor == null) return "";
    if (typeof valor === "boolean") return valor ? "Sim" : "Não";
    if (typeof valor === "object") {
      try { return JSON.stringify(valor); } catch { return String(valor); }
    }
    const s = String(valor);
    if (!/[<&]/.test(s)) return normalizar(s);
    // os grids costumam mandar HTML pronto (links, <b>, &nbsp;)
    const doc = new DOMParser().parseFromString(s.replace(/<br\s*\/?>/gi, " \n"), "text/html");
    return normalizar(doc.body ? doc.body.textContent : s);
  }

  function titulizar(chave) {
    const t = String(chave)
      .replace(/^[_\W]+/, "")
      .replace(/[_\-]+/g, " ")
      .replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2")
      .trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : String(chave);
  }

  function listaDeJson(json) {
    if (Array.isArray(json)) return json;
    if (!json || typeof json !== "object") return null;
    for (const chave of ["items", "rows", "data", "dados", "lista", "result", "results"]) {
      if (Array.isArray(json[chave])) return json[chave];
    }
    const primeira = Object.values(json).find((v) => Array.isArray(v));
    return primeira || null;
  }

  function totalDeJson(json) {
    if (!json || typeof json !== "object" || Array.isArray(json)) return null;
    for (const chave of ["numRows", "total", "totalCount", "count", "recordsTotal"]) {
      const n = Number(json[chave]);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    return null;
  }

  function achatar(obj, prefixo, saida, nivel) {
    Object.entries(obj).forEach(([k, v]) => {
      if (/^_/.test(k)) return;
      const nome = prefixo ? `${prefixo} › ${titulizar(k)}` : titulizar(k);
      if (v && typeof v === "object" && !Array.isArray(v) && nivel < 2) achatar(v, nome, saida, nivel + 1);
      else saida.push({ rotulo: nome, valor: Array.isArray(v) ? v.map(textoSimples).join(", ") : textoSimples(v) });
    });
    return saida;
  }

  function camposDeObjeto(obj) {
    if (!obj || typeof obj !== "object") return [];
    return achatar(obj, "", [], 0);
  }

  function tabelaDeLista(lista) {
    const itens = (lista || []).filter((i) => i && typeof i === "object");
    if (!itens.length) {
      // lista de valores soltos
      const soltos = (lista || []).map(textoSimples).filter(Boolean);
      return soltos.length ? { colunas: ["Valor"], linhas: soltos.map((v) => [v]) } : null;
    }

    const chaves = [];
    itens.forEach((i) => Object.keys(i).forEach((k) => {
      if (!/^_/.test(k) && !chaves.includes(k)) chaves.push(k);
    }));

    const matriz = itens.map((i) => chaves.map((k) => textoSimples(i[k])));
    const usar = chaves.map((k, c) => matriz.some((l) => l[c] !== "")).map((u, c) => (u ? c : -1)).filter((c) => c >= 0);

    if (!usar.length) return null;
    return {
      colunas: usar.map((c) => titulizar(chaves[c])),
      linhas: matriz.map((l) => usar.map((c) => l[c]))
    };
  }

  const api = {
    extrairHtml,
    listaDeJson,
    totalDeJson,
    tabelaDeLista,
    camposDeObjeto,
    textoSimples,
    titulizar
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.AndamentoParser = api;
})(typeof self !== "undefined" ? self : this);
