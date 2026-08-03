import { Router } from "express";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import {
  createMysqlOwner,
  createMysqlProperty,
  createMysqlPropertyMedia,
  ensureMysqlCompanySite,
  prisma,
} from "../services/mysql-real-estate.js";
import type { RequestWithAccess } from "../types/access.js";

export const testLabRouter = Router();

testLabRouter.use(requireAuth, requireCompany, requireActiveSubscription);

type QaScenario = {
  typeLabel: string;
  propertyType: "apartment" | "house" | "commercial" | "land" | "rural" | "other";
  operation: "sale" | "rent" | "both";
  status: "draft" | "available" | "reserved" | "sold" | "rented" | "inactive";
  title: string;
  city: string;
  neighborhood: string;
  salePriceCents: number | null;
  rentPriceCents: number | null;
  bedrooms: number;
  suites: number;
  bathrooms: number;
  parkingSpaces: number;
  privateArea: number;
  totalArea: number;
  featured: boolean;
  hasVideo: boolean;
  hasTour: boolean;
};

const imagePool = [
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=82",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=82",
  "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1600&q=82",
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=82",
  "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1600&q=82",
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1600&q=82",
  "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1600&q=82",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1600&q=82",
  "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1600&q=82",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=82",
  "https://images.unsplash.com/photo-1523741543316-beb7fc7023d8?auto=format&fit=crop&w=1600&q=82",
  "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1600&q=82",
];

