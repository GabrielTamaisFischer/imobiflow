import {
  createWebsiteBuilderComponent,
  createWebsiteBuilderPage,
  createWebsiteBuilderSection,
  getWebsiteBuilderWebsite,
  updateWebsiteBuilderWebsite,
  type WebsiteBuilderWebsite,
} from "./website-builder";

type ProjectFileKind = "route" | "component" | "style" | "asset" | "data" | "config" | "document" | "other";

type ProjectFile = {
  path: string;
  kind: ProjectFileKind;
  size?: number;
  text?: string;
  url?: string;
};

type ImportedRouteFile = ProjectFile & {
  slug: string;
  title: string;
  pageType: "home" | "property" | "about" | "contact" | "landing" | "blog" | "custom" | "terms" | "privacy";
  texts: string[];
};

type GitHubTreeItem = {
  path: string;
  type: "blob" | "tree";
  size?: number;
};

type GitHubRepository = {
  owner: string;
  repo: string;
};

export type GitHubProjectImportInput = {
  websiteId: string;
  repositoryUrl: string;
  token?: string;
  accentColor?: string;
  previewUrl?: string;
};

export type LocalProjectImportInput = {
  websiteId: string;
  files: File[];
  reference?: string;
  accentColor?: string;
  previewUrl?: string;
};

export type LiveWebsiteImportInput = {
  websiteId: string;
  url: string;
  accentColor?: string;
};

export type ProjectImportResult = {
  website: WebsiteBuilderWebsite;
  summary: {
    totalFiles: number;
    pages: number;
    components: number;
    styles: number;
    assets: number;
  };
};

const textFilePattern = /\.(tsx|jsx|ts|js|css|scss|sass|html|htm|json|md|mdx|txt)$/i;
const assetFilePattern = /\.(png|jpe?g|webp|gif|svg|mp4|webm|mov|ico|avif)$/i;
const ignoredPathPattern = /(^|\/)(node_modules|\.git|dist|build|\.next|\.vercel|coverage|\.turbo|\.output)\//i;
const maxTextFileBytes = 180 * 1024;

export async function importGithubProjectIntoBuilder({
  websiteId,
  repositoryUrl,
  token,
  accentColor,
  previewUrl,
}: GitHubProjectImportInput): Promise<ProjectImportResult> {
  const repository = parseGithubRepository(repositoryUrl);
  if (!repository) {
    throw new Error("Informe um link válido de repositório GitHub. Exemplo: https://github.com/usuario/repositorio");
  }

  const headers = githubHeaders(token);
  const repoResponse = await fetch(`https://api.github.com/repos/${repository.owner}/${repository.repo}`, { headers });
  if (!repoResponse.ok) {
    if (repoResponse.status === 404) {
      throw new Error("Repositório GitHub não encontrado ou privado. Para repositório privado, informe um token GitHub temporário.");
    }
    throw new Error("Não foi possível acessar este repositório GitHub.");
  }

  const repo = (await repoResponse.json()) as {
    default_branch?: string;
    html_url?: string;
    homepage?: string | null;
    description?: string | null;
    name?: string;
  };
  const branch = repo.default_branch || "main";
  const treeResponse = await fetch(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers },
  );
  if (!treeResponse.ok) throw new Error("Não foi possível ler a pasta completa do repositório GitHub.");

  const treePayload = (await treeResponse.json()) as { tree?: GitHubTreeItem[]; truncated?: boolean };
  const treeFiles = (treePayload.tree ?? [])
    .filter((item) => item.type === "blob")
    .filter((item) => !ignoredPathPattern.test(item.path))
    .sort((left, right) => left.path.localeCompare(right.path));

  const assetFiles = treeFiles
    .filter((item) => assetFilePattern.test(item.path))
    .slice(0, 80)
    .map<ProjectFile>((item) => ({
      path: item.path,
      kind: "asset",
      size: item.size,
      url: rawGithubUrl(repository, branch, item.path),
    }));

  const textCandidates = selectTextFilesForImport(treeFiles).slice(0, 120);
  const textFiles = await Promise.all(
    textCandidates.map(async (item) => ({
      path: item.path,
      kind: classifyProjectPath(item.path),
      size: item.size,
      text: await fetchGithubTextFile(repository, branch, item.path, headers),
    })),
  );

  return persistProjectImport({
    websiteId,
    source: "github",
    reference: repo.html_url ?? repositoryUrl,
    externalPreviewUrl: normalizePreviewUrl(previewUrl) || inferExternalPreviewUrl(repositoryUrl, repo.homepage),
    accentColor,
    files: [...textFiles, ...assetFiles],
    metadata: {
      repository: repo.html_url ?? repositoryUrl,
      branch,
      description: repo.description ?? "",
      truncated: Boolean(treePayload.truncated),
      packageName: repo.name ?? repository.repo,
    },
  });
}

