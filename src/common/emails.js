if (!window.ApoioEmails) {
  window.ApoioEmails = (() => {
    const CHAVE_LOCAL = "emailsModelos";
    const CHAVE_PARTES = "emailsPartes";
    const PREFIXO = "emailsParte";
    const TAMANHO_PARTE = 7000;

    // uma vez que o sync recusa a gravacao, parar de insistir: senao cada
    // mudanca tentaria de novo e esbarraria no limite de gravacoes por minuto
    let syncIndisponivel = false;

    function ehChaveDeEmail(chave) {
      return chave === CHAVE_PARTES || chave.startsWith(PREFIXO);
    }

    async function lerDoSync() {
      const dados = await chrome.storage.sync.get(null);
      const partes = dados[CHAVE_PARTES];

      if (!Number.isInteger(partes) || partes < 1) return null;

      let texto = "";
      for (let i = 0; i < partes; i++) {
        const pedaco = dados[PREFIXO + i];
        // gravacao interrompida no meio: melhor cair pro local inteiro do
        // que devolver uma lista cortada
        if (typeof pedaco !== "string") return null;
        texto += pedaco;
      }

      try {
        const lista = JSON.parse(texto);
        return Array.isArray(lista) ? lista : null;
      } catch {
        return null;
      }
    }

    async function limparSobras(usadas) {
      const dados = await chrome.storage.sync.get(null);

      // uma lista que encolheu deixa pedacos antigos para tras; sem remove-los
      // eles so ocupam cota, mas tambem confundem qualquer leitura futura
      const sobrando = Object.keys(dados).filter(
        (chave) =>
          chave.startsWith(PREFIXO) &&
          Number(chave.slice(PREFIXO.length)) >= usadas
      );

      if (sobrando.length) await chrome.storage.sync.remove(sobrando);
    }

    async function enviarParaSync(lista) {
      if (syncIndisponivel) return false;

      const texto = JSON.stringify(lista);
      const pedacos = [];
      for (let i = 0; i < texto.length; i += TAMANHO_PARTE) {
        pedacos.push(texto.slice(i, i + TAMANHO_PARTE));
      }

      const gravar = { [CHAVE_PARTES]: pedacos.length };
      pedacos.forEach((pedaco, i) => {
        gravar[PREFIXO + i] = pedaco;
      });

      try {
        await chrome.storage.sync.set(gravar);
        await limparSobras(pedacos.length);
        return true;
      } catch (erro) {
        syncIndisponivel = true;
        console.warn("Apoio Soluti: modelos de e-mail sem sincronizacao:", erro.message);

        // o local ja tem tudo. Limpar as chaves DESTE modulo evita o pior
        // caso: uma versao parcial/antiga la sobrescrevendo a boa na proxima
        // leitura. So as proprias: os macros dividem o mesmo sync.
        try {
          const dados = await chrome.storage.sync.get(null);
          const nossas = Object.keys(dados).filter(ehChaveDeEmail);
          if (nossas.length) await chrome.storage.sync.remove(nossas);
        } catch {}

        return false;
      }
    }

    async function ler() {
      try {
        const doSync = await lerDoSync();
        if (doSync) return doSync;
      } catch {}

      const dados = await chrome.storage.local.get(CHAVE_LOCAL);
      return Array.isArray(dados[CHAVE_LOCAL]) ? dados[CHAVE_LOCAL] : [];
    }

    async function salvar(lista) {
      // o local primeiro, sempre: e a copia que nao depende de rede nem cota
      await chrome.storage.local.set({ [CHAVE_LOCAL]: lista });
      return enviarParaSync(lista);
    }

    function aoMudar(callback) {
      chrome.storage.onChanged.addListener((mudancas, area) => {
        const mexeu =
          (area === "sync" && Object.keys(mudancas).some(ehChaveDeEmail)) ||
          (area === "local" && Boolean(mudancas[CHAVE_LOCAL]));

        if (mexeu) ler().then(callback);
      });
    }

    return { ler, salvar, aoMudar };
  })();
}
