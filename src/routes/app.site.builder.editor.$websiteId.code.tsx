import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Braces,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Eye,
  FileCode2,
  Folder,
  FolderOpen,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createWebsiteBuilderCodeFile,
  getWebsiteBuilderWebsite,
  listWebsiteBuilderCodeFiles,
  listWebsiteBuilderAssets,
  listWebsiteBuilderComponents,
  listWebsiteBuilderPages,
  listWebsiteBuilderSections,
  updateWebsiteBuilderCodeFile,
  type WebsiteBuilderAsset,
  type WebsiteBuilderCodeFile,
  type WebsiteBuilderComponent,
  type WebsiteBuilderPage,
  type WebsiteBuilderSection,
  type WebsiteBuilderWebsite,
} from "@/product/website-builder";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/site/builder/editor/$websiteId/code")({
  component: WebsiteBuilderCodeEditorPage,
});

type CodeFile = {
  id?: string;
  path: string;
  label: string;
  code: string;
  language: "tsx" | "ts" | "json" | "css" | "html" | "javascript" | "markdown";
  description: string;
  fileType: string;
  pageId?: string | null;
  updatedAt?: string | null;
  persisted?: boolean;
};

type TreeNode = {
  name: string;
  path: string;
  file?: CodeFile;
  children: TreeNode[];
};