export async function importLocalProjectIntoBuilder({
  websiteId,
  files,
  reference,
  accentColor,
  previewUrl,
}: LocalProjectImportInput): Promise<ProjectImportResult> {
  if (!files.length) {
    throw new Error("Selecione uma pasta completa do site ou os arquivos do projeto para importar.");
  }

  const normalizedFiles = files
    .map((file) => ({
      file,
      path: normalizeLocalFilePath(file),
    }))
    .filter((item) => item.path && !ignoredPathPattern.test(item.path))
    .sort((left, right) => left.path.localeCompare(right.path));

  const textFiles = await Promise.all(
    normalizedFiles
      .filter((item) => textFilePattern.test(item.path))
      .filter((item) => item.file.size <= maxTextFileBytes)
      .slice(0, 140)
      .map(async (item) => ({
        path: item.path,
        kind: classifyProjectPath(item.path),
        size: item.file.size,
        text: await item.file.text().catch(() => ""),
      })),
  );

  const assetFiles = normalizedFiles
    .filter((item) => assetFilePattern.test(item.path))
    .slice(0, 80)
    .map<ProjectFile>((item) => ({
      path: item.path,
      kind: "asset",
      size: item.file.size,
      url: URL.createObjectURL(item.file),
    }));

  return persistProjectImport({
    websiteId,
    source: "local_folder",
    reference: reference || "Pasta local importada",
    externalPreviewUrl: normalizePreviewUrl(previewUrl) || normalizePreviewUrl(reference),
    accentColor,
    files: [...textFiles, ...assetFiles],
    metadata: {
      localFileCount: normalizedFiles.length,
      packageName: detectPackageName(textFiles) || "site-importado",
    },
  });
}

export async function importLiveWebsiteIntoBuilder({
  websiteId,
  url,
  accentColor,
}: LiveWebsiteImportInput): Promise<ProjectImportResult> {
  const previewUrl = normalizePreviewUrl(url);
  if (!previewUrl) {
    throw new Error("Informe a URL real do site publicado. Exemplo: /site/magnificopaginainicial#topo");
  }

  const colors = extractProjectColors("", accentColor);
  const websiteResponse = await getWebsiteBuilderWebsite(websiteId);
  const website = websiteResponse.website;

  const updateResponse = await updateWebsiteBuilderWebsite(websiteId, {
    theme_json: {
      ...website.themeJson,
      colors: {
        ...(isRecord(website.themeJson.colors) ? website.themeJson.colors : {}),
        primary: colors.primary,
        background: colors.background,
        foreground: colors.foreground,
        muted: colors.muted,
      },
    },
    settings_json: {
      ...website.settingsJson,
      import_mode: "live_website",
      import_source: "url",
      import_reference: url,
      external_preview_url: previewUrl,
      live_editor_url: previewUrl,
      imported_at: new Date().toISOString(),
      imported_project_summary: {
        totalFiles: 0,
        pages: 1,
        components: 0,
        styles: 0,
        assets: 0,
        metadata: {
          note: "Site real conectado por URL publicada para preview fiel no editor.",
        },
      },
    },
  });

  const pageResponse = await createWebsiteBuilderPage(websiteId, {
    title: "Site real importado",
    slug: "site-real",
    page_type: "home",
    status: "draft",
    sort_order: 0,
    settings_json: {
      source: "live_website",
      externalPreviewUrl: previewUrl,
    },
  });

  const sectionResponse = await createWebsiteBuilderSection(pageResponse.page.id, {
    name: "Site real conectado",
    section_type: "live_website",
    sort_order: 0,
    props_json: {
      title: "Site real conectado",
      externalPreviewUrl: previewUrl,
      source: "live_website",
    },
    style_json: {
      backgroundColor: "#080806",
      color: "#ffffff",
      paddingY: 48,
    },
  });

  await createWebsiteBuilderComponent(sectionResponse.section.id, {
    name: "URL do site real",
    component_type: "live_site_url",
    sort_order: 0,
    props_json: {
      text: previewUrl,
      url: previewUrl,
    },
  });

  return {
    website: updateResponse.website,
    summary: {
      totalFiles: 0,
      pages: 1,
      components: 0,
      styles: 0,
      assets: 0,
    },
  };
}