testLabRouter.post(
  "/generate",
  requirePermission("properties.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const batchId = createBatchId();
      const scenarios = buildQaScenarios();
      const created = {
        owners: 0,
        properties: 0,
        media: 0,
        appointments: 0,
        inspections: 0,
        inspection_items: 0,
        inspection_media: 0,
        pdfs: 0,
        leads: 0,
        site_leads: 0,
        site: 0,
      };
      const skipped = { properties: 0, appointments: 0, inspections: 0 };
      const siteResult = await ensureMysqlCompanySite(companyId, userId, batchId);
      if (siteResult.created) created.site += 1;

      const generatedProperties: Array<{ id: string; code: string; title: string; operation: string }> = [];

      for (const [index, scenario] of scenarios.entries()) {
        const code = `QA-${batchId.slice(-8).toUpperCase()}-${String(index + 1).padStart(3, "0")}`;
        const owner = await createMysqlOwner(companyId, userId, {
          owner_type: index % 5 === 0 ? "company" : "individual",
          client_type: "proprietario",
          name: `Proprietario QA ${String(index + 1).padStart(2, "0")}`,
          document: index % 5 === 0 ? `12.345.67${index}/0001-00` : `123.456.78${index}-00`,
          email: `proprietario.qa.${batchId}.${index + 1}@imobiflow.test`,
          phone: `(11) 400${index}-1000`,
          whatsapp: `(11) 9${String(8000 + index).padStart(4, "0")}-0000`,
          residential_phone: `(11) 300${index}-2000`,
          commercial_phone: `(11) 500${index}-3000`,
          address_json: {
            state: "SP",
            city: scenario.city,
            neighborhood: scenario.neighborhood,
            street: `Rua QA Proprietario ${index + 1}`,
            number: String(100 + index),
            country: "Brasil",
            test_lab: { is_test_data: true, test_batch_id: batchId },
          },
          notes: `Dado de teste gerado automaticamente. test_batch_id:${batchId}`,
        });
        created.owners += 1;

        const publishedAt = shouldPublish(scenario.status) ? new Date() : null;
        const property = await createMysqlProperty(companyId, userId, {
          owner_id: owner.id,
          responsible_user_id: userId,
          code,
          title: scenario.title,
          description: buildDescription(scenario),
          property_type: scenario.propertyType,
          operation: scenario.operation,
          status: scenario.status,
          street: `Rua QA ${index + 1}`,
          number: String(120 + index),
          complement: scenario.propertyType === "apartment" ? `Apto ${index + 11}` : null,
          neighborhood: scenario.neighborhood,
          city: scenario.city,
          state: "SP",
          country: "Brasil",
          zip_code: `095${String(200 + index).padStart(3, "0")}00`,
          latitude: -23.55 + index / 900,
          longitude: -46.63 - index / 900,
          condominium_name: scenario.propertyType === "apartment" ? `Condominio QA ${index + 1}` : null,
          bedrooms: scenario.bedrooms,
          bathrooms: scenario.bathrooms,
          suites: scenario.suites,
          parking_spaces: scenario.parkingSpaces,
          private_area: scenario.privateArea,
          total_area: scenario.totalArea,
          sale_price_cents: scenario.salePriceCents,
          rent_price_cents: scenario.rentPriceCents,
          condominium_fee_cents: scenario.propertyType === "apartment" ? 62000 + index * 3500 : null,
          iptu_cents: 14000 + index * 1500,
          nearby_highways: ["Anchieta", "Imigrantes", "Bandeirantes"].slice(0, (index % 3) + 1),
          capture_json: {
            source: "qa-test-lab",
            test_lab: { is_test_data: true, test_batch_id: batchId },
            corretor_responsavel: req.access!.appUser.name,
          },
          primary_details_json: {
            accepts_financing: index % 3 !== 0,
            accepts_exchange: index % 4 === 0,
            furnished: index % 2 === 0,
            source_type_label: scenario.typeLabel,
            test_lab: { is_test_data: true, test_batch_id: batchId },
          },
          measurements_json: {
            ceiling_height: scenario.propertyType === "commercial" ? 6.2 : 2.8,
            land_area_m2: scenario.totalArea,
            built_area_m2: scenario.privateArea,
          },
          commercial_terms_json: {
            season_price_cents: index % 7 === 0 ? 85000 + index * 3000 : null,
            test_lab: { is_test_data: true, test_batch_id: batchId },
          },
          features_json: buildFeatures(index),
          amenity_groups_json: buildAmenityGroups(index),
          videos_json: buildVideos(code, scenario),
          publication_settings_json: {
            site_enabled: Boolean(publishedAt),
            site_featured: scenario.featured,
            operation_hints:
              scenario.operation === "both"
                ? ["venda", "locacao"]
                : scenario.operation === "rent"
                  ? ["locacao"]
                  : ["venda"],
            test_lab: { is_test_data: true, test_batch_id: batchId },
          },
          description_template_key: `qa_property_${index + 1}`,
        });
        created.properties += 1;

        if (publishedAt) {
          await prisma().property.update({
            where: { id: property.id },
            data: { publishedAt },
          });
        }

        generatedProperties.push({ id: property.id, code: property.code, title: property.title, operation: property.operation });
        created.media += await createPropertyMedia(companyId, property.id, code, index, scenario, batchId);
      }

      const leadResult = await createQaLeads(companyId, batchId, generatedProperties, siteResult.siteId);
      created.leads += leadResult.leads;
      created.site_leads += leadResult.siteLeads;
      created.appointments += await createQaAppointments(companyId, userId, batchId, generatedProperties);

      res.status(201).json({
        test_batch_id: batchId,
        created,
        skipped,
        totals: {
          planned_properties: scenarios.length,
          planned_appointments: Math.min(8, generatedProperties.length),
          planned_inspections: 0,
        },
        site: siteResult.site,
        cache: {
          invalidated: true,
          scope: "company",
          company_id: companyId,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

testLabRouter.delete(
  "/clear",
  requirePermission("properties.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const properties = await prisma().property.findMany({
        where: { companyId, code: { startsWith: "QA-" } },
        select: { id: true, ownerId: true },
      });
      const propertyIds = properties.map((property) => property.id);
      const ownerIds = [...new Set(properties.map((property) => property.ownerId).filter(isString))];

      const cleared = {
        properties: 0,
        owners: 0,
        appointments: 0,
        inspections: 0,
        rooms: 0,
        items: 0,
        media: 0,
        signatures: 0,
        leads: 0,
        site_leads: 0,
      };

      if (propertyIds.length > 0) {
        cleared.site_leads += (await prisma().siteLead.deleteMany({ where: { companyId, propertyId: { in: propertyIds } } })).count;
        cleared.appointments += (await prisma().appointment.deleteMany({ where: { companyId, propertyId: { in: propertyIds } } })).count;
        cleared.media += (await prisma().propertyMedia.deleteMany({ where: { companyId, propertyId: { in: propertyIds } } })).count;
        await prisma().propertyOwnerLink.deleteMany({ where: { companyId, propertyId: { in: propertyIds } } });
        cleared.properties += (await prisma().property.deleteMany({ where: { companyId, id: { in: propertyIds } } })).count;
      }

      cleared.leads += (await prisma().lead.deleteMany({ where: { companyId, source: "qa-test-lab" } })).count;

      if (ownerIds.length > 0) {
        cleared.owners += (await prisma().propertyOwner.deleteMany({ where: { companyId, id: { in: ownerIds } } })).count;
      }

      await markQaSiteClean(companyId);

      res.json({
        ...cleared,
        cache: {
          invalidated: true,
          scope: "company",
          company_id: companyId,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

async function createPropertyMedia(
  companyId: string,
  propertyId: string,
  code: string,
  scenarioIndex: number,
  scenario: QaScenario,
  batchId: string,
) {
  let count = 0;
  for (let imageIndex = 0; imageIndex < 6; imageIndex += 1) {
    await createMysqlPropertyMedia(companyId, propertyId, {
      media_type: "photo",
      url: imagePool[(scenarioIndex + imageIndex) % imagePool.length],
      caption: imageIndex === 0 ? `Capa QA ${scenario.typeLabel}` : `Galeria QA ${imageIndex + 1}`,
      position: imageIndex,
      storage_path: `qa/${batchId}/${code}/${imageIndex + 1}.jpg`,
      mime_type: "image/jpeg",
      file_size: 260000,
      is_cover: imageIndex === 0,
    });
    count += 1;
  }

  if (scenario.hasVideo) {
    await createMysqlPropertyMedia(companyId, propertyId, {
      media_type: "video",
      url: "https://player.vimeo.com/video/76979871",
      caption: "Video QA do imovel",
      position: count,
      storage_path: `qa/${batchId}/${code}/video`,
      mime_type: "video/mp4",
      file_size: 0,
    });
    count += 1;
  }

  if (scenario.hasTour) {
    await createMysqlPropertyMedia(companyId, propertyId, {
      media_type: "tour",
      url: imagePool[(scenarioIndex + 9) % imagePool.length],
      caption: "Tour 360 QA",
      position: count,
      storage_path: `qa/${batchId}/${code}/tour`,
      mime_type: "image/jpeg",
      file_size: 260000,
    });
    count += 1;
  }

  return count;
}

async function createQaLeads(
  companyId: string,
  batchId: string,
  properties: Array<{ id: string; code: string; title: string; operation: string }>,
  siteId: string | null,
) {
  const selected = properties.slice(0, 5);
  let leads = 0;
  let siteLeads = 0;

  for (const [index, property] of selected.entries()) {
    const lead = await prisma().lead.create({
      data: {
        companyId,
        name: `Lead QA ${index + 1}`,
        email: `lead.qa.${batchId}.${index + 1}@imobiflow.test`,
        phone: `(11) 9888${index}-0000`,
        source: "qa-test-lab",
        interestType: property.operation === "sale" ? "sale" : property.operation === "rent" ? "rent" : "both",
        propertyReference: property.code || property.title,
        notes: `Lead de teste vinculado ao imovel ${property.title}. test_batch_id:${batchId}`,
      },
    });
    leads += 1;

    if (siteId) {
      await prisma().siteLead.create({
        data: {
          companyId,
          siteId,
          propertyId: property.id,
          leadId: lead.id,
          name: `Lead QA ${index + 1}`,
          email: `lead.qa.${batchId}.${index + 1}@imobiflow.test`,
          phone: `(11) 9888${index}-0000`,
          message: `Tenho interesse no imovel ${property.title}.`,
          sourceUrl: `/qa/${batchId}`,
          metadata: { test_lab: { is_test_data: true, test_batch_id: batchId } },
        },
      });
      siteLeads += 1;
    }
  }

  return { leads, siteLeads };
}

async function createQaAppointments(
  companyId: string,
  userId: string,
  batchId: string,
  properties: Array<{ id: string; code: string; title: string }>,
) {
  const rows = properties.slice(0, 8).map((property, index) => {
    const startsAt = new Date(Date.UTC(2026, 6, 14 + index, 13 + (index % 4), 0, 0));
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    return {
      companyId,
      propertyId: property.id,
      createdBy: uuidOrNull(userId),
      appointmentType: index % 2 === 0 ? "visit" : "inspection",
      title: `QA visita - ${property.code}`,
      description: `Compromisso de teste para validar agenda e imovel ${property.title}.`,
      locationText: `Endereco do imovel ${property.code}`,
      startsAt,
      endsAt,
      reminderAt: new Date(startsAt.getTime() - 30 * 60 * 1000),
      metadata: { test_lab: { is_test_data: true, test_batch_id: batchId } },
      status: "scheduled",
    };
  });

  if (rows.length === 0) return 0;
  return (await prisma().appointment.createMany({ data: rows })).count;
}

async function markQaSiteClean(companyId: string) {
  const site = await prisma().companySite.findFirst({ where: { companyId } });
  if (!site) return;
  const seoJson = asRecord(site.seoJson);
  if (!seoJson.test_lab) return;

  await prisma().companySite.update({
    where: { id: site.id },
    data: { seoJson: { ...seoJson, test_lab_cleaned_at: new Date().toISOString() } },
  });
}

function buildQaScenarios(): QaScenario[] {
  const labels = [
    ["Apartamento", "apartment"],
    ["Casa", "house"],
    ["Sobrado", "house"],
    ["Cobertura", "apartment"],
    ["Studio", "apartment"],
    ["Kitnet", "apartment"],
    ["Terreno", "land"],
    ["Chacara", "rural"],
    ["Sitio", "rural"],
    ["Galpao", "commercial"],
    ["Sala comercial", "commercial"],
    ["Loja", "commercial"],
    ["Predio comercial", "commercial"],
    ["Imovel de alto padrao", "house"],
  ] as const;
  const statuses: QaScenario["status"][] = [
    "available",
    "reserved",
    "available",
    "sold",
    "rented",
    "inactive",
    "draft",
  ];

  return labels.map(([typeLabel, propertyType], index) => {
    const operation: QaScenario["operation"] = index % 4 === 0 ? "both" : index % 4 === 1 ? "rent" : "sale";

    return {
      typeLabel,
      propertyType,
      operation,
      status: statuses[index % statuses.length],
      title: `${typeLabel} QA ${index + 1} em ${index % 2 === 0 ? "bairro nobre" : "regiao estrategica"}`,
      city: index % 3 === 0 ? "Sao Paulo" : index % 3 === 1 ? "Santo Andre" : "Sao Caetano do Sul",
      neighborhood: index % 4 === 0 ? "Centro" : index % 4 === 1 ? "Jardim Sao Caetano" : index % 4 === 2 ? "Moema" : "Campestre",
      salePriceCents: operation === "rent" ? null : 42000000 + index * 7850000,
      rentPriceCents: operation === "sale" ? null : 260000 + index * 38000,
      bedrooms: propertyType === "commercial" || propertyType === "land" ? 0 : (index % 4) + 1,
      suites: propertyType === "commercial" || propertyType === "land" ? 0 : index % 3,
      bathrooms: (index % 4) + 1,
      parkingSpaces: index % 5,
      privateArea: 38 + index * 17,
      totalArea: 70 + index * 28,
      featured: index % 3 === 0,
      hasVideo: index % 4 === 0,
      hasTour: index % 5 === 0,
    };
  });
}

function buildDescription(scenario: QaScenario) {
  const operationLabel =
    scenario.operation === "both" ? "venda e locacao" : scenario.operation === "rent" ? "locacao" : "venda";
  return `${scenario.typeLabel} de teste em ${scenario.neighborhood}, ${scenario.city}, criado para validar cards, filtros, vitrine, pagina individual, mapa, videos, tour 360, contato e imoveis semelhantes. Operacao: ${operationLabel}.`;
}

function buildFeatures(index: number) {
  const all = [
    "Piscina",
    "Churrasqueira",
    "Area gourmet",
    "Academia",
    "Portaria 24h",
    "Vista livre",
    "Varanda",
    "Mobiliado",
    "Aceita financiamento",
    "Aceita permuta",
  ];

  return Object.fromEntries(all.map((feature, featureIndex) => [feature, (index + featureIndex) % 2 === 0]));
}

function buildAmenityGroups(index: number) {
  return {
    infraestrutura: ["Portao eletronico", "Ar condicionado", "Energia solar"].slice(0, (index % 3) + 1),
    lazer: ["Piscina", "Churrasqueira", "Salao de festas"].slice(0, (index % 3) + 1),
    servicos: ["Cozinha", "Area de servico", "Despensa"].slice(0, (index % 3) + 1),
  };
}

function buildVideos(code: string, scenario: QaScenario) {
  const videos: Array<Record<string, unknown>> = [];
  if (scenario.hasVideo) {
    videos.push({ type: "video", url: "https://player.vimeo.com/video/76979871", title: `Video ${code}` });
  }
  if (scenario.hasTour) {
    videos.push({ type: "tour", url: `https://tour.imobiflow.test/${code.toLowerCase()}`, title: `Tour 360 ${code}` });
  }
  return videos;
}

function shouldPublish(status: QaScenario["status"]) {
  return status === "available" || status === "reserved";
}

function createBatchId() {
  return `qa_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function uuidOrNull(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