function WebsiteBuilderCodeEditorPage() {
  const { websiteId } = Route.useParams();
  const { isLoading, session } = useSessionGuard();
  const [website, setWebsite] = useState<WebsiteBuilderWebsite | null>(null);
  const [pages, setPages] = useState<WebsiteBuilderPage[]>([]);
  const [sectionsByPage, setSectionsByPage] = useState<Record<string, WebsiteBuilderSection[]>>({});
  const [componentsBySection, setComponentsBySection] = useState<Record<string, WebsiteBuilderComponent[]>>({});
  const [assets, setAssets] = useState<WebsiteBuilderAsset[]>([]);
  const [codeFiles, setCodeFiles] = useState<WebsiteBuilderCodeFile[]>([]);
  const [selectedPath, setSelectedPath] = useState("site.config.json");
  const [openPaths, setOpenPaths] = useState<string[]>(["site.config.json"]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedSnapshots, setSavedSnapshots] = useState<Record<string, string>>({});
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Editor de codigo carregado.");
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isLoading || !session) return;
    void loadStructure();
  }, [isLoading, session, websiteId]);

  const files = useMemo(
    () => mergePersistedCodeFiles(buildCodeFiles(website, pages, sectionsByPage, componentsBySection, assets), codeFiles),
    [assets, codeFiles, componentsBySection, pages, sectionsByPage, website],
  );

  const selectedFile = files.find((file) => file.path === selectedPath) ?? files[0] ?? null;
  const currentCode = selectedFile ? drafts[selectedFile.path] ?? savedSnapshots[selectedFile.path] ?? selectedFile.code : "";
  const savedCode = selectedFile ? savedSnapshots[selectedFile.path] ?? selectedFile.code : "";
  const isDirty = Boolean(selectedFile && currentCode !== savedCode);
  const hasUnsavedChanges = useMemo(
    () => files.some((file) => (drafts[file.path] ?? savedSnapshots[file.path] ?? file.code) !== (savedSnapshots[file.path] ?? file.code)),
    [drafts, files, savedSnapshots],
  );
  const openFiles = openPaths.map((filePath) => files.find((file) => file.path === filePath)).filter((file): file is CodeFile => Boolean(file));

  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return files;
    return files.filter((file) => `${file.path} ${file.label} ${file.description}`.toLowerCase().includes(query));
  }, [files, search]);

  const tree = useMemo(() => buildFileTree(filteredFiles), [filteredFiles]);

  const totals = useMemo(() => {
    const sections = Object.values(sectionsByPage).flat();
    const components = Object.values(componentsBySection).flat();
    return {
      pages: pages.length,
      sections: sections.length,
      components: components.length,
      assets: assets.length,
      files: files.length,
    };
  }, [assets.length, componentsBySection, files.length, pages.length, sectionsByPage]);

  useEffect(() => {
    if (!selectedFile) return;
    setDrafts((current) => {
      if (current[selectedFile.path] !== undefined || savedSnapshots[selectedFile.path] !== undefined) return current;
      return { ...current, [selectedFile.path]: selectedFile.code };
    });
  }, [savedSnapshots, selectedFile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isShortcut = event.ctrlKey || event.metaKey;
      if (!isShortcut) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void saveCurrentFile();
      }
      if (key === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentCode, selectedFile]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "Existem alterações de código não salvas.";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  async function loadStructure() {
    setError(null);
    setStatusMessage("Carregando estrutura completa do site...");
    try {
      const [websiteResponse, pagesResponse, assetsResponse, codeFilesResponse] = await Promise.all([
        getWebsiteBuilderWebsite(websiteId),
        listWebsiteBuilderPages(websiteId),
        listWebsiteBuilderAssets(websiteId),
        listWebsiteBuilderCodeFiles(websiteId),
      ]);

      const sortedPages = [...pagesResponse.pages].sort((left, right) => left.sortOrder - right.sortOrder);
      const sectionsEntries = await Promise.all(
        sortedPages.map(async (page) => {
          const response = await listWebsiteBuilderSections(page.id);
          const sections = [...response.sections].sort((left, right) => left.sortOrder - right.sortOrder);
          return [page.id, sections] as const;
        }),
      );

      const allSections = sectionsEntries.flatMap(([, sections]) => sections);
      const componentEntries = await Promise.all(
        allSections.map(async (section) => {
          const response = await listWebsiteBuilderComponents(section.id);
          const components = [...response.components].sort((left, right) => left.sortOrder - right.sortOrder);
          return [section.id, components] as const;
        }),
      );

      setWebsite(websiteResponse.website);
      setPages(sortedPages);
      setSectionsByPage(Object.fromEntries(sectionsEntries));
      setComponentsBySection(Object.fromEntries(componentEntries));
      setAssets(assetsResponse.assets);
      setCodeFiles(codeFilesResponse.code_files);
      setSavedSnapshots(Object.fromEntries(codeFilesResponse.code_files.map((file) => [file.filePath, file.content])));
      setSelectedPath((current) => (current ? current : "site.config.json"));
      setStatusMessage("Estrutura carregada. Selecione qualquer arquivo para editar.");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Nao foi possivel carregar o codigo do site.");
      setStatusMessage("Falha ao carregar estrutura.");
    }
  }

  async function saveCurrentFile() {
    if (!selectedFile || !website) return;
    const jsonError = validateJsonIfNeeded(selectedFile, currentCode);
    if (jsonError) {
      setStatusMessage(jsonError);
      return;
    }

    setStatusMessage(`Salvando ${selectedFile.path}...`);

    try {
      const payload = {
        page_id: selectedFile.pageId ?? null,
        file_path: selectedFile.path,
        file_type: selectedFile.fileType,
        language: toApiCodeLanguage(selectedFile.language),
        content: currentCode,
      };
      const response = selectedFile.id
        ? await updateWebsiteBuilderCodeFile(website.id, selectedFile.id, payload)
        : await createWebsiteBuilderCodeFile(website.id, payload);

      setCodeFiles((current) => {
        const withoutCurrent = current.filter((file) => file.id !== response.code_file.id && file.filePath !== response.code_file.filePath);
        return [...withoutCurrent, response.code_file].sort((left, right) => left.filePath.localeCompare(right.filePath));
      });
      setSavedSnapshots((current) => ({ ...current, [response.code_file.filePath]: response.code_file.content }));
      setDrafts((current) => ({ ...current, [response.code_file.filePath]: response.code_file.content }));
      setStatusMessage(`${selectedFile.path} salvo no MySQL do Website Builder.`);
    } catch (saveError) {
      setStatusMessage(saveError instanceof Error ? saveError.message : "Nao foi possivel salvar o codigo.");
    }
  }

  function resetCurrentFile() {
    if (!selectedFile) return;
    setDrafts((current) => ({ ...current, [selectedFile.path]: savedSnapshots[selectedFile.path] ?? selectedFile.code }));
    setStatusMessage(`${selectedFile.path} restaurado para a ultima versao salva.`);
  }

  async function copyCurrentCode() {
    if (!selectedFile) return;
    await navigator.clipboard?.writeText(currentCode);
    setStatusMessage(`${selectedFile.path} copiado.`);
  }

  function selectFile(file: CodeFile) {
    setSelectedPath(file.path);
    setOpenPaths((current) => (current.includes(file.path) ? current : [...current, file.path]));
  }

  function closeTab(filePath: string) {
    setOpenPaths((current) => {
      const next = current.filter((item) => item !== filePath);
      if (selectedPath === filePath) {
        setSelectedPath(next.at(-1) ?? "site.config.json");
      }
      return next.length ? next : ["site.config.json"];
    });
  }

  function formatCurrentCode() {
    if (!selectedFile) return;
    try {
      const formatted =
        selectedFile.language === "json"
          ? `${JSON.stringify(JSON.parse(currentCode || "{}"), null, 2)}\n`
          : `${currentCode.trim()}\n`;
      setDrafts((current) => ({ ...current, [selectedFile.path]: formatted }));
      setStatusMessage(`${selectedFile.path} formatado.`);
    } catch {
      setStatusMessage("Nao foi possivel formatar: JSON invalido.");
    }
  }

  function toggleFolder(path: string) {
    setCollapsedFolders((current) => ({ ...current, [path]: !current[path] }));
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">Carregando editor de codigo...</div>;
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-neutral-950 text-white">
      <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-white/10 bg-black px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="sm" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" asChild>
            <Link to="/app/site/builder/editor/$websiteId" params={{ websiteId }}>
              <ArrowLeft className="size-4" />
              Editor visual
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-300">Editor de codigo</p>
            <h1 className="truncate text-base font-semibold">{website?.name ?? "Site da imobiliaria"}</h1>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${hasUnsavedChanges ? "bg-amber-400/15 text-amber-200" : "bg-emerald-400/10 text-emerald-200"}`}>
            {hasUnsavedChanges ? "alteracoes pendentes" : "tudo salvo"}
          </span>
        </div>

        <div className="flex items-center overflow-hidden rounded-full border border-white/10 bg-white/5 p-1 shadow-2xl">
          <span className="flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-xs font-black text-neutral-950">
            <Code2 className="size-4" />
            Codigo do site
          </span>
          <span className="px-4 text-xs font-semibold text-white/65">{totals.files} arquivos</span>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={() => void loadStructure()}>
            <RefreshCw className="size-4" />
            Recarregar
          </Button>
          <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={formatCurrentCode} disabled={!selectedFile}>
            <Braces className="size-4" />
            Formatar código
          </Button>
          <Button variant="outline" size="sm" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" asChild>
            <Link to="/app/site/builder/preview/$websiteId" params={{ websiteId }}>
              <Eye className="size-4" />
              Visualizar
            </Link>
          </Button>
          <Button type="button" size="sm" className="border border-amber-300/60 bg-amber-400 text-neutral-950 hover:bg-amber-300" onClick={() => void saveCurrentFile()} disabled={!selectedFile || !isDirty}>
            <Save className="size-4" />
            Salvar alterações
          </Button>
        </div>
      </header>

      {error ? <div className="border-b border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}

      <section className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)_300px]">
        <aside className="flex min-h-0 flex-col border-r border-white/10 bg-neutral-900">
          <div className="shrink-0 border-b border-white/10 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FolderOpen className="size-4 text-amber-300" />
                Estrutura completa
              </div>
              <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold text-white/55">{totals.pages} paginas</span>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm">
              <Search className="size-4 text-white/45" />
              <input
                ref={searchRef}
                className="w-full bg-transparent text-white outline-none placeholder:text-white/35"
                value={search}
                placeholder="Buscar arquivo, pasta ou codigo..."
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            {tree.children.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/55">Nenhum arquivo encontrado.</div>
            ) : (
              <FileTree
                node={tree}
                depth={0}
                selectedPath={selectedFile?.path ?? ""}
                collapsedFolders={collapsedFolders}
                onToggleFolder={toggleFolder}
                onSelectFile={selectFile}
              />
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col bg-[#070707]">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-amber-400 text-neutral-950">
                <FileCode2 className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{selectedFile?.path ?? "codigo"}</p>
                <p className="truncate text-xs text-white/45">{selectedFile?.description ?? "Selecione um arquivo na estrutura."}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isDirty ? <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-200">alteracoes nao salvas</span> : <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">salvo</span>}
              <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={() => void copyCurrentCode()} disabled={!selectedFile}>
                <Copy className="size-4" />
                Copiar
              </Button>
              <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={resetCurrentFile} disabled={!selectedFile}>
                Restaurar
              </Button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 overflow-x-auto border-b border-white/10 bg-black/45">
              {openFiles.map((file) => {
                const fileDirty = (drafts[file.path] ?? savedSnapshots[file.path] ?? file.code) !== (savedSnapshots[file.path] ?? file.code);
                return (
                  <button
                    key={file.path}
                    type="button"
                    className={`flex min-w-[170px] items-center justify-between gap-3 border-r border-white/10 px-3 py-2 text-left text-xs ${
                      file.path === selectedPath ? "bg-[#111827] text-white" : "bg-black/30 text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                    onClick={() => selectFile(file)}
                    title={file.path}
                  >
                    <span className="truncate">{file.label}</span>
                    <span className="flex items-center gap-2">
                      {fileDirty ? <span className="size-2 rounded-full bg-amber-300" /> : null}
                      <span
                        className="rounded px-1 text-white/35 hover:bg-white/10 hover:text-white"
                        onClick={(event) => {
                          event.stopPropagation();
                          closeTab(file.path);
                        }}
                      >
                        x
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="min-h-0 flex-1">
              <Editor
                height="100%"
                path={selectedFile?.path}
                language={toMonacoLanguage(selectedFile?.language)}
                theme="vs-dark"
                value={currentCode}
                loading={<div className="flex h-full items-center justify-center bg-[#0b0b0b] text-sm text-white/55">Carregando Monaco Editor...</div>}
                options={{
                  automaticLayout: true,
                  fontSize: 14,
                  fontFamily: "JetBrains Mono, Consolas, monospace",
                  minimap: { enabled: true },
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  tabSize: 2,
                  wordWrap: "on",
                  renderLineHighlight: "all",
                  guides: { indentation: true },
                }}
                onChange={(value) => {
                  if (!selectedFile) return;
                  setDrafts((current) => ({ ...current, [selectedFile.path]: value ?? "" }));
                }}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between border-t border-white/10 bg-black px-4 py-2 text-xs text-white/45">
            <span>{statusMessage}</span>
            <span>Atalhos: Ctrl+S salvar · Ctrl+F buscar · editor visual: botao &lt;/&gt;</span>
          </div>
        </section>

        <aside className="min-h-0 overflow-auto border-l border-white/10 bg-neutral-900 p-4">
          <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="size-4 text-amber-300" />
              <h2 className="text-sm font-semibold">Mapa do projeto</h2>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Metric label="Paginas" value={totals.pages} />
              <Metric label="Secoes" value={totals.sections} />
              <Metric label="Componentes" value={totals.components} />
              <Metric label="Assets" value={totals.assets} />
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Braces className="size-4 text-amber-300" />
              <h2 className="text-sm font-semibold">Arquivo selecionado</h2>
            </div>
            <dl className="space-y-3 text-xs">
              <InfoRow label="Nome" value={selectedFile?.label ?? "-"} />
              <InfoRow label="Caminho" value={selectedFile?.path ?? "-"} />
              <InfoRow label="Tipo" value={selectedFile?.fileType ?? "-"} />
              <InfoRow label="Linguagem" value={selectedFile?.language ?? "-"} />
              <InfoRow label="Linhas" value={String(lineNumbers(currentCode).length)} />
              <InfoRow label="Status" value={isDirty ? "Alterado" : "Salvo"} />
              <InfoRow label="Persistência" value={selectedFile?.persisted ? "MySQL" : "Placeholder editável"} />
              <InfoRow label="Última alteração" value={selectedFile?.updatedAt ? new Date(selectedFile.updatedAt).toLocaleString("pt-BR") : "Ainda não salvo"} />
            </dl>
            <div className="mt-4 grid gap-2">
              <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={resetCurrentFile} disabled={!selectedFile}>
                Resetar arquivo
              </Button>
              <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={() => void copyCurrentCode()} disabled={!selectedFile}>
                <Copy className="size-4" />
                Copiar conteúdo
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-50">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <TerminalSquare className="size-4" />
              Edicao direta
            </div>
            <p className="text-xs leading-5 text-amber-50/75">
              Esta tela mostra a estrutura tecnica do site ativo: paginas, componentes, estilos, dados, SEO, assets e integracoes. Use para ajustes finos quando souber mexer em codigo.
            </p>
            <p className="mt-3 text-xs leading-5 text-amber-50/75">
              Segurança: scripts com acesso a cookies, localStorage, sessionStorage, indexedDB, eval ou Function são bloqueados pelo backend antes de salvar.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}

function FileTree({
  node,
  depth,
  selectedPath,
  collapsedFolders,
  onToggleFolder,
  onSelectFile,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string;
  collapsedFolders: Record<string, boolean>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (file: CodeFile) => void;
}) {
  return (
    <div className={depth === 0 ? "space-y-1" : ""}>
      {node.children.map((child) => {
        const isFolder = child.children.length > 0;
        const isCollapsed = collapsedFolders[child.path];
        if (isFolder) {
          return (
            <div key={child.path}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
                style={{ paddingLeft: 8 + depth * 14 }}
                onClick={() => onToggleFolder(child.path)}
              >
                {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                {isCollapsed ? <Folder className="size-4 text-amber-300" /> : <FolderOpen className="size-4 text-amber-300" />}
                <span className="truncate font-semibold">{child.name}</span>
              </button>
              {!isCollapsed ? (
                <FileTree node={child} depth={depth + 1} selectedPath={selectedPath} collapsedFolders={collapsedFolders} onToggleFolder={onToggleFolder} onSelectFile={onSelectFile} />
              ) : null}
            </div>
          );
        }

        if (!child.file) return null;
        const isSelected = child.file.path === selectedPath;
        return (
          <button
            key={child.file.path}
            type="button"
            className={[
              "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition",
              isSelected ? "bg-amber-400 text-neutral-950" : "text-white/70 hover:bg-white/10 hover:text-white",
            ].join(" ")}
            style={{ paddingLeft: 30 + depth * 14 }}
            onClick={() => onSelectFile(child.file!)}
          >
            <FileCode2 className="size-4 shrink-0" />
            <span className="truncate">{child.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-lg font-black text-white">{value}</p>
      <p className="text-white/45">{label}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-white/40">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-white/80">{value}</dd>
    </div>
  );
}

function buildCodeFiles(
  website: WebsiteBuilderWebsite | null,
  pages: WebsiteBuilderPage[],
  sectionsByPage: Record<string, WebsiteBuilderSection[]>,
  componentsBySection: Record<string, WebsiteBuilderComponent[]>,
  assets: WebsiteBuilderAsset[],
): CodeFile[] {
  const sortedPages = [...pages].sort((left, right) => left.sortOrder - right.sortOrder);
  const siteConfig = {
    id: website?.id,
    company_id: website?.companyId,
    name: website?.name,
    slug: website?.slug,
    status: website?.status,
    template_id: website?.templateId,
    settings: website?.settingsJson ?? {},
    pages: sortedPages.map((page) => ({ id: page.id, title: page.title, slug: page.slug, type: page.pageType, status: page.status })),
  };

  const baseFiles: CodeFile[] = [
    file("website/pages/home/page.json", "Home page.json", "json", "Estrutura JSON da pagina inicial.", JSON.stringify(sortedPages.find((page) => page.pageType === "home") ?? {}, null, 2)),
    file("website/pages/home/sections/hero.json", "Hero", "json", "Bloco hero da pagina inicial.", JSON.stringify(findSectionByType(sortedPages, sectionsByPage, "hero"), null, 2)),
    file("website/pages/home/sections/imoveis-destaque.json", "Imoveis destaque", "json", "Seção de imoveis em destaque.", JSON.stringify(findSectionByType(sortedPages, sectionsByPage, "property_grid"), null, 2)),
    file("website/pages/home/sections/contato.json", "Contato", "json", "Seção de contato e captacao.", JSON.stringify(findSectionByType(sortedPages, sectionsByPage, "contact"), null, 2)),
    file("website/pages/property/page.json", "Property page.json", "json", "Estrutura da pagina individual do imovel.", JSON.stringify(sortedPages.find((page) => page.pageType === "property") ?? {}, null, 2)),
    file("website/pages/property/sections/galeria.json", "Galeria do imovel", "json", "Bloco de galeria da pagina do imovel.", "{}\n"),
    file("website/pages/property/sections/detalhes.json", "Detalhes do imovel", "json", "Bloco de detalhes tecnicos e comerciais.", "{}\n"),
    file("website/pages/property/sections/formulario.json", "Formulario do imovel", "json", "Formulario de interesse da pagina do imovel.", "{}\n"),
    file("website/layout/header.json", "Header JSON", "json", "Configuração editavel do cabeçalho.", JSON.stringify({ logo: "Magnifico Imoveis", navigation: buildNavigation(sortedPages) }, null, 2)),
    file("website/layout/footer.json", "Footer JSON", "json", "Configuração editavel do rodape.", JSON.stringify({ columns: [], social: [], policies: ["termos", "privacidade"] }, null, 2)),
    file("website/layout/navigation.json", "Navigation JSON", "json", "Links do menu principal.", JSON.stringify(buildNavigation(sortedPages), null, 2)),
    file("website/styles/theme.json", "Theme JSON", "json", "Tokens do tema global.", JSON.stringify(website?.themeJson ?? {}, null, 2)),
    file("website/styles/global.css", "Global CSS", "css", "CSS global do site.", buildGlobalCss()),
    file("website/styles/custom.css", "Custom CSS", "css", "CSS customizado livre do usuario avançado.", "/* CSS customizado do site */\n"),
    file("website/scripts/custom.js", "Custom JS", "javascript", "JavaScript customizado controlado.", "// JavaScript customizado do site\n"),
    file("website/scripts/tracking.js", "Tracking JS", "javascript", "Pixels e scripts de rastreamento.", "// Scripts de tracking aprovados\n"),
    file("website/seo/global-seo.json", "Global SEO", "json", "SEO global do site.", JSON.stringify(buildGlobalSeo(website), null, 2)),
    file("website/seo/home-seo.json", "Home SEO", "json", "SEO da pagina inicial.", JSON.stringify(sortedPages.find((page) => page.pageType === "home")?.seoJson ?? {}, null, 2)),
    file("website/seo/property-seo.json", "Property SEO", "json", "SEO da pagina de imovel.", JSON.stringify(sortedPages.find((page) => page.pageType === "property")?.seoJson ?? {}, null, 2)),
    file("website/assets/images.json", "Images JSON", "json", "Imagens cadastradas no storage.", JSON.stringify(assets.filter((asset) => asset.assetType === "image"), null, 2)),
    file("website/assets/videos.json", "Videos JSON", "json", "Videos cadastrados no storage.", JSON.stringify(assets.filter((asset) => asset.assetType === "video"), null, 2)),
    file("website/assets/fonts.json", "Fonts JSON", "json", "Fontes e arquivos tipograficos.", JSON.stringify(assets.filter((asset) => asset.assetType === "font"), null, 2)),
    file("website/components/components.json", "Components JSON", "json", "Lista completa de componentes do site.", JSON.stringify(Object.values(componentsBySection).flat(), null, 2)),
    file("website/custom/custom-html.html", "Custom HTML", "html", "HTML customizado avançado.", "<!-- HTML customizado do site -->\n"),
    file("website/custom/custom-css.css", "Custom CSS", "css", "CSS customizado avançado.", "/* CSS customizado avançado */\n"),
    file("website/custom/custom-js.js", "Custom JS", "javascript", "JavaScript customizado avançado.", "// JavaScript customizado avançado\n"),
    file("site.config.json", "Config do site", "json", "Configuracao principal do site ativo.", JSON.stringify(siteConfig, null, 2)),
    file("theme/theme.json", "Tema global", "json", "Cores, fontes, raio, sombras e tokens visuais.", JSON.stringify(website?.themeJson ?? {}, null, 2)),
    file("seo/global.json", "SEO global", "json", "SEO padrao, Open Graph, schema e canonical.", JSON.stringify(buildGlobalSeo(website), null, 2)),
    file("data/navigation.json", "Navegacao", "json", "Menu principal gerado a partir das paginas.", JSON.stringify(buildNavigation(sortedPages), null, 2)),
    file("data/pages.json", "Paginas", "json", "Todas as paginas conhecidas do site.", JSON.stringify(sortedPages, null, 2)),
    file("data/properties.json", "Imoveis", "json", "Fonte automatica dos imoveis publicados pelo ImobiFlow.", JSON.stringify({ source: "ImobiFlow", mode: "automatic", publish: "published_properties_only" }, null, 2)),
    file("data/assets.json", "Assets", "json", "Assets ligados ao site e ao storage.", JSON.stringify(assets, null, 2)),
    file("app/site/[slug]/layout.tsx", "Layout publico", "tsx", "Layout base do site imobiliario.", buildLayoutTsx()),
    file("app/site/[slug]/page.tsx", "Pagina publica", "tsx", "Entrada da pagina principal do site.", buildPublicPageTsx()),
    file("app/site/[slug]/loading.tsx", "Loading", "tsx", "Estado de carregamento do site.", buildLoadingTsx()),
    file("app/site/[slug]/imoveis/[propertySlug]/page.tsx", "Pagina do imovel", "tsx", "Pagina individual do imovel.", buildPropertyPageTsx()),
    file("app/api/site/[slug]/lead/route.ts", "API de leads", "ts", "Endpoint para enviar leads ao CRM.", buildLeadApiTs()),
    file("app/api/site/[slug]/properties/route.ts", "API de imoveis", "ts", "Endpoint para listar imoveis publicados.", buildPropertiesApiTs()),
    file("components/site/Header.tsx", "Header", "tsx", "Cabecalho editavel do site.", buildHeaderTsx()),
    file("components/site/MobileMenu.tsx", "Menu mobile", "tsx", "Menu responsivo do site.", buildMobileMenuTsx()),
    file("components/site/Hero.tsx", "Hero", "tsx", "Hero principal premium.", buildHeroTsx()),
    file("components/site/SearchBar.tsx", "Busca", "tsx", "Barra de busca e filtros de imoveis.", buildSearchBarTsx()),
    file("components/site/SectionRenderer.tsx", "Renderer", "tsx", "Renderizador de secoes e blocos.", buildSectionRendererTsx()),
    file("components/site/PropertyGrid.tsx", "Grade de imoveis", "tsx", "Lista de cards dos imoveis publicados.", buildPropertyGridTsx()),
    file("components/site/PropertyCard.tsx", "Card de imovel", "tsx", "Card individual do imovel.", buildPropertyCardTsx()),
    file("components/site/PropertyGallery.tsx", "Galeria", "tsx", "Galeria da pagina do imovel.", buildGalleryTsx()),
    file("components/site/PropertyDetails.tsx", "Detalhes do imovel", "tsx", "Detalhes tecnicos e comerciais do imovel.", buildPropertyDetailsTsx()),
    file("components/site/LeadForm.tsx", "Formulario de lead", "tsx", "Formulario conectado ao CRM.", buildLeadFormTsx()),
    file("components/site/MapBlock.tsx", "Mapa", "tsx", "Mapa e localizacao aproximada.", buildMapBlockTsx()),
    file("components/site/Footer.tsx", "Footer", "tsx", "Rodape do site.", buildFooterTsx()),
    file("lib/site/site-renderer.tsx", "Site renderer", "tsx", "Monta pagina com tema, secoes e componentes.", buildSiteRendererTsx()),
    file("lib/site/property-query.ts", "Consulta de imoveis", "ts", "Busca imoveis publicados.", buildPropertyQueryTs()),
    file("lib/site/lead-client.ts", "Lead client", "ts", "Envia leads para o CRM.", buildLeadClientTs()),
    file("lib/site/seo.ts", "SEO", "ts", "Gera metadata e schema.", buildSeoTs()),
    file("lib/site/theme.ts", "Tema", "ts", "Converte tokens do builder em CSS.", buildThemeTs()),
    file("lib/site/animations.ts", "Animacoes", "ts", "Mapa de animacoes do site.", buildAnimationsTs()),
    file("styles/globals.css", "Global CSS", "css", "Estilos globais do site publico.", buildGlobalCss()),
    file("styles/theme.css", "Theme CSS", "css", "Variaveis visuais do tema atual.", buildThemeCss(website)),
    file("public/assets/README.md", "Assets README", "markdown", "Biblioteca de midias do site.", "# Assets do site\n\nLogos, imagens, videos, icones e arquivos ficam ligados ao website e ao storage configurado.\n"),
  ];

  const pageFiles = sortedPages.flatMap((page) => {
    const sections = sectionsByPage[page.id] ?? [];
    const pageComponents = sections.flatMap((section) => componentsBySection[section.id] ?? []);
    return [
      file(`pages/${page.slug}/page.tsx`, page.title, "tsx", `Pagina ${page.title}.`, buildPageTsx(page, sections)),
      file(`pages/${page.slug}/sections.json`, page.title, "json", `Secoes da pagina ${page.title}.`, JSON.stringify(sections, null, 2)),
      file(`pages/${page.slug}/components.json`, page.title, "json", `Componentes da pagina ${page.title}.`, JSON.stringify(pageComponents, null, 2)),
      file(`pages/${page.slug}/seo.json`, page.title, "json", `SEO da pagina ${page.title}.`, JSON.stringify(page.seoJson ?? {}, null, 2)),
    ];
  });

  return [...baseFiles, ...pageFiles].sort((left, right) => left.path.localeCompare(right.path));
}

function file(path: string, label: string, language: CodeFile["language"], description: string, code: string): CodeFile {
  return { path, label, language, description, code, fileType: inferFileType(path), pageId: null, persisted: false };
}

function mergePersistedCodeFiles(baseFiles: CodeFile[], persistedFiles: WebsiteBuilderCodeFile[]): CodeFile[] {
  const byPath = new Map(baseFiles.map((file) => [file.path, file]));
  for (const persistedFile of persistedFiles) {
    const existing = byPath.get(persistedFile.filePath);
    byPath.set(persistedFile.filePath, {
      ...(existing ?? {
        path: persistedFile.filePath,
        label: labelFromPath(persistedFile.filePath),
        description: "Arquivo customizado salvo no MySQL.",
      }),
      id: persistedFile.id,
      path: persistedFile.filePath,
      code: persistedFile.content,
      language: fromApiCodeLanguage(persistedFile.language),
      fileType: persistedFile.fileType,
      pageId: persistedFile.pageId,
      updatedAt: persistedFile.updatedAt,
      persisted: true,
    });
  }
  return Array.from(byPath.values()).sort((left, right) => left.path.localeCompare(right.path));
}

function inferFileType(filePath: string) {
  if (filePath.includes("/seo/") || filePath.includes("seo")) return "seo";
  if (filePath.includes("/styles/") || filePath.endsWith(".css")) return "style";
  if (filePath.includes("/scripts/") || filePath.endsWith(".js")) return "script";
  if (filePath.includes("/layout/")) return "layout";
  if (filePath.includes("/assets/")) return "asset";
  if (filePath.includes("/components/")) return "component";
  if (filePath.includes("/custom/")) return "custom";
  if (filePath.includes("/pages/")) return "page";
  return "code";
}

function labelFromPath(filePath: string) {
  return filePath.split("/").at(-1) ?? filePath;
}

function toApiCodeLanguage(language: CodeFile["language"]): WebsiteBuilderCodeFile["language"] {
  return language === "markdown" ? "markdown" : language;
}

function fromApiCodeLanguage(language: WebsiteBuilderCodeFile["language"]): CodeFile["language"] {
  return language;
}

function toMonacoLanguage(language?: CodeFile["language"]) {
  if (language === "tsx") return "typescript";
  if (language === "ts") return "typescript";
  if (language === "javascript") return "javascript";
  if (language === "markdown") return "markdown";
  return language ?? "plaintext";
}

function validateJsonIfNeeded(file: CodeFile, code: string) {
  if (file.language !== "json" && !file.path.endsWith(".json")) return null;
  try {
    JSON.parse(code || "{}");
    return null;
  } catch (error) {
    return error instanceof Error ? `JSON invalido: ${error.message}` : "JSON invalido.";
  }
}

function findSectionByType(
  pages: WebsiteBuilderPage[],
  sectionsByPage: Record<string, WebsiteBuilderSection[]>,
  sectionType: string,
) {
  for (const page of pages) {
    const section = (sectionsByPage[page.id] ?? []).find((item) => item.sectionType === sectionType);
    if (section) return section;
  }
  return {};
}

function buildFileTree(files: CodeFile[]): TreeNode {
  const root: TreeNode = { name: "site", path: "", children: [] };
  for (const codeFile of files) {
    const parts = codeFile.path.split("/");
    let current = root;
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      let next = current.children.find((child) => child.name === part);
      if (!next) {
        next = { name: part, path, children: [] };
        current.children.push(next);
      }
      if (index === parts.length - 1) next.file = codeFile;
      current = next;
    });
  }
  sortTree(root);
  return root;
}

function sortTree(node: TreeNode) {
  node.children.sort((left, right) => {
    const leftFolder = left.children.length > 0;
    const rightFolder = right.children.length > 0;
    if (leftFolder !== rightFolder) return leftFolder ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  node.children.forEach(sortTree);
}

function lineNumbers(code: string) {
  return Array.from({ length: Math.max(1, code.split("\n").length) }, (_, index) => String(index + 1));
}

function buildNavigation(pages: WebsiteBuilderPage[]) {
  return pages.map((page) => ({ title: page.title, slug: page.slug, href: page.slug === "home" ? "#topo" : `#${page.slug}` }));
}

function buildGlobalSeo(website: WebsiteBuilderWebsite | null) {
  return {
    title: website?.name ?? "Site imobiliario",
    description: "Site imobiliario conectado ao ImobiFlow.",
    canonical: website?.slug ? `/site/${website.slug}` : "",
    schema: "RealEstateAgent",
  };
}

function buildLayoutTsx() {
  return `import "./theme.css";

export default function SiteLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
`;
}

function buildPublicPageTsx() {
  return `import { SiteRenderer } from "@/lib/site/site-renderer";

export default function PublicSitePage({ params }) {
  return <SiteRenderer slug={params.slug} />;
}
`;
}

function buildLoadingTsx() {
  return `export default function Loading() {
  return <main className="site-loading">Carregando site...</main>;
}
`;
}

function buildPropertyPageTsx() {
  return `import { PropertyDetails } from "@/components/site/PropertyDetails";

export default function PropertyPage({ params }) {
  return <PropertyDetails siteSlug={params.slug} propertySlug={params.propertySlug} />;
}
`;
}

function buildLeadApiTs() {
  return `export async function POST(request) {
  const lead = await request.json();
  // Enviar lead para o CRM ImobiFlow.
  return Response.json({ ok: true, lead });
}
`;
}

function buildPropertiesApiTs() {
  return `export async function GET() {
  // Retornar somente imoveis publicados no site ativo.
  return Response.json({ properties: [] });
}
`;
}

function buildHeaderTsx() {
  return `export function Header({ site, navigation }) {
  return (
    <header data-editable="header">
      <a href="#topo">{site?.name}</a>
      <nav>{navigation?.map((item) => <a key={item.href} href={item.href}>{item.title}</a>)}</nav>
    </header>
  );
}
`;
}

function buildMobileMenuTsx() {
  return `export function MobileMenu({ navigation }) {
  return <nav data-editable="mobile-menu">{navigation?.map((item) => <a key={item.href} href={item.href}>{item.title}</a>)}</nav>;
}
`;
}

function buildHeroTsx() {
  return `export function Hero({ title, subtitle, imageUrl }) {
  return (
    <section data-editable="hero" style={{ backgroundImage: imageUrl ? \`url(\${imageUrl})\` : undefined }}>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      <a href="#imoveis">Ver imoveis</a>
    </section>
  );
}
`;
}

function buildSearchBarTsx() {
  return `export function SearchBar({ onSearch }) {
  return (
    <form data-editable="property-search" onSubmit={onSearch}>
      <input name="query" placeholder="Buscar por bairro, codigo, cidade ou tipo" />
      <button type="submit">Pesquisar</button>
    </form>
  );
}
`;
}

function buildSectionRendererTsx() {
  return `export function SectionRenderer({ section, components }) {
  if (!section?.isVisible) return null;
  return (
    <section data-section-id={section.id} data-section-type={section.sectionType}>
      {components?.map((component) => <div key={component.id} data-component-type={component.componentType}>{component.name}</div>)}
    </section>
  );
}
`;
}

function buildPropertyGridTsx() {
  return `import { PropertyCard } from "./PropertyCard";

export function PropertyGrid({ properties }) {
  return <section id="imoveis" data-editable="property-grid">{properties?.map((property) => <PropertyCard key={property.id} property={property} />)}</section>;
}
`;
}

function buildPropertyCardTsx() {
  return `export function PropertyCard({ property }) {
  return (
    <article data-editable="property-card">
      <img src={property.mainImage} alt={property.title} />
      <h3>{property.title}</h3>
      <p>{property.city}</p>
      <strong>{property.price}</strong>
      <a href={property.href}>Ver detalhes</a>
    </article>
  );
}
`;
}

function buildGalleryTsx() {
  return `export function PropertyGallery({ images }) {
  return <section data-editable="property-gallery">{images?.map((image) => <img key={image.url} src={image.url} alt={image.alt} />)}</section>;
}
`;
}

function buildPropertyDetailsTsx() {
  return `export function PropertyDetails({ property }) {
  return (
    <main data-editable="property-details">
      <h1>{property?.title}</h1>
      <p>{property?.description}</p>
    </main>
  );
}
`;
}

function buildLeadFormTsx() {
  return `export function LeadForm({ property }) {
  return (
    <form data-editable="lead-form">
      <input name="name" placeholder="Nome" />
      <input name="phone" placeholder="Telefone" />
      <input name="email" placeholder="E-mail" />
      <textarea name="message" placeholder="Mensagem" />
      <button type="submit">Tenho interesse</button>
    </form>
  );
}
`;
}

function buildMapBlockTsx() {
  return `export function MapBlock({ address }) {
  return <section data-editable="map">Mapa do endereco aproximado: {address}</section>;
}
`;
}

function buildFooterTsx() {
  return `export function Footer({ site, navigation }) {
  return (
    <footer data-editable="footer">
      <strong>{site?.name}</strong>
      <nav>{navigation?.map((item) => <a key={item.href} href={item.href}>{item.title}</a>)}</nav>
    </footer>
  );
}
`;
}

function buildSiteRendererTsx() {
  return `import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { SectionRenderer } from "@/components/site/SectionRenderer";

export function SiteRenderer({ site, pages, sectionsByPage, componentsBySection }) {
  const home = pages?.find((page) => page.slug === "home") ?? pages?.[0];
  const sections = sectionsByPage?.[home?.id] ?? [];
  return (
    <>
      <Header site={site} navigation={pages} />
      {sections.map((section) => <SectionRenderer key={section.id} section={section} components={componentsBySection?.[section.id]} />)}
      <Footer site={site} navigation={pages} />
    </>
  );
}
`;
}

function buildPropertyQueryTs() {
  return `export async function getPublishedProperties(siteId) {
  // Buscar imoveis publicados automaticamente pelo ImobiFlow.
  return [];
}
`;
}

function buildLeadClientTs() {
  return `export async function sendLead(payload) {
  const response = await fetch("/api/site/lead", { method: "POST", body: JSON.stringify(payload) });
  return response.json();
}
`;
}

function buildSeoTs() {
  return `export function buildSiteMetadata(site, page) {
  return {
    title: page?.seo?.title ?? site?.name,
    description: page?.seo?.description ?? "Site imobiliario conectado ao ImobiFlow",
  };
}
`;
}

function buildThemeTs() {
  return `export function themeToCssVars(theme) {
  return {
    "--site-background": theme?.colors?.background ?? "#080806",
    "--site-foreground": theme?.colors?.foreground ?? "#ffffff",
    "--site-primary": theme?.colors?.primary ?? "#d6a536",
  };
}
`;
}

function buildAnimationsTs() {
  return `export const siteAnimations = {
  fadeIn: { opacity: [0, 1], transform: ["translateY(12px)", "translateY(0)"] },
  luxuryHover: { transform: "translateY(-4px)", boxShadow: "0 24px 80px rgba(0,0,0,.22)" },
};
`;
}

function buildGlobalCss() {
  return `* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; font-family: Inter, Arial, sans-serif; background: var(--site-background); color: var(--site-foreground); }
a { color: inherit; text-decoration: none; }
img { max-width: 100%; display: block; }
`;
}

function buildThemeCss(website: WebsiteBuilderWebsite | null) {
  const theme = website?.themeJson ?? {};
  const colors = typeof theme.colors === "object" && theme.colors !== null ? (theme.colors as Record<string, unknown>) : {};
  return `:root {
  --site-background: ${String(colors.background ?? "#080806")};
  --site-foreground: ${String(colors.foreground ?? "#ffffff")};
  --site-primary: ${String(colors.primary ?? "#d6a536")};
  --site-muted: ${String(colors.muted ?? "#737373")};
}
`;
}

function buildPageTsx(page: WebsiteBuilderPage, sections: WebsiteBuilderSection[]) {
  return `import { SectionRenderer } from "@/components/site/SectionRenderer";

const sections = ${JSON.stringify(
    sections.map((section) => ({ id: section.id, name: section.name, type: section.sectionType, visible: section.isVisible })),
    null,
    2,
  )};

export default function ${toComponentName(page.slug)}Page() {
  return (
    <main data-page="${page.slug}">
      {sections.map((section) => <SectionRenderer key={section.id} section={section} />)}
    </main>
  );
}
`;
}

function toComponentName(slug: string) {
  const name = slug
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return name || "Site";
}
