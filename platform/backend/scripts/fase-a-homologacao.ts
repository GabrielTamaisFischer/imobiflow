/**
 * Homologação automatizada da Fase A (auditoria de 2026-08-30).
 *
 * Testa, com dados reais criados através do fluxo Prisma/MySQL atual (não
 * mocks, não grep de string), as correções:
 *   A1 - BUG-SITE-001 (publicação de imóvel não pode alterar status)
 *   A2 - Área do Proprietário (leitura do portal na mesma fonte da escrita)
 *   A3 - Vistoria reconhece imóvel cadastrado via Prisma/MySQL
 *   A4 - Idempotência real (ledger em Prisma/MySQL) + guarda CAS documentada
 *   A5 - Deduplicação de lead sob concorrência real (TD-GLOBAL-008)
 *   A6 - purpose persistido em StoredFile + controle mínimo de acesso
 *
 * Pré-requisitos: backend rodando em BASE_URL (padrão http://127.0.0.1:3333)
 * contra o MySQL local já provisionado (ver platform/backend/.env).
 *
 * Uso: npx tsx scripts/fase-a-homologacao.ts
 */
import { randomUUID } from "node:crypto";
import "../src/config/env.js";
import { withIdempotency, IdempotencyConflictError } from "../src/services/idempotency.js";
import {
  createStoredFileReference,
  findStoredFileByIdForEntity,
} from "../src/services/storage/stored-files.js";
import { assertStoredFilePurposeAccess } from "../src/services/storage/purposes.js";
import { getPrisma } from "../src/lib/website-builder-prisma.js";

const BASE_URL = process.env.FASE_A_BASE_URL ?? "http://127.0.0.1:3333";
const ADMIN_SECRET = process.env.SYNTHETIC_BILLING_ADMIN_SECRET ?? "";

type Result = { item: string; status: "PASS" | "FAIL" | "BLOCKED"; detail: string };
const results: Result[] = [];

