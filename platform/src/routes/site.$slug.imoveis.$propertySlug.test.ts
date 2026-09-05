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
    // Fast-follow F3F: item de videos_json (sem isOwnUpload) com URL não
    // reconhecida pela allowlist agora cai em fallback seguro (link),
    // nunca em <video src> nem em iframe — ver 15b/16-20 abaixo para a
    // cobertura completa do fast-follow.
    const media: PropertyMedia = { media_type: "video", url: "https://evil.com/panorama-360-tour" };
    expect(classifyMediaFrame(media).kind).not.toBe("iframe");
    expect(classifyMediaFrame(media)).toEqual({ kind: "fallback" });
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
      isOwnUpload: true,
    };
    expect(classifyMediaFrame(media)).toEqual({ kind: "video-file" });
  });

  it("14b. .webm próprio também usa <video controls>", () => {
    const media: PropertyMedia = {
      media_type: "video",
      url: "https://cdn.example.com/clip.webm",
      isOwnUpload: true,
    };
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

  it("Matterport válido continua indo para iframe (não-regressão)", () => {
    expect(
      classifyMediaFrame({
        media_type: "video",
        url: "https://my.matterport.com/show/?m=abc123XYZ0",
      }),
    ).toEqual({
      kind: "iframe",
      embedUrl: "https://my.matterport.com/show/?m=abc123XYZ0",
      provider: "matterport",
    });
  });

  it("Kuula válido continua indo para iframe (não-regressão)", () => {
    expect(
      classifyMediaFrame({
        media_type: "video",
        url: "https://kuula.co/share/abcDEF123",
      }),
    ).toEqual({
      kind: "iframe",
      embedUrl: "https://kuula.co/share/abcDEF123",
      provider: "kuula",
    });
  });

  it("15a. mídia sem URL nunca quebra a classificação (nem lança, nem vira iframe)", () => {
    expect(() => classifyMediaFrame({ media_type: "video", url: null })).not.toThrow();
    expect(() => classifyMediaFrame({ media_type: "video" })).not.toThrow();
    expect(classifyMediaFrame({ media_type: "video", url: null }).kind).not.toBe("iframe");
    expect(classifyMediaFrame({ media_type: "video" }).kind).not.toBe("iframe");
  });

  it("15b. link externo malicioso disfarçado de 'vídeo do imóvel' (videos_json) nunca vira iframe nem <video src>", () => {
    // Simula exatamente o vetor real: item de videos_json é sempre mapeado
    // para { media_type: "video", url: <qualquer coisa com protocolo
    // http(s)> }, SEM isOwnUpload (ver mapeamento de `videos` em
    // site.$slug.imoveis.$propertySlug.tsx). Fast-follow F3F: a URL
    // maliciosa não pode mais virar `src` de iframe NEM de <video> — como
    // não é upload próprio e não bate no allowlist, cai no fallback
    // seguro (link "Abrir mídia cadastrada", sem request automático).
    const media: PropertyMedia = { media_type: "video", url: "https://evil.com/?matterport=1" };
    expect(classifyMediaFrame(media)).toEqual({ kind: "fallback" });
  });
});

