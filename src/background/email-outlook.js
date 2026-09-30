// O Cco vem na mensagem, ja resolvido: ele e propriedade do modelo de
// e-mail, e quem escolheu o modelo foi a tela. Antes era uma chave unica no
// storage, lida aqui — o que fazia todo envio copiar o mesmo endereco.
function montarUrlComposicaoOutlook({ destinatario, assunto, corpo, cco }) {
  // URLSearchParams usa "+" para espaço (regra de formulário), e o Outlook
  // Web nao converte esse "+" de volta — o assunto e o corpo chegavam com
  // "+" no lugar de cada espaço. %20 via encodeURIComponent e o que o
  // deeplink espera de verdade.
  const partes = { to: destinatario };

  // so entra quando existe: um "bcc=" vazio faz o Outlook abrir o campo de
  // copia oculta a toa por cima do rascunho
  if (cco) partes.bcc = cco;

  partes.subject = assunto || "";
  partes.body = corpo || "";

  const consulta = Object.entries(partes)
    .map(([chave, valor]) => `${chave}=${encodeURIComponent(valor)}`)
    .join("&");

  return `https://outlook.office.com/mail/deeplink/compose?${consulta}`;
}

// "complete" so garante que o HTML inicial carregou, nao que o botao de
// Enviar ja esteja na tela — por isso o limite de tempo aqui e so uma rede
// de seguranca para a aba nunca travar a espera para sempre.
function aguardarAbaCarregada(abaId, statusInicial) {
  if (statusInicial === "complete") return Promise.resolve();

  return Promise.race([
    new Promise((resolve) => {
      function ouvinte(id, info) {
        if (id === abaId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(ouvinte);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(ouvinte);
    }),
    new Promise((resolve) => setTimeout(resolve, 15000))
  ]);
}

async function clicarEnviarOutlook(abaId) {
  const [injecao] = await chrome.scripting.executeScript({
    target: { tabId: abaId },
    func: async () => {
      function localizarBotaoEnviar() {
        const candidatos = document.querySelectorAll('[role="button"], button');

        for (const el of candidatos) {
          const rotulo = (
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            el.textContent ||
            ""
          ).trim();

          if (/^(enviar|send)$/i.test(rotulo)) return el;
        }

        return null;
      }

      // ate ~8s (20 x 400ms) para o painel de composicao terminar de montar
      for (let tentativa = 0; tentativa < 20; tentativa++) {
        const botao = localizarBotaoEnviar();
        if (botao) {
          botao.click();
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      return false;
    }
  });

  return Boolean(injecao?.result);
}

async function enviarEmailOutlook({ destinatario, assunto, corpo, cco }) {
  if (!destinatario) {
    return { erro: "Nenhum destinatário informado." };
  }

  const url = montarUrlComposicaoOutlook({ destinatario, assunto, corpo, cco });
  const aba = await chrome.tabs.create({ url, active: true });

  try {
    await aguardarAbaCarregada(aba.id, aba.status);
    const enviado = await clicarEnviarOutlook(aba.id);
    return { ok: true, enviado };
  } catch (erro) {
    // a aba com o rascunho continua aberta: o atendente ainda consegue
    // terminar o envio na mao mesmo quando a automacao falha
    console.warn("Apoio Soluti: não consegui clicar em Enviar:", erro.message);
    return { ok: true, enviado: false };
  }
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (mensagem?.tipo === "enviarEmailOutlook") {
    enviarEmailOutlook(mensagem)
      .then(responder)
      .catch((erro) => responder({ erro: erro.message || String(erro) }));
    return true;
  }
});

