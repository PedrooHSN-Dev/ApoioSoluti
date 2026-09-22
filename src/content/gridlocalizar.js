// Apoio Soluti v4 — ferramentas de atendimento do Suporte B2C.
//
// Desenvolvido por Vitor Azevedo (v1 e v2).
// Reescrito e mantido por Vinícius Zoccoli e Pedro H. S. Nascimento (v3 em diante).

// Portado da v2 (funciona). Roda em toda pagina *.acsoluti.com.br.
// Quando a pagina e o retorno JSON do gridlocalizar, le o idCDsolicitacao
// e redireciona a aba para o grid visual de andamento. Tenta a cada 1,5s
// porque o retorno depende do login/carregamento da sessao.

(function () {
  async function tentarRedirecionar() {
    try {
      const res = await fetch(location.href, { credentials: "include" });
      const text = await res.text();

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        return false;
      }

      const id = json?.items?.[0]?.idCDsolicitacao;
      if (!id) return false;

      location.replace(`${location.origin}/certdig/andamento/id/${id}`);
      return true;
    } catch {
      return false;
    }
  }

  // so age nas paginas de gridlocalizar (evita rodar fetch em toda pagina)
  if (!location.pathname.includes("/certdig/gridlocalizar")) return;

  tentarRedirecionar();

  const intervalo = setInterval(async () => {
    const ok = await tentarRedirecionar();
    if (ok) clearInterval(intervalo);
  }, 1500);

  setTimeout(() => clearInterval(intervalo), 20000);
})();
