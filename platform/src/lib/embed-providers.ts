// Fase 3D — Segurança de embeds externos (site público de imóveis).
//
// PROBLEMA CORRIGIDO AQUI: antes desta fase, a decisão de transformar uma
// URL de mídia em `<iframe src=...>` na página pública era feita por
// correspondência de substring solta (`url.includes("matterport")`,
// `url.includes("360")` etc). Isso permitia que qualquer usuário com
// permissão de editar o imóvel colasse uma URL como
// `https://evil.com/?matterport=1` (ou contendo "kuula"/"360"/"panorama"
// em qualquer parte — subdomínio, path ou querystring) no campo "Links de
// vídeo" (`videos_json`, sem nenhuma validação de domínio no backend) e
// ela virasse `src` de um iframe arbitrário, sem sandbox, visível a
// qualquer visitante do site público. Isso viola literalmente a Diretriz
// Mestre 11.2 ("Não permitir iframe arbitrário inseguro").
//
// POLÍTICA NOVA (allowlist explícita, sem substring matching):
// 1. A URL precisa ser um `https://` real e bem formado (rejeita
//    `javascript:`, `data:`, `file:`, `http://` inseguro, URLs malformadas
//    e URLs com credenciais embutidas — `https://user:pass@host/...`).
// 2. O `hostname` precisa bater EXATAMENTE (nunca por substring/`includes`)
//    contra um allowlist fechado por provider.
// 3. O formato esperado do provider (ID de vídeo, parâmetro `m` do
//    Matterport, path `/share/<id>` do Kuula) precisa ser válido.
// 4. A URL final usada como `src` do iframe é sempre RECONSTRUÍDA do zero
//    a partir do ID extraído — nunca a URL crua fornecida pelo usuário é
//    devolvida como `src`.
//
// PROVIDERS SUPORTADOS (decidido após inspecionar código + Diretriz Mestre
// + doc de módulo "Página de Imóvel"):
// - YouTube: Diretriz Mestre 11.2 exige explicitamente suporte com embed
//   seguro. Homologado (Matriz de Gap 2026-08-31, PASS).
// - Vimeo: já possuía conversão segura no código (`toEmbedUrl` antigo já
//   convertia para `player.vimeo.com`) e a própria tarefa F3D declara
//   "YouTube/Vimeo já homologados não devem regredir" — mantido.
// - Matterport / Kuula: a Diretriz Mestre 11 só aprova "outros embeds
//   somente se a arquitetura já permitir com segurança" — e a arquitetura
//   ANTES desta correção não validava esses dois com segurança nenhuma
//   (apenas substring + passthrough cru). O doc de módulo "Página de
//   Imóvel" (PARTE CXV — EMBED WHITELIST, item 342) cita explicitamente
//   Matterport e Kuula como "provider conhecido" a suportar via "lista
//   deliberada", e o item 343 alerta: "Não interpretar substring como
//   trust." Portanto o produto CONTEMPLA os dois, mas exigia a validação
//   real de hostname que só é implementada agora. Caso o produto decida no
//   futuro que nenhum dos dois é realmente usado, basta remover as duas
//   entradas do allowlist abaixo — nenhuma outra mudança é necessária.
// - MP4/WebM próprio e panorama próprio (Pannellum) NÃO passam por aqui:
//   continuam bypassando o iframe inteiramente via `<video controls>` /
//   `PanoramaViewer`, como já era o caso antes desta fase.
//
// Protocolo HTTP inseguro (não-https) para embeds externos: bloqueado.
// Preferência explícita da tarefa F3D ("Preferencialmente aceitar somente
// HTTPS para embeds externos") e da Diretriz Mestre 11.2. Uma URL
// `http://youtube.com/...` cai no fallback seguro (link), não no iframe.

export type EmbedProvider = "youtube" | "vimeo" | "matterport" | "kuula";

export interface SafeEmbed {
  provider: EmbedProvider;
  embedUrl: string;
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const MATTERPORT_HOSTS = new Set(["my.matterport.com"]);
const KUULA_HOSTS = new Set(["kuula.co", "www.kuula.co"]);

function safeParseUrl(raw: string): URL | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  // Credenciais embutidas (`https://user:pass@host/...`) não têm uso
  // legítimo em nenhum destes providers e são um vetor clássico de tentar
  // confundir parsers ingênuos de URL — rejeitadas antes de qualquer
  // checagem de hostname.
  if (url.username || url.password) return null;
  return url;
}

function isVideoId(id: string | null | undefined): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{6,32}$/.test(id);
}

function resolveYoutube(url: URL): SafeEmbed | null {
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v");
  } else if (url.pathname.startsWith("/embed/")) {
    id = url.pathname.slice("/embed/".length).split(/[/?#]/)[0] ?? null;
  } else if (url.pathname.startsWith("/shorts/")) {
    id = url.pathname.slice("/shorts/".length).split(/[/?#]/)[0] ?? null;
  }
  if (!isVideoId(id)) return null;
  return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
}

function resolveVimeo(url: URL): SafeEmbed | null {
  const host = url.hostname.toLowerCase();
  if (!VIMEO_HOSTS.has(host)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const id = host === "player.vimeo.com" ? segments[segments.indexOf("video") + 1] : segments[0];
  if (!id || !/^\d{6,15}$/.test(id)) return null;
  return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
}

function resolveMatterport(url: URL): SafeEmbed | null {
  if (!MATTERPORT_HOSTS.has(url.hostname.toLowerCase())) return null;
  const id = url.searchParams.get("m");
  if (!id || !/^[A-Za-z0-9]{6,24}$/.test(id)) return null;
  return { provider: "matterport", embedUrl: `https://my.matterport.com/show/?m=${id}` };
}

function resolveKuula(url: URL): SafeEmbed | null {
  if (!KUULA_HOSTS.has(url.hostname.toLowerCase())) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const shareIndex = segments.indexOf("share");
  const id = shareIndex >= 0 ? segments[shareIndex + 1] : null;
  if (!id || !/^[A-Za-z0-9_-]{4,48}$/.test(id)) return null;
  return { provider: "kuula", embedUrl: `https://kuula.co/share/${id}` };
}

/**
 * Única função central de decisão: uma URL só pode virar `<iframe src>`
 * se esta função retornar um objeto não-nulo. Qualquer outro caminho
 * (frontend) deve tratar `null` como "não é embeddable" e cair no
 * fallback seguro (link), nunca em um iframe.
 */
export function resolveSafeEmbed(rawUrl: string | null | undefined): SafeEmbed | null {
  const url = safeParseUrl(rawUrl ?? "");
  if (!url) return null;
  if (url.protocol !== "https:") return null;
  return (
    resolveYoutube(url) ?? resolveVimeo(url) ?? resolveMatterport(url) ?? resolveKuula(url) ?? null
  );
}
