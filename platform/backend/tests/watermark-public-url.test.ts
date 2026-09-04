import { beforeEach, describe, expect, it, vi } from "vitest";

// F3C (2026-09-04): marca d'água configurável por empresa, aplicada só na
// versão PUBLICADA/DERIVADA de fotos (nunca no original, nunca em
// panorama/vídeo). Config vive em CompanySite.settingsJson.watermark (sem
// migration — settingsJson já existia e já aceitava chaves extras); o logo
// é um StoredFile normal (entityType "company_watermark_logo", entityId
// SEMPRE o companyId autenticado — nunca um id vindo do cliente). A chamada
// real de rede/API do Cloudinary é sempre mockada — nenhum destes testes
// toca a API real nem qualquer credencial real.

const { database } = vi.hoisted(() => ({
  database: {
    property: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    storedFile: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../src/lib/website-builder-prisma.js", () => ({
  getPrisma: () => database,
}));

vi.mock("../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config/env.js")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      STORAGE_PROVIDER: "cloudinary",
      CLOUDINARY_CLOUD_NAME: "fake-cloud-for-tests",
      CLOUDINARY_API_KEY: "fake-key-for-tests",
      CLOUDINARY_API_SECRET: "fake-secret-for-tests",
    },
  };
});

vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    url: vi.fn((publicId: string, options: { transformation?: Array<Record<string, unknown>> }) => {
      const steps = (options?.transformation ?? [])
        .map((step) => {
          if ("overlay" in step) {
            return `l_${step.overlay},g_${step.gravity},x_${step.x ?? "-"},y_${step.y ?? "-"},o_${step.opacity},w_${step.width},c_${step.crop},fl_${step.flags}`;
          }
          return `w_${step.width}_h_${step.height}_c_${step.crop}_q_${step.quality}_f_${step.fetch_format}`;
        })
        .join("/");
      return `https://res.cloudinary.example/${publicId}?${steps}`;
    }),
    uploader: { upload_stream: vi.fn(), destroy: vi.fn() },
  },
}));

import {
  loadMysqlPublicProperties,
  loadMysqlPublicPropertyByReference,
  resolveWatermarkOverlayForSite,
  WATERMARK_LOGO_ENTITY_TYPE,
} from "../src/services/mysql-real-estate.js";

const PROPERTY_ID = "22222222-2222-4222-8222-222222222222";
const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
const RAW_URL = "https://res.cloudinary.example/imobiflow/company-a/properties/prop-1/images/original-abc.jpg";
const PUBLIC_ID = "imobiflow/company-a/properties/prop-1/images/original-abc";
const LOGO_PUBLIC_ID = "imobiflow/company-a/logos/logo-abc";

function baseProperty(mediaOverrides: Record<string, unknown> = {}) {
  return {
    id: PROPERTY_ID,
    companyId: COMPANY_A,
    code: "F3C-1",
    title: "Casa com marca d'água",
    description: "desc",
    propertyType: "house",
    operation: "sale",
    status: "available",
    street: null,
    number: null,
    complement: null,
    neighborhood: "Centro",
    city: "Curitiba",
    state: "PR",
    country: "Brasil",
    zipCode: null,
    latitude: null,
    longitude: null,
    condominiumName: null,
    bedrooms: 3,
    bathrooms: 2,
    suites: 1,
    parkingSpaces: 1,
    privateArea: 90,
    totalArea: 100,
    salePriceCents: 500_000_00,
    rentPriceCents: null,
    condominiumFeeCents: null,
    iptuCents: null,
    featuresJson: {},
    amenityGroupsJson: {},
    videosJson: [],
    siteFeatured: false,
    publishedAt: new Date("2026-09-01T00:00:00.000Z"),
    responsibleUser: { name: "Corretor" },
    media: [
      {
        mediaType: "photo",
        url: RAW_URL,
        caption: "Fachada",
        position: 0,
        isCover: true,
        storageBucket: "cloudinary",
        storagePath: PUBLIC_ID,
        ...mediaOverrides,
      },
    ],
  };
}

function siteWithWatermark(watermark: Record<string, unknown> | undefined, companyId = COMPANY_A) {
  return { companyId, settingsJson: watermark ? { watermark } : {} };
}

