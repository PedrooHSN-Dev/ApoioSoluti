const EMAILS_EQUIPE = window.EMAILS_EQUIPE || [];

let meusModelos = [];

// ids de modelos da equipe que a pessoa excluiu (ver ApoioEmails.lerOcultos).
// Mesma ideia dos macros da equipe: o modelo mora no codigo e nao se apaga,
// so sai de vista — e volta pelo "Restaurar" no fim da lista.
let modelosOcultos = [];

function normalizarModelos(lista) {
  let precisaSalvar = false;

  const normalizados = (Array.isArray(lista) ? lista : [])
    .filter((item) => item && item.nome && item.corpo)
    .map((item) => {
      if (!item.id) precisaSalvar = true;

      return {
        id: item.id || gerarId(),
        nome: String(item.nome),
        assunto: String(item.assunto || ""),
        corpo: String(item.corpo),
        cco: String(item.cco || "").trim(),
        origem: "usuario"
      };
    });

  return { normalizados, precisaSalvar };
}

function modelosDaEquipe() {
  const usados = new Set(meusModelos.map((item) => item.nome.toLowerCase()));

  return EMAILS_EQUIPE.filter((item) => item && item.nome && item.corpo)
    .map((item) => ({
      id: item.id || `equipe-${item.nome}`,
      nome: String(item.nome),
      assunto: String(item.assunto || ""),
      corpo: String(item.corpo),
      cco: String(item.cco || "").trim(),
      rotulos: item.rotulos || {},
      origem: "equipe",
      // modelo pessoal com o mesmo nome tem prioridade no envio
      substituido: usados.has(String(item.nome).toLowerCase())
    }))
    // filtrar aqui, e nao so na hora de desenhar, e o que tira o modelo
    // excluido tambem do seletor de envio: os dois saem desta funcao
    .filter((modelo) => !modelosOcultos.includes(modelo.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function meusModelosOrdenados() {
  return [...meusModelos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function carregarModelosEmail() {
  const [guardados, ocultos] = await Promise.all([
    window.ApoioEmails.ler(),
    window.ApoioEmails.lerOcultos()
  ]);
  const { normalizados, precisaSalvar } = normalizarModelos(guardados);

  meusModelos = normalizados;
  modelosOcultos = ocultos;

  // recupera bases antigas gravadas sem id
  if (precisaSalvar) await salvarModelosEmail();

  // depende de meusModelos ja carregado: leva o Cco antigo para os modelos
  // certos antes de a tela ser desenhada
  await migrarCcoFixo();

  renderizarModelosEmail();
  renderizarNoticiaCco();
}

async function salvarModelosEmail() {
  const sincronizou = await window.ApoioEmails.salvar(
    meusModelos.map(({ id, nome, assunto, corpo, cco }) => ({
      id,
      nome,
      assunto,
      corpo,
      cco
    }))
  );

  $("avisoSyncEmails").classList.toggle("hidden", sincronizou !== false);
}

// os campos a preencher sao os {marcadores} do texto. {saudacao} fica de
// fora: quem resolve e o relogio, nao o atendente.
function marcadoresDoModelo(modelo) {
  const texto = `${modelo?.assunto || ""} ${modelo?.corpo || ""}`;
  const chaves = [];

  for (const achado of texto.matchAll(/\{(\w+)\}/g)) {
    const chave = achado[1];
    if (chave.toLowerCase() === "saudacao") continue;
    if (!chaves.includes(chave)) chaves.push(chave);
  }

  return chaves;
}

function resolverTextoEmail(texto, valores) {
  return (texto || "")
    .replace(/\{saudacao\}/gi, window.ApoioMacros.saudacaoAtual())
    .replace(/\{(\w+)\}/g, (match, chave) => valores[chave] || match);
}

function emailValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((valor || "").trim());
}

/* Copia oculta, por modelo -------------------------------------------
   Cada modelo tem o seu Cco, ou nenhum. Quem grava e o formulario do
   modelo, junto do assunto e do corpo; a tela de envio so mostra.

   O endereco viaja na mensagem ate o background. Ele NAO le mais o Cco
   por conta propria, como fazia quando era uma chave so valida para todo
   envio: agora o Cco pertence ao modelo, e so quem escolheu o modelo
   sabe qual e.

   Um Cco silencioso surpreenderia o proprio atendente meses depois, por
   isso ele aparece duas vezes antes de sair: na previa e na confirmacao.
   Oculto e para quem recebe, nao para quem manda.
   ------------------------------------------------------------------ */

// Versao anterior: um endereco so, na chave "ccoFixo", valido para todo
// e-mail enviado. A migracao abaixo roda uma vez, leva esse endereco para
// os modelos que devem continuar copiando e apaga a chave. Enquanto a
// chave existir, a migracao ainda nao rodou — nao precisa de outra marca.
//
// CODIGO COM PRAZO: depois que todo atendente tiver aberto o popup uma vez
// (a chave some na primeira abertura), este bloco inteiro — as tres
// constantes, lerCcoAntigo e migrarCcoFixo — pode ser apagado, junto com a
// chamada em carregarModelosEmail.
const CHAVE_CCO_ANTIGO = "ccoFixo";

// so os modelos de PIN/PUK herdam o endereco antigo. Os demais comecam sem
// Cco, que e justamente o ponto da mudanca.
const HERDA_CCO_ANTIGO = /pin|puk/i;

// o que a migracao fez fica guardado ate o atendente dizer que leu. Se o
// aviso morresse junto com o popup, um endereco que deixou de ser copiado
// passaria batido — e Cco que some so aparece quando faz falta.
const CHAVE_NOTICIA_CCO = "ccoMigradoAviso";

async function lerCcoAntigo() {
  for (const area of [chrome.storage.sync, chrome.storage.local]) {
    try {
      const dados = await area.get(CHAVE_CCO_ANTIGO);
      if (typeof dados[CHAVE_CCO_ANTIGO] === "string") {
        return dados[CHAVE_CCO_ANTIGO].trim();
      }
    } catch {}
  }

  // a chave nao existe em lugar nenhum: ou a migracao ja rodou, ou esta
  // instalacao nunca teve Cco fixo
  return null;
}

// A ordem dos passos aqui e deliberada: o aviso e gravado ANTES de a chave
// antiga ser apagada. Ele guarda o endereco, entao enquanto ele existir o
// endereco existe em algum lugar. Se a gravacao dos modelos falhasse depois
// de a chave ja ter sumido, sem o aviso o endereco estaria perdido — e um
// Cco perdido so aparece quando alguem sente falta da copia.
async function migrarCcoFixo() {
  const endereco = await lerCcoAntigo();

  // a chave nao existe: ou ja migrou, ou nunca houve Cco fixo
  if (endereco === null) return;

  const herdaram = endereco
    ? meusModelos.filter((modelo) => HERDA_CCO_ANTIGO.test(modelo.nome))
    : [];

  // 1. registra o que vai acontecer, com o endereco por extenso
  if (endereco) {
    try {
      await chrome.storage.local.set({
        [CHAVE_NOTICIA_CCO]: {
          endereco,
          modelos: herdaram.map((modelo) => modelo.nome)
        }
      });
    } catch {}
  }

  // 2. apaga a chave antiga: e ela que marca a migracao como pendente, e
  //    apagar aqui impede que uma segunda passagem reescreva um Cco que o
  //    atendente ja tenha ajustado a mao
  for (const area of [chrome.storage.sync, chrome.storage.local]) {
    try {
      await area.remove(CHAVE_CCO_ANTIGO);
    } catch {}
  }

  // 3. leva o endereco para os modelos que continuam copiando
  if (!herdaram.length) return;

  herdaram.forEach((modelo) => {
    modelo.cco = endereco;
  });

  await salvarModelosEmail();
}

async function renderizarNoticiaCco() {
  let noticia = null;

  try {
    const dados = await chrome.storage.local.get(CHAVE_NOTICIA_CCO);
    noticia = dados[CHAVE_NOTICIA_CCO] || null;
  } catch {}

  if (!noticia?.endereco) return;

  const mantidos = noticia.modelos?.length
    ? `Ele ficou em: ${noticia.modelos.join(", ")}.`
    : "Nenhum modelo herdou o endereço automaticamente.";

  $("noticiaCcoTexto").textContent =
    `O Cco agora é de cada modelo, não mais fixo para todos. ` +
    `O endereço anterior era ${noticia.endereco}. ${mantidos} ` +
    `Os outros modelos começaram sem Cco — abra o modelo para acrescentar ` +
    `onde precisar.`;

  $("noticiaCco").classList.remove("hidden");
}

$("noticiaCcoOkBtn").addEventListener("click", async () => {
  $("noticiaCco").classList.add("hidden");

  try {
    await chrome.storage.local.remove(CHAVE_NOTICIA_CCO);
  } catch {}
});

/* Bloco "Enviar" ---------------------------------------------------- */

// os da equipe que foram substituidos ficam de fora: o pessoal de mesmo
// nome ja esta na lista, e dois itens iguais no select so confundiriam
function modelosParaEnvio() {
  return [
    ...meusModelosOrdenados(),
    ...modelosDaEquipe().filter((modelo) => !modelo.substituido)
  ];
}

function modeloEmailAtual() {
  const id = $("tipoEmail").value;
  const disponiveis = modelosParaEnvio();
  return disponiveis.find((modelo) => modelo.id === id) || disponiveis[0];
}

function preencherSelectEmails() {
  const select = $("tipoEmail");
  const anterior = select.value;

  select.innerHTML = "";

  const grupos = [
    { rotulo: "Meus modelos", itens: meusModelosOrdenados() },
    {
      rotulo: "Da equipe",
      itens: modelosDaEquipe().filter((modelo) => !modelo.substituido)
    }
  ];

  grupos.forEach((grupo) => {
    if (!grupo.itens.length) return;

    const optgroup = document.createElement("optgroup");
    optgroup.label = grupo.rotulo;

    grupo.itens.forEach((modelo) => {
      const opcao = document.createElement("option");
      opcao.value = modelo.id;
      opcao.textContent = modelo.nome;
      optgroup.appendChild(opcao);
    });

    select.appendChild(optgroup);
  });

  // mantem o modelo escolhido quando a lista e redesenhada (edicao, sync,
  // outra janela do popup)
  if (anterior && select.querySelector(`option[value="${CSS.escape(anterior)}"]`)) {
    select.value = anterior;
  }
}

function renderizarCamposExtrasEmail() {
  const modelo = modeloEmailAtual();
  const container = $("camposExtrasEmail");

  // o que ja estava digitado sobrevive ao redesenho, desde que o marcador
  // continue existindo no modelo
  const anteriores = valoresExtrasEmail();

  container.innerHTML = "";

  marcadoresDoModelo(modelo).forEach((chave) => {
    const grupo = document.createElement("div");
    grupo.className = "campo-email";

    const rotulo = document.createElement("label");
    rotulo.className = "campo-rotulo";
    rotulo.setAttribute("for", `campoExtraEmail-${chave}`);
    rotulo.textContent = modelo?.rotulos?.[chave] || chave;

    const input = document.createElement("input");
    input.id = `campoExtraEmail-${chave}`;
    input.type = "text";
    input.autocomplete = "off";
    input.dataset.chave = chave;
    input.value = anteriores[chave] || "";
    input.addEventListener("input", atualizarPreviaEmail);

    grupo.appendChild(rotulo);
    grupo.appendChild(input);
    container.appendChild(grupo);
  });

  atualizarPreviaEmail();
}

function valoresExtrasEmail() {
  const valores = {};
  $("camposExtrasEmail")
    .querySelectorAll("input")
    .forEach((input) => {
      valores[input.dataset.chave] = input.value.trim();
    });
  return valores;
}

function atualizarPreviaEmail() {
  const modelo = modeloEmailAtual();
  const destinatario = $("destinatarioEmail").value.trim();
  const extras = valoresExtrasEmail();
  const valores = { destinatario, ...extras };

  const cco = modelo?.cco || "";
  $("previaEmailCco").textContent = cco;
  $("previaEmailCcoCampo").classList.toggle("hidden", !cco);

  $("previaEmailAssunto").textContent = resolverTextoEmail(modelo?.assunto, valores);
  $("previaEmailCorpo").textContent = resolverTextoEmail(modelo?.corpo, valores);

  const camposPreenchidos = marcadoresDoModelo(modelo).every(
    (chave) => extras[chave]
  );

  $("enviarEmailBtn").disabled =
    !modelo || !emailValido(destinatario) || !camposPreenchidos;
  $("confirmarEmailCard").classList.add("hidden");
}

$("tipoEmail").addEventListener("change", renderizarCamposExtrasEmail);
$("destinatarioEmail").addEventListener("input", atualizarPreviaEmail);

$("enviarEmailBtn").addEventListener("click", () => {
  const modelo = modeloEmailAtual();
  $("confirmarEmailTipo").textContent = modelo?.nome || "";
  $("confirmarEmailPara").textContent = $("destinatarioEmail").value.trim();

  const cco = modelo?.cco || "";
  $("confirmarEmailCcoEndereco").textContent = cco;
  $("confirmarEmailCco").classList.toggle("hidden", !cco);

  $("confirmarEmailCard").classList.remove("hidden");
  mostrarAviso($("avisoEmail"), "", "");
});

$("confirmarEmailNaoBtn").addEventListener("click", () => {
  $("confirmarEmailCard").classList.add("hidden");
});

$("confirmarEmailSimBtn").addEventListener("click", async () => {
  const modelo = modeloEmailAtual();
  const destinatario = $("destinatarioEmail").value.trim();
  const valores = { destinatario, ...valoresExtrasEmail() };

  const assunto = resolverTextoEmail(modelo?.assunto, valores);
  const corpo = resolverTextoEmail(modelo?.corpo, valores);

  $("confirmarEmailCard").classList.add("hidden");
  $("enviarEmailBtn").disabled = true;
  mostrarAviso($("avisoEmail"), "Enviando pelo Outlook Web...", "");

  try {
    const resposta = await chrome.runtime.sendMessage({
      tipo: "enviarEmailOutlook",
      destinatario,
      assunto,
      corpo,
      cco: modelo?.cco || ""
    });

    if (!resposta || resposta.erro) {
      mostrarAviso(
        $("avisoEmail"),
        resposta?.erro || "Não foi possível enviar o e-mail.",
        "erro"
      );
    } else if (resposta.enviado) {
      mostrarAviso($("avisoEmail"), "E-mail enviado.", "ok");
    } else {
      mostrarAviso(
        $("avisoEmail"),
        "O rascunho foi aberto no Outlook, mas não consegui confirmar o envio automático — confira a aba.",
        "erro"
      );
    }
  } catch {
    mostrarAviso($("avisoEmail"), "Não foi possível falar com a extensão.", "erro");
  } finally {
    // reavalia o botao pelas regras de validade, em vez de so reabilitar
    atualizarPreviaEmail();
  }
});

/* Bloco "Modelos" --------------------------------------------------- */

function abrirFormularioModelo(modelo = null) {
  $("formularioModelo").classList.remove("hidden");

  $("modeloId").value = modelo?.id || "";
  $("modeloNome").value = modelo?.nome || "";
  $("modeloAssunto").value = modelo?.assunto || "";
  $("modeloCorpo").value = modelo?.corpo || "";
  $("modeloCco").value = modelo?.cco || "";

  $("modeloNome").focus();
}

function fecharFormularioModelo() {
  $("formularioModelo").classList.add("hidden");
  $("modeloId").value = "";
  $("modeloNome").value = "";
  $("modeloAssunto").value = "";
  $("modeloCorpo").value = "";
  $("modeloCco").value = "";
}

async function salvarFormularioModelo() {
  const id = $("modeloId").value;
  const nome = $("modeloNome").value.trim();
  const assunto = $("modeloAssunto").value.trim();
  const corpo = $("modeloCorpo").value.trim();
  const cco = $("modeloCco").value.trim();

  if (!nome || !assunto || !corpo) {
    alert("Preencha o nome, o assunto e o corpo do modelo.");
    return;
  }

  // vazio e valido, e e o normal: quer dizer que este modelo nao copia
  // ninguem. So o endereco malformado e recusado.
  if (cco && !emailValido(cco)) {
    alert("O endereço do Cco não parece válido.");
    return;
  }

  const duplicado = meusModelos.some(
    (modelo) =>
      modelo.nome.toLowerCase() === nome.toLowerCase() && modelo.id !== id
  );

  if (duplicado) {
    alert("Você já tem um modelo com esse nome.");
    return;
  }

  const existente = id && meusModelos.find((modelo) => modelo.id === id);

  if (existente) {
    existente.nome = nome;
    existente.assunto = assunto;
    existente.corpo = corpo;
    existente.cco = cco;
  } else {
    meusModelos.push({
      id: gerarId(),
      nome,
      assunto,
      corpo,
      cco,
      origem: "usuario"
    });
  }

  await salvarModelosEmail();

  fecharFormularioModelo();
  renderizarModelosEmail();
}

async function excluirModelo(id) {
  const meu = meusModelos.find((item) => item.id === id);
  const daEquipe = !meu && modelosDaEquipe().find((item) => item.id === id);
  const modelo = meu || daEquipe;

  if (!modelo) return;
  if (!confirm(`Excluir o modelo "${modelo.nome}"?`)) return;

  if (meu) {
    meusModelos = meusModelos.filter((item) => item.id !== id);
    await salvarModelosEmail();
  } else {
    modelosOcultos = [...new Set([...modelosOcultos, id])];
    await window.ApoioEmails.salvarOcultos(modelosOcultos);
  }

  renderizarModelosEmail();
}

function criarItemModelo(modelo) {
  const item = document.createElement("li");
  item.className = "item";

  const meio = document.createElement("div");
  meio.className = "item-meio";

  const nome = document.createElement("span");
  nome.className = "comando";
  nome.textContent = modelo.nome;
  meio.appendChild(nome);

  const marcadores = marcadoresDoModelo(modelo);
  if (marcadores.length) {
    const etiqueta = document.createElement("span");
    etiqueta.className = "modelo-marcadores";
    etiqueta.textContent = marcadores.map((chave) => `{${chave}}`).join(" ");
    meio.appendChild(etiqueta);
  }

  // quem copia quem precisa aparecer na lista: um Cco so descoberto ao
  // abrir o modelo e um Cco que ninguem confere
  if (modelo.cco) {
    const etiquetaCco = document.createElement("span");
    etiquetaCco.className = "modelo-cco";
    etiquetaCco.textContent = `Cco ${modelo.cco}`;
    meio.appendChild(etiquetaCco);
  }

  item.appendChild(meio);

  if (modelo.origem === "equipe" && modelo.substituido) {
    const aviso = document.createElement("span");
    aviso.className = "tag-substituido";
    aviso.textContent = "substituído";
    item.appendChild(aviso);
  }

  const botoes = document.createElement("div");
  botoes.className = "acoes";

  const daEquipe = modelo.origem === "equipe";

  // nos da equipe o lapis abre uma copia pessoal: o original e o mesmo para
  // todo mundo e nao se edita daqui
  function editarModelo() {
    abrirFormularioModelo(
      daEquipe
        ? {
            id: "",
            nome: modelo.nome,
            assunto: modelo.assunto,
            corpo: modelo.corpo,
            cco: modelo.cco
          }
        : modelo
    );
  }

  botoes.appendChild(
    criarBotaoIcone(
      "editar",
      daEquipe ? "Editar cópia" : "Editar",
      ICONE_LAPIS,
      (evento) => {
        evento.stopPropagation();
        editarModelo();
      }
    )
  );

  // o da equipe tambem sai: o original fica no codigo e so some de vista,
  // entao o "Restaurar" no fim da lista traz todos de volta
  botoes.appendChild(
    criarBotaoIcone(
      "excluir",
      daEquipe ? "Excluir (dá para restaurar)" : "Excluir",
      ICONE_LIXEIRA,
      (evento) => {
        evento.stopPropagation();
        excluirModelo(modelo.id);
      }
    )
  );

  item.appendChild(botoes);

  // a linha inteira abre a edicao: o lapis e o atalho visivel disso
  item.addEventListener("click", editarModelo);

  return item;
}

function renderizarModelosEmail() {
  // o select do envio e a lista saem da mesma base: um redesenho atualiza
  // os dois, senao o envio continuaria oferecendo um modelo ja apagado
  preencherSelectEmails();
  renderizarCamposExtrasEmail();

  const lista = $("listaModelos");
  lista.innerHTML = "";

  const meus = meusModelosOrdenados();
  const equipe = modelosDaEquipe();
  const total = meus.length + equipe.length;

  $("contadorModelos").textContent =
    `${total} modelo` + (total === 1 ? "" : "s");

  if (!total) {
    const vazio = document.createElement("li");
    vazio.className = "lista-vazia";
    vazio.textContent =
      "Nenhum modelo cadastrado. Clique em Criar modelo para começar.";
    lista.appendChild(vazio);

    // quem escondeu TODOS os da equipe e nao tem os seus cai aqui: sem
    // isto, a lista ficaria vazia e sem como desfazer
    renderizarAvisoModelosOcultos(lista);
    return;
  }

  if (meus.length) {
    lista.appendChild(criarCabecalhoGrupo("Meus modelos"));
    meus.forEach((modelo) => lista.appendChild(criarItemModelo(modelo)));
  }

  if (equipe.length) {
    lista.appendChild(criarCabecalhoGrupo("Da equipe"));
    equipe.forEach((modelo) => lista.appendChild(criarItemModelo(modelo)));
  }

  renderizarAvisoModelosOcultos(lista);
}

// Sem esta linha um modelo da equipe excluido sumiria sem deixar rastro, e
// nao haveria como trazer de volta.
function renderizarAvisoModelosOcultos(lista) {
  const existentes = new Set(
    EMAILS_EQUIPE.filter((item) => item && item.nome && item.corpo)
      .map((item) => item.id || `equipe-${item.nome}`)
  );
  const n = modelosOcultos.filter((id) => existentes.has(id)).length;
  if (!n) return;

  const linha = document.createElement("li");
  linha.className = "lista-vazia ocultos-aviso";
  linha.appendChild(
    document.createTextNode(`${n} modelo(s) da equipe oculto(s). `)
  );

  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "link-btn";
  botao.textContent = "Restaurar";
  botao.addEventListener("click", async () => {
    if (!confirm(`Restaurar os ${n} modelos da equipe ocultos?`)) return;
    modelosOcultos = [];
    await window.ApoioEmails.salvarOcultos([]);
    renderizarModelosEmail();
  });
  linha.appendChild(botao);
  lista.appendChild(linha);
}

// outra janela do popup, ou o sync, mexeu na lista de ocultos
window.ApoioEmails.aoMudarOcultos((ids) => {
  modelosOcultos = ids;
  renderizarModelosEmail();
});

$("novoModeloBtn").addEventListener("click", () => abrirFormularioModelo());
$("cancelarModeloBtn").addEventListener("click", fecharFormularioModelo);
$("salvarModeloBtn").addEventListener("click", salvarFormularioModelo);

/* Escopo da aba (Enviar / Modelos) ---------------------------------- */

function trocarEscopoEmail(escopo) {
  const enviar = escopo === "enviar";

  $("escopoEnviarEmail").classList.toggle("ativo", enviar);
  $("escopoModelosEmail").classList.toggle("ativo", !enviar);

  $("bloco-enviar-email").classList.toggle("hidden", !enviar);
  $("bloco-modelos-email").classList.toggle("hidden", enviar);

  if (enviar) $("destinatarioEmail").focus();
}

$("escopoEnviarEmail").addEventListener("click", () =>
  trocarEscopoEmail("enviar")
);
$("escopoModelosEmail").addEventListener("click", () =>
  trocarEscopoEmail("modelos")
);

// outra janela do popup ou outro dispositivo pelo sync
window.ApoioEmails.aoMudar((lista) => {
  const { normalizados } = normalizarModelos(lista);
  meusModelos = normalizados;
  renderizarModelosEmail();
});


/* Exportar / importar modelos ---------------------------------------
   Mesmo formato do backup da aba Começar ({ modelosEmail: [...] }), então
   um arquivo serve nos dois lugares. Só os SEUS modelos saem: os da equipe
   vêm no código da extensão e reexportá-los criaria cópias pessoais.
   ------------------------------------------------------------------ */

function exportarModelos() {
  const aviso = $("avisoModelos");

  if (!meusModelos.length) {
    mostrarAviso(aviso, "Você ainda não tem modelos próprios para exportar.", "erro");
    return;
  }

  baixarJson(
    {
      versao: chrome.runtime.getManifest().version,
      exportadoEm: new Date().toISOString(),
      modelosEmail: meusModelos.map(({ nome, assunto, corpo, cco }) => ({
        nome,
        assunto,
        corpo,
        cco
      }))
    },
    "apoio-soluti-modelos-email"
  );

  mostrarAviso(aviso, `Exportado: ${meusModelos.length} modelo(s).`, "ok");
}

async function importarModelos(arquivo) {
  const aviso = $("avisoModelos");

  let json;
  try {
    json = JSON.parse(await arquivo.text());
  } catch {
    mostrarAviso(aviso, "Arquivo inválido: não é um JSON válido.", "erro");
    return;
  }

  // aceita a lista solta ou o objeto { modelosEmail: [...] }
  if (Array.isArray(json)) json = { modelosEmail: json };

  const validos = modelosValidos(json);
  if (!validos.length) {
    mostrarAviso(aviso, "Arquivo inválido: nenhum modelo encontrado nele.", "erro");
    return;
  }

  const existentes = validos.filter((item) =>
    meusModelos.some((m) => m.nome.toLowerCase() === item.nome.trim().toLowerCase())
  ).length;

  if (
    existentes &&
    !confirm(
      `${existentes} modelo(s) do arquivo têm o mesmo nome de modelos que você já tem ` +
      `e vão substituí-los.\n\nContinuar?`
    )
  ) {
    return;
  }

  try {
    const total = await importarModelosDoBackup(json);
    await carregarModelosEmail();
    mostrarAviso(aviso, `Importado: ${total} modelo(s).`, "ok");
  } catch (erro) {
    mostrarAviso(aviso, `Importação interrompida: ${erro.message}`, "erro");
  }
}

$("exportarModelosBtn").addEventListener("click", exportarModelos);
$("importarModelosBtn").addEventListener("click", () => $("importarModelosInput").click());
$("importarModelosInput").addEventListener("change", async (evento) => {
  const [arquivo] = evento.target.files;
  // zerado para o mesmo arquivo poder ser escolhido de novo
  evento.target.value = "";
  if (arquivo) await importarModelos(arquivo);
});