async function persistProjectImport({
  websiteId,
  source,
  reference,
  externalPreviewUrl,
  accentColor,
  files,
  metadata,
}: {
  websiteId: string;
  source: "github" | "local_folder";
  reference: string;
  externalPreviewUrl?: string | null;
  accentColor?: string;
  files: ProjectFile[];
  metadata: Record<string, unknown>;
}) {
  const websiteResponse = await getWebsiteBuilderWebsite(websiteId);
  const website = websiteResponse.website;
  const routes = buildRouteFiles(files);
  const componentFiles = files.filter((file) => file.kind === "component").slice(0, 48);
  const styleFiles = files.filter((file) => file.kind === "style").slice(0, 12);
  const dataFiles = files.filter((file) => file.kind === "data").slice(0, 16);
  const assets = files.filter((file) => file.kind === "asset").slice(0, 80);
  const colors = extractProjectColors(styleFiles.map((file) => file.text ?? "").join("\n"), accentColor);
  const fonts = extractProjectFonts(styleFiles.map((file) => file.text ?? "").join("\n"));
  const packageInfo = parsePackageInfo(files);

  const summary = {
    totalFiles: files.length,
    pages: routes.length,
    components: componentFiles.length,
    styles: styleFiles.length,
    assets: assets.length,
  };

  const nextSettings = {
    ...website.settingsJson,
    import_mode: "project_package",
    import_source: source,
    import_reference: reference,
    imported_at: new Date().toISOString(),
    external_preview_url: externalPreviewUrl ?? null,
    imported_project_summary: {
      ...summary,
      dataFiles: dataFiles.length,
      package: packageInfo,
      metadata,
    },
    imported_project_files: files.slice(0, 180).map((file) => ({
      path: file.path,
      kind: file.kind,
      size: file.size ?? null,
    })),
    imported_routes: routes.map((route) => ({
      path: route.path,
      slug: route.slug,
      title: route.title,
      pageType: route.pageType,
    })),
    imported_component_files: componentFiles.map((file) => ({
      path: file.path,
      name: fileNameWithoutExtension(file.path),
      texts: extractVisibleTexts(file.text ?? "").slice(0, 4),
    })),
    imported_style_files: styleFiles.map((file) => ({
      path: file.path,
      colors: extractProjectColors(file.text ?? "").palette.slice(0, 12),
    })),
    imported_assets: assets.map((file) => ({
      path: file.path,
      url: file.url ?? "",
      size: file.size ?? null,
    })),
    imported_data_files: dataFiles.map((file) => ({
      path: file.path,
      keys: extractObjectKeys(file.text ?? "").slice(0, 20),
    })),
  };

  const updateResponse = await updateWebsiteBuilderWebsite(websiteId, {
    theme_json: {
      ...website.themeJson,
      colors: {
        ...(isRecord(website.themeJson.colors) ? website.themeJson.colors : {}),
        primary: colors.primary,
        secondary: colors.secondary,
        background: colors.background,
        foreground: colors.foreground,
        muted: colors.muted,
      },
      fonts: {
        heading: fonts.heading,
        body: fonts.body,
      },
      radius: {
        cards: 24,
        buttons: 999,
      },
    },
    settings_json: nextSettings,
  });

  await createProjectMapPage(websiteId, {
    source,
    reference,
    summary,
    routes,
    componentFiles,
    styleFiles,
    dataFiles,
    assets,
    colors,
  });

  for (let index = 0; index < routes.length; index += 1) {
    await createImportedRoutePage(websiteId, routes[index], {
      index,
      source,
      reference,
      assets,
      componentFiles,
      colors,
    });
  }

  return { website: updateResponse.website, summary };
}

