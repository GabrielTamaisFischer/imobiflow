import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { getWhatsAppProvider } from "./whatsapp/index.js";
import { loadMysqlPublicPropertyByReference, prisma } from "./mysql-real-estate.js";

// NOTA TÉCNICA (2026-08-30, atualizada): "property_published_owner_notified",
// "property_published_owner_notification_skipped" e (2026-08-31)
// "property_published_whatsapp_link_opened" já existem de verdade no enum
// website_audit_logs.action no banco (migrações
// 202608300004_property_published_notification_audit e
// 202608310001_property_published_whatsapp_link_opened, ambas aplicadas e
// verificadas via SHOW COLUMNS). O Prisma Client gerado neste sandbox está
// desatualizado porque `prisma generate` precisa baixar o schema-engine de
// binaries.prisma.sh, bloqueado pela rede deste ambiente.
//
// Verificação end-to-end real (2026-08-30) mostrou que um simples cast de
// TIPO (`as WebsiteAuditActionWorkaround as never`) NÃO bastava: o Prisma
// Client valida o valor do enum em TEMPO DE EXECUÇÃO contra os metadados
// (DMMF) gerados — que são os antigos, sem os valores novos — e lança
// PrismaClientValidationError mesmo a coluna aceitando o valor no MySQL.
// Por isso estes inserts usam SQL bruto ($executeRaw) só para os valores de
// enum novos, contornando a validação client-side do Prisma. O restante do
// módulo (Property, CompanySite) continua usando o Prisma Client normalmente.
// Remover o $executeRaw e voltar a usar prisma().websiteAuditLog.create()
// assim que o client for regenerado num ambiente com acesso à rede da Prisma.
async function insertWebsiteAuditLogRaw(row: {
  companyId: string;
  actorUserId?: string | null;
  action:
    | "property_published_owner_notified"
    | "property_published_owner_notification_skipped"
    | "property_published_whatsapp_link_opened";
  entityType: string;
  entityId: string;
  metadataJson: Record<string, unknown>;
}) {
  const id = randomUUID();
  await prisma().$executeRaw`
    INSERT INTO website_audit_logs (id, company_id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
    VALUES (${id}, ${row.companyId}, ${row.actorUserId ?? null}, ${row.action}, ${row.entityType}, ${row.entityId}, ${JSON.stringify(row.metadataJson)}, NOW())
  `;
}

export type WhatsAppOwnerNotificationEligibility =
  | {
      eligible: true;
      provider: string;
      phone: string;
      ownerName: string | null;
      companyName: string;
      code: string;
      title: string;
      publicUrl: string;
      message: string;
      waUrl: string;
    }
  | { eligible: false; reason: string };

