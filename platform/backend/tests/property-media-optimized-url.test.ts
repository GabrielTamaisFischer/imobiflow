import { beforeEach, describe, expect, it, vi } from "vitest";

// F3B (2026-09-03): cobre a publicação de mídia otimizada no site público
// (variante "gallery" do Cloudinary — f_auto/q_auto, redimensiona sem
// distorcer proporção) derivada em memória de storageBucket/storagePath,
// SEM nenhuma migration nova e SEM duplicar o arquivo no Cloudinary. A
// chamada real de rede/API do Cloudinary é sempre mockada — nenhum destes
// testes toca a API real nem qualquer credencial real.

const { database } = vi.hoisted(() => ({
  database: {
    property: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../src/lib/website-builder-prisma.js", () => ({
  getPrisma: () => database,
}));

// Credenciais obviamente falsas, apenas para satisfazer o guard de
// configuração (CloudinaryStorageProvider.configure()) e chegar até a
// chamada mockada de cloudinary.url — nunca usadas para uma chamada real.
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
      const transformation = options?.transformation?.[0];
      const variantTag = transformation
        ? `w_${transformation.width}_h_${transformation.height}_c_${transformation.crop}_q_${transformation.quality}_f_${transformation.fetch_format}`
        : "original";
      return `https://res.cloudinary.example/${publicId}?${variantTag}`;
    }),
    uploader: { upload_stream: vi.fn(), destroy: vi.fn() },
  },
}));

import {
  loadMysqlPublicProperties,
  loadMysqlPublicPropertyByReference,
} from "../src/services/mysql-real-estate.js";

const PROPERTY_ID = "22222222-2222-4222-8222-222222222222";
const RAW_URL =
  "https://res.cloudinary.example/imobiflow/company-a/properties/prop-1/images/original-abc.jpg";
const PUBLIC_ID = "imobiflow/company-a/properties/prop-1/images/original-abc";

function baseProperty(mediaOverrides: Record<string, unknown> = {}) {
  return {
    id: PROPERTY_ID,
    companyId: "company-a",
    code: "F3B-1",
    title: "Casa com foto otimizada",
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("F3B — publicação com mídia otimizada (Cloudinary f_auto/q_auto)", () => {
  it("usa a URL transformada (variante gallery) para fotos com storageBucket=cloudinary, sem distorcer proporção", async () => {
    database.property.findMany.mockResolvedValue([baseProperty()]);

    const [property] = await loadMysqlPublicProperties(
      { companyId: "company-a", settingsJson: {} },
      6,
    );

    expect(property.property_media[0].url).toContain(PUBLIC_ID);
    expect(property.property_media[0].url).toContain("w_1200_h_800_c_limit_q_auto_f_auto");
  });

  it("aplica a mesma otimização no detalhe público do imóvel", async () => {
    database.property.findFirst.mockResolvedValue(baseProperty());

    const property = await loadMysqlPublicPropertyByReference(
      { companyId: "company-a", settingsJson: {} },
      PROPERTY_ID,
    );

    expect(property.property_media[0].url).toContain("c_limit");
    expect(property.property_media[0].url).toContain(PUBLIC_ID);
  });

  it("mídia antiga sem storagePath (upload anterior à F3B) continua servindo a url original, sem quebrar (compatibilidade)", async () => {
    database.property.findMany.mockResolvedValue([
      baseProperty({ storageBucket: null, storagePath: null }),
    ]);

    const [property] = await loadMysqlPublicProperties(
      { companyId: "company-a", settingsJson: {} },
      6,
    );

    expect(property.property_media[0].url).toBe(RAW_URL);
  });

  it("mídia gravada por outro provider (ex.: local/R2) não tenta transformar — usa a url original", async () => {
    database.property.findMany.mockResolvedValue([
      baseProperty({ storageBucket: "local", storagePath: "some/local/path.jpg" }),
    ]);

    const [property] = await loadMysqlPublicProperties(
      { companyId: "company-a", settingsJson: {} },
      6,
    );

    expect(property.property_media[0].url).toBe(RAW_URL);
  });

  it("vídeo não é transformado, mesmo com storageBucket=cloudinary — a otimização é só para fotos", async () => {
    database.property.findMany.mockResolvedValue([
      baseProperty({
        mediaType: "video",
        url: "https://res.cloudinary.example/imobiflow/company-a/properties/prop-1/videos/tour.mp4",
        storagePath: "imobiflow/company-a/properties/prop-1/videos/tour",
      }),
    ]);

    const [property] = await loadMysqlPublicProperties(
      { companyId: "company-a", settingsJson: {} },
      6,
    );

    expect(property.property_media[0].url).toBe(
      "https://res.cloudinary.example/imobiflow/company-a/properties/prop-1/videos/tour.mp4",
    );
  });

  it("se a geração da URL transformada falhar, cai de volta para a url original em vez de quebrar a resposta pública", async () => {
    const cloudinaryModule = await import("cloudinary");
    (cloudinaryModule.v2.url as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("falha simulada de geração de URL");
    });
    database.property.findMany.mockResolvedValue([baseProperty()]);

    const [property] = await loadMysqlPublicProperties(
      { companyId: "company-a", settingsJson: {} },
      6,
    );

    expect(property.property_media[0].url).toBe(RAW_URL);
  });
});