async function createProjectMapPage(
  websiteId: string,
  input: {
    source: string;
    reference: string;
    summary: ProjectImportResult["summary"];
    routes: ImportedRouteFile[];
    componentFiles: ProjectFile[];
    styleFiles: ProjectFile[];
    dataFiles: ProjectFile[];
    assets: ProjectFile[];
    colors: ReturnType<typeof extractProjectColors>;
  },
) {
  const pageResponse = await createWebsiteBuilderPage(websiteId, {
    title: "Mapa do projeto importado",
    slug: "mapa-do-projeto",
    page_type: "custom",
    status: "draft",
    sort_order: 0,
    settings_json: {
      importSource: input.source,
      reference: input.reference,
    },
  });

  const sectionResponse = await createWebsiteBuilderSection(pageResponse.page.id, {
    name: "Projeto completo importado",
    section_type: "imported_project_manifest",
    sort_order: 0,
    props_json: {
      title: "Projeto completo importado",
      source: input.source,
      reference: input.reference,
      summary: input.summary,
      routes: input.routes.map((route) => route.path),
      components: input.componentFiles.map((file) => file.path),
      styles: input.styleFiles.map((file) => file.path),
      dataFiles: input.dataFiles.map((file) => file.path),
      assets: input.assets.map((file) => file.path),
      palette: input.colors.palette,
    },
    style_json: { backgroundColor: "#080806", color: "#ffffff", paddingY: 88 },
  });

  await createWebsiteBuilderComponent(sectionResponse.section.id, {
    name: "Resumo do projeto",
    component_type: "project_manifest",
    sort_order: 0,
    props_json: {
      text: `Importação completa: ${input.summary.pages} página(s), ${input.summary.components} componente(s), ${input.summary.styles} estilo(s), ${input.summary.assets} asset(s).`,
      summary: input.summary,
    },
  });

  await createWebsiteBuilderComponent(sectionResponse.section.id, {
    name: "Arquivos detectados",
    component_type: "file_tree",
    sort_order: 1,
    props_json: {
      routes: input.routes.map((route) => route.path),
      components: input.componentFiles.map((file) => file.path),
      styles: input.styleFiles.map((file) => file.path),
      assets: input.assets.map((file) => file.path),
    },
  });

  if (input.assets.length) {
    await createWebsiteBuilderComponent(sectionResponse.section.id, {
      name: "Galeria importada",
      component_type: "asset_grid",
      sort_order: 2,
      props_json: {
        assets: input.assets.slice(0, 16).map((file) => ({ path: file.path, url: file.url })),
      },
    });
  }
}

