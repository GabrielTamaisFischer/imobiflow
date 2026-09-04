import { describe, expect, it } from "vitest";
import { resolveSafeEmbed } from "./embed-providers";

// Fase 3D — Segurança de embeds externos. Cobre os 15 cenários exigidos
// pela tarefa (itens 1-15 do bloco "TESTES OBRIGATÓRIOS — EMBED").
describe("resolveSafeEmbed", () => {
  it("1. Matterport válido é permitido (provider suportado)", () => {
    const result = resolveSafeEmbed("https://my.matterport.com/show/?m=Zh8Yv2Fp5qR");
    expect(result).toEqual({
      provider: "matterport",
      embedUrl: "https://my.matterport.com/show/?m=Zh8Yv2Fp5qR",
    });
  });

  it("2. Kuula válido é permitido (provider suportado)", () => {
    const result = resolveSafeEmbed("https://kuula.co/share/7hK9pQ2m?fs=1&vr=0");
    expect(result).toEqual({ provider: "kuula", embedUrl: "https://kuula.co/share/7hK9pQ2m" });
  });

  it("3. YouTube válido continua permitido (watch, youtu.be, embed, shorts)", () => {
    expect(resolveSafeEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    });
    expect(resolveSafeEmbed("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    });
    expect(resolveSafeEmbed("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.provider).toBe(
      "youtube",
    );
  });

  it("4. Vimeo válido continua permitido (link direto e player já-convertido)", () => {
    expect(resolveSafeEmbed("https://vimeo.com/123456789")).toEqual({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/123456789",
    });
    expect(resolveSafeEmbed("https://player.vimeo.com/video/123456789")).toEqual({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/123456789",
    });
  });

  it("5. domínio falso contendo nome do provider é bloqueado", () => {
    expect(resolveSafeEmbed("https://matterport-tour.com/show/?m=abc123def")).toBeNull();
    expect(resolveSafeEmbed("https://youtube.com.evil.net/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("6. query string contendo nome do provider é bloqueada", () => {
    expect(resolveSafeEmbed("https://evil.com/?matterport=1")).toBeNull();
    expect(resolveSafeEmbed("https://evil.com/page?provider=kuula&x=youtube.com")).toBeNull();
  });

  it("7. subdomínio malicioso é bloqueado", () => {
    expect(resolveSafeEmbed("https://matterport.evil.com/show/?m=abc123def")).toBeNull();
    expect(resolveSafeEmbed("https://kuula.co.evil.com/share/abc123")).toBeNull();
  });

  it("8. javascript: é bloqueado", () => {
    expect(resolveSafeEmbed("javascript:alert(document.cookie)")).toBeNull();
  });

  it("9. data: é bloqueado", () => {
    expect(
      resolveSafeEmbed("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="),
    ).toBeNull();
  });

  it("10. http inseguro é bloqueado (política: apenas HTTPS para embeds externos)", () => {
    expect(resolveSafeEmbed("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(resolveSafeEmbed("http://kuula.co/share/abc123")).toBeNull();
  });

  it("11. URL inválida cai em fallback seguro (retorna null, nunca lança)", () => {
    expect(resolveSafeEmbed("não é uma url")).toBeNull();
    expect(resolveSafeEmbed("")).toBeNull();
    expect(resolveSafeEmbed(null)).toBeNull();
    expect(resolveSafeEmbed(undefined)).toBeNull();
    expect(resolveSafeEmbed("   ")).toBeNull();
  });

  it("12. strings contendo '360'/'panorama' não viram iframe só por conterem essas palavras", () => {
    expect(resolveSafeEmbed("https://evil.com/panorama-360-tour")).toBeNull();
    expect(resolveSafeEmbed("https://360.evil.com/panorama")).toBeNull();
    expect(resolveSafeEmbed("https://evil.com/?type=360&panorama=true")).toBeNull();
  });

  it("13. file: é bloqueado", () => {
    expect(resolveSafeEmbed("file:///etc/passwd")).toBeNull();
  });

  it("14. credenciais embutidas na URL não burlam a checagem de hostname", () => {
    expect(resolveSafeEmbed("https://my.matterport.com:evil@evil.com/")).toBeNull();
    expect(resolveSafeEmbed("https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("15. formato de provider inválido (hostname certo, conteúdo errado) é rejeitado", () => {
    expect(resolveSafeEmbed("https://www.youtube.com/watch")).toBeNull();
    expect(resolveSafeEmbed("https://www.youtube.com/watch?v=")).toBeNull();
    expect(resolveSafeEmbed("https://my.matterport.com/show/")).toBeNull();
    expect(resolveSafeEmbed("https://kuula.co/share/")).toBeNull();
    expect(resolveSafeEmbed("https://vimeo.com/not-a-number")).toBeNull();
  });
});