// Diretriz Mestre do MVP, Secao 7 (correcao de 2026-08-31): o servidor NUNCA
// envia a mensagem de WhatsApp automaticamente. Esta função só CALCULA se um
// deeplink pode ser oferecido para o usuário e monta o texto/URL prontos —
// quem decide de fato "enviar" é o usuário, clicando o botão na UI e
// confirmando dentro do próprio WhatsApp. Reaproveitada por:
//   1) emitPropertyPublishedEvent() logo após a publicação, só para registrar
//      (auditoria) quando o WhatsApp NÃO pôde ser oferecido e por quê —
//      nunca para "enviar" nada;
//   2) GET /properties/:id/whatsapp-link (routes/sites.ts), chamada sob
//      demanda quando o usuário abre a tela e o botão precisa aparecer/ficar
//      desabilitado com o motivo certo.
//
// Só considera elegível DEPOIS que a URL pública foi validada de verdade —
// não "publishedAt != null", mas uma chamada real a
// loadMysqlPublicPropertyByReference(), o MESMO código que a rota pública
// (GET /public/sites/:slug/properties/:ref) usa.
export async function resolveWhatsAppOwnerNotification(
  companyId: string,
  propertyId: string,
): Promise<WhatsAppOwnerNotificationEligibility> {
  const property = await prisma().property.findFirst({
    where: { id: propertyId, companyId },
    include: { owner: true },
  });
  if (!property) return { eligible: false, reason: "PROPERTY_NOT_FOUND" };

  const company = await prisma().company.findFirst({ where: { id: companyId } });
  if (!company) return { eligible: false, reason: "COMPANY_NOT_FOUND" };

  const site = await prisma().companySite.findFirst({
    where: { companyId, status: "published" },
  });
  if (!site) return { eligible: false, reason: "SITE_NOT_PUBLISHED" };

  const reference = property.code || property.id;
  let publicProperty: Awaited<ReturnType<typeof loadMysqlPublicPropertyByReference>>;
  try {
    // Validação real da URL pública: reusa o MESMO caminho de código que um
    // visitante real percorre. Se o imóvel não estiver de fato visível
    // (checklist incompleto, empresa suspensa, assinatura vencida etc.),
    // isto lança e cai no catch abaixo — nunca oferece um link quebrado.
    publicProperty = await loadMysqlPublicPropertyByReference(
      { companyId: site.companyId, settingsJson: site.settingsJson },
      reference,
    );
  } catch {
    return { eligible: false, reason: "PUBLIC_URL_NOT_READY" };
  }
  if (!publicProperty) return { eligible: false, reason: "PUBLIC_URL_NOT_READY" };

  const ownerPhone = property.owner?.whatsapp || property.owner?.phone;
  if (!ownerPhone) return { eligible: false, reason: "OWNER_WITHOUT_PHONE" };

  // URL da página do IMÓVEL especificamente, não a home do site — a Seção 7
  // da diretriz pede "URL pública do imóvel". A rota pública é
  // /site/:slug/imoveis/:code (site.$slug.imoveis.$propertySlug.tsx).
  const publicUrl = `${env.APP_URL}/site/${site.slug}/imoveis/${encodeURIComponent(reference)}`;
  const ownerFirstName = (property.owner?.name ?? "").trim().split(/\s+/)[0] || null;

  const message = [
    ownerFirstName ? `Olá, ${ownerFirstName}!` : "Olá!",
    "",
    `Seu imóvel ${property.code ?? property.id.slice(0, 8)} — ${property.title} foi cadastrado e publicado pela ${company.name}.`,
    "",
    "Você pode conferir como ficou seu anúncio acessando:",
    publicUrl,
    "",
    "Atenciosamente,",
    company.name,
  ].join("\n");

  const deepLink = getWhatsAppProvider().buildDeepLink({
    companyId,
    toPhone: ownerPhone,
    toName: property.owner?.name ?? null,
    message,
    relatedEntityType: "properties",
    relatedEntityId: propertyId,
    metadata: { event: "property.published", public_url: publicUrl },
  });

  return {
    eligible: true,
    provider: deepLink.provider,
    phone: deepLink.phone,
    ownerName: property.owner?.name ?? null,
    companyName: company.name,
    code: property.code ?? property.id.slice(0, 8),
    title: property.title,
    publicUrl,
    message: deepLink.message,
    waUrl: deepLink.url,
  };
}

// Chamada de forma "fire and forget" pela rota de publicação (sites.ts,
// POST /properties/:id/publish) — nunca bloqueia nem derruba essa resposta.
// Só registra em auditoria os casos em que o WhatsApp NÃO pôde ser oferecido
// (e por quê). Quando é elegível, NÃO grava nada aqui: nada foi enviado nem
// aberto ainda — só quando o usuário efetivamente abrir o link
// (POST /properties/:id/whatsapp-link-opened) é que existe uma ação real
// para auditar. Isso evita repetir o erro encontrado na auditoria de
// 2026-08-31: registrar "owner_notified" quando, na verdade, nenhuma
// mensagem foi enviada.
export async function emitPropertyPublishedEvent(companyId: string, propertyId: string) {
  try {
    const result = await resolveWhatsAppOwnerNotification(companyId, propertyId);
    if (!result.eligible) {
      await insertWebsiteAuditLogRaw({
        companyId,
        action: "property_published_owner_notification_skipped",
        entityType: "properties",
        entityId: propertyId,
        metadataJson: { reason: result.reason },
      });
    }
    return result;
  } catch (error) {
    console.error(
      "[property.published] Falha ao avaliar elegibilidade de WhatsApp (não bloqueia a publicação).",
      error,
    );
    await insertWebsiteAuditLogRaw({
      companyId,
      action: "property_published_owner_notification_skipped",
      entityType: "properties",
      entityId: propertyId,
      metadataJson: { reason: "ERROR" },
    }).catch(() => undefined);
    return { eligible: false as const, reason: "ERROR" };
  }
}

// Chamada pela rota POST /properties/:id/whatsapp-link-opened quando o
// FRONTEND confirma que o usuário clicou no botão "Enviar anúncio ao
// proprietário pelo WhatsApp" e o link foi de fato aberto no navegador. Isto
// NUNCA significa que a mensagem chegou ao proprietário — só que o usuário
// da imobiliária abriu o WhatsApp com o texto pronto. A distinção é
// deliberada (Diretriz Mestre, Seção 7: "Não afirmar que uma mensagem foi
// enviada se apenas o link foi aberto").
export async function recordWhatsAppLinkOpened(
  companyId: string,
  propertyId: string,
  actorUserId: string | null,
) {
  await insertWebsiteAuditLogRaw({
    companyId,
    actorUserId,
    action: "property_published_whatsapp_link_opened",
    entityType: "properties",
    entityId: propertyId,
    metadataJson: { provider: "whatsapp_deeplink" },
  });
}