async function createImportedRoutePage(
  websiteId: string,
  route: ImportedRouteFile,
  input: {
    index: number;
    source: string;
    reference: string;
    assets: ProjectFile[];
    componentFiles: ProjectFile[];
    colors: ReturnType<typeof extractProjectColors>;
  },
) {
  const pageResponse = await createWebsiteBuilderPage(websiteId, {
    title: route.title,
    slug: route.slug,
    page_type: route.pageType,
    status: "draft",
    sort_order: input.index + 1,
    seo_json: {
      sourceFile: route.path,
      importedFrom: input.reference,
    },
    settings_json: {
      sourceFile: route.path,
      routePath: route.slug === "home" ? "/" : `/${route.slug}`,
    },
  });

  const referencedAssets = findAssetsReferencedByCode(route.text ?? "", input.assets);
  const referencedComponents = findComponentsReferencedByCode(route.text ?? "", input.componentFiles);
  const heroAsset = referencedAssets[0] ?? input.assets.find((file) => /\.(png|jpe?g|webp|avif)$/i.test(file.path));
  const sectionResponse = await createWebsiteBuilderSection(pageResponse.page.id, {
    name: route.title,
    section_type: route.pageType === "home" ? "imported_home_page" : "imported_project_page",
    sort_order: 0,
    props_json: {
      title: route.title,
      sourceFile: route.path,
      source: input.source,
      repository: input.reference,
      backgroundUrl: heroAsset?.url,
      referencedAssets: referencedAssets.map((file) => ({ path: file.path, url: file.url })),
      referencedComponents: referencedComponents.map((file) => file.path),
    },
    style_json: {
      backgroundColor: route.pageType === "home" ? input.colors.background : "#11100d",
      color: input.colors.foreground,
      paddingY: route.pageType === "home" ? 104 : 80,
      borderRadius: 0,
    },
  });

  await createWebsiteBuilderComponent(sectionResponse.section.id, {
    name: "Título importado",
    component_type: "heading",
    sort_order: 0,
    props_json: { text: route.title, sourceFile: route.path },
  });

  const texts = route.texts.length ? route.texts : ["Página importada do projeto original e convertida para estrutura editável no ImobiFlow."];
  for (let textIndex = 0; textIndex < Math.min(texts.length, 8); textIndex += 1) {
    await createWebsiteBuilderComponent(sectionResponse.section.id, {
      name: `Texto importado ${textIndex + 1}`,
      component_type: textIndex === 0 ? "text" : "imported_text",
      sort_order: textIndex + 1,
      props_json: { text: texts[textIndex], sourceFile: route.path },
    });
  }

  if (heroAsset?.url) {
    await createWebsiteBuilderComponent(sectionResponse.section.id, {
      name: "Imagem detectada",
      component_type: heroAsset.path.match(/\.(mp4|webm|mov)$/i) ? "video" : "image",
      sort_order: 20,
      props_json: { imageUrl: heroAsset.url, videoUrl: heroAsset.url, alt: route.title, sourcePath: heroAsset.path },
    });
  }

  if (referencedComponents.length) {
    await createWebsiteBuilderComponent(sectionResponse.section.id, {
      name: "Componentes vinculados",
      component_type: "component_tree",
      sort_order: 30,
      props_json: {
        text: `${referencedComponents.length} componente(s) do projeto foram associados a esta página.`,
        components: referencedComponents.slice(0, 18).map((file) => file.path),
      },
    });
  }
}

function selectTextFilesForImport(files: GitHubTreeItem[]) {
  const important = files.filter((item) => {
    if (!textFilePattern.test(item.path)) return false;
    if ((item.size ?? 0) > maxTextFileBytes) return false;
    return (
      isRoutePath(item.path) ||
      isComponentPath(item.path) ||
      isStylePath(item.path) ||
      isDataPath(item.path) ||
      isConfigPath(item.path) ||
      item.path === "package.json" ||
      item.path.toLowerCase().endsWith("readme.md") ||
      item.path === "index.html" ||
      item.path === "src/App.tsx" ||
      item.path === "src/App.jsx"
    );
  });

  return important.sort((left, right) => importPriority(left.path) - importPriority(right.path) || left.path.localeCompare(right.path));
}

