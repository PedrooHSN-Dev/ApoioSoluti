// Apoio Soluti v4 — ferramentas de atendimento do Suporte B2C.
//
// Desenvolvido por Vitor Azevedo (v1 e v2).
// Reescrito e mantido por Vinícius Zoccoli e Pedro H. S. Nascimento (v3 em diante).

// Recorta a captura, melhora a imagem e roda o OCR local (Tesseract).
// Nada sai do navegador: worker, wasm e traineddata sao arquivos da extensao.

// Upscale do recorte do print. O print ja chega degradado (compressao do
// PNG + zoom do CSS), entao ampliar antes de binarizar ajuda o Tesseract.
const ESCALA = 3;

// Alvo do OCR na imagem ORIGINAL: imagem pequena e ampliada ate o lado
// maior chegar perto de LADO_ALVO; imagem grande e usada como esta. O teto
// existe porque o canvas mora na memoria do documento offscreen.
const LADO_ALVO = 1600;
const LADO_MAXIMO = 4000;

let workerPromise = null;

function obterWorker() {
  if (workerPromise) return workerPromise;

  workerPromise = Tesseract.createWorker("por", 1, {
    workerPath: chrome.runtime.getURL("lib/worker.min.js"),
    corePath: chrome.runtime.getURL("lib/"),
    langPath: chrome.runtime.getURL("lib/"),
    workerBlobURL: false,
    cacheMethod: "none",
    gzip: false
  });

  return workerPromise;
}

async function recortar(dataUrl, rect, dpr) {
  const resposta = await fetch(dataUrl);
  const blob = await resposta.blob();
  const imagem = await createImageBitmap(blob);

  const x = Math.max(0, Math.round(rect.x * dpr));
  const y = Math.max(0, Math.round(rect.y * dpr));
  const largura = Math.min(Math.round(rect.width * dpr), imagem.width - x);
  const altura = Math.min(Math.round(rect.height * dpr), imagem.height - y);

  if (largura < 4 || altura < 4) {
    throw new Error("Área selecionada muito pequena.");
  }

  const canvas = new OffscreenCanvas(largura * ESCALA, altura * ESCALA);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    imagem,
    x,
    y,
    largura,
    altura,
    0,
    0,
    canvas.width,
    canvas.height
  );

  binarizar(ctx, canvas.width, canvas.height);

  return {
    blob: await canvas.convertToBlob({ type: "image/png" }),
    largura: canvas.width,
    altura: canvas.height
  };
}

// Tons de cinza + limiar de Otsu. Texto claro em fundo escuro tambem funciona,
// porque o Tesseract lida melhor com preto no branco: invertemos se preciso.
function binarizar(ctx, largura, altura) {
  const dados = ctx.getImageData(0, 0, largura, altura);
  const pixels = dados.data;
  const cinza = new Uint8Array(largura * altura);
  const histograma = new Array(256).fill(0);

  for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
    const v = Math.round(
      0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
    );
    cinza[p] = v;
    histograma[v]++;
  }

  const total = cinza.length;
  let soma = 0;
  for (let i = 0; i < 256; i++) soma += i * histograma[i];

  let somaFundo = 0;
  let pesoFundo = 0;
  let melhorVariancia = -1;
  let limiar = 128;

  for (let i = 0; i < 256; i++) {
    pesoFundo += histograma[i];
    if (!pesoFundo) continue;

    const pesoFrente = total - pesoFundo;
    if (!pesoFrente) break;

    somaFundo += i * histograma[i];

    const mediaFundo = somaFundo / pesoFundo;
    const mediaFrente = (soma - somaFundo) / pesoFrente;
    const variancia =
      pesoFundo * pesoFrente * (mediaFundo - mediaFrente) ** 2;

    if (variancia > melhorVariancia) {
      melhorVariancia = variancia;
      limiar = i;
    }
  }

  let escuros = 0;
  for (let p = 0; p < total; p++) if (cinza[p] <= limiar) escuros++;

  // se a maior parte for escura, o texto provavelmente e claro: inverte
  const inverter = escuros > total / 2;

  for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
    let claro = cinza[p] > limiar;
    if (inverter) claro = !claro;

    const v = claro ? 255 : 0;
    pixels[i] = v;
    pixels[i + 1] = v;
    pixels[i + 2] = v;
    pixels[i + 3] = 255;
  }

  ctx.putImageData(dados, 0, 0);
}

