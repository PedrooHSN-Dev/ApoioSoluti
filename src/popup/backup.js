// Aba Importar: levar o que é seu para fora e trazer de volta.
//
// POR QUE ISTO EXISTE, se macros, modelos e a lista do dia já sincronizam
// sozinhos: o chrome.storage.sync só viaja entre máquinas em que você está
// logado no MESMO navegador. Máquina nova ainda sem login, outro navegador,
// perfil corporativo que não deixa entrar com conta, ou a máquina que vai
// ser formatada amanhã — em todos esses casos o sync não leva nada, e um
// arquivo leva. Passar um macro para um colega é o mesmo caso.
//
// UM FORMATO SÓ. O arquivo tem uma chave por ferramenta e o importador
// aproveita as que encontrar. Então "exportar só os macros" é o mesmo
// arquivo com uma chave preenchida, e importá-lo pelo "tudo junto"
// funciona igual. É isso que deixa esta tela ser uma tabela, PARTES, em
// vez de três pares de botões com três formatos quase iguais.
//
// O QUE NÃO ENTRA: macros, modelos e sistemas da equipe vêm no código da
// extensão. Reexportá-los faria a importação criar cópias pessoais de
// coisas que já existem sozinhas. Só o que é seu viaja — mais a lista do
// que você escondeu, que também é escolha sua.

const NOME_ARQUIVO_BACKUP = "apoio-soluti";

/* O que cada arquivo carrega ------------------------------------------
   `juntar` monta o pedaço do JSON; `aplicar` devolve um resumo do que
   entrou, ou "" quando o arquivo não tinha nada daquela parte.
   -------------------------------------------------------------------- */
const PARTES = {
  sites: {
    titulo: "Endereços da aba Começar",
    descricao:
      "A lista do \"Começar o dia\": os endereços que você acrescentou, a " +
      "ordem e o que está desmarcado.",
    arquivo: "enderecos",
    juntar: async () => ({ rotinaDoDia: await lerRotina() }),
    temAlgo: async () => (await lerRotina()).some(ehItemExtra),
    reconhece: (json) => Boolean(rotinaValida(json)),
    aplicar: aplicarRotina
  },
  macros: {
    titulo: "Macros",
    descricao: "Os comandos que você criou, com o texto de cada um.",
    arquivo: "macros",
    juntar: async () => ({
      macros: (await window.ApoioMacros.ler()).map(({ comando, resposta }) => ({
        comando,
        resposta
      })),
      macrosEquipeOcultos: await window.ApoioMacros.lerOcultos()
    }),
    temAlgo: async () => (await window.ApoioMacros.ler()).length > 0,
    reconhece: (json) =>
      Boolean(extrairMacrosImportados(json)) || Array.isArray(json?.macrosEquipeOcultos),
    aplicar: aplicarMacros
  },
  emails: {
    titulo: "Modelos de e-mail",
    descricao: "Os modelos que você criou, com assunto, corpo e Cco.",
    arquivo: "modelos-email",
    juntar: async () => ({
      modelosEmail: (await window.ApoioEmails.ler()).map(
        ({ nome, assunto, corpo, cco }) => ({ nome, assunto, corpo, cco })
      ),
      emailsEquipeOcultos: await window.ApoioEmails.lerOcultos()
    }),
    temAlgo: async () => (await window.ApoioEmails.ler()).length > 0,
    reconhece: (json) =>
      modelosValidos(json).length > 0 || Array.isArray(json?.emailsEquipeOcultos),
    aplicar: aplicarModelos
  }
};

const ORDEM_PARTES = ["sites", "macros", "emails"];

/* Exportar ----------------------------------------------------------- */