function buildRouteFiles(files: ProjectFile[]): ImportedRouteFile[] {
  let candidates = files.filter((file) => file.kind === "route" && file.text);
  if (!candidates.length) {
    candidates = files.filter((file) => /(^|\/)(App|index)\.(tsx|jsx|ts|js|html)$/i.test(file.path) && file.text);
  }

  const seen = new Map<string, number>();
  return candidates
    .sort((left, right) => routeSortWeight(left.path) - routeSortWeight(right.path) || left.path.localeCompare(right.path))
    .slice(0, 20)
    .map((file, index) => {
      const baseSlug = uniqueRouteSlug(slugFromRoutePath(file.path), index);
      const duplicateCount = seen.get(baseSlug) ?? 0;
      seen.set(baseSlug, duplicateCount + 1);
      const slug = duplicateCount > 0 ? `${baseSlug}-${duplicateCount + 1}` : baseSlug;
      return {
        ...file,
        slug,
        title: titleFromRouteCode(file.path, file.text ?? ""),
        pageType: pageTypeFromRoutePath(file.path),
        texts: extractVisibleTexts(file.text ?? "").slice(0, 14),
      };
    });
}

function classifyProjectPath(filePath: string): ProjectFileKind {
  if (assetFilePattern.test(filePath)) return "asset";
  if (isRoutePath(filePath)) return "route";
  if (isComponentPath(filePath)) return "component";
  if (isStylePath(filePath)) return "style";
  if (isDataPath(filePath)) return "data";
  if (isConfigPath(filePath)) return "config";
  if (/\.(md|mdx|txt)$/i.test(filePath)) return "document";
  return "other";
}

function isRoutePath(filePath: string) {
  return (
    /^src\/routes\/.+\.(tsx|jsx|ts|js)$/i.test(filePath) ||
    /^src\/pages\/.+\.(tsx|jsx|ts|js)$/i.test(filePath) ||
    /^pages\/.+\.(tsx|jsx|ts|js)$/i.test(filePath) ||
    /^app\/.+\/page\.(tsx|jsx|ts|js)$/i.test(filePath) ||
    /^src\/app\/.+\/page\.(tsx|jsx|ts|js)$/i.test(filePath) ||
    /(^|\/)(App)\.(tsx|jsx)$/i.test(filePath) ||
    /^index\.html$/i.test(filePath)
  );
}

function isComponentPath(filePath: string) {
  return /(^|\/)(components|sections|blocks|layouts|ui)\//i.test(filePath) && /\.(tsx|jsx|ts|js)$/i.test(filePath);
}

function isStylePath(filePath: string) {
  return /\.(css|scss|sass)$/i.test(filePath);
}

function isDataPath(filePath: string) {
  return /(^|\/)(data|content|cms|mocks|mock|constants)\//i.test(filePath) && /\.(ts|tsx|js|json|md|mdx)$/i.test(filePath);
}

function isConfigPath(filePath: string) {
  return /(^|\/)(package\.json|vite\.config|tailwind\.config|tsconfig|next\.config|components\.json)/i.test(filePath);
}

function importPriority(filePath: string) {
  if (filePath === "package.json") return 0;
  if (isStylePath(filePath)) return 1;
  if (isRoutePath(filePath)) return 2;
  if (isComponentPath(filePath)) return 3;
  if (isDataPath(filePath)) return 4;
  return 9;
}

function githubHeaders(token?: string) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function parseGithubRepository(value: string): GitHubRepository | null {
  const match = value.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/i, "") };
}

