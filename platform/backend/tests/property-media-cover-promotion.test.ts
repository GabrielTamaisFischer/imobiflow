import { beforeEach, describe, expect, it, vi } from "vitest";

// Fase 3D — AUTO-PROMOÇÃO DE CAPA. Cobre os itens 16-27 do bloco "TESTES
// OBRIGATÓRIOS — CAPA" da tarefa. Segue o mesmo padrão de fake de banco em
// memória já usado em property-access.test.ts / property-media-optimized-url.test.ts
// (nenhuma chamada real a MySQL/TiDB, nenhuma credencial).

type FakeMedia = {
  id: string;
  companyId: string;
  propertyId: string;
  mediaType: string;
  url: string;
  position: number;
  isCover: boolean;
  createdAt: Date;
};

type FakeProperty = {
  id: string;
  companyId: string;
  publicationSettingsJson: Record<string, unknown>;
  commercialTermsJson: Record<string, unknown>;
  operation: string;
  salePriceCents: number | null;
  rentPriceCents: number | null;
  ownerId: string | null;
  title: string;
  description: string;
  zipCode: string | null;
  city: string | null;
  state: string | null;
  status: string;
  publishedAt: Date | null;
  siteFeatured: boolean;
};

const state = vi.hoisted(() => ({
  media: [] as FakeMedia[],
  properties: [] as FakeProperty[],
  seq: 0,
}));

function baseProperty(id: string, companyId: string): FakeProperty {
  return {
    id,
    companyId,
    publicationSettingsJson: {},
    commercialTermsJson: {},
    operation: "sale",
    salePriceCents: null,
    rentPriceCents: null,
    ownerId: null,
    title: "Imovel de teste",
    description: "",
    zipCode: null,
    city: null,
    state: null,
    status: "available",
    publishedAt: null,
    siteFeatured: false,
  };
}

function resetState() {
  state.media = [];
  state.properties = [
    baseProperty("property-a1", "company-a"),
    baseProperty("property-b1", "company-b"),
  ];
  state.seq = 0;
}

function matchesWhere<T extends Record<string, unknown>>(
  row: T,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition && typeof condition === "object" && !Array.isArray(condition)) {
      const cond = condition as Record<string, unknown>;
      if ("in" in cond) return (cond.in as unknown[]).includes(value);
      if ("not" in cond) return value !== cond.not;
    }
    return value === condition;
  });
}

function sortMedia(rows: FakeMedia[], orderBy?: Array<Record<string, "asc" | "desc">>) {
  if (!orderBy?.length) return rows;
  return [...rows].sort((a, b) => {
    for (const clause of orderBy) {
      const [field, direction] = Object.entries(clause)[0];
      const av = (a as unknown as Record<string, unknown>)[field];
      const bv = (b as unknown as Record<string, unknown>)[field];
      let cmp = 0;
      if (av instanceof Date && bv instanceof Date) cmp = av.getTime() - bv.getTime();
      else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      if (cmp !== 0) return direction === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

function buildFakeDatabase() {
  const propertyMediaModel = {
    findFirst: vi.fn(
      async ({
        where,
        orderBy,
      }: {
        where: Record<string, unknown>;
        orderBy?: Array<Record<string, "asc" | "desc">>;
      }) => {
        const rows = sortMedia(
          state.media.filter((row) => matchesWhere(row, where)),
          orderBy,
        );
        return rows[0] ?? null;
      },
    ),
    findMany: vi.fn(
      async ({
        where,
        orderBy,
      }: {
        where: Record<string, unknown>;
        orderBy?: Array<Record<string, "asc" | "desc">>;
      }) => {
        return sortMedia(
          state.media.filter((row) => matchesWhere(row, where)),
          orderBy,
        );
      },
    ),
    count: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        state.media.filter((row) => matchesWhere(row, where)).length,
    ),
    create: vi.fn(async ({ data }: { data: Partial<FakeMedia> }) => {
      const row: FakeMedia = {
        id: data.id ?? `media-${++state.seq}`,
        companyId: data.companyId!,
        propertyId: data.propertyId!,
        mediaType: data.mediaType ?? "photo",
        url: data.url ?? "",
        position: data.position ?? 0,
        isCover: Boolean(data.isCover),
        createdAt: new Date(2026, 0, 1, 0, 0, state.seq),
      };
      state.media.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeMedia> }) => {
      const row = state.media.find((candidate) => candidate.id === where.id);
      if (!row) throw new Error("media not found in fake db");
      Object.assign(row, data);
      return row;
    }),
    updateMany: vi.fn(
      async ({ where, data }: { where: Record<string, unknown>; data: Partial<FakeMedia> }) => {
        const rows = state.media.filter((row) => matchesWhere(row, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    ),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const before = state.media.length;
      state.media = state.media.filter((row) => !matchesWhere(row, where));
      return { count: before - state.media.length };
    }),
  };

  const propertyModel = {
    findFirst: vi.fn(
      async ({
        where,
        include,
      }: {
        where: Record<string, unknown>;
        include?: Record<string, unknown>;
      }) => {
        const row = state.properties.find((property) =>
          matchesWhere(property as unknown as Record<string, unknown>, where),
        );
        if (!row) return null;
        if (include?.media) {
          const mediaClause = include.media as { where: Record<string, unknown>; take?: number };
          const media = state.media
            .filter((item) => item.propertyId === row.id && matchesWhere(item, mediaClause.where))
            .slice(0, mediaClause.take ?? undefined);
          return { ...row, media };
        }
        return { ...row, media: [] };
      },
    ),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Partial<FakeProperty> }) => {
        const row = state.properties.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error("property not found in fake db");
        Object.assign(row, data);
        return row;
      },
    ),
  };

  const database = {
    property: propertyModel,
    propertyMedia: propertyMediaModel,
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") return (arg as (tx: typeof database) => unknown)(database);
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };

  return database;
}

