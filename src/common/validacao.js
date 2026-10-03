// Apoio Soluti v5 — ferramentas de atendimento do Suporte B2C.
//
// Validação de CPF/CNPJ (dígito verificador). Módulo único, no mesmo
// padrão do src/common/macros.js, pra poder ser usado tanto pelo popup
// quanto por qualquer content script no futuro.
//
// Objetivo: pegar documento com dígito verificador errado ANTES de
// disparar uma busca que nunca vai voltar com resultado (S.Deal,
// Gestão Online, Wings e Databricks todos dependem de CPF/CNPJ real).

if (!window.ApoioValidacao) {
  window.ApoioValidacao = (() => {
    function apenasDigitos(doc) {
      return String(doc || "").replace(/\D/g, "");
    }

    function digitosRepetidos(doc) {
      return /^(\d)\1*$/.test(doc);
    }

    function calcularDigitoCpf(base, pesoInicial) {
      let soma = 0;
      for (let i = 0; i < base.length; i++) {
        soma += Number(base[i]) * (pesoInicial - i);
      }
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    }

    function validarCpf(doc) {
      const cpf = apenasDigitos(doc);
      if (cpf.length !== 11 || digitosRepetidos(cpf)) return false;

      const d1 = calcularDigitoCpf(cpf.slice(0, 9), 10);
      if (d1 !== Number(cpf[9])) return false;

      const d2 = calcularDigitoCpf(cpf.slice(0, 10), 11);
      if (d2 !== Number(cpf[10])) return false;

      return true;
    }

    function calcularDigitoCnpj(base, pesos) {
      let soma = 0;
      for (let i = 0; i < base.length; i++) {
        soma += Number(base[i]) * pesos[i];
      }
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    }

    const PESOS_CNPJ_D1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const PESOS_CNPJ_D2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    function validarCnpj(doc) {
      const cnpj = apenasDigitos(doc);
      if (cnpj.length !== 14 || digitosRepetidos(cnpj)) return false;

      const d1 = calcularDigitoCnpj(cnpj.slice(0, 12), PESOS_CNPJ_D1);
      if (d1 !== Number(cnpj[12])) return false;

      const d2 = calcularDigitoCnpj(cnpj.slice(0, 13), PESOS_CNPJ_D2);
      if (d2 !== Number(cnpj[13])) return false;

      return true;
    }

    // true/false só faz sentido quando o campo já tem 11 ou 14 dígitos —
    // documento incompleto não é "inválido", é "ainda não terminou de
    // digitar". Por isso retorna null nesse caso, pra quem chama decidir
    // se quer avisar ou simplesmente ficar quieto.
    function documentoValido(doc) {
      const limpo = apenasDigitos(doc);
      if (limpo.length === 11) return validarCpf(limpo);
      if (limpo.length === 14) return validarCnpj(limpo);
      return null;
    }

    function tipoDocumento(doc) {
      const limpo = apenasDigitos(doc);
      if (limpo.length === 11) return "CPF";
      if (limpo.length === 14) return "CNPJ";
      return null;
    }

    return { apenasDigitos, validarCpf, validarCnpj, documentoValido, tipoDocumento };
  })();
}
