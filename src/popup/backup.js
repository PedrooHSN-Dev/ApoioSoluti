// Levar tudo para outro PC: um arquivo com os macros, os modelos de e-mail
// e a rotina do dia.
//
// POR QUE ISTO EXISTE, se as três coisas já sincronizam sozinhas: o
// chrome.storage.sync só viaja entre máquinas em que você está logado no
// MESMO navegador. Máquina nova ainda sem login, outro navegador, perfil
// corporativo que não permite entrar com conta, ou a máquina que vai ser
// formatada amanhã — em todos esses casos o sync não leva nada, e um
// arquivo leva.
//
// Não é o mesmo que o "Exportar" da aba Macros. Aquele manda só os macros,
// para dar a um colega; este é a mudança inteira.
//
// Este arquivo não pertence à aba Começar, embora os botões fiquem no
// painel dela: ele mexe em três coisas de abas diferentes, e nenhuma delas
// tem a ver com começar o expediente.

const NOME_ARQUIVO_BACKUP = "apoio-soluti-backup";

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

async function exportarTudo() {
  const aviso = $("avisoBackup");

  // lidos na hora, e não das variáveis da tela: a aba de macros pode nem
  // ter sido aberta nesta sessão do popup
  const macros = await window.ApoioMacros.ler();
  const modelos = await window.ApoioEmails.ler();
  const rotina = await lerRotina();
  const ocultos = await window.ApoioMacros.lerOcultos();

  // só o que é seu. Os macros e modelos da equipe vêm no código da
  // extensão, e os sistemas da tabela também: reexportá-los faria a
  // importação criar cópias pessoais de coisas que já existem sozinhas.
  const extras = rotina.filter(ehItemExtra);

  if (!macros.length && !modelos.length && !extras.length && !ocultos.length) {
    mostrarAviso(aviso, "Não há nada seu para exportar ainda.", "erro");
    return;
  }

  baixarJson(
    {
      versao: chrome.runtime.getManifest().version,
      exportadoEm: new Date().toISOString(),
      macros: macros.map(({ comando, resposta }) => ({ comando, resposta })),
      modelosEmail: modelos.map(({ nome, assunto, corpo, cco }) => ({
        nome,
        assunto,
        corpo,
        cco
      })),
      // a rotina inteira, e não só os extras: a ordem e o que está
      // desmarcado também são escolha sua, e é isso que se quer de volta
      rotinaDoDia: rotina,
      // macros da equipe que voce excluiu (escondeu)
      macrosEquipeOcultos: ocultos
    },
    NOME_ARQUIVO_BACKUP
  );

  mostrarAviso(
    aviso,
    `Exportado: ${macros.length} macro(s), ${modelos.length} modelo(s), ${extras.length} endereço(s).`,
    "ok"
  );
}

/* Importar ------------------------------------------------------------ */

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
      itens.push({ id: item.id, ligado: item.ligado !== false });
    }
  }

  return itens.length ? itens : null;
}

async function importarMacrosDoBackup(json) {
  const importados = extrairMacrosImportados(json);
  if (!importados?.length) return 0;

  const atuais = await window.ApoioMacros.ler();
  let mexidos = 0;

  importados.forEach(({ comando, resposta }) => {
    const limpo = comando.trim();
    const existente = atuais.find(
      (macro) => macro.comando.toLowerCase() === limpo.toLowerCase()
    );

    if (existente) existente.resposta = resposta.trim();
    else atuais.push({ id: gerarId(), comando: limpo, resposta: resposta.trim(), origem: "usuario" });

    mexidos += 1;
  });

  await window.ApoioMacros.salvar(atuais);
  return mexidos;
}

async function importarModelosDoBackup(json) {
  const importados = modelosValidos(json);
  if (!importados.length) return 0;

  const atuais = await window.ApoioEmails.ler();
  let mexidos = 0;

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

    mexidos += 1;
  });

  await window.ApoioEmails.salvar(atuais);
  return mexidos;
}

async function importarTudo(arquivo) {
  const aviso = $("avisoBackup");

  let json;
  try {
    json = JSON.parse(await arquivo.text());
  } catch {
    mostrarAviso(aviso, "Arquivo inválido: não é um JSON válido.", "erro");
    return;
  }

  const temMacros = Array.isArray(extrairMacrosImportados(json));
  const rotina = rotinaValida(json);

  if (!temMacros && !modelosValidos(json).length && !rotina && !Array.isArray(json?.macrosEquipeOcultos)) {
    mostrarAviso(aviso, "Arquivo inválido: não reconheci nada dentro dele.", "erro");
    return;
  }

  // Substituir sem avisar apaga o que a pessoa montou nesta máquina. O
  // mesmo nome de macro/modelo é atualizado, o resto é somado — mas a
  // rotina é uma ORDEM, e ordem não se soma: essa, sim, é substituída.
  const vaiTrocarRotina = Boolean(rotina);
  if (
    vaiTrocarRotina &&
    !confirm(
      "A lista de endereços da aba Começar vai ser substituída pela do arquivo.\n\n" +
      "Macros e modelos de e-mail são somados aos que já existem aqui (os de mesmo nome são atualizados).\n\n" +
      "Continuar?"
    )
  ) {
    return;
  }

  const partes = [];

  try {
    const macros = await importarMacrosDoBackup(json);
    if (macros) partes.push(`${macros} macro(s)`);

    const modelos = await importarModelosDoBackup(json);
    if (modelos) partes.push(`${modelos} modelo(s)`);

    if (Array.isArray(json?.macrosEquipeOcultos)) {
      const atuais = await window.ApoioMacros.lerOcultos();
      await window.ApoioMacros.salvarOcultos([...atuais, ...json.macrosEquipeOcultos]);
    }

    if (rotina) {
      await salvarRotina(rotina);
      partes.push(`${rotina.filter(ehItemExtra).length} endereço(s)`);
    }
  } catch (erro) {
    mostrarAviso(aviso, `Importação interrompida: ${erro.message}`, "erro");
    return;
  }

  // as três telas precisam redesenhar: os dados mudaram por baixo delas
  await carregarMacros();
  await carregarModelosEmail();
  await montarPainelDoDia();

  mostrarAviso(aviso, `Importado: ${partes.join(", ")}.`, "ok");
}

// recolhido por padrão: ver src/popup/popup.html, no painel da aba Começar
$("backupBtn").addEventListener("click", () => {
  const bloco = $("blocoBackup");
  const abrindo = bloco.classList.contains("hidden");

  bloco.classList.toggle("hidden", !abrindo);

  // abrir um fecha o outro: os dois ficam no mesmo lugar, acima da lista
  if (abrindo) fecharFormularioDia();
});

$("exportarTudoBtn").addEventListener("click", () => {
  exportarTudo().catch((erro) => {
    mostrarAviso($("avisoBackup"), `Não foi possível exportar: ${erro.message}`, "erro");
  });
});

$("importarTudoBtn").addEventListener("click", () => {
  $("importarTudoInput").click();
});

$("importarTudoInput").addEventListener("change", async (evento) => {
  const [arquivo] = evento.target.files;
  // zerado antes de usar: sem isso, escolher o MESMO arquivo de novo não
  // dispara o evento e a importação parece ter sido ignorada
  evento.target.value = "";
  if (arquivo) await importarTudo(arquivo);
});