vi.mock("../src/lib/website-builder-prisma.js", () => ({ getPrisma: () => buildFakeDatabase() }));

const {
  createMysqlPropertyMedia,
  deleteMysqlPropertyMedia,
  setMysqlPropertyMediaCover,
  listMysqlPropertyMedia,
} = await import("../src/services/mysql-real-estate.js");

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
const PROPERTY_A1 = "property-a1";
const PROPERTY_B1 = "property-b1";

async function seedPhoto(companyId: string, propertyId: string, position: number, isCover = false) {
  return createMysqlPropertyMedia(companyId, propertyId, {
    media_type: "photo",
    url: `https://cdn.example/${propertyId}/photo-${position}.jpg`,
    position,
    is_cover: isCover,
  });
}

beforeEach(() => {
  resetState();
});

describe("Fase 3D — auto-promoção de capa ao excluir mídia", () => {
  it("16. excluir foto que NÃO é capa → capa permanece a mesma", async () => {
    const cover = await seedPhoto(COMPANY_A, PROPERTY_A1, 0, true);
    const other = await seedPhoto(COMPANY_A, PROPERTY_A1, 1, false);

    await deleteMysqlPropertyMedia(COMPANY_A, PROPERTY_A1, other.id);

    const media = await listMysqlPropertyMedia(COMPANY_A, PROPERTY_A1);
    expect(media).toHaveLength(1);
    expect(media[0].id).toBe(cover.id);
    expect(media[0].is_cover).toBe(true);
  });

  it("17. excluir a capa havendo outra foto → a outra foto vira a nova capa", async () => {
    const cover = await seedPhoto(COMPANY_A, PROPERTY_A1, 0, true);
    const other = await seedPhoto(COMPANY_A, PROPERTY_A1, 1, false);

    const result = await deleteMysqlPropertyMedia(COMPANY_A, PROPERTY_A1, cover.id);

    expect(result?.find((item) => item.id === other.id)?.is_cover).toBe(true);
    const media = await listMysqlPropertyMedia(COMPANY_A, PROPERTY_A1);
    expect(media.filter((item) => item.is_cover)).toHaveLength(1);
    expect(media.find((item) => item.is_cover)?.id).toBe(other.id);
  });

  it("18. a nova capa é deterministicamente a de menor position (empate por created_at)", async () => {
    const cover = await seedPhoto(COMPANY_A, PROPERTY_A1, 0, true);
    const third = await seedPhoto(COMPANY_A, PROPERTY_A1, 2, false);
    const second = await seedPhoto(COMPANY_A, PROPERTY_A1, 1, false);

    await deleteMysqlPropertyMedia(COMPANY_A, PROPERTY_A1, cover.id);

    const media = await listMysqlPropertyMedia(COMPANY_A, PROPERTY_A1);
    expect(media.find((item) => item.is_cover)?.id).toBe(second.id);
    expect(media.find((item) => item.id === third.id)?.is_cover).toBe(false);
  });

  it("19. excluir a única foto → o imóvel fica sem capa (comportamento explícito, não é bug)", async () => {
    const cover = await seedPhoto(COMPANY_A, PROPERTY_A1, 0, true);

    const result = await deleteMysqlPropertyMedia(COMPANY_A, PROPERTY_A1, cover.id);

    expect(result).toHaveLength(0);
    const media = await listMysqlPropertyMedia(COMPANY_A, PROPERTY_A1);
    expect(media).toHaveLength(0);
  });

  it("20. panorama (tour) restante nunca vira capa automaticamente", async () => {
    const cover = await seedPhoto(COMPANY_A, PROPERTY_A1, 0, true);
    const tour = await createMysqlPropertyMedia(COMPANY_A, PROPERTY_A1, {
      media_type: "tour",
      url: "https://cdn.example/tour.jpg",
      position: 1,
    });

    const result = await deleteMysqlPropertyMedia(COMPANY_A, PROPERTY_A1, cover.id);

    expect(result?.find((item) => item.id === tour.id)?.is_cover).toBe(false);
    expect(result?.some((item) => item.is_cover)).toBe(false);
  });

  it("21. vídeo restante nunca vira capa automaticamente", async () => {
    const cover = await seedPhoto(COMPANY_A, PROPERTY_A1, 0, true);
    const video = await createMysqlPropertyMedia(COMPANY_A, PROPERTY_A1, {
      media_type: "video",
      url: "https://cdn.example/video.mp4",
      position: 1,
    });

    const result = await deleteMysqlPropertyMedia(COMPANY_A, PROPERTY_A1, cover.id);

    expect(result?.find((item) => item.id === video.id)?.is_cover).toBe(false);
    expect(result?.some((item) => item.is_cover)).toBe(false);
  });

  it("22. múltiplas fotos → sempre exatamente uma capa, antes e depois da exclusão", async () => {
    const cover = await seedPhoto(COMPANY_A, PROPERTY_A1, 0, true);
    await seedPhoto(COMPANY_A, PROPERTY_A1, 1, false);
    await seedPhoto(COMPANY_A, PROPERTY_A1, 2, false);

    const before = await listMysqlPropertyMedia(COMPANY_A, PROPERTY_A1);
    expect(before.filter((item) => item.is_cover)).toHaveLength(1);

    await deleteMysqlPropertyMedia(COMPANY_A, PROPERTY_A1, cover.id);

    const after = await listMysqlPropertyMedia(COMPANY_A, PROPERTY_A1);
    expect(after.filter((item) => item.is_cover)).toHaveLength(1);
  });

  it("23. tenant A não afeta mídia/capa do tenant B (isolamento multi-tenant)", async () => {
    const coverA = await seedPhoto(COMPANY_A, PROPERTY_A1, 0, true);
    const coverB = await seedPhoto(COMPANY_B, PROPERTY_B1, 0, true);
    await seedPhoto(COMPANY_B, PROPERTY_B1, 1, false);

    await deleteMysqlPropertyMedia(COMPANY_A, PROPERTY_A1, coverA.id);

    const mediaB = await listMysqlPropertyMedia(COMPANY_B, PROPERTY_B1);
    expect(mediaB.find((item) => item.id === coverB.id)?.is_cover).toBe(true);
    expect(mediaB).toHaveLength(2);
  });

  it("24. IDOR de delete continua bloqueado (mídia de outra empresa não é afetada nem promovida)", async () => {
    const coverB = await seedPhoto(COMPANY_B, PROPERTY_B1, 0, true);

    // Empresa A tenta excluir mídia de B usando o próprio propertyId de B —
    // ensurePropertyBelongsToCompany rejeita porque a property não pertence
    // à companyId informada.
    await expect(deleteMysqlPropertyMedia(COMPANY_A, PROPERTY_B1, coverB.id)).rejects.toMatchObject(
      { statusCode: 404 },
    );

    const mediaB = await listMysqlPropertyMedia(COMPANY_B, PROPERTY_B1);
    expect(mediaB).toHaveLength(1);
    expect(mediaB[0].is_cover).toBe(true);
  });

  it("25. excluir mídia inexistente é uma no-op segura (não promove nada, não lança)", async () => {
    await seedPhoto(COMPANY_A, PROPERTY_A1, 0, true);

    const result = await deleteMysqlPropertyMedia(COMPANY_A, PROPERTY_A1, "media-inexistente");

    expect(result).toHaveLength(1);
    expect(result?.[0].is_cover).toBe(true);
  });

  it("26. regressão: set-cover manual (media-cover) continua funcionando normalmente", async () => {
    const first = await seedPhoto(COMPANY_A, PROPERTY_A1, 0, true);
    const second = await seedPhoto(COMPANY_A, PROPERTY_A1, 1, false);

    const media = await setMysqlPropertyMediaCover(COMPANY_A, PROPERTY_A1, second.id);

    expect(media.find((item) => item.id === second.id)?.is_cover).toBe(true);
    expect(media.find((item) => item.id === first.id)?.is_cover).toBe(false);
    expect(media.filter((item) => item.is_cover)).toHaveLength(1);
  });

  it("27. ordem/position continua correta após a promoção automática", async () => {
    const cover = await seedPhoto(COMPANY_A, PROPERTY_A1, 0, true);
    const second = await seedPhoto(COMPANY_A, PROPERTY_A1, 1, false);
    const thirdVideo = await createMysqlPropertyMedia(COMPANY_A, PROPERTY_A1, {
      media_type: "video",
      url: "https://cdn.example/video.mp4",
      position: 2,
    });

    await deleteMysqlPropertyMedia(COMPANY_A, PROPERTY_A1, cover.id);

    const media = await listMysqlPropertyMedia(COMPANY_A, PROPERTY_A1);
    expect(media.map((item) => item.id)).toEqual([second.id, thirdVideo.id]);
    expect(media.map((item) => item.position)).toEqual([1, 2]);
  });
});