// Fast-follow F3F (2026-09-05) — achado da homologação final (F3F): uma URL
// externa de videos_json que NÃO é reconhecida por `resolveSafeEmbed`
// caía em `<video src={url} preload="metadata">`, fazendo o navegador do
// visitante disparar uma requisição automática para o domínio externo
// arbitrário. Corrigido exigindo `media.isOwnUpload` (verdadeiro somente
// para itens vindos do array `media`/`property_media`, upload real
// validado pelo backend) além de `!safeEmbed` para o ramo "video-file".
// Todos os itens abaixo simulam explicitamente um item de videos_json
// (sem isOwnUpload) para provar que nenhum deles gera <video> ou <iframe>.
describe("classifyMediaFrame — fast-follow F3F (bloqueio de <video src> externo não confiável)", () => {
  it("1. MP4 legítimo próprio (isOwnUpload=true) continua <video>", () => {
    const media: PropertyMedia = {
      media_type: "video",
      url: "https://res.cloudinary.com/imobiflow/video/upload/v1/imovel-proprio.mp4",
      isOwnUpload: true,
    };
    expect(classifyMediaFrame(media)).toEqual({ kind: "video-file" });
  });

  it("2. YouTube válido (item de videos_json, sem isOwnUpload) continua iframe", () => {
    const media: PropertyMedia = {
      media_type: "video",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    };
    expect(classifyMediaFrame(media)).toEqual({
      kind: "iframe",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      provider: "youtube",
    });
  });

  it("3. Vimeo válido (item de videos_json, sem isOwnUpload) continua iframe", () => {
    const media: PropertyMedia = { media_type: "video", url: "https://vimeo.com/123456789" };
    expect(classifyMediaFrame(media)).toEqual({
      kind: "iframe",
      embedUrl: "https://player.vimeo.com/video/123456789",
      provider: "vimeo",
    });
  });

  it("4. Matterport válido (item de videos_json, sem isOwnUpload) continua iframe", () => {
    const media: PropertyMedia = {
      media_type: "video",
      url: "https://my.matterport.com/show/?m=abc123XYZ0",
    };
    expect(classifyMediaFrame(media)).toEqual({
      kind: "iframe",
      embedUrl: "https://my.matterport.com/show/?m=abc123XYZ0",
      provider: "matterport",
    });
  });

  it("5. Kuula válido (item de videos_json, sem isOwnUpload) continua iframe", () => {
    const media: PropertyMedia = { media_type: "video", url: "https://kuula.co/share/abcDEF123" };
    expect(classifyMediaFrame(media)).toEqual({
      kind: "iframe",
      embedUrl: "https://kuula.co/share/abcDEF123",
      provider: "kuula",
    });
  });

  it("6. evil.example não vira <video>", () => {
    const media: PropertyMedia = { media_type: "video", url: "https://evil.example/" };
    const frame = classifyMediaFrame(media);
    expect(frame.kind).not.toBe("video-file");
    expect(frame.kind).not.toBe("iframe");
    expect(frame).toEqual({ kind: "fallback" });
  });

  it("7. evil.example/video.mp4 não vira <video>", () => {
    const media: PropertyMedia = { media_type: "video", url: "https://evil.example/video.mp4" };
    const frame = classifyMediaFrame(media);
    expect(frame.kind).not.toBe("video-file");
    expect(frame.kind).not.toBe("iframe");
    expect(frame).toEqual({ kind: "fallback" });
  });

  it("8. URL com 'matterport' apenas na querystring não vira iframe nem <video>", () => {
    const media: PropertyMedia = { media_type: "video", url: "https://evil.example/?matterport=1" };
    const frame = classifyMediaFrame(media);
    expect(frame.kind).not.toBe("iframe");
    expect(frame.kind).not.toBe("video-file");
    expect(frame).toEqual({ kind: "fallback" });
  });

  it("9. subdomínio falso matterport.evil.example é bloqueado", () => {
    const media: PropertyMedia = {
      media_type: "video",
      url: "https://matterport.evil.example/show/?m=abc123XYZ0",
    };
    const frame = classifyMediaFrame(media);
    expect(frame.kind).not.toBe("iframe");
    expect(frame.kind).not.toBe("video-file");
    expect(frame).toEqual({ kind: "fallback" });
  });

  it("10. subdomínio falso kuula.evil.example é bloqueado", () => {
    const media: PropertyMedia = {
      media_type: "video",
      url: "https://kuula.evil.example/share/abcDEF123",
    };
    const frame = classifyMediaFrame(media);
    expect(frame.kind).not.toBe("iframe");
    expect(frame.kind).not.toBe("video-file");
    expect(frame).toEqual({ kind: "fallback" });
  });

  it("11. http:// inseguro é bloqueado (não vira iframe nem <video>)", () => {
    const media: PropertyMedia = {
      media_type: "video",
      url: "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    };
    const frame = classifyMediaFrame(media);
    expect(frame.kind).not.toBe("iframe");
    expect(frame.kind).not.toBe("video-file");
    expect(frame).toEqual({ kind: "fallback" });
  });

  it("12. javascript: é bloqueado", () => {
    const media: PropertyMedia = { media_type: "video", url: "javascript:alert(1)" };
    const frame = classifyMediaFrame(media);
    expect(frame.kind).not.toBe("iframe");
    expect(frame.kind).not.toBe("video-file");
    expect(frame).toEqual({ kind: "fallback" });
  });

  it("13. data: é bloqueado", () => {
    const media: PropertyMedia = {
      media_type: "video",
      url: "data:text/html,<script>alert(1)</script>",
    };
    const frame = classifyMediaFrame(media);
    expect(frame.kind).not.toBe("iframe");
    expect(frame.kind).not.toBe("video-file");
    expect(frame).toEqual({ kind: "fallback" });
  });

  it("14. file: é bloqueado", () => {
    const media: PropertyMedia = { media_type: "video", url: "file:///etc/passwd" };
    const frame = classifyMediaFrame(media);
    expect(frame.kind).not.toBe("iframe");
    expect(frame.kind).not.toBe("video-file");
    expect(frame).toEqual({ kind: "fallback" });
  });

  it("15. URL com credenciais embutidas é bloqueada", () => {
    const media: PropertyMedia = {
      media_type: "video",
      url: "https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ",
    };
    const frame = classifyMediaFrame(media);
    expect(frame.kind).not.toBe("iframe");
    expect(frame.kind).not.toBe("video-file");
    expect(frame).toEqual({ kind: "fallback" });
  });

  it("16. fallback nunca é 'video-file' nem 'iframe' — MediaFrame só renderiza <a> click-to-open para 'fallback', sem request automático", () => {
    // classifyMediaFrame é puro e não faz nenhum fetch/preload por si só;
    // o que importa é que, para todo caso acima, o kind retornado é
    // 'fallback', que no componente MediaFrame renderiza apenas um <a
    // target="_blank">, nunca um elemento que dispara carregamento
    // automático (<video preload>/<iframe src>).
    const media: PropertyMedia = { media_type: "video", url: "https://evil.example/malicious" };
    expect(classifyMediaFrame(media).kind).toBe("fallback");
  });

  it("17. panorama próprio (Pannellum) não regride com a mudança", () => {
    const media: PropertyMedia = {
      media_type: "tour",
      url: "https://res.cloudinary.com/imobiflow/image/upload/v1/panorama-sala.jpg",
      isOwnUpload: true,
    };
    expect(classifyMediaFrame(media)).toEqual({ kind: "panorama-photo" });
  });

  it("18. watermark: classifyMediaFrame não depende de watermark e não é afetado pela mudança (não-regressão estrutural)", () => {
    // A resolução de watermark acontece em resolvePublicPhotoUrl (backend)
    // antes da URL chegar aqui — classifyMediaFrame só decide o tipo de
    // frame a partir de media_type/url/isOwnUpload, nunca reprocessa
    // watermark. Uma foto de capa com watermark aplicado continua sendo
    // tratada como foto comum (fora do escopo de vídeo/tour).
    const media: PropertyMedia = {
      media_type: "photo",
      url: "https://res.cloudinary.com/imobiflow/image/upload/l_watermark/v1/foto.jpg",
      isOwnUpload: true,
    };
    expect(classifyMediaFrame(media)).toEqual({ kind: "fallback" });
  });

  it("19. galeria (fotos) não é afetada — isOwnUpload não muda a classificação de media_type 'photo'", () => {
    const media: PropertyMedia = { media_type: "photo", url: "https://cdn.example.com/foto.jpg" };
    expect(classifyMediaFrame(media)).toEqual({ kind: "fallback" });
    expect(isVideoMedia(media)).toBe(false);
  });

  it("20. multi-tenant: a classificação não depende de companyId/tenant — mesma URL, mesmo resultado independente da empresa", () => {
    const mediaCompanyA: PropertyMedia = {
      media_type: "video",
      url: "https://res.cloudinary.com/imobiflow/video/upload/v1/empresa-a.mp4",
      isOwnUpload: true,
    };
    const mediaCompanyB: PropertyMedia = {
      media_type: "video",
      url: "https://res.cloudinary.com/imobiflow/video/upload/v1/empresa-b.mp4",
      isOwnUpload: true,
    };
    expect(classifyMediaFrame(mediaCompanyA)).toEqual({ kind: "video-file" });
    expect(classifyMediaFrame(mediaCompanyB)).toEqual({ kind: "video-file" });
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