function baixarJson(dados, prefixo) {
  const blob = new Blob([JSON.stringify(dados, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${prefixo}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();

  URL.revokeObjectURL(url);
}

// `chaves` vazio significa todas: é assim que o "tudo junto" reusa o resto.
async function exportar(chaves) {
  const aviso = $("avisoBackup");
  const alvos = chaves.length ? chaves : ORDEM_PARTES;

  // lidos na hora, e não das variáveis da tela: a aba de macros pode nem
  // ter sido aberta nesta sessão do popup
  const temAlgum = await Promise.all(alvos.map((chave) => PARTES[chave].temAlgo()));
  if (!temAlgum.some(Boolean)) {
    mostrarAviso(aviso, "Não há nada seu para exportar ainda.", "erro");
    return;
  }

  const dados = {
    versao: chrome.runtime.getManifest().version,
    exportadoEm: new Date().toISOString()
  };

  for (const chave of alvos) {
    Object.assign(dados, await PARTES[chave].juntar());
  }

  const sufixo = chaves.length === 1 ? PARTES[chaves[0]].arquivo : "backup";
  baixarJson(dados, `${NOME_ARQUIVO_BACKUP}-${sufixo}`);

  mostrarAviso(
    aviso,
    `Exportado: ${alvos.map((chave) => PARTES[chave].titulo.toLowerCase()).join(", ")}.`,
    "ok"
  );
}

/* Ler o arquivo ------------------------------------------------------- */

function extrairMacrosImportados(json) {
  const lista = Array.isArray(json) ? json : json?.macros;
  if (!Array.isArray(lista)) return null;

  return lista.filter(
    (item) =>
      item &&
      typeof item.comando === "string" &&
      item.comando.trim() &&
      typeof item.resposta === "string" &&
      item.resposta.trim()
  );
}

function modelosValidos(json) {
  const lista = json?.modelosEmail;
  if (!Array.isArray(lista)) return [];

  return lista.filter(
    (item) =>
      item &&
      typeof item.nome === "string" &&
      item.nome.trim() &&
      typeof item.corpo === "string" &&
      item.corpo.trim()
  );
}

// Do arquivo só se aproveita o que ainda faz sentido aqui: um sistema que
// saiu da tabela, ou um endereço com URL inválida, não entram.
function rotinaValida(json) {
  const lista = json?.rotinaDoDia;
  if (!Array.isArray(lista)) return null;

  const itens = [];

  for (const item of lista) {
    if (!item || typeof item.id !== "string") continue;

    if (ehItemExtra(item)) {
      const recriado = novoItemExtra(item.nome, item.url);
      if (recriado) itens.push({ ...recriado, id: item.id, ligado: item.ligado !== false });
      continue;
    }

    if (sistemaPorId(item.id)) {
      itens.push({ id: item.id, ligado: item.ligado !== false, removido: Boolean(item.removido) });
    }
  }

  return itens.length ? itens : null;
}

/* Aplicar ------------------------------------------------------------- */

async function aplicarMacros(json) {
  const importados = extrairMacrosImportados(json) || [];
  const atuais = await window.ApoioMacros.ler();

  importados.forEach(({ comando, resposta }) => {
    const limpo = comando.trim();
    const existente = atuais.find(
      (macro) => macro.comando.toLowerCase() === limpo.toLowerCase()
    );

    if (existente) existente.resposta = resposta.trim();
    else atuais.push({ id: gerarId(), comando: limpo, resposta: resposta.trim(), origem: "usuario" });
  });

  if (importados.length) await window.ApoioMacros.salvar(atuais);

  if (Array.isArray(json?.macrosEquipeOcultos)) {
    const ocultos = await window.ApoioMacros.lerOcultos();
    await window.ApoioMacros.salvarOcultos([...ocultos, ...json.macrosEquipeOcultos]);
  }

  await carregarMacros();
  return importados.length ? `${importados.length} macro(s)` : "";
}

async function aplicarModelos(json) {
  const importados = modelosValidos(json);
  const atuais = await window.ApoioEmails.ler();

  importados.forEach((item) => {
    const nome = item.nome.trim();
    const existente = atuais.find(
      (modelo) => (modelo.nome || "").toLowerCase() === nome.toLowerCase()
    );

    const campos = {
      nome,
      assunto: (item.assunto || "").trim(),
      corpo: item.corpo.trim(),
      // Cco malformado vindo de arquivo nao entra: iria para o rascunho
      cco: emailValido(item.cco) ? item.cco.trim() : ""
    };

    if (existente) Object.assign(existente, campos);
    else atuais.push({ id: gerarId(), ...campos, origem: "usuario" });
  });

  if (importados.length) await window.ApoioEmails.salvar(atuais);

  if (Array.isArray(json?.emailsEquipeOcultos)) {
    const ocultos = await window.ApoioEmails.lerOcultos();
    await window.ApoioEmails.salvarOcultos([...ocultos, ...json.emailsEquipeOcultos]);
  }

  await carregarModelosEmail();
  return importados.length ? `${importados.length} modelo(s)` : "";
}

async function aplicarRotina(json) {
  const rotina = rotinaValida(json);
  if (!rotina) return "";

  await salvarRotina(rotina);
  await montarPainelDoDia();
  return `${rotina.filter(ehItemExtra).length} endereço(s)`;
}

/* Importar ------------------------------------------------------------ */

// A rotina é uma ORDEM, e ordem não se soma: ela substitui a que está aqui.
// Macros e modelos de mesmo nome são atualizados, o resto é somado — isso
// não apaga nada e não precisa de confirmação.
const AVISO_SUBSTITUI =
  "A lista de endereços da aba Começar vai ser substituída pela do arquivo.\n\n" +
  "Continuar?";

async function importar(chaves, arquivo) {
  const aviso = $("avisoBackup");
  const alvos = chaves.length ? chaves : ORDEM_PARTES;

  let json;
  try {
    json = JSON.parse(await arquivo.text());
  } catch {
    mostrarAviso(aviso, "Arquivo inválido: não é um JSON válido.", "erro");
    return;
  }

  const reconhecidas = alvos.filter((chave) => PARTES[chave].reconhece(json));

  if (!reconhecidas.length) {
    mostrarAviso(
      aviso,
      chaves.length
        ? `Não achei ${PARTES[chaves[0]].titulo.toLowerCase()} neste arquivo.`
        : "Arquivo inválido: não reconheci nada dentro dele.",
      "erro"
    );
    return;
  }

  if (reconhecidas.includes("sites") && !confirm(AVISO_SUBSTITUI)) return;

  const partes = [];

  try {
    for (const chave of reconhecidas) {
      const resumo = await PARTES[chave].aplicar(json);
      if (resumo) partes.push(resumo);
    }
  } catch (erro) {
    mostrarAviso(aviso, `Importação interrompida: ${erro.message}`, "erro");
    return;
  }

  mostrarAviso(
    aviso,
    partes.length ? `Importado: ${partes.join(", ")}.` : "Nada novo no arquivo.",
    "ok"
  );
}

/* A tela -------------------------------------------------------------- */

// Um <input type="file"> por linha. Um só, reaproveitado, obrigaria a
// guardar "para qual parte foi o último clique" entre dois eventos.
function criarLinhaBackup({ titulo, descricao, chaves }) {
  const linha = document.createElement("section");
  linha.className = "backup-item";

  const texto = document.createElement("div");
  texto.className = "backup-texto";

  const nome = document.createElement("h3");
  nome.textContent = titulo;

  const detalhe = document.createElement("p");
  detalhe.textContent = descricao;

  texto.appendChild(nome);
  texto.appendChild(detalhe);

  const botoes = document.createElement("div");
  botoes.className = "backup-botoes";

  const exportarBtn = document.createElement("button");
  exportarBtn.type = "button";
  exportarBtn.className = "secondary";
  exportarBtn.textContent = "Exportar";
  exportarBtn.addEventListener("click", () => {
    exportar(chaves).catch((erro) =>
      mostrarAviso($("avisoBackup"), `Não foi possível exportar: ${erro.message}`, "erro")
    );
  });

  const escolher = document.createElement("input");
  escolher.type = "file";
  escolher.accept = "application/json";
  escolher.hidden = true;
  escolher.addEventListener("change", async (evento) => {
    const [arquivo] = evento.target.files;
    // zerado antes de usar: sem isso, escolher o MESMO arquivo de novo não
    // dispara o evento e a importação parece ter sido ignorada
    evento.target.value = "";
    if (arquivo) await importar(chaves, arquivo);
  });

  const importarBtn = document.createElement("button");
  importarBtn.type = "button";
  importarBtn.className = "secondary";
  importarBtn.textContent = "Importar";
  importarBtn.addEventListener("click", () => escolher.click());

  botoes.appendChild(exportarBtn);
  botoes.appendChild(importarBtn);
  botoes.appendChild(escolher);

  linha.appendChild(texto);
  linha.appendChild(botoes);
  return linha;
}

function montarPainelImportar() {
  const lista = $("listaPartesBackup");
  lista.innerHTML = "";

  ORDEM_PARTES.forEach((chave) => {
    const { titulo, descricao } = PARTES[chave];
    lista.appendChild(criarLinhaBackup({ titulo, descricao, chaves: [chave] }));
  });

  const tudo = criarLinhaBackup({
    titulo: "Tudo junto",
    descricao:
      "Um arquivo só, com as três coisas acima. É o que se leva para uma " +
      "máquina nova.",
    chaves: []
  });
  tudo.classList.add("backup-item-destaque");
  lista.appendChild(tudo);
}

montarPainelImportar();
