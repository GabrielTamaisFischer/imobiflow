// WhatsAppProvider — mesmo padrão de adapter usado em StorageProvider
// (services/storage/types.ts): uma interface estável que qualquer rota ou
// automação pode chamar, sem nunca conhecer qual implementação está ativa.
//
// Diretriz Mestre do MVP, Secao 7 (correcao de 2026-08-31): o MVP NÃO envia
// mensagem nenhuma pelo servidor. buildDeepLink() apenas monta um link
// https://wa.me/<telefone>?text=<mensagem> — quem efetivamente decide enviar
// é o USUÁRIO, clicando um botão na UI que abre esse link no WhatsApp/WhatsApp
// Web dele. Por isso este método é síncrono (não faz nenhuma chamada de rede)
// e nunca retorna "sent": nenhum provider deste MVP pode alegar que enviou
// algo, porque nenhum deles envia de fato.
//
// A interface deixa espaço para, no futuro, um provider HTTP real (WhatsApp
// Business API paga) ser adicionado — ele implementaria esta mesma interface
// e, adicionalmente, um método de envio real assíncrono — sem que quem chama
// buildDeepLink() hoje (property-events.ts, rotas de Imóveis) precise mudar.

export type WhatsAppDeepLinkInput = {
  companyId: string;
  toPhone: string;
  toName?: string | null;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  metadata?: Record<string, unknown>;
};

export type WhatsAppDeepLink = {
  provider: string;
  /** https://wa.me/<telefone>?text=<mensagem codificada> — nunca chamado pelo servidor, só aberto pelo navegador do usuário. */
  url: string;
  phone: string;
  message: string;
};

export interface WhatsAppProvider {
  readonly name: string;
  /** Monta o deeplink. NÃO envia nada — nenhuma chamada de rede acontece aqui. */
  buildDeepLink(input: WhatsAppDeepLinkInput): WhatsAppDeepLink;
}