function mockLogoForCompany(companyId: string, publicId: string | null, provider = "cloudinary") {
  database.storedFile.findFirst.mockImplementation(async (args: { where: { companyId: string; entityType: string } }) => {
    if (args.where.companyId !== companyId || args.where.entityType !== WATERMARK_LOGO_ENTITY_TYPE) return null;
    if (!publicId) return null;
    return {
      id: "stored-file-logo",
      provider,
      publicId,
      resourceType: "image",
      secureUrl: `https://res.cloudinary.example/${publicId}`,
      originalFilename: "logo.png",
      mimeType: "image/png",
      purpose: "company_logo",
      createdAt: new Date("2026-09-04T00:00:00.000Z"),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("F3C — resolveWatermarkOverlayForSite", () => {
  it("retorna null quando a watermark está desabilitada (ou config ausente)", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID);
    expect(await resolveWatermarkOverlayForSite(COMPANY_A, {})).toBeNull();
    expect(await resolveWatermarkOverlayForSite(COMPANY_A, { watermark: { enabled: false } })).toBeNull();
    // Nenhuma consulta ao StoredFile deveria ter sido necessária quando já
    // está desabilitada — otimização, não estritamente obrigatório, mas
    // confirma que o caminho comum (maioria das empresas, default OFF) é
    // barato.
    expect(database.storedFile.findFirst).not.toHaveBeenCalled();
  });

  it("retorna null quando habilitada mas a empresa não tem logo cadastrado (fallback seguro)", async () => {
    mockLogoForCompany(COMPANY_A, null);
    const overlay = await resolveWatermarkOverlayForSite(COMPANY_A, { watermark: { enabled: true } });
    expect(overlay).toBeNull();
  });

  it("retorna null quando o logo foi gravado por um provider que não é cloudinary (sem overlay nesse caso)", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID, "local");
    const overlay = await resolveWatermarkOverlayForSite(COMPANY_A, { watermark: { enabled: true } });
    expect(overlay).toBeNull();
  });

  it("nunca deixa uma falha ao resolver o logo derrubar a resolução (cai em null)", async () => {
    database.storedFile.findFirst.mockRejectedValue(new Error("falha simulada de banco"));
    const overlay = await resolveWatermarkOverlayForSite(COMPANY_A, { watermark: { enabled: true } });
    expect(overlay).toBeNull();
  });

  it("resolve publicId/posição/opacidade quando habilitada com logo válido", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID);
    const overlay = await resolveWatermarkOverlayForSite(COMPANY_A, {
      watermark: { enabled: true, position: "top-left", opacity: 45 },
    });
    expect(overlay).toEqual({ publicId: LOGO_PUBLIC_ID, position: "top-left", opacity: 45 });
  });

  it("usa posição/opacidade padrão quando ausentes ou inválidas na config persistida", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID);
    const overlay = await resolveWatermarkOverlayForSite(COMPANY_A, {
      watermark: { enabled: true, position: "diagonal-inexistente", opacity: 999 },
    });
    expect(overlay?.position).toBe("bottom-right");
    expect(overlay?.opacity).toBeLessThanOrEqual(100);
    expect(overlay?.opacity).toBeGreaterThanOrEqual(10);
  });

  it("IDOR estrutural: a resolução do logo usa SEMPRE companyId como entityId — nunca um id vindo de fora", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID);
    await resolveWatermarkOverlayForSite(COMPANY_A, { watermark: { enabled: true } });

    expect(database.storedFile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: COMPANY_A, entityType: WATERMARK_LOGO_ENTITY_TYPE, entityId: COMPANY_A },
      }),
    );
  });

  it("empresa A nunca resolve o logo da empresa B, mesmo que ambas tenham watermark habilitada", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID);
    // company B nunca teve seu logo cadastrado neste mock — deve continuar
    // null mesmo que B também habilite a watermark.
    const overlayA = await resolveWatermarkOverlayForSite(COMPANY_A, { watermark: { enabled: true } });
    const overlayB = await resolveWatermarkOverlayForSite(COMPANY_B, { watermark: { enabled: true } });

    expect(overlayA?.publicId).toBe(LOGO_PUBLIC_ID);
    expect(overlayB).toBeNull();
  });
});

