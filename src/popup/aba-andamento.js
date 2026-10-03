// Consulta da aba Solicitação: mostra dentro da extensão o que a página de andamento da
// solicitação exibe na AR (dados, histórico, pessoas envolvidas, documentos).
//
// Quem consulta é o background (consultarAndamento), com a sessão do próprio
// atendente; aqui só se lê o resultado (AndamentoParser) e se desenha. Nada
// do que volta é gravado: só o código vai para o histórico de recentes.
//
// Todo texto vindo da AR entra na tela por textContent, nunca por innerHTML.

(() => {
  const campo = $("codigoSolicitacao");
  const botao = $("consultarAndamentoBtn");
  const aviso = $("avisoSolicitacao");
  const escolha = $("andamentoEscolha");
  const resultado = $("andamentoResultado");
  const titulo = $("andamentoTitulo");
  const cabecalhoEl = $("andamentoCabecalho");
  const containerSecoes = $("andamentoSecoes");
  const botaoCopiarTudo = $("andamentoCopiarBtn");
  const botaoAbrir = $("andamentoAbrirBtn");
  const botaoAtualizar = $("andamentoAtualizarBtn");

  let consultaAtual = 0; // descarta resposta de uma consulta que já foi superada
  let ultimo = null; // { codigo, id, urlAndamento, cabecalho, secoes }

  /* Utilitários ---------------------------------------------------- */

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }

  async function copiar(texto, botaoOrigem, rotuloOriginal) {
    try {
      await navigator.clipboard.writeText(texto);
      if (botaoOrigem) {
        botaoOrigem.textContent = "Copiado";
        setTimeout(() => (botaoOrigem.textContent = rotuloOriginal), 1500);
      }
    } catch {
      mostrarAviso(aviso, "Não foi possível copiar.", "erro");
    }
  }

  function textoDaSecao(secao) {
    const linhas = [secao.titulo];
    secao.campos.forEach((c) => linhas.push(c.rotulo ? `${c.rotulo}: ${c.valor}` : c.valor));
    secao.tabelas.forEach((t) => {
      linhas.push(t.colunas.join(" | "));
      t.linhas.forEach((l) => linhas.push(l.join(" | ")));
    });
    secao.notas.forEach((n) => linhas.push(n));
    return linhas.join("\n");
  }

  /* Montagem do modelo --------------------------------------------- */

  function secaoVazia(tituloSecao, extras) {
    return { titulo: tituloSecao, campos: [], tabelas: [], notas: [], ...extras };
  }

  function secaoDeGrid(tituloSecao, parte) {
    const secao = secaoVazia(tituloSecao);
    if (parte.erro) {
      secao.notas.push(`Não foi possível carregar: ${parte.erro}`);
      secao.falhou = true;
      return secao;
    }

    const lista = AndamentoParser.listaDeJson(parte.json);
    const tabela = lista ? AndamentoParser.tabelaDeLista(lista) : null;

    if (tabela) {
      secao.tabelas.push(tabela);
      const total = AndamentoParser.totalDeJson(parte.json);
      if (total && total > tabela.linhas.length) {
        secao.notas.push(`Mostrando ${tabela.linhas.length} de ${total} registros.`);
      }
    } else if (lista) {
      secao.notas.push("Nenhum registro.");
    } else {
      // resposta que não é lista (ex.: resultado de uma validação)
      secao.campos.push(...AndamentoParser.camposDeObjeto(parte.json));
      if (!secao.campos.length) secao.notas.push("Nenhum registro.");
    }
    return secao;
  }

  function montarModelo(r) {
    const secoes = [];
    let cabecalho = "";

    const itens = r.itens.filter((i) => i && typeof i === "object");
    const item = itens.find((i) => String(i.idCDsolicitacao) === r.id) || itens[0];
    const resumo = secaoVazia("Resumo da busca");
    resumo.campos = AndamentoParser.camposDeObjeto(item).filter((c) => c.valor !== "");
    if (resumo.campos.length) secoes.push(resumo);

    let textoCompleto = "";
    if (r.andamento.erro) {
      const s = secaoVazia("Página de andamento");
      s.notas.push(`Não foi possível carregar: ${r.andamento.erro}`);
      s.falhou = true;
      secoes.push(s);
    } else {
      try {
        const lido = AndamentoParser.extrairHtml(r.andamento.texto);
        cabecalho = lido.cabecalho || "";
        secoes.push(...lido.secoes);
        textoCompleto = lido.texto;
      } catch (erro) {
        // o leitor falhou: mostra o texto cru da página em vez de perder tudo
        console.error("Apoio Soluti: leitor do andamento falhou", erro);
        const s = secaoVazia("Página de andamento");
        s.notas.push(`Não foi possível organizar a página (${erro.message || erro}).`);
        s.falhou = true;
        secoes.push(s);
      }
    }

    [
      ["Histórico", r.historico],
      ["Pessoas envolvidas", r.pessoas],
      ["Documentos anexos", r.documentos]
    ].forEach(([nome, parte]) => {
      try {
        secoes.push(secaoDeGrid(nome, parte));
      } catch (erro) {
        console.error(`Apoio Soluti: falha ao ler ${nome}`, erro);
        const s = secaoVazia(nome);
        s.notas.push(`Não foi possível ler esta parte (${erro.message || erro}).`);
        s.falhou = true;
        secoes.push(s);
      }
    });

    if (textoCompleto) {
      secoes.push(secaoVazia("Texto completo da página", { notas: [textoCompleto], preformatado: true, fechada: true }));
    }
    return { secoes, cabecalho };
  }

  /* Desenho -------------------------------------------------------- */

  function desenharTabela(t) {
    const envoltorio = el("div", "and-tabela-wrap");
    const tabela = el("table", "and-tabela");
    const cabeca = el("thead");
    const linhaCab = el("tr");
    t.colunas.forEach((c) => linhaCab.appendChild(el("th", "", c)));
    cabeca.appendChild(linhaCab);
    tabela.appendChild(cabeca);

    const corpo = el("tbody");
    t.linhas.forEach((l) => {
      const tr = el("tr");
      t.colunas.forEach((_, i) => tr.appendChild(el("td", "", l[i] || "")));
      corpo.appendChild(tr);
    });
    tabela.appendChild(corpo);
    envoltorio.appendChild(tabela);
    return envoltorio;
  }

  function desenharSecao(secao) {
    const card = el("div", "databricks-card" + (secao.fechada ? "" : " aberto"));

    const cab = el("div", "databricks-card-cabecalho");
    const seta = el("span", "databricks-card-seta", "▶");
    const tit = el("div", "databricks-card-titulo");

    const quantidade = secao.tabelas.reduce((n, t) => n + t.linhas.length, 0) || secao.campos.length;
    const nome = el("span", "databricks-card-situacao" + (secao.falhou ? " alerta" : ""));
    nome.textContent = quantidade && !secao.preformatado ? `${secao.titulo} · ${quantidade}` : secao.titulo;
    tit.appendChild(nome);

    const acoes = el("div", "databricks-card-acoes");
    const copiarSecao = el("button", "link-btn", "Copiar");
    copiarSecao.type = "button";
    copiarSecao.addEventListener("click", (evento) => {
      evento.stopPropagation();
      copiar(secao.preformatado ? secao.notas[0] : textoDaSecao(secao), copiarSecao, "Copiar");
    });
    acoes.appendChild(copiarSecao);

    cab.append(seta, tit, acoes);
    cab.addEventListener("click", () => card.classList.toggle("aberto"));

    const corpo = el("div", "databricks-card-corpo");

    if (secao.campos.length) {
      const linhas = el("div", "databricks-linhas");
      secao.campos.forEach((c) => {
        const linha = el("div", "databricks-linha");
        if (c.rotulo) linha.appendChild(el("span", "sdeal-rotulo", c.rotulo));
        const valor = el("span", "sdeal-valor and-valor", c.valor || "—");
        valor.title = "Clique para copiar";
        valor.addEventListener("click", () => {
          copiar(c.valor, null);
          valor.classList.add("and-copiado");
          setTimeout(() => valor.classList.remove("and-copiado"), 700);
        });
        linha.appendChild(valor);
        linhas.appendChild(linha);
      });
      corpo.appendChild(linhas);
    }

    secao.tabelas.forEach((t) => corpo.appendChild(desenharTabela(t)));

    secao.notas.forEach((n) => {
      corpo.appendChild(secao.preformatado ? el("pre", "and-pre", n) : el("p", "and-nota", n));
    });

    card.append(cab, corpo);
    return card;
  }

  function desenharEscolha(r, codigo) {
    escolha.textContent = "";
    const itens = r.itens.filter((i) => i && typeof i === "object");
    if (itens.length < 2) {
      escolha.classList.add("hidden");
      return;
    }

    escolha.appendChild(el("span", "historico-rotulo", `${itens.length} solicitações com esse código:`));
    itens.forEach((i) => {
      const id = String(i.idCDsolicitacao ?? "");
      if (!id) return;
      const b = el("button", "historico-chip-valor and-escolha-item" + (id === r.id ? " ativo" : ""), `#${id}`);
      b.type = "button";
      b.addEventListener("click", () => consultar(codigo, id));
      escolha.appendChild(b);
    });
    escolha.classList.remove("hidden");
  }

  function desenhar(r, codigo, secoes, cabecalho) {
    titulo.textContent = `${codigo} · AR ${r.subdominio} · nº ${r.id}`;
    cabecalhoEl.textContent = cabecalho || "";
    cabecalhoEl.classList.toggle("hidden", !cabecalho);
    containerSecoes.textContent = "";
    secoes.forEach((s) => containerSecoes.appendChild(desenharSecao(s)));
    desenharEscolha(r, codigo);
    resultado.classList.remove("hidden");
  }

  /* Avisos --------------------------------------------------------- */

  function avisarSessaoExpirada(r, codigo) {
    mostrarAviso(
      aviso,
      `Sem sessão na AR ${r.subdominio}. Entre com o certificado digital e consulte de novo.`,
      "erro"
    );

    const login = el("button", "ferramenta-aviso-abrir", "Entrar com certificado");
    login.type = "button";
    login.title = "Abre o login da AR em uma nova aba (o PIN do token é pedido lá)";
    login.addEventListener("click", () => chrome.tabs.create({ url: r.loginUrl }));

    const tentar = el("button", "ferramenta-aviso-abrir", "Tentar de novo");
    tentar.type = "button";
    tentar.addEventListener("click", () => consultar(codigo));

    aviso.append(login, tentar);
  }

  /* Consulta ------------------------------------------------------- */

  async function consultar(codigoDigitado, id) {
    const codigo = (codigoDigitado ?? campo.value).trim();
    if (!codigo) {
      mostrarAviso(aviso, "Digite o código da solicitação.", "erro");
      campo.focus();
      return;
    }
    campo.value = codigo;

    const minha = ++consultaAtual;
    const rotulo = "Consultar";
    botao.disabled = true;
    botao.textContent = "Consultando...";
    mostrarAviso(aviso, "Consultando a AR...", "");

    const falhar = (texto) => {
      ultimo = null;
      resultado.classList.add("hidden");
      escolha.classList.add("hidden");
      mostrarAviso(aviso, texto, "erro");
    };

    try {
      let r;
      try {
        r = await chrome.runtime.sendMessage({ tipo: "consultarAndamento", codigo, id });
      } catch (erro) {
        if (minha !== consultaAtual) return;
        falhar(`Não foi possível falar com a extensão (${erro?.message || erro}). Recarregue a extensão em chrome://extensions.`);
        return;
      }
      if (minha !== consultaAtual) return;

      if (!r) {
        falhar("A extensão não respondeu. Recarregue a extensão em chrome://extensions (o serviço em segundo plano pode estar desatualizado).");
        return;
      }

      if (r.sessaoExpirada) {
        falhar("");
        avisarSessaoExpirada(r, codigo);
        return;
      }

      if (r.erro) {
        falhar(r.erro);
        return;
      }

      let modelo;
      try {
        modelo = montarModelo(r);
        ultimo = { codigo, id: r.id, urlAndamento: r.urlAndamento, cabecalho: modelo.cabecalho, secoes: modelo.secoes };
        desenhar(r, codigo, modelo.secoes, modelo.cabecalho);
      } catch (erro) {
        console.error("Apoio Soluti: falha ao montar o andamento", erro);
        falhar(`A AR respondeu, mas não consegui montar o resultado (${erro?.message || erro}).`);
        return;
      }

      const falhas = modelo.secoes.filter((s) => s.falhou).length;
      if (falhas) {
        mostrarAviso(
          aviso,
          `${falhas} ${falhas === 1 ? "parte não carregou" : "partes não carregaram"} — a sessão pode ter expirado.`,
          "erro"
        );
      } else {
        mostrarAviso(aviso, "Pronto.", "ok");
      }
      salvarNoHistorico("solicitacao", codigo);
    } finally {
      if (minha === consultaAtual) {
        botao.disabled = false;
        botao.textContent = rotulo;
      }
    }
  }

  /* Ligações ------------------------------------------------------- */

  botao.addEventListener("click", () => consultar());
  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") botao.click();
  });

  botaoAtualizar.addEventListener("click", () => {
    if (ultimo) consultar(ultimo.codigo, ultimo.id);
  });

  botaoAbrir.addEventListener("click", () => {
    if (ultimo?.urlAndamento) chrome.tabs.create({ url: ultimo.urlAndamento });
  });

  botaoCopiarTudo.addEventListener("click", () => {
    if (!ultimo) return;
    const texto = [
      ultimo.cabecalho,
      ...ultimo.secoes.filter((s) => !s.preformatado).map(textoDaSecao)
    ].filter(Boolean).join("\n\n");
    copiar(texto, botaoCopiarTudo, "Copiar tudo");
  });
})();
