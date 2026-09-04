import { describe, expect, it } from "vitest";
import {
  classifyMediaFrame,
  isPhotoMedia,
  isTourMedia,
  isVideoMedia,
  sortMedia,
  type PropertyMedia,
} from "./site.$slug.imoveis.$propertySlug";

// Fase 3D — cobre os itens 12-15 do bloco "TESTES OBRIGATÓRIOS — EMBED"
// (os itens 1-11 já são cobertos em profundidade em
// src/lib/embed-providers.test.ts, que é a fonte de verdade para a
// allowlist) e a regressão de classificação de mídia (F3B/F3C).
describe("classifyMediaFrame (Fase 3D)", () => {
  it("12. string contendo '360'/'panorama' na URL de um link externo não vira iframe só por isso", () => {
    const media: PropertyMedia = { media_type: "video", url: "https://evil.com/panorama-360-tour" };
    // media_type "video" (é assim que todo item de videos_json chega, ver
    // 15b abaixo) faz isso cair no ramo <video src> (elemento nativo, sem
    // risco de execução de script) em vez de "fallback" puro — o que
    // importa para a vulnerabilidade corrigida é que NUNCA vira iframe.
    expect(classifyMediaFrame(media).kind).not.toBe("iframe");
    expect(classifyMediaFrame(media)).toEqual({ kind: "video-file" });
  });

  it("12b. tipo não-vídeo/não-tour com '360'/'panorama' na URL cai em fallback puro (nunca iframe)", () => {
    const media: PropertyMedia = {
      media_type: "floor_plan",
      url: "https://evil.com/panorama-360-tour",
    };
    expect(classifyMediaFrame(media)).toEqual({ kind: "fallback" });
  });

  it("12c. reproduz o bypass histórico real (URL contendo 'youtube.com' como substring, sem ser o host real) — não vira mais iframe", () => {
    // Este é o payload que explorava o gap antigo: como a URL contém a
    // substring "youtube.com", o código antigo excluía do ramo de vídeo
    // direto e entrava no ramo de iframe via correspondência de substring
    // solta em isEmbeddableUrl, devolvendo a URL crua como src (toEmbedUrl
    // não reconhecia o formato e não alterava nada).
    const media: PropertyMedia = {
      media_type: "video",
      url: "https://evil.com/?youtube.com=1&panorama=xss-vector",
    };
    expect(classifyMediaFrame(media).kind).not.toBe("iframe");
  });

  it("13. panorama próprio (upload real, arquivo de imagem) continua funcionando via Pannellum", () => {
    const media: PropertyMedia = {
      media_type: "tour",
      url: "https://res.cloudinary.com/imobiflow/image/upload/v1/panorama-sala.jpg",
    };
    expect(classifyMediaFrame(media)).toEqual({ kind: "panorama-photo" });
  });

  it("13b. panorama próprio via storage local (/uploads/) também é reconhecido", () => {
    const media: PropertyMedia = {
      media_type: "tour",
      url: "https://imobiflow-staging.vercel.app/uploads/property-media/tour-360.png",
    };
    expect(classifyMediaFrame(media)).toEqual({ kind: "panorama-photo" });
  });

  it("14. MP4 próprio continua funcionando via <video controls>, nunca iframe", () => {
    const media: PropertyMedia = {
      media_type: "video",
      url: "https://res.cloudinary.com/imobiflow/video/upload/v1/imovel.mp4",
    };
    expect(classifyMediaFrame(media)).toEqual({ kind: "video-file" });
  });

  it("14b. .webm próprio também usa <video controls>", () => {
    const media: PropertyMedia = { media_type: "video", url: "https://cdn.example.com/clip.webm" };
    expect(classifyMediaFrame(media)).toEqual({ kind: "video-file" });
  });

  it("YouTube/Vimeo continuam indo para iframe, nunca para <video controls> (não-regressão)", () => {
    expect(
      classifyMediaFrame({
        media_type: "video",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    ).toEqual({
      kind: "iframe",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      provider: "youtube",
    });
    expect(classifyMediaFrame({ media_type: "video", url: "https://vimeo.com/123456789" })).toEqual(
      {
        kind: "iframe",
        embedUrl: "https://player.vimeo.com/video/123456789",
        provider: "vimeo",
      },
    );
  });

  it("15a. mídia sem URL nunca quebra a classificação (nem lança, nem vira iframe)", () => {
    expect(() => classifyMediaFrame({ media_type: "video", url: null })).not.toThrow();
    expect(() => classifyMediaFrame({ media_type: "video" })).not.toThrow();
    expect(classifyMediaFrame({ media_type: "video", url: null }).kind).not.toBe("iframe");
    expect(classifyMediaFrame({ media_type: "video" }).kind).not.toBe("iframe");
  });

  it("15b. link externo malicioso disfarçado de 'vídeo do imóvel' (videos_json) nunca vira iframe", () => {
    // Simula exatamente o vetor real: item de videos_json é sempre mapeado
    // para { media_type: "video", url: <qualquer coisa com protocolo
    // http(s)> } (ver mapeamento de `videos` em
    // site.$slug.imoveis.$propertySlug.tsx). O que importa aqui é que a
    // URL maliciosa NUNCA chega a virar `src` de iframe — ela cai no
    // elemento <video> nativo (sem risco de execução de script) porque
    // `resolveSafeEmbed` rejeita o host "evil.com".
    const media: PropertyMedia = { media_type: "video", url: "https://evil.com/?matterport=1" };
    expect(classifyMediaFrame(media)).toEqual({ kind: "video-file" });
  });
});

describe("isTourMedia / isVideoMedia / isPhotoMedia (Fase 3D — sem substring solta)", () => {
  it("isTourMedia confia apenas em media_type, nunca em substring da URL", () => {
    expect(isTourMedia({ media_type: "tour", url: "https://cdn.example.com/foto.jpg" })).toBe(true);
    expect(
      isTourMedia({
        media_type: "video",
        url: "https://evil.com/matterport-kuula-360-panorama.jpg",
      }),
    ).toBe(false);
  });

  it("isVideoMedia reconhece vídeo próprio, YouTube e Vimeo reais; não confia em substring solta", () => {
    expect(isVideoMedia({ media_type: "video", url: "https://cdn.example.com/clip.mp4" })).toBe(
      true,
    );
    expect(
      isVideoMedia({ media_type: "photo", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
    ).toBe(true);
    expect(isVideoMedia({ media_type: "photo", url: "https://evil.com/youtube.com/fake" })).toBe(
      false,
    );
  });

  it("isPhotoMedia não regride (F3B/F3C)", () => {
    expect(isPhotoMedia({ media_type: "photo", url: "https://cdn.example.com/foto.jpg" })).toBe(
      true,
    );
    expect(isPhotoMedia({ media_type: "video", url: "https://cdn.example.com/clip.mp4" })).toBe(
      false,
    );
  });
});

describe("sortMedia (regressão F3B — capa primeiro, depois position)", () => {
  it("mantém capa em primeiro, depois ordena por position", () => {
    const media: PropertyMedia[] = [
      { id: "b", url: "b.jpg", position: 1, is_cover: false },
      { id: "cover", url: "cover.jpg", position: 5, is_cover: true },
      { id: "a", url: "a.jpg", position: 0, is_cover: false },
    ];
    expect(sortMedia(media).map((item) => item.id)).toEqual(["cover", "a", "b"]);
  });
});