describe("F3C — publicação de fotos com marca d'água (Cloudinary overlay)", () => {
  it("watermark desligada: URL pública continua exatamente a variante gallery da F3B, sem overlay", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID);
    database.property.findMany.mockResolvedValue([baseProperty()]);

    const [property] = await loadMysqlPublicProperties(siteWithWatermark(undefined), 6);

    expect(property.property_media[0].url).toContain("w_1200_h_800_c_limit_q_auto_f_auto");
    expect(property.property_media[0].url).not.toContain("l_");
  });

  it("watermark ligada + logo válida: URL pública recebe otimização gallery E overlay do logo", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID);
    database.property.findMany.mockResolvedValue([baseProperty()]);

    const [property] = await loadMysqlPublicProperties(
      siteWithWatermark({ enabled: true, position: "bottom-right", opacity: 70 }),
      6,
    );

    const url = property.property_media[0].url;
    // F3B continua intacta: mesmo passo de otimização, na frente do overlay.
    expect(url).toContain("w_1200_h_800_c_limit_q_auto_f_auto");
    // Overlay: logo correto, gravity mapeado de "bottom-right", opacidade,
    // largura relativa (proporcional, nunca tamanho fixo).
    expect(url).toContain(`l_${LOGO_PUBLIC_ID.replace(/\//g, ":")}`);
    expect(url).toContain("g_south_east");
    expect(url).toContain("o_70");
    expect(url).toContain("fl_relative");
  });

  it("empresa sem logo cadastrado, mesmo com watermark habilitada: serve a foto otimizada SEM overlay (nunca quebra o site público)", async () => {
    mockLogoForCompany(COMPANY_A, null);
    database.property.findMany.mockResolvedValue([baseProperty()]);

    const [property] = await loadMysqlPublicProperties(siteWithWatermark({ enabled: true }), 6);

    expect(property.property_media[0].url).toContain("w_1200_h_800_c_limit_q_auto_f_auto");
    expect(property.property_media[0].url).not.toContain("l_");
  });

  it("o original (storage_bucket/storage_path/mime/file_size) nunca é tocado pela watermark — só a url pública muda", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID);
    const originalMedia = { fileSize: 2_029_283, mimeType: "image/jpeg" };
    database.property.findMany.mockResolvedValue([baseProperty(originalMedia)]);

    const [property] = await loadMysqlPublicProperties(siteWithWatermark({ enabled: true }), 6);

    // A url pública muda (otimizada + watermark), mas nada no registro
    // original é lido/alterado por essa função — não há chamada de upload,
    // não há segundo asset, storagePath permanece o mesmo public_id.
    expect(property.property_media[0].url).toContain(PUBLIC_ID);
    expect(property.property_media[0].url).not.toBe(RAW_URL);
  });

  it("panorama (tour) nunca recebe overlay de watermark, mesmo habilitada e com logo válido", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID);
    database.property.findMany.mockResolvedValue([
      baseProperty({
        mediaType: "tour",
        url: "https://res.cloudinary.example/imobiflow/company-a/properties/prop-1/tours/pano.jpg",
        storagePath: "imobiflow/company-a/properties/prop-1/tours/pano",
      }),
    ]);

    const [property] = await loadMysqlPublicProperties(siteWithWatermark({ enabled: true, opacity: 80 }), 6);

    expect(property.property_media[0].url).toBe(
      "https://res.cloudinary.example/imobiflow/company-a/properties/prop-1/tours/pano.jpg",
    );
  });

  it("vídeo nunca recebe overlay de watermark, mesmo habilitada e com logo válido", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID);
    database.property.findMany.mockResolvedValue([
      baseProperty({
        mediaType: "video",
        url: "https://res.cloudinary.example/imobiflow/company-a/properties/prop-1/videos/tour.mp4",
        storagePath: "imobiflow/company-a/properties/prop-1/videos/tour",
      }),
    ]);

    const [property] = await loadMysqlPublicProperties(siteWithWatermark({ enabled: true }), 6);

    expect(property.property_media[0].url).toBe(
      "https://res.cloudinary.example/imobiflow/company-a/properties/prop-1/videos/tour.mp4",
    );
  });

  it("mídia antiga sem storagePath (upload anterior à F3B/F3C) continua servindo a url original, mesmo com watermark habilitada", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID);
    database.property.findMany.mockResolvedValue([baseProperty({ storageBucket: null, storagePath: null })]);

    const [property] = await loadMysqlPublicProperties(siteWithWatermark({ enabled: true }), 6);

    expect(property.property_media[0].url).toBe(RAW_URL);
  });

  it("aplica a mesma lógica de watermark no detalhe público do imóvel (loadMysqlPublicPropertyByReference, por id)", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID);
    database.property.findFirst.mockResolvedValue(baseProperty());

    const property = await loadMysqlPublicPropertyByReference(
      siteWithWatermark({ enabled: true, position: "top-left", opacity: 50 }),
      PROPERTY_ID,
    );

    expect(property.property_media[0].url).toContain(`l_${LOGO_PUBLIC_ID.replace(/\//g, ":")}`);
    expect(property.property_media[0].url).toContain("g_north_west");
    expect(property.property_media[0].url).toContain("o_50");
  });

  it("aplica a mesma lógica de watermark no detalhe público do imóvel por código/slug (branch não-uuid)", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID);
    database.property.findFirst.mockResolvedValue(baseProperty());

    const property = await loadMysqlPublicPropertyByReference(
      siteWithWatermark({ enabled: true, opacity: 65 }),
      "F3C-1",
    );

    expect(property.property_media[0].url).toContain(`l_${LOGO_PUBLIC_ID.replace(/\//g, ":")}`);
    expect(property.property_media[0].url).toContain("o_65");
  });

  it("multi-tenant: watermark configurada pela empresa A nunca é aplicada à publicação da empresa B", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID);
    database.property.findMany.mockResolvedValue([{ ...baseProperty(), companyId: COMPANY_B }]);

    const [property] = await loadMysqlPublicProperties(siteWithWatermark({ enabled: true }, COMPANY_B), 6);

    // Empresa B não tem logo cadastrado no mock -> sem overlay, mesmo tendo
    // habilitado watermark: nunca "herda" o logo/; da empresa A.
    expect(property.property_media[0].url).not.toContain("l_");
  });

  it("se a geração da URL com overlay falhar, cai de volta para a url original em vez de quebrar a resposta pública", async () => {
    mockLogoForCompany(COMPANY_A, LOGO_PUBLIC_ID);
    const cloudinaryModule = await import("cloudinary");
    (cloudinaryModule.v2.url as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("falha simulada de geração de URL");
    });
    database.property.findMany.mockResolvedValue([baseProperty()]);

    const [property] = await loadMysqlPublicProperties(siteWithWatermark({ enabled: true }), 6);

    expect(property.property_media[0].url).toBe(RAW_URL);
  });
});