async function fetchGithubTextFile(
  repository: GitHubRepository,
  branch: string,
  filePath: string,
  headers: Record<string, string>,
) {
  const response = await fetch(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/contents/${encodeURIComponentPath(filePath)}?ref=${encodeURIComponent(branch)}`,
    { headers },
  );
  if (!response.ok) return "";
  const payload = (await response.json()) as { content?: string; encoding?: string };
  if (payload.encoding === "base64" && payload.content) {
    return decodeBase64Utf8(payload.content.replace(/\s/g, ""));
  }
  return "";
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeURIComponentPath(filePath: string) {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

function rawGithubUrl(repository: GitHubRepository, branch: string, filePath: string) {
  return `https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/${encodeURIComponent(branch)}/${filePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function inferExternalPreviewUrl(repositoryUrl: string, homepage?: string | null) {
  if (homepage && /^https?:\/\//i.test(homepage)) return homepage.replace(/\/+$/, "");
  void repositoryUrl;
  return null;
}

function normalizePreviewUrl(value?: string | null) {
  if (!value) return null;
  const clean = value.trim();
  if (!clean) return null;
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith("/")) return clean;
  return null;
}

function normalizeLocalFilePath(file: File) {
  const relativePath = "webkitRelativePath" in file && typeof file.webkitRelativePath === "string" ? file.webkitRelativePath : file.name;
  return relativePath.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function routeSortWeight(filePath: string) {
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith("index.tsx") || normalized.endsWith("index.jsx") || normalized.endsWith("app.tsx") || normalized === "index.html") return 0;
  if (normalized.includes("imoveis") || normalized.includes("properties")) return 1;
  if (normalized.includes("sobre") || normalized.includes("about")) return 2;
  if (normalized.includes("como-trabalhamos")) return 3;
  if (normalized.includes("contato") || normalized.includes("contact")) return 4;
  return 10;
}

function slugFromRoutePath(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  if (/^index\.html$/i.test(normalized) || /(^|\/)App\.(tsx|jsx)$/i.test(normalized)) return "home";
  if (/\/page\.(tsx|jsx|ts|js)$/i.test(normalized)) {
    const parts = normalized.split("/").filter(Boolean);
    const pageIndex = parts.lastIndexOf("page.tsx") >= 0 ? parts.lastIndexOf("page.tsx") : parts.length - 1;
    const routeParts = parts.slice(Math.max(0, pageIndex - 2), pageIndex).filter((part) => !["app", "src"].includes(part));
    return slugify(routeParts.join("-") || "home");
  }

  const fileName = normalized.split("/").pop() ?? "pagina";
  const clean = fileName
    .replace(/\.(tsx|jsx|ts|js|html|htm)$/i, "")
    .replace(/^index$/i, "home")
    .replace(/^imoveis_\.\$slug$/i, "imoveis-detalhe")
    .replace(/\$/g, "")
    .replace(/_/g, "-");
  return slugify(clean) || "pagina";
}

function uniqueRouteSlug(slug: string, index: number) {
  if (index === 0 && (slug === "app" || slug === "index")) return "home";
  return slug || `pagina-${index + 1}`;
}

function pageTypeFromRoutePath(filePath: string): ImportedRouteFile["pageType"] {
  const slug = slugFromRoutePath(filePath);
  if (slug === "home" || /(^|\/)(App)\.(tsx|jsx)$/i.test(filePath)) return "home";
  if (slug.includes("imoveis-detalhe") || slug.includes("property") || slug.includes("produto")) return "property";
  if (slug.includes("sobre") || slug.includes("about")) return "about";
  if (slug.includes("contato") || slug.includes("contact")) return "contact";
  if (slug.includes("termos") || slug.includes("terms")) return "terms";
  if (slug.includes("politica") || slug.includes("privacy")) return "privacy";
  if (slug.includes("blog")) return "blog";
  return "custom";
}

function titleFromRouteCode(filePath: string, code: string) {
  const metaTitle = code.match(/\{\s*title:\s*"([^"]+)"/)?.[1] || code.match(/\{\s*title:\s*'([^']+)'/)?.[1];
  if (metaTitle) return metaTitle.split("·")[0].trim();
  const h1 = code.match(/<h1[^>]*>([\s\S]{0,260}?)<\/h1>/i)?.[1]?.trim();
  if (h1) return stripJsxText(h1).slice(0, 90);
  const slug = slugFromRoutePath(filePath);
  return slug === "home" ? "Página inicial importada" : titleCase(slug.replace(/-/g, " "));
}

function extractVisibleTexts(code: string) {
  const plainTextMatches = [...code.matchAll(/>([^<>{}][^<>{]{14,220})</g)].map((match) => match[1]);
  const stringMatches = [...code.matchAll(/(?:title|subtitle|description|label|headline|text|name):\s*["'`]([^"'`]{14,220})["'`]/g)].map((match) => match[1]);

  return Array.from(
    new Set([...plainTextMatches, ...stringMatches].map(stripJsxText).filter((text) => text.length > 14).filter((text) => !/^[\s.;,()]+$/.test(text))),
  ).slice(0, 30);
}

function stripJsxText(value: string) {
  return value
    .replace(/\{[^}]+\}/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&")
    .trim();
}

function extractProjectColors(css: string, accentColor?: string) {
  const hexColors = Array.from(new Set([...(css.match(/#[0-9a-f]{3,8}\b/gi) ?? []), accentColor ?? ""].filter(Boolean)));
  const cssVarGold = css.match(/--(?:gold|primary|accent):\s*([^;]+)/i)?.[1]?.trim();
  const primary = normalizeCssColor(accentColor) || normalizeCssColor(cssVarGold) || hexColors[0] || "#c8a24b";
  return {
    primary,
    secondary: hexColors[1] || "#1f1b13",
    background: hexColors.find((color) => isVeryDarkColor(color)) || "#080806",
    foreground: "#ffffff",
    muted: "#9c9384",
    palette: hexColors.slice(0, 24),
  };
}

function extractProjectFonts(css: string) {
  const fontFamily = css.match(/font-family:\s*([^;]+)/i)?.[1]?.trim();
  return {
    heading: fontFamily || "Cormorant Garamond, Playfair Display, Georgia, serif",
    body: "Inter, system-ui, -apple-system, sans-serif",
  };
}

function normalizeCssColor(value?: string | null) {
  if (!value) return "";
  const clean = value.trim();
  return clean.startsWith("#") ? clean : "";
}

function isVeryDarkColor(value: string) {
  const hex = value.replace("#", "");
  if (![3, 6, 8].includes(hex.length)) return false;
  const full = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex.slice(0, 6);
  const number = Number.parseInt(full, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return r + g + b < 120;
}

function parsePackageInfo(files: ProjectFile[]) {
  const packageFile = files.find((file) => file.path.endsWith("package.json") && file.text);
  if (!packageFile?.text) return {};
  try {
    const parsed = JSON.parse(packageFile.text) as {
      name?: string;
      version?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    return {
      name: parsed.name,
      version: parsed.version,
      dependencies: Object.keys(parsed.dependencies ?? {}).slice(0, 30),
      devDependencies: Object.keys(parsed.devDependencies ?? {}).slice(0, 30),
      scripts: parsed.scripts ?? {},
    };
  } catch {
    return {};
  }
}

function detectPackageName(files: ProjectFile[]) {
  const packageInfo = parsePackageInfo(files);
  return isRecord(packageInfo) && typeof packageInfo.name === "string" ? packageInfo.name : "";
}

function findAssetsReferencedByCode(code: string, assets: ProjectFile[]) {
  return assets
    .filter((asset) => {
      const fileName = asset.path.split("/").pop() ?? "";
      return fileName && code.includes(fileName);
    })
    .slice(0, 12);
}

function findComponentsReferencedByCode(code: string, components: ProjectFile[]) {
  return components
    .filter((component) => {
      const name = fileNameWithoutExtension(component.path);
      return name && code.includes(name);
    })
    .slice(0, 24);
}

function extractObjectKeys(code: string) {
  return Array.from(new Set([...code.matchAll(/([a-zA-Z_$][\w$]*)\s*:/g)].map((match) => match[1]))).filter((key) => key.length > 1);
}

function fileNameWithoutExtension(filePath: string) {
  return (filePath.split("/").pop() ?? filePath).replace(/\.[^.]+$/, "");
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