/* OCR na imagem original ----------------------------------------------
   O print da tela chega aqui ja degradado: passou pelo zoom do CSS, pela
   recompressao do PNG e esta limitado ao que cabe no viewport. Quando
   sabemos o endereco da imagem, buscamos os bytes originais e lemos na
   resolucao nativa. E o caminho do "Ler tudo" do visualizador e do item de
   menu "Extrair texto da imagem".
   --------------------------------------------------------------------- */

async function prepararOriginal(src, rotacao, espelho) {
  // credentials: "include" porque a imagem pode estar atras de login (a AR,
  // por exemplo); o host_permissions <all_urls> autoriza mandar o cookie
  const resposta = await fetch(src, { credentials: "include" });

  if (!resposta.ok) {
    throw new Error(`A imagem respondeu ${resposta.status}.`);
  }

  const imagem = await createImageBitmap(await resposta.blob());

  const girado = Math.abs(rotacao % 180) === 90;
  const largura = girado ? imagem.height : imagem.width;
  const altura = girado ? imagem.width : imagem.height;

  if (largura < 4 || altura < 4) {
    throw new Error("Imagem pequena demais para leitura.");
  }

  const maior = Math.max(largura, altura);
  const fator = Math.min(
    maior < LADO_ALVO ? LADO_ALVO / maior : 1,
    LADO_MAXIMO / maior
  );

  const canvas = new OffscreenCanvas(
    Math.round(largura * fator),
    Math.round(altura * fator)
  );
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // a rotacao e o espelho aplicados no visualizador valem aqui tambem:
  // e depois deles que o texto fica na horizontal
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotacao * Math.PI) / 180);
  ctx.scale(espelho * fator, fator);
  ctx.drawImage(imagem, -imagem.width / 2, -imagem.height / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  binarizar(ctx, canvas.width, canvas.height);

  // blob, e nao o proprio canvas: e a mesma entrada que o recorte do print
  // ja usa, e OffscreenCanvas nem sempre e aceito pelo Tesseract
  return {
    blob: await canvas.convertToBlob({ type: "image/png" }),
    largura: canvas.width,
    altura: canvas.height
  };
}

// Uma area larga e baixa e quase sempre uma linha so (o caso de copiar um
// codigo). O modo 7 le a imagem como uma linha unica e acerta bem mais que
// o 6, que fica procurando um bloco de varias linhas.
function modoDeSegmentacao(largura, altura) {
  return largura / altura >= 8 ? "7" : "6";
}

async function reconhecer(fonte, largura, altura) {
  const worker = await obterWorker();

  await worker.setParameters({
    tessedit_pageseg_mode: modoDeSegmentacao(largura, altura),
    preserve_interword_spaces: "1"
  });

  const { data } = await worker.recognize(fonte);

  return (data.text || "").replace(/[ \t]+\n/g, "\n").trim();
}

async function executarOcr(dataUrl, rect, dpr) {
  const { blob, largura, altura } = await recortar(dataUrl, rect, dpr);
  return reconhecer(blob, largura, altura);
}

async function executarOcrOriginal(src, rotacao, espelho) {
  const { blob, largura, altura } = await prepararOriginal(
    src,
    rotacao || 0,
    espelho || 1
  );
  return reconhecer(blob, largura, altura);
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.destino !== "offscreen") return;

  if (mensagem.tipo === "ocr") {
    executarOcr(mensagem.dataUrl, mensagem.rect, mensagem.dpr)
      .then((texto) => responder({ texto }))
      .catch((erro) => responder({ erro: erro.message || String(erro) }));

    return true;
  }

  if (mensagem.tipo === "ocrOriginal") {
    executarOcrOriginal(mensagem.src, mensagem.rotacao, mensagem.espelho)
      .then((texto) => responder({ texto }))
      .catch((erro) => responder({ erro: erro.message || String(erro) }));

    return true;
  }
});


// carrega o worker assim que o documento offscreen existe, sem esperar
// a primeira captura: o carregamento do wasm/traineddata acontece em
// paralelo enquanto o usuario ainda esta selecionando a area na tela
obterWorker().catch(() => {});