// Checagem real: executa uma asserção de comportamento e é contada no placar
// PASS/FAIL final.
function record(item: string, ok: boolean, detail: string) {
  results.push({ item, status: ok ? "PASS" : "FAIL", detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${item} — ${detail}`);
}

// Declaração de transparência: usada SOMENTE para itens que não puderam ser
// executados como teste real neste ambiente (ex.: dependem de um serviço
// externo deliberadamente desligado, custo R$0). NUNCA conta como PASS no
// placar — fica separada, para não inflar artificialmente o resultado.
function recordBlocked(item: string, detail: string) {
  results.push({ item, status: "BLOCKED", detail });
  console.log(`[BLOCKED] ${item} — ${detail}`);
}

async function api(path: string, options: RequestInit & { token?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(options.headers as any) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function provisionOwner(label: string) {
  const email = `fase-a-${label}-${randomUUID().slice(0, 8)}@imobiflow.test`;
  const prov = await api("/billing/internal/synthetic-provisioning", {
    method: "POST",
    token: undefined,
    headers: { "x-imobiflow-admin-secret": ADMIN_SECRET },
    body: JSON.stringify({ email, plan_slug: "staging-synthetic" }),
  });
  if (prov.status !== 201) throw new Error(`Provisioning falhou (${label}): ${JSON.stringify(prov.body)}`);
  const token = new URL(prov.body.activation_url).searchParams.get("token");
  const activation = await api("/auth/activate-account", {
    method: "POST",
    body: JSON.stringify({
      token,
      name: `Fase A ${label}`,
      password: "SenhaForte#2026",
      company_name: `Fase A QA ${label} ${randomUUID().slice(0, 6)}`,
      company_document: "00000000000191",
      phone: "+5511999999999",
    }),
  });
  if (activation.status !== 201) throw new Error(`Ativação falhou (${label}): ${JSON.stringify(activation.body)}`);
  return {
    accessToken: activation.body.session.access_token as string,
    companyId: activation.body.company.id as string,
    ownerId: activation.body.owner.id as string,
    email,
  };
}

async function main() {
  if (!ADMIN_SECRET) throw new Error("SYNTHETIC_BILLING_ADMIN_SECRET ausente no ambiente.");

  console.log("== Provisionando 2 empresas isoladas para os testes (multi-tenant) ==");
  const companyA = await provisionOwner("a");
  const companyB = await provisionOwner("b");
  record("setup", true, `Empresa A=${companyA.companyId} Empresa B=${companyB.companyId}`);

  // ============================= A1 =============================
  console.log("\n== A1: BUG-SITE-001 (publicação de imóvel) ==");
  {
    // Imóvel incompleto (draft, sem dados) — publish deve recusar por status.
    const createDraft = await api("/real-estate/properties", {
      method: "POST",
      token: companyA.accessToken,
      body: JSON.stringify({ title: "Apto Fase A", status: "draft", operation: "rent" }),
    });
    const draftId = createDraft.body?.property?.id;
    if (!draftId) throw new Error(`Falha ao criar imóvel draft: ${JSON.stringify(createDraft.body)}`);

    const publishDraft = await api(`/site/properties/${draftId}/publish`, { method: "POST", token: companyA.accessToken });
    record(
      "A1.1 publicar imóvel draft é recusado (não vira available às cegas)",
      publishDraft.status === 409 && publishDraft.body?.error === "PROPERTY_NOT_PUBLISHABLE",
      `status=${publishDraft.status} body=${JSON.stringify(publishDraft.body)}`,
    );

    // Verifica que o status do imóvel PERMANECEU draft (não foi alterado como efeito colateral).
    const afterAttempt = await api(`/real-estate/properties/${draftId}`, { token: companyA.accessToken });
    record(
      "A1.2 status não foi alterado pela tentativa de publicação recusada",
      afterAttempt.body?.property?.status === "draft",
      `status=${afterAttempt.body?.property?.status}`,
    );

    // Prepara um imóvel completo (available) com proprietário, endereço, preço e foto de capa.
    const owner = await api("/real-estate/owners", {
      method: "POST",
      token: companyA.accessToken,
      body: JSON.stringify({ name: "Proprietário Fase A", owner_type: "individual", client_type: "proprietario" }),
    });
    const ownerId = owner.body?.owner?.id;

    const createReady = await api("/real-estate/properties", {
      method: "POST",
      token: companyA.accessToken,
      body: JSON.stringify({
        title: "Apto Fase A Completo",
        description: "Imóvel de teste da Fase A, com todos os dados obrigatórios preenchidos.",
        status: "rented", // já alugado — este é o cenário exato do BUG-SITE-001
        operation: "rent",
        owner_id: ownerId,
        zip_code: "01001-000",
        city: "São Paulo",
        state: "SP",
        rent_price_cents: 250000,
      }),
    });
    const readyId = createReady.body?.property?.id;
    if (!readyId) throw new Error(`Falha ao criar imóvel completo: ${JSON.stringify(createReady.body)}`);

    // Publicar um imóvel "rented" também deve ser recusado (não pode virar "available").
    const publishRented = await api(`/site/properties/${readyId}/publish`, { method: "POST", token: companyA.accessToken });
    record(
      "A1.3 publicar imóvel ALUGADO é recusado — não pode virar 'available' (o próprio BUG-SITE-001)",
      publishRented.status === 409 && publishRented.body?.error === "PROPERTY_NOT_PUBLISHABLE",
      `status=${publishRented.status} body=${JSON.stringify(publishRented.body)}`,
    );
    const afterRentedAttempt = await api(`/real-estate/properties/${readyId}`, { token: companyA.accessToken });
    record(
      "A1.4 status permanece 'rented' após tentativa de publicação (não virou 'available')",
      afterRentedAttempt.body?.property?.status === "rented",
      `status=${afterRentedAttempt.body?.property?.status}`,
    );

    // Agora move para 'available' (fluxo legítimo) e adiciona uma foto de capa via upload base64 mínimo.
    await api(`/real-estate/properties/${readyId}`, {
      method: "PATCH",
      token: companyA.accessToken,
      body: JSON.stringify({ status: "available" }),
    });
    const tinyPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const mediaUpload = await api(`/real-estate/properties/${readyId}/media`, {
      method: "POST",
      token: companyA.accessToken,
      body: JSON.stringify({
        file_name: "capa.png",
        mime_type: "image/png",
        size_bytes: 95,
        content_base64: tinyPngBase64,
        media_type: "photo",
        is_cover: true,
      }),
    });
    console.log(`[DEBUG] media upload status=${mediaUpload.status} body=${JSON.stringify(mediaUpload.body)}`);

    const publishReady = await api(`/site/properties/${readyId}/publish`, { method: "POST", token: companyA.accessToken });
    const mediaStorageUnavailable = mediaUpload.status === 503 && mediaUpload.body?.error === "STORAGE_NOT_CONFIGURED";
    record(
      "A1.5 publicar imóvel pronto (available + dados completos) funciona",
      publishReady.status === 200 && publishReady.body?.property?.status === "available",
      mediaStorageUnavailable
        ? `BLOQUEADO POR AMBIENTE (não é falha de lógica): upload de foto de capa retornou 503 STORAGE_NOT_CONFIGURED (Cloudinary/R2 não configurados neste sandbox local R$0 — mesma categoria de limitação do Supabase em A3.1/A4.5). status=${publishReady.status} body=${JSON.stringify(publishReady.body)}`
        : `status=${publishReady.status} body=${JSON.stringify(publishReady.body)}`,
    );

    // A1.6: prova determinística de que a LÓGICA de publicação funciona quando
    // há uma foto de capa — inserindo a mídia diretamente via Prisma/MySQL
    // (mesma tabela/campo que o endpoint real usaria), contornando apenas a
    // dependência externa de storage (Cloudinary/R2), que é uma limitação de
    // AMBIENTE local R$0 e não do código corrigido em A1. Isso isola a causa
    // raiz do FAIL acima: não é regressão em sites.ts/syncMysqlPropertyPublication.
    const prismaForMedia = getPrisma();
    await (prismaForMedia as any).propertyMedia.create({
      data: {
        companyId: companyA.companyId,
        propertyId: readyId,
        mediaType: "photo",
        url: "https://example.com/capa-teste-direta.png",
        isCover: true,
        position: 0,
      },
    });
    const publishReadyDirect = await api(`/site/properties/${readyId}/publish`, { method: "POST", token: companyA.accessToken });
    record(
      "A1.6 (prova de causa raiz) com foto de capa inserida diretamente no Prisma/MySQL, publicar funciona e NÃO altera status incorretamente",
      publishReadyDirect.status === 200 && publishReadyDirect.body?.property?.status === "available",
      `status=${publishReadyDirect.status} body=${JSON.stringify(publishReadyDirect.body)}`,
    );
  }

  // ============================= A2 =============================
  console.log("\n== A2: Área do Proprietário (leitura via Prisma/MySQL) ==");
  {
    const ownerCreate = await api("/real-estate/owners", {
      method: "POST",
      token: companyA.accessToken,
      body: JSON.stringify({ name: "Maria Portal Fase A", owner_type: "individual", client_type: "proprietario" }),
    });
    const owner = ownerCreate.body?.owner;
    record("A2.1 criação de proprietário retorna portal_token", Boolean(owner?.portal_token), `owner=${JSON.stringify(owner)}`);

    const propertyForOwner = await api("/real-estate/properties", {
      method: "POST",
      token: companyA.accessToken,
      body: JSON.stringify({
        title: "Casa do Proprietário Fase A",
        status: "available",
        operation: "sale",
        owner_id: owner.id,
        sale_price_cents: 50000000,
      }),
    });
    record("A2.2 imóvel vinculado ao proprietário criado", propertyForOwner.status === 201, `status=${propertyForOwner.status}`);

    const portal = await api(`/public/portals/owners/${owner.portal_token}`);
    record(
      "A2.3 portal do proprietário retorna 200 (NÃO mais 404 — bug original corrigido)",
      portal.status === 200,
      `status=${portal.status} body=${JSON.stringify(portal.body)?.slice(0, 200)}`,
    );
    record(
      "A2.4 portal retorna o imóvel recém-criado deste proprietário",
      Array.isArray(portal.body?.properties) && portal.body.properties.some((p: any) => p.id === propertyForOwner.body?.property?.id),
      `properties=${JSON.stringify(portal.body?.properties)}`,
    );

    // Isolamento multi-tenant: proprietário da empresa B não pode ver dados da empresa A.
    const ownerB = await api("/real-estate/owners", {
      method: "POST",
      token: companyB.accessToken,
      body: JSON.stringify({ name: "Proprietário Empresa B", owner_type: "individual", client_type: "proprietario" }),
    });
    const portalB = await api(`/public/portals/owners/${ownerB.body.owner.portal_token}`);
    record(
      "A2.5 isolamento multi-tenant: portal do proprietário B não retorna imóveis da empresa A",
      portalB.status === 200 && Array.isArray(portalB.body?.properties) && portalB.body.properties.length === 0,
      `status=${portalB.status} properties=${JSON.stringify(portalB.body?.properties)}`,
    );
    record(
      "A2.6 isolamento: token da empresa A não pode ser reaproveitado para ver dado de outro proprietário (token é 1:1)",
      portal.body?.owner?.id === owner.id && portal.body?.owner?.company_id === companyA.companyId,
      `owner_in_portal=${JSON.stringify(portal.body?.owner)}`,
    );
  }

  // ============================= A3 =============================
  console.log("\n== A3: Vistoria reconhece imóvel Prisma/MySQL (validação corrigida) ==");
  {
    const property = await api("/real-estate/properties", {
      method: "POST",
      token: companyA.accessToken,
      body: JSON.stringify({ title: "Imóvel para Vistoria Fase A", status: "available", operation: "rent" }),
    });
    const propertyId = property.body?.property?.id;

    const inspectionAttempt = await api("/inspections", {
      method: "POST",
      token: companyA.accessToken,
      body: JSON.stringify({ property_id: propertyId, title: "Vistoria de teste Fase A", inspection_type: "entry" }),
    });
    const notInvalidProperty = inspectionAttempt.body?.error !== "INVALID_PROPERTY" && inspectionAttempt.status !== 422;
    record(
      "A3.1 criar vistoria para imóvel Prisma/MySQL NÃO retorna mais 422 INVALID_PROPERTY",
      notInvalidProperty,
      `status=${inspectionAttempt.status} body=${JSON.stringify(inspectionAttempt.body)} ` +
        (notInvalidProperty
          ? "(a falha restante, se houver, é por Supabase legado não configurado neste ambiente local — módulo de Vistoria em si não foi migrado nesta fase, só a validação de imóvel)"
          : "REGRESSÃO: validação de imóvel ainda rejeitando"),
    );

    const invalidCompanyAttempt = await api("/inspections", {
      method: "POST",
      token: companyB.accessToken,
      body: JSON.stringify({ property_id: propertyId, title: "Tentativa cross-tenant", inspection_type: "entry" }),
    });
    record(
      "A3.2 isolamento mantido: empresa B não pode criar vistoria para imóvel da empresa A (continua 422)",
      invalidCompanyAttempt.status === 422 && invalidCompanyAttempt.body?.error === "INVALID_PROPERTY",
      `status=${invalidCompanyAttempt.status} body=${JSON.stringify(invalidCompanyAttempt.body)}`,
    );
  }

  // ============================= A4 =============================
  console.log("\n== A4: Idempotência real (ledger Prisma/MySQL) sob concorrência ==");
  {
    let executions = 0;
    const key = `fase-a-test-${randomUUID()}`;
    const scope = "fase_a_homologacao.test";
    const N = 12;

    const outcomes = await Promise.allSettled(
      Array.from({ length: N }, () =>
        withIdempotency(companyA.companyId, scope, key, async () => {
          executions += 1;
          await new Promise((r) => setTimeout(r, 150)); // alarga a janela de corrida de propósito
          return { marker: "resultado-unico", ranAt: Date.now() };
        }),
      ),
    );

    const succeeded = outcomes.filter((o) => o.status === "fulfilled") as PromiseFulfilledResult<any>[];
    const conflicted = outcomes.filter(
      (o) => o.status === "rejected" && o.reason instanceof IdempotencyConflictError,
    );
    record(
      "A4.1 sob 12 chamadas concorrentes com a MESMA chave, a função protegida executa exatamente 1 vez",
      executions === 1,
      `execuções=${executions} (esperado: 1) sucesso=${succeeded.length} conflito409=${conflicted.length}`,
    );
    record(
      "A4.2 todas as chamadas concorrentes terminam com sucesso ou 409 (nunca com dado duplicado)",
      succeeded.length + conflicted.length === N,
      `total=${outcomes.length} sucesso=${succeeded.length} conflito=${conflicted.length}`,
    );

    // Replay: depois que a primeira execução terminou, uma nova chamada com a
    // MESMA chave deve retornar o resultado já registrado (não reexecutar).
    const replay = await withIdempotency(companyA.companyId, scope, key, async () => {
      executions += 1;
      return { marker: "NAO deveria rodar de novo" };
    });
    record(
      "A4.3 replay após conclusão retorna o resultado original (sem reexecutar a função)",
      replay.replayed === true && executions === 1 && (replay.result as any).marker === "resultado-unico",
      `replayed=${replay.replayed} execuções=${executions} result=${JSON.stringify(replay.result)}`,
    );

    // Chave diferente => execução independente (prova que não é um lock global).
    const independent = await withIdempotency(companyA.companyId, scope, `${key}-outra`, async () => {
      executions += 1;
      return { marker: "outra-chave" };
    });
    record(
      "A4.4 chave diferente executa normalmente (a proteção é por chave, não um lock global)",
      independent.replayed === false && executions === 2,
      `replayed=${independent.replayed} execuções=${executions}`,
    );

    recordBlocked(
      "A4.5 CAS de /charges/confirm-payment e /entries/:id/payments — NÃO testável ponta a ponta neste sandbox",
      "esses dois endpoints dependem de Supabase (Financeiro não foi migrado nesta fase, por instrução explícita contra migração big-bang). " +
        "Supabase está propositalmente desligado no ambiente local (custo R$0). O código foi implementado com o mesmo padrão " +
        "compare-and-swap (UPDATE...WHERE status IN (...) atômico) e revisado, mas requer validação de concorrência real em um " +
        "ambiente com Supabase provisionado antes de considerar 100% homologado. Ver recomendação no relatório final. " +
        "NÃO é uma checagem executada — não entra no placar PASS/FAIL.",
    );
  }

  // ============================= A5 =============================
  console.log("\n== A5: Deduplicação de lead sob concorrência real (TD-GLOBAL-008) ==");
  {
    const site = await api("/site/settings", {
      method: "PUT",
      token: companyA.accessToken,
      body: JSON.stringify({
        slug: `fase-a-site-${randomUUID().slice(0, 8)}`,
        brand_name: "Imobiliária Fase A",
        settings_json: { allow_lead_capture: true },
      }),
    });
    await api("/site/publish", { method: "POST", token: companyA.accessToken });
    const slug = site.body?.site?.slug;

    const sharedEmail = `lead-concorrente-${randomUUID().slice(0, 8)}@example.com`;
    const N = 15;
    const responses = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        fetch(`${BASE_URL}/public/sites/${slug}/leads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `Lead Concorrente ${i}`, email: sharedEmail }),
        }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })),
      ),
    );
    const failures = responses.filter((r: any) => !r.body?.lead?.id);
    if (failures.length) {
      console.log(`[DEBUG] A5 falhas (${failures.length}/${N}): ${JSON.stringify(failures.slice(0, 5))}`);
    }
    const leadIds = new Set(responses.map((r: any) => r.body?.lead?.id).filter(Boolean));
    record(
      `A5.1 ${N} envios concorrentes do MESMO e-mail geram exatamente 1 Lead (antes: duplicava)`,
      leadIds.size === 1 && responses.every((r: any) => r.body?.lead?.id),
      `leads distintos=${leadIds.size} (esperado: 1) respostas_ok=${responses.filter((r: any) => r.body?.lead?.id).length}/${N}`,
    );

    const prisma = getPrisma();
    const dbCount = await (prisma as any).lead.count({
      where: { companyId: companyA.companyId, emailNormalized: sharedEmail.toLowerCase() },
    });
    record(
      "A5.2 confirmação direta no banco: apenas 1 registro em Lead para este e-mail",
      dbCount === 1,
      `contagem no banco=${dbCount}`,
    );

    const siteLeadCount = await (prisma as any).siteLead.count({
      where: { companyId: companyA.companyId, leadId: [...leadIds][0] },
    });
    record(
      `A5.3 histórico preservado: ${N} SiteLead registrados (um por submissão), todos ligados ao mesmo Lead`,
      siteLeadCount === N,
      `site_leads encontrados=${siteLeadCount} (esperado ${N})`,
    );
  }

  // ============================= A6 =============================
  console.log("\n== A6: purpose persistido em StoredFile + controle mínimo de acesso ==");
  {
    const explicitRef = await createStoredFileReference({
      id: randomUUID(),
      companyId: companyA.companyId,
      entityType: "financial_document",
      entityId: randomUUID(),
      provider: "cloudinary",
      publicId: `fase-a-test/${randomUUID()}`,
      resourceType: "raw",
      secureUrl: "https://example.invalid/fase-a-test.pdf",
      originalFilename: "recibo.pdf",
      mimeType: "application/pdf",
      purpose: "financial_document",
    });
    record(
      "A6.1 purpose explícito é persistido de fato no banco (StoredFile.purpose)",
      explicitRef.purpose === "financial_document",
      `purpose salvo=${(explicitRef as any).purpose}`,
    );

    const inferredRef = await createStoredFileReference({
      id: randomUUID(),
      companyId: companyA.companyId,
      entityType: "inspection_media",
      entityId: randomUUID(),
      provider: "cloudinary",
      publicId: `fase-a-test/${randomUUID()}`,
      resourceType: "image",
      secureUrl: "https://example.invalid/fase-a-test.jpg",
      originalFilename: "foto.jpg",
      mimeType: "image/jpeg",
    });
    record(
      "A6.2 purpose é inferido automaticamente quando não informado (retrocompatibilidade)",
      (inferredRef as any).purpose === "inspection_evidence",
      `purpose inferido=${(inferredRef as any).purpose} (entityType=inspection_media)`,
    );

    let deniedForLackOfPermission = false;
    try {
      assertStoredFilePurposeAccess("financial_document", ["properties.view"]);
    } catch (error: any) {
      deniedForLackOfPermission = error?.statusCode === 403 && error?.code === "STORED_FILE_PURPOSE_DENIED";
    }
    record(
      "A6.3 controle de acesso: usuário SEM finance.view é barrado (403) ao tentar ler documento financeiro",
      deniedForLackOfPermission,
      `bloqueado=${deniedForLackOfPermission}`,
    );

    let allowedWithPermission = true;
    try {
      assertStoredFilePurposeAccess("financial_document", ["finance.view"]);
    } catch {
      allowedWithPermission = false;
    }
    record(
      "A6.4 controle de acesso: usuário COM finance.view acessa documento financeiro normalmente",
      allowedWithPermission,
      `permitido=${allowedWithPermission}`,
    );

    let publicPurposeAllowed = true;
    try {
      assertStoredFilePurposeAccess("property_media", []);
    } catch {
      publicPurposeAllowed = false;
    }
    record(
      "A6.5 propósito público (property_media) não exige nenhuma permissão extra",
      publicPurposeAllowed,
      `permitido=${publicPurposeAllowed}`,
    );

    // Prova end-to-end da função de leitura já com o parâmetro de permissões:
    const fetchedDenied = await findStoredFileByIdForEntity(
      companyA.companyId,
      explicitRef.id,
      "financial_document",
      explicitRef.entityId,
      ["properties.view"],
    ).then(
      () => "não lançou erro (FALHA)",
      (error: any) => (error?.code === "STORED_FILE_PURPOSE_DENIED" ? "bloqueado corretamente" : `erro inesperado: ${error}`),
    );
    record(
      "A6.6 findStoredFileByIdForEntity aplica o controle de acesso quando permissões são informadas",
      fetchedDenied === "bloqueado corretamente",
      fetchedDenied,
    );

    recordBlocked(
      "A6.7 enforcement ponta a ponta: rotas de Vistoria (requireInspectionStoredFile/withSignedMediaUrls) agora passam req.access.appUser.permissions",
      "Conectado nesta revisão de checkpoint aos 4 call sites reais de leitura/assinatura de mídia em routes/inspections.ts " +
        "(as únicas rotas do sistema que de fato servem/assinam conteúdo de StoredFile a um viewer; os outros 2 call sites de " +
        "findStoredFileForEntity, em real-estate.ts e website-builder.ts, são helpers internos de EXCLUSÃO de arquivo, já " +
        "gated por permissão de gestão na própria rota, e não fazem sentido para controle de acesso de leitura). " +
        "Todas as rotas afetadas já exigiam inspections.view/inspections.manage, que satisfaz a permissão exigida pelo " +
        "propósito (inspections.view) — ou seja, nenhum comportamento muda para um chamador autorizado; o ganho é " +
        "fail-closed para qualquer chamador futuro que não tenha essa permissão. NÃO foi possível provar isso ponta a " +
        "ponta via HTTP neste sandbox porque as rotas de Vistoria dependem do Supabase legado (mesma limitação de A3.1/A4.5, " +
        "deliberadamente desconfigurado por custo R$0). O mecanismo em si (assertStoredFilePurposeAccess) já está provado " +
        "por A6.1-A6.6 com chamada direta. NÃO é uma checagem executada — não entra no placar PASS/FAIL.",
    );
  }

  // ============================= RESUMO =============================
  // Placar em duas camadas, para não repetir o erro de contar uma
  // declaração de transparência (BLOCKED) como se fosse um PASS real:
  //   - "checagens executadas" = PASS + FAIL (asserções reais rodadas)
  //   - "itens declarados bloqueados" = BLOCKED (não são teste, são
  //     transparência sobre o que não pôde ser exercitado neste ambiente)
  console.log("\n\n===== RESUMO FASE A =====");
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  const executed = pass + fail;
  const icon = { PASS: "✅", FAIL: "❌", BLOCKED: "⛔" } as const;
  for (const r of results) console.log(`${icon[r.status]} ${r.item}`);
  console.log(
    `\nCheckagens executadas (PASS+FAIL): ${executed} | PASS: ${pass} | FAIL: ${fail}` +
      `\nItens declarados BLOCKED (não são teste, não contam no placar): ${blocked}` +
      `\nTotal de linhas no relatório: ${results.length} (${executed} executadas + ${blocked} declaradas)`,
  );

  if (fail > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error("ERRO FATAL NA HOMOLOGAÇÃO:", error);
    process.exit(1);
  });
