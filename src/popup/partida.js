// Partida das abas Começar e E-mails. Vem por último: precisa de tudo que as
// outras já definiram.
montarPainelDoDia();
carregarModelosEmail().catch((erro) =>
  console.error("Apoio Soluti: modelos de e-mail:", erro)
);
carregarAtalhoDoDia();
