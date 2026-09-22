// Apoio Soluti v4 — ferramentas de atendimento do Suporte B2C.
//
// Desenvolvido por Vitor Azevedo (v1 e v2).
// Reescrito e mantido por Vinícius Zoccoli e Pedro H. S. Nascimento (v3 em diante).

// ============================================================
// Macros da equipe (fixos no codigo)
// ============================================================
// Lista importada da planilha e embutida aqui. Para alterar,
// edite este arquivo e recarregue a extensao em edge://extensions.
// Cada macro: { id, comando, resposta }.
// ============================================================

window.MACROS_EQUIPE = [
  {
    "id": "equipe-.ini",
    "comando": ".ini",
    "resposta": "Olá, {saudacao}! Sou da equipe do Suporte e estou aqui para te ajudar da melhor forma possível. \nPor favor, me informe com detalhes o que está acontecendo para que eu possa te auxiliar rapidamente. 😊"
  },
  {
    "id": "equipe-.por",
    "comando": ".por",
    "resposta": "✨ Por nada! Sempre que precisar, estamos à disposição para te ajudar. A Soluti agradece o seu contato 💚😊\n\n⭐ Após o encerramento, aparecerá na tela a opção para avaliar o atendimento. Sua opinião é muito importante para que possamos melhorar cada vez mais!"
  },
  {
    "id": "equipe-.cod",
    "comando": ".cod",
    "resposta": "O código de solicitação é o código alfanumérico de 16 dígitos presente no seu termo de titularidade que foi enviado por e-mail no e-mail de aprovação (caso feita a videoconferência) ou no documento reservado impresso."
  },
  {
    "id": "equipe-.senha",
    "comando": ".senha",
    "resposta": "Ela foi exibida durante a videoconferência nas primeiras etapas e consiste de 8 a 10 dígitos, incluindo letras maiúsculas, minúsculas e números"
  },
  {
    "id": "equipe-.fim",
    "comando": ".fim",
    "resposta": "Como não tivemos mais notícias suas o atendimento será encerrado. Mas não se preocupe caso deseje um novo atendimento basta mandar mensagem por esse canal ou entrar em contato através do número 62 4000-1807. \nA Soluti agradece o seu contato 💚😊"
  },
  {
    "id": "equipe-.modelo",
    "comando": ".modelo",
    "resposta": "Qual seria modelo do seu certificado? A1(Arquivo .pfx), A3 (Token ou SmartCard) ou BirdId(App no celular)?"
  },
  {
    "id": "equipe-.carta",
    "comando": ".carta",
    "resposta": "Certo. Como você não possui a senha de emissão, será necessário realizar a revogação do certificado.\n\n📄 MODELO DE CARTA A PRÓPRIO PUNHO  \nEu, [SEU NOME COMPLETO], solicito a revogação do certificado com o número de solicitação [NÚMERO DO PEDIDO], CPF [SEU CPF] e CNPJ [SEU CNPJ, se houver], pelo motivo perda da senha de emissão.\n\n(Assinatura do titular conforme documento enviado)\n\n📤 INSTRUÇÕES DE ENVIO  \nPara: videoconferencia@soluti.com.br  \nAssunto: REVOGAR PERDA DA SENHA DE EMISSÃO  \nAnexos:  \n- Foto da carta escrita de próprio punho assinada  \n- Documento pessoal oficial com foto (RG, CNH ou equivalente)  \n\n🧩 PRÓXIMOS PASSOS \nAguarde o email de confirmação da revogação do certificado.  \nAcesse o site da videoconferência pelo link:  \nhttps://vline.soluti.com.br/ardigisec?flow=vra  \nUtilize o seu número de pedido/voucher para prosseguir com a emissão do novo certificado."
  },
  {
    "id": "equipe-.acesso",
    "comando": ".acesso",
    "resposta": "🖥️ Acesso Remoto\n\n1️⃣ Acesse o site:  \n2️⃣ Após isso, clique em Juntar-se — será baixado um arquivo no seu computador.  \n📁 Caso não tenha selecionado uma pasta específica, o arquivo estará na pasta Downloads.  \n3️⃣ Execute o arquivo baixado.  \n4️⃣ Marque a opção Permitir controle de desktop remoto e clique em Entrar.  \n5️⃣ Após isso, basta deixar o mouse parado para que o acesso possa ser realizado."
  },
  {
    "id": "equipe-.opçoes",
    "comando": ".opçoes",
    "resposta": "Pesquisa por \"opções da internet\" na barra do Windows → clique em “Conteúdo” → depois “Certificados”. E veja se ele aparece."
  },
  {
    "id": "equipe-.token",
    "comando": ".token",
    "resposta": "🔐 Desbloqueio de Token  \nOlá! Para iniciar o processo preciso de duas coisas:  \n1️⃣ Uma foto da frente do token.  \n2️⃣ O código de solicitação (16 caracteres), presente no termo de titularidade (e-mail de aprovação via videoconferência) ou no documento impresso reservado.  \nApós validar, vou te enviar por e-mail o link com a senha PUK e as instruções de desbloqueio. (LEIA COM ATENÇÃO O EMAIL)"
  },
  {
    "id": "equipe-.a1bird",
    "comando": ".a1bird",
    "resposta": "Você adquiriu um Certificado Digital A1 PJ e talvez tenha ficado na dúvida sobre o Bird ID que veio junto. Vou te explicar de forma bem simples, beleza? 😊\n \n👉 Diferença entre A1 e Bird ID:\n \n    O Certificado A1 PJ que você comprou é um Certificado Digital usado para representar a sua empresa, seja para emitir notas fiscais, acessar sistemas do governo ou assinar documentos digitais em nome da PJ. Ele fica armazenado no seu computador e tem validade de até 1 ano.\n \n    Já o Bird ID é um Certificado Digital em nuvem, ou seja, não fica preso a um computador. Ele é pessoal (Pessoa Física) e pode ser acessado pelo celular ou qualquer outro dispositivo, usando apenas um app e uma senha.\n \n🧐 \"Mas por que ganhei um Bird ID?\"\nA gente te dá o Bird ID gratuitamente porque ele facilita muito a sua próxima renovação do A1 PJ. Como ele fica na nuvem, você pode usá-lo para renovar seu Certificado PJ sem precisar de um novo atendimento presencial ou vídeo chamada. Isso te poupa tempo e torna tudo mais prático.\n \nAlém disso, se quiser, pode usar o Bird ID para assinar documentos como Pessoa Física. Para isso, basta ativá-lo comprando uma recarga Bird."
  },
  {
    "id": "equipe-.iphone",
    "comando": ".iphone",
    "resposta": "Na tela inicial, toque no ícone ⚙️ Ajustes.\n\n📱 Selecione \"Geral\"\nRole para baixo e toque em Geral.\n\n💾 Toque em \"Armazenamento do iPhone\"\nDentro de \"Geral\", escolha Armazenamento do iPhone.\n⏳ Pode levar alguns segundos para carregar a lista de apps instalados.\n\n🔍 Encontre o app BirdID\nRole a lista e toque em BirdID.\n\n🗑️ Toque em \"Apagar App\"\nIsso irá remover o aplicativo e todos os seus dados armazenados.\n\n✅ Confirme a exclusão\nToque novamente em Apagar App para confirmar.\n\n🔄 Reinstale o aplicativo\nVá até a App Store, procure por BirdID e reinstale o app.\n\n🚀 Abra o BirdID novamente\nApós reinstalar, abra o app normalmente — ele estará limpo e pronto para uso."
  },
  {
    "id": "equipe-.android",
    "comando": ".android",
    "resposta": "⚙️ Abra as Configurações do seu celular.\n\n📱 Vá em \"Apps\" ou \"Aplicativos\"\n(o nome pode variar conforme o modelo do aparelho).\n\n🔍 Localize e toque em \"BirdID\" na lista.\n\n💾 Toque em \"Armazenamento e cache\"\n\n🧹 Toque em \"Limpar cache\" e depois em \"Limpar armazenamento\" ou \"Limpar dados\"\nIsso apaga todos os dados salvos localmente pelo aplicativo.\n\n🔁 Reinicie o celular\nApós limpar os dados, reinicie o dispositivo para aplicar completamente as mudanças.\n\n🚀 Abra o BirdID novamente\nDepois de reiniciar, abra o app — ele estará limpo e funcionando como novo."
  },
  {
    "id": "equipe-.diferencas",
    "comando": ".diferencas",
    "resposta": "Diferença entre os certificados A1, A3 e Bird ID\n\n- Certificado A1\n\nArmazenamento: No computador ou sistema (arquivo .pfx ou .p12)\nValidade: 1 ano\nUso: Emissão de notas fiscais, acesso ao e-CAC, assinaturas automáticas\nVantagens: Prático, rápido e pode ser usado em sistemas automáticos\nDesvantagens: Se perder o arquivo e não tiver backup, precisa emitir outro\n\n- Certificado A3\n\nArmazenamento: Em um token USB ou cartão com leitora\nValidade: 1 a 3 anos\nUso: Assinaturas presenciais e documentos importantes\nVantagens: Alta segurança, não pode ser copiado\nDesvantagens: Precisa conectar o dispositivo e digitar senha toda vez\n\n- Certificado Bird ID (A3 em Nuvem)\n\nArmazenamento: Na nuvem, acessado pelo app Bird ID no celular\nValidade: 5 anos\nUso: Portais do governo (e-CAC, eSocial, Conectividade Social, NF-e)\nVantagens: Seguro, sem token físico, pode usar em qualquer lugar\nDesvantagens: Requer internet e autorização pelo app no celular"
  },
  {
    "id": "equipe-.meli",
    "comando": ".meli",
    "resposta": "💛 Parceria Soluti + Mercado Livre! 💛\n\nA Soluti é parceira oficial do Mercado Livre, e graças a essa parceria, os vendedores do Meli têm um super benefício 🎉\n\n📄 O Certificado Digital PJ A1 sai por apenas R$ 99,00 💰\n\n👉 Basta realizar a compra pelo link oficial:\n🔗 https://centrodepartners.mercadolivre.com.br/solutions/certificados/soluti\n\n🕒 Após a compra, você receberá o voucher de validação do certificado em até 24 horas."
  },
  {
    "id": "equipe-.duvida",
    "comando": ".duvida",
    "resposta": "Mais alguma duvida?"
  },
  {
    "id": "equipe-.mac",
    "comando": ".mac",
    "resposta": "🍎 MAC — Liberação de Acesso para Suporte Remoto\n\n👁️‍🗨️ Liberar Visualização da Tela\n1️⃣ Clique na maçã  no canto superior esquerdo.\n2️⃣ Vá em “Preferências do Sistema” (ou “Ajustes do Sistema” em algumas versões).\n3️⃣ Selecione “Segurança e Privacidade”.\n4️⃣ Acesse a aba “Gravação de Tela”.\n5️⃣ Marque a opção “Suporte Remoto”.\n🔒 Se o cadeado no canto inferior esquerdo estiver fechado, clique nele e insira a senha do Mac para destravar.\n\n🖱️ Liberar Controle Remoto\n1️⃣ Clique na maçã  no canto superior esquerdo.\n2️⃣ Vá em “Preferências do Sistema” (ou “Ajustes do Sistema”).\n3️⃣ Selecione “Segurança e Privacidade”.\n4️⃣ Entre na aba “Acessibilidade”.\n5️⃣ Marque a opção “Suporte Remoto”.\n6️⃣ Digite a senha do Mac ou use a leitura da digital para confirmar."
  },
  {
    "id": "equipe-.usuario",
    "comando": ".usuario",
    "resposta": "Preciso do usuário de emissão, que é um código que a Soluti te enviou por e-mail assim que o certificado foi aprovado, com o assunto \"Solicitação de certificado digital aprovada\". Dá uma olhadinha na sua caixa de entrada (ou no spam, às vezes cai lá) e me manda esse código aqui. 😉"
  },
  {
    "id": "equipe-.sms",
    "comando": ".sms",
    "resposta": "Sobre a recuperação da *senha no app BIRD ID*, tem um detalhe importante: o link que você recebeu por e-mail já dá a opção de recuperar via SMS, mas Texto realçado:essa alternativa só fica disponível *depois de 24 horas*.\n \nOu seja, se você não lembra da senha de emissão ou não tem acesso ao código OTP agora, precisa aguardar esse prazo para liberar a opção de SMS e então você pode entrar no mesmo link do e-mail para usar a opção de SMS e concluir a recuperação.\n \nEu sei que esperar é chato, mas depois desse tempo vai ficar bem mais fácil recuperar o acesso, tudo bem?"
  },
  {
    "id": "equipe-.solucoes",
    "comando": ".solucoes",
    "resposta": "Para este caso, é necessário entrar em contato com o departamento de Suporte ao AGR. Para isso, acesse o link abaixo, selecione a opção “Menu Soluções” e depois escolha a alternativa que mais se aproxima do problema enfrentado.\nhttps://www.soluti.com.br/atendimento-solucoes/"
  },
  {
    "id": "equipe-.tvendas",
    "comando": ".tvendas",
    "resposta": "Para que você consiga realizar a compra, vou transferir seu atendimento para o setor de vendas, que poderá prosseguir com todas as informações e finalizar o pedido para você."
  },
  {
    "id": "equipe-.erro",
    "comando": ".erro",
    "resposta": "Coloca o curso do mouse em cima do arquivo baixado e vai aparecer 3 pontinhos, clica nele e depois você vai clicar em \"Manter\". Vai abrir uma outra tela que vai ter um quadradinho azul e ao lado uma setinha, clica na setinha e depois clica em \"Manter mesmo assim\""
  },
  {
    "id": "equipe-.video",
    "comando": ".video",
    "resposta": "Você pode acessar o link abaixo para realizar a validação por videoconferência:\n\nhttps://vline.soluti.com.br/ardigisec?flow=vra\n\nRecomendo utilizar o navegador Google Chrome no celular para evitar erros durante o processo, além de garantir que esteja em uma conexão estável para não interromper a chamada."
  },
  {
    "id": "equipe-.emissor",
    "comando": ".emissor",
    "resposta": "Tente acessar por este programa:\nhttps://emissor.ca.inf.br/prod/Emissor.jnlp\n\nEsse arquivo abre um programa em Java, utilizado para realizar a emissão.\n\nCaso você não tenha o Java instalado, é necessário baixar e instalar por este link:\nhttps://www.java.com/pt-BR/download/\n\nApós a instalação, tente abrir o arquivo novamente."
  },
  {
    "id": "equipe-.recuperar",
    "comando": ".recuperar",
    "resposta": "🔐 Como redefinir sua senha no aplicativo BirdID\n\nAbra o aplicativo BirdID e clique em “Esqueci minha senha”.\n\nVocê receberá um 📧 e-mail de redefinição de senha no endereço cadastrado.\n\nAo abrir o e-mail, você verá três opções para redefinir a senha:\n\n🔑 Senha de emissão: Utilize a senha criada (ou recebida) no momento da emissão do certificado.\n\n📲 Token OTP: Informe o código OTP gerado dentro do aplicativo BirdID. Requer acesso ao BirdID em outro dispositivo.\n\n📱 SMS: Essa opção aparece apenas após 24 horas do recebimento do e-mail. Se não aparecer, aguarde e abra o mesmo e-mail depois desse período.\n\nEscolha a opção desejada e siga as instruções para criar uma nova senha.\n\nDepois disso, volte ao aplicativo e faça login com sua nova senha ✔️."
  },
  {
    "id": "equipe-.estorno",
    "comando": ".estorno",
    "resposta": "Para compras realizadas diretamente conosco, você pode solicitar o estorno pelo link:\nsoluti.com.br/estornos"
  },
  {
    "id": "equipe-.otp",
    "comando": ".otp",
    "resposta": "1. Na tela inicial do aplicativo BirdID, toque em Menu.\n2. Acesse a opção Configurações.\n3. Selecione Apagar Tudo.\n- Isso irá remover todos os dados do usuário sincronizado.\n4. Após a limpeza, faça login novamente informando seu CPF e senha.\n\n✅ Pronto! Depois disso, o aplicativo deve voltar a funcionar normalmente."
  },
  {
    "id": "equipe-.creditos",
    "comando": ".creditos",
    "resposta": "O BirdID possui um prazo total de validade de 5 anos.\nAo adquirir o BirdID, o cliente recebe 1 ano de créditos para utilizar o serviço normalmente. Após esse período inicial, é necessário realizar uma nova recarga para continuar usando o BirdID sem limitações.\n\nPara facilitar o entendimento, pense no BirdID como um cartão pré-pago:\n- O BirdID é o cartão.\n- Os créditos são o saldo disponível para uso.\n\nQuando esse saldo acaba, é preciso recarregar para ter acesso completo ao serviço.\n\nCaso os créditos se esgotem, o BirdID ainda poderá ser utilizado para:\n- Validar certificados em sistemas parceiros integrados com BirdID.\n\nPorém, não funcionará em plataformas que dependem da assinatura direta via BirdID, como: Adobe , GOV.BR...\n\nNesses casos, a recarga é obrigatória para que o BirdID volte a funcionar normalmente."
  },
  {
    "id": "equipe-.revogar",
    "comando": ".revogar",
    "resposta": "Certo, vamos resolver isso. A senha pode não estar funcionando por dois motivos: ou houve um erro na hora de anotá-la, ou pode ter ocorrido um problema interno nosso.\n \nDe qualquer forma, o próximo passo é solicitar a revogação do certificado. Assim que você fizer isso, a revogação será concluída em até 24 horas.\n \nDepois que o certificado for revogado, você poderá usar o mesmo voucher/pedido para fazer uma nova videoconferência e gerar uma nova senha de emissão.\n \nPosso te passar agora os passos para solicitar a revogação, pode ser?"
  },
  {
    "id": "equipe-.cordealidade",
    "comando": ".cordealidade",
    "resposta": "Certo, devido à falta de cordialidade durante o atendimento, informo que estarei encerrando este chamado no momento. Permanecemos à disposição para dar continuidade ao suporte assim que o contato puder ocorrer de forma respeitosa e adequada."
  },
  {
    "id": "equipe-.audio",
    "comando": ".audio",
    "resposta": "No momento, não consigo ouvir áudios, mas fico feliz em te atender pelo chat!\nSe preferir conversar por voz, é só ligar para (62) 4000-1807. Conte conosco!"
  },
  {
    "id": "equipe-.gov",
    "comando": ".gov",
    "resposta": "Certo, vamos fazer um teste.\n\nAcesse o site: gov.br/pt-br\n\nDepois, clique na opção “Entrar com gov.br” no canto superior direito.\n\nNa próxima tela, selecione a opção “Seu certificado digital em nuvem” e escolha o BirdID."
  }
];
