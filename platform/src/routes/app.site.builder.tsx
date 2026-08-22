import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Database,
  Eye,
  ExternalLink,
  FileText,
  FolderPlus,
  Globe2,
  History,
  Image,
  Layers3,
  Loader2,
  Monitor,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { Button } from "@/components/ui/button";
import { getModuleByKey } from "@/product/app-modules";
import { getConfiguredApiUrl } from "@/product/api";
import { useSessionGuard } from "@/product/use-session-guard";
import {
  cloneWebsiteBuilderTemplate,
  createBlankWebsite,
  createWebsiteBuilderDomain,
  createWebsiteBuilderComponent,
  createWebsiteBuilderPage,
  createWebsiteBuilderSection,
  createWebsiteBuilderSectionFromBlock,
  deleteWebsiteBuilderAsset,
  deleteWebsiteBuilderDomain,
  deleteWebsiteBuilderComponent,
  deleteWebsiteBuilderPage,
  deleteWebsiteBuilderSection,
  deleteWebsiteBuilderWebsite,
  getWebsiteBuilderFoundationStatus,
  getWebsiteBuilderWebsite,
  listWebsiteBuilderComponents,
  listWebsiteBuilderPages,
  listWebsiteBuilderAssets,
  listWebsiteBuilderDomains,
  listWebsiteBuilderPublishLogs,
  listWebsiteBuilderSeo,
  listWebsiteBuilderSectionBlocks,
  listWebsiteBuilderSections,
  listWebsiteBuilderTemplates,
  listWebsiteBuilderVersions,
  listWebsiteBuilderWebsites,
  requestWebsiteBuilderAssetUpload,
  upsertWebsiteBuilderSeo,
  updateWebsiteBuilderDomain,
  updateWebsiteBuilderComponent,
  updateWebsiteBuilderPage,
  updateWebsiteBuilderSection,
  type WebsiteBuilderAsset,
  type WebsiteBuilderComponent,
  type WebsiteBuilderDomain,
  type WebsiteBuilderFoundationStatus,
  type WebsiteBuilderPage as WebsiteBuilderPageRecord,
  type WebsiteBuilderPublishLog,
  type WebsiteBuilderSection,
  type WebsiteBuilderSectionBlock,
  type WebsiteBuilderSeo,
  type WebsiteBuilderTemplate,
  type WebsiteBuilderVersion,
  type WebsiteBuilderWebsite,
} from "@/product/website-builder";

export const Route = createFileRoute("/app/site/builder")({
  component: WebsiteBuilderPage,
});

function WebsiteBuilderPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("site");
  const [websites, setWebsites] = useState<WebsiteBuilderWebsite[]>([]);
  const [templates, setTemplates] = useState<WebsiteBuilderTemplate[]>([]);
  const [selectedWebsite, setSelectedWebsite] = useState<WebsiteBuilderWebsite | null>(null);
  const [pages, setPages] = useState<WebsiteBuilderPageRecord[]>([]);
  const [sections, setSections] = useState<WebsiteBuilderSection[]>([]);
  const [components, setComponents] = useState<WebsiteBuilderComponent[]>([]);
  const [sectionBlocks, setSectionBlocks] = useState<WebsiteBuilderSectionBlock[]>([]);
  const [assets, setAssets] = useState<WebsiteBuilderAsset[]>([]);
  const [versions, setVersions] = useState<WebsiteBuilderVersion[]>([]);
  const [publishLogs, setPublishLogs] = useState<WebsiteBuilderPublishLog[]>([]);
  const [domains, setDomains] = useState<WebsiteBuilderDomain[]>([]);
  const [seoRecords, setSeoRecords] = useState<WebsiteBuilderSeo[]>([]);
  const [foundationStatus, setFoundationStatus] = useState<WebsiteBuilderFoundationStatus | null>(null);
  const [copiedSetup, setCopiedSetup] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [selectedBlockKey, setSelectedBlockKey] = useState("");
  const [blockCategoryFilter, setBlockCategoryFilter] = useState("all");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetType, setAssetType] = useState<WebsiteBuilderAsset["assetType"]>("image");
  const [assetMessage, setAssetMessage] = useState<string | null>(null);
  const [domainForm, setDomainForm] = useState({ domain: "", is_primary: true });
  const [seoScope, setSeoScope] = useState<"global" | "page">("global");
  const [seoForm, setSeoForm] = useState({
    title: "",
    description: "",
    canonical_url: "",
    og_image_asset_id: "",
    schema_json: "{}",
  });
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blankForm, setBlankForm] = useState({ name: "", slug: "" });
  const [cloneForm, setCloneForm] = useState({ template_id: "", name: "", slug: "" });
  const [pageForm, setPageForm] = useState({ title: "", slug: "", type: "custom" as WebsiteBuilderPageRecord["pageType"] });
  const [sectionForm, setSectionForm] = useState({ name: "", type: "custom" });
  const [componentForm, setComponentForm] = useState({ name: "", type: "text", text: "" });
  const [pageEditForm, setPageEditForm] = useState({
    title: "",
    slug: "",
    type: "custom" as WebsiteBuilderPageRecord["pageType"],
  });
  const [sectionEditForm, setSectionEditForm] = useState({ name: "", type: "", is_visible: true });
  const [componentEditForm, setComponentEditForm] = useState({
    name: "",
    type: "",
    text: "",
    is_visible: true,
  });

  async function refresh() {
    setIsBusy(true);
    setError(null);

    try {
      const statusResponse = await getWebsiteBuilderFoundationStatus();
      setFoundationStatus(statusResponse.status);

      if (!statusResponse.status.database.configured) {
        const blockResponse = await listWebsiteBuilderSectionBlocks();
        setWebsites([]);
        setTemplates([]);
        setSelectedWebsite(null);
        setPages([]);
        setSections([]);
        setComponents([]);
        setAssets([]);
        setVersions([]);
        setPublishLogs([]);
        setDomains([]);
        setSeoRecords([]);
        setSectionBlocks(blockResponse.blocks);
        if (!selectedBlockKey && blockResponse.blocks[0]) {
          setSelectedBlockKey(blockResponse.blocks[0].key);
        }
        return;
      }

      const [websiteResponse, templateResponse, blockResponse] = await Promise.all([
        listWebsiteBuilderWebsites(),
        listWebsiteBuilderTemplates(),
        listWebsiteBuilderSectionBlocks(),
      ]);
      setWebsites(websiteResponse.websites);
      setTemplates(templateResponse.templates);
      setSectionBlocks(blockResponse.blocks);

      if (!selectedWebsite && websiteResponse.websites[0]) {
        setSelectedWebsite(websiteResponse.websites[0]);
      }

      if (!cloneForm.template_id && templateResponse.templates[0]) {
        setCloneForm((current) => ({ ...current, template_id: templateResponse.templates[0].id }));
      }

      if (!selectedBlockKey && blockResponse.blocks[0]) {
        setSelectedBlockKey(blockResponse.blocks[0].key);
      }
    } catch (builderError) {
      setError(builderError instanceof Error ? builderError.message : "Não foi possível carregar o Website Builder.");
    } finally {
      setIsBusy(false);
    }
  }

  async function refreshSelectedStructure(websiteId: string) {
    setError(null);

    try {
      const [
        websiteResponse,
        pageResponse,
        assetResponse,
        versionResponse,
        publishLogResponse,
        domainResponse,
        seoResponse,
      ] = await Promise.all([
        getWebsiteBuilderWebsite(websiteId),
        listWebsiteBuilderPages(websiteId),
        listWebsiteBuilderAssets(websiteId),
        listWebsiteBuilderVersions(websiteId),
        listWebsiteBuilderPublishLogs(websiteId),
        listWebsiteBuilderDomains(websiteId),
        listWebsiteBuilderSeo(websiteId),
      ]);
      setSelectedWebsite(websiteResponse.website);
      setPages(pageResponse.pages);
      setAssets(assetResponse.assets);
      setVersions(versionResponse.versions);
      setPublishLogs(publishLogResponse.publish_logs);
      setDomains(domainResponse.domains);
      setSeoRecords(seoResponse.seo);

      const nextPageId = selectedPageId || pageResponse.pages[0]?.id || "";
      setSelectedPageId(nextPageId);
      if (nextPageId) {
        await refreshPageSections(nextPageId);
      } else {
        setSections([]);
        setSelectedSectionId("");
        setComponents([]);
        setSelectedComponentId("");
      }
    } catch (structureError) {
      setError(structureError instanceof Error ? structureError.message : "Não foi possível carregar a estrutura.");
    }
  }

  async function refreshPageSections(pageId: string, preferredSectionId?: string) {
    const sectionResponse = await listWebsiteBuilderSections(pageId);
    setSections(sectionResponse.sections);
    const nextSectionId =
      preferredSectionId && sectionResponse.sections.some((section) => section.id === preferredSectionId)
        ? preferredSectionId
        : selectedSectionId && sectionResponse.sections.some((section) => section.id === selectedSectionId)
          ? selectedSectionId
          : sectionResponse.sections[0]?.id || "";
    setSelectedSectionId(nextSectionId);

    if (nextSectionId) {
      const componentResponse = await listWebsiteBuilderComponents(nextSectionId);
      setComponents(componentResponse.components);
      setSelectedComponentId((current) =>
        componentResponse.components.some((component) => component.id === current) ? current : componentResponse.components[0]?.id ?? "",
      );
    } else {
      setComponents([]);
      setSelectedComponentId("");
    }
  }

  async function refreshSectionComponents(sectionId: string) {
    const componentResponse = await listWebsiteBuilderComponents(sectionId);
    setComponents(componentResponse.components);
    setSelectedComponentId((current) =>
      componentResponse.components.some((component) => component.id === current) ? current : componentResponse.components[0]?.id ?? "",
    );
  }

  async function refreshWebsiteAssets(websiteId: string) {
    const response = await listWebsiteBuilderAssets(websiteId);
    setAssets(response.assets);
  }

  async function refreshWebsiteVersions(websiteId: string) {
    const [versionResponse, publishLogResponse] = await Promise.all([
      listWebsiteBuilderVersions(websiteId),
      listWebsiteBuilderPublishLogs(websiteId),
    ]);
    setVersions(versionResponse.versions);
    setPublishLogs(publishLogResponse.publish_logs);
  }

  async function refreshWebsiteDomainsAndSeo(websiteId: string) {
    const [domainResponse, seoResponse] = await Promise.all([
      listWebsiteBuilderDomains(websiteId),
      listWebsiteBuilderSeo(websiteId),
    ]);
    setDomains(domainResponse.domains);
    setSeoRecords(seoResponse.seo);
  }

  useEffect(() => {
    if (pathname !== "/app/site/builder") return;
    if (!isLoading && session) void refresh();
  }, [isLoading, pathname, session]);

  useEffect(() => {
    if (pathname !== "/app/site/builder") return;
    if (selectedWebsite?.id) void refreshSelectedStructure(selectedWebsite.id);
  }, [pathname, selectedWebsite?.id]);

  useEffect(() => {
    if (pathname !== "/app/site/builder") return;
    if (typeof window !== "undefined") {
      window.location.replace("/app/site");
    }
  }, [pathname]);

  const selectedPage = useMemo(() => pages.find((page) => page.id === selectedPageId) ?? null, [pages, selectedPageId]);
  const selectedSection = useMemo(
    () => sections.find((section) => section.id === selectedSectionId) ?? null,
    [sections, selectedSectionId],
  );
  const selectedComponent = useMemo(
    () => components.find((component) => component.id === selectedComponentId) ?? null,
    [components, selectedComponentId],
  );
  const blockCategories = useMemo(
    () => Array.from(new Set(sectionBlocks.map((block) => block.category))).sort((a, b) => a.localeCompare(b)),
    [sectionBlocks],
  );
  const filteredSectionBlocks = useMemo(
    () =>
      blockCategoryFilter === "all"
        ? sectionBlocks
        : sectionBlocks.filter((block) => block.category === blockCategoryFilter),
    [blockCategoryFilter, sectionBlocks],
  );
  const selectedBlock = useMemo(
    () => sectionBlocks.find((block) => block.key === selectedBlockKey) ?? null,
    [sectionBlocks, selectedBlockKey],
  );
  const selectedSeoRecord = useMemo(() => {
    const pageId = seoScope === "page" ? selectedPageId : null;
    return seoRecords.find((record) => record.pageId === pageId) ?? null;
  }, [selectedPageId, seoRecords, seoScope]);

  useEffect(() => {
    if (!selectedPage) return;
    setPageEditForm({ title: selectedPage.title, slug: selectedPage.slug, type: selectedPage.pageType });
  }, [selectedPage]);

  useEffect(() => {
    if (!selectedSection) return;
    setSectionEditForm({
      name: selectedSection.name,
      type: selectedSection.sectionType,
      is_visible: selectedSection.isVisible,
    });
  }, [selectedSection]);

  useEffect(() => {
    if (!selectedComponent) return;
    setComponentEditForm({
      name: selectedComponent.name,
      type: selectedComponent.componentType,
      text: readComponentText(selectedComponent),
      is_visible: selectedComponent.isVisible,
    });
  }, [selectedComponent]);

  useEffect(() => {
    setSeoForm({
      title: selectedSeoRecord?.title ?? "",
      description: selectedSeoRecord?.description ?? "",
      canonical_url: selectedSeoRecord?.canonicalUrl ?? "",
      og_image_asset_id: selectedSeoRecord?.ogImageAssetId ?? "",
      schema_json: JSON.stringify(selectedSeoRecord?.schemaJson ?? {}, null, 2),
    });
  }, [selectedSeoRecord]);

  if (pathname !== "/app/site/builder") {
    return <Outlet />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-center text-sm text-muted-foreground">
      Abrindo a área de sites...
    </main>
  );

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  }

  async function handleCreateBlank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!blankForm.name.trim()) return;

    setIsBusy(true);
    setError(null);

    try {
      const response = await createBlankWebsite({
        name: blankForm.name.trim(),
        slug: normalizeSlug(blankForm.slug || blankForm.name),
      });
      setBlankForm({ name: "", slug: "" });
      setSelectedWebsite(response.website);
      await refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Não foi possível criar o site em branco.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCloneTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cloneForm.template_id || !cloneForm.name.trim()) return;

    setIsBusy(true);
    setError(null);

    try {
      const response = await cloneWebsiteBuilderTemplate({
        template_id: cloneForm.template_id,
        name: cloneForm.name.trim(),
        slug: normalizeSlug(cloneForm.slug || cloneForm.name),
      });
      setCloneForm((current) => ({ ...current, name: "", slug: "" }));
      setSelectedWebsite(response.website);
      await refresh();
    } catch (cloneError) {
      setError(cloneError instanceof Error ? cloneError.message : "Não foi possível clonar o template.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteWebsite(website: WebsiteBuilderWebsite) {
    if (!window.confirm(`Excluir o site "${website.name}"?`)) return;

    setIsBusy(true);
    setError(null);

    try {
      await deleteWebsiteBuilderWebsite(website.id);
      setSelectedWebsite(null);
      setPages([]);
      setSections([]);
      setComponents([]);
      setAssets([]);
      setVersions([]);
      setPublishLogs([]);
      setDomains([]);
      setSeoRecords([]);
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir o site.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreatePage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWebsite || !pageForm.title.trim()) return;

    setIsBusy(true);
    setError(null);

    try {
      const response = await createWebsiteBuilderPage(selectedWebsite.id, {
        title: pageForm.title.trim(),
        slug: normalizeSlug(pageForm.slug || pageForm.title),
        page_type: pageForm.type,
      });
      setPageForm({ title: "", slug: "", type: "custom" });
      setSelectedPageId(response.page.id);
      await refreshSelectedStructure(selectedWebsite.id);
    } catch (pageError) {
      setError(pageError instanceof Error ? pageError.message : "Não foi possível criar a página.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPage || !sectionForm.name.trim()) return;

    setIsBusy(true);
    setError(null);

    try {
      const response = await createWebsiteBuilderSection(selectedPage.id, {
        name: sectionForm.name.trim(),
        section_type: sectionForm.type || "custom",
      });
      setSectionForm({ name: "", type: "custom" });
      setSelectedSectionId(response.section.id);
      await refreshPageSections(selectedPage.id, response.section.id);
    } catch (sectionError) {
      setError(sectionError instanceof Error ? sectionError.message : "Não foi possível criar a seção.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateSectionFromBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPage || !selectedBlockKey) return;

    setIsBusy(true);
    setError(null);

    try {
      const response = await createWebsiteBuilderSectionFromBlock(selectedPage.id, {
        block_key: selectedBlockKey,
        sort_order: sections.length,
      });
      setSelectedSectionId(response.section.id);
      await refreshPageSections(selectedPage.id, response.section.id);
    } catch (blockError) {
      setError(blockError instanceof Error ? blockError.message : "Não foi possível adicionar o bloco pronto.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateComponent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSection || !componentForm.name.trim()) return;

    setIsBusy(true);
    setError(null);

    try {
      await createWebsiteBuilderComponent(selectedSection.id, {
        name: componentForm.name.trim(),
        component_type: componentForm.type || "text",
        props_json: { text: componentForm.text },
      });
      setComponentForm({ name: "", type: "text", text: "" });
      await refreshSectionComponents(selectedSection.id);
    } catch (componentError) {
      setError(componentError instanceof Error ? componentError.message : "Não foi possível criar o componente.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUpdatePage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWebsite || !selectedPage || !pageEditForm.title.trim()) return;

    setIsBusy(true);
    setError(null);

    try {
      await updateWebsiteBuilderPage(selectedPage.id, {
        title: pageEditForm.title.trim(),
        slug: normalizeSlug(pageEditForm.slug || pageEditForm.title),
        page_type: pageEditForm.type,
      });
      await refreshSelectedStructure(selectedWebsite.id);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Não foi possível atualizar a página.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUpdateSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPage || !selectedSection || !sectionEditForm.name.trim()) return;

    setIsBusy(true);
    setError(null);

    try {
      await updateWebsiteBuilderSection(selectedSection.id, {
        name: sectionEditForm.name.trim(),
        section_type: sectionEditForm.type || "custom",
        is_visible: sectionEditForm.is_visible,
      });
      await refreshPageSections(selectedPage.id);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Não foi possível atualizar a seção.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUpdateComponent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSection || !selectedComponent || !componentEditForm.name.trim()) return;

    setIsBusy(true);
    setError(null);

    try {
      await updateWebsiteBuilderComponent(selectedComponent.id, {
        name: componentEditForm.name.trim(),
        component_type: componentEditForm.type || "text",
        props_json: {
          ...selectedComponent.propsJson,
          text: componentEditForm.text,
        },
        is_visible: componentEditForm.is_visible,
      });
      await refreshSectionComponents(selectedSection.id);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Não foi possível atualizar o componente.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCopySetup(label: string, content: string) {
    try {
      await copyTextToClipboard(content);
      setCopiedSetup(label);
      window.setTimeout(() => setCopiedSetup(null), 2200);
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o conteúdo e copie manualmente.");
    }
  }

  async function handleMovePage(pageIndex: number, direction: -1 | 1) {
    if (!selectedWebsite) return;
    const targetIndex = pageIndex + direction;
    const page = pages[pageIndex];
    const targetPage = pages[targetIndex];
    if (!page || !targetPage) return;

    setIsBusy(true);
    setError(null);

    try {
      await Promise.all([
        updateWebsiteBuilderPage(page.id, { sort_order: targetPage.sortOrder ?? targetIndex }),
        updateWebsiteBuilderPage(targetPage.id, { sort_order: page.sortOrder ?? pageIndex }),
      ]);
      await refreshSelectedStructure(selectedWebsite.id);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Não foi possível reordenar as páginas.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleMoveSection(sectionIndex: number, direction: -1 | 1) {
    if (!selectedPage) return;
    const targetIndex = sectionIndex + direction;
    const section = sections[sectionIndex];
    const targetSection = sections[targetIndex];
    if (!section || !targetSection) return;

    setIsBusy(true);
    setError(null);

    try {
      await Promise.all([
        updateWebsiteBuilderSection(section.id, { sort_order: targetSection.sortOrder ?? targetIndex }),
        updateWebsiteBuilderSection(targetSection.id, { sort_order: section.sortOrder ?? sectionIndex }),
      ]);
      await refreshPageSections(selectedPage.id, section.id);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Não foi possível reordenar as seções.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleMoveComponent(componentIndex: number, direction: -1 | 1) {
    if (!selectedSection) return;
    const targetIndex = componentIndex + direction;
    const component = components[componentIndex];
    const targetComponent = components[targetIndex];
    if (!component || !targetComponent) return;

    setIsBusy(true);
    setError(null);

    try {
      await Promise.all([
        updateWebsiteBuilderComponent(component.id, { sort_order: targetComponent.sortOrder ?? targetIndex }),
        updateWebsiteBuilderComponent(targetComponent.id, { sort_order: component.sortOrder ?? componentIndex }),
      ]);
      await refreshSectionComponents(selectedSection.id);
      setSelectedComponentId(component.id);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Não foi possível reordenar os componentes.");
    } finally {
      setIsBusy(false);
    }
  }

  function handleAssetFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setAssetFile(file);
    if (file) setAssetType(inferAssetType(file.type));
  }

  async function handleUploadAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWebsite || !assetFile) return;

    setIsBusy(true);
    setError(null);
    setAssetMessage(null);

    try {
      const content = await readFileAsDataUrl(assetFile);
      const response = await requestWebsiteBuilderAssetUpload({
        website_id: selectedWebsite.id,
        asset_type: assetType,
        file_name: assetFile.name,
        mime_type: assetFile.type || "application/octet-stream",
        file_size: assetFile.size,
        content_base64: content,
        metadata_json: {
          originalName: assetFile.name,
          uploadedFrom: "website_builder",
        },
      });

      setAssetFile(null);
      setAssetMessage(`Arquivo enviado para ${response.upload.storageProvider} e registrado no MySQL.`);
      await refreshWebsiteAssets(selectedWebsite.id);
      await refreshWebsiteVersions(selectedWebsite.id);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Não foi possível enviar o asset.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteAsset(asset: WebsiteBuilderAsset) {
    if (!selectedWebsite || !window.confirm(`Excluir o arquivo "${asset.fileName}" da biblioteca deste site?`)) return;

    setIsBusy(true);
    setError(null);

    try {
      await deleteWebsiteBuilderAsset(asset.id);
      await refreshWebsiteAssets(selectedWebsite.id);
      await refreshWebsiteVersions(selectedWebsite.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir o asset.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWebsite || !domainForm.domain.trim()) return;

    setIsBusy(true);
    setError(null);

    try {
      await createWebsiteBuilderDomain(selectedWebsite.id, {
        domain: domainForm.domain.trim(),
        is_primary: domainForm.is_primary,
      });
      setDomainForm({ domain: "", is_primary: false });
      await refreshWebsiteDomainsAndSeo(selectedWebsite.id);
      await refreshWebsiteVersions(selectedWebsite.id);
    } catch (domainError) {
      setError(domainError instanceof Error ? domainError.message : "Não foi possível adicionar o domínio.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSetPrimaryDomain(domain: WebsiteBuilderDomain) {
    if (!selectedWebsite) return;

    setIsBusy(true);
    setError(null);

    try {
      await updateWebsiteBuilderDomain(domain.id, { is_primary: true });
      await refreshWebsiteDomainsAndSeo(selectedWebsite.id);
      await refreshWebsiteVersions(selectedWebsite.id);
    } catch (domainError) {
      setError(domainError instanceof Error ? domainError.message : "Não foi possível definir o domínio principal.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteDomain(domain: WebsiteBuilderDomain) {
    if (!selectedWebsite || !window.confirm(`Desativar o domínio "${domain.domain}"?`)) return;

    setIsBusy(true);
    setError(null);

    try {
      await deleteWebsiteBuilderDomain(domain.id);
      await refreshWebsiteDomainsAndSeo(selectedWebsite.id);
      await refreshWebsiteVersions(selectedWebsite.id);
    } catch (domainError) {
      setError(domainError instanceof Error ? domainError.message : "Não foi possível desativar o domínio.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSaveSeo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWebsite) return;
    if (seoScope === "page" && !selectedPageId) return;

    setIsBusy(true);
    setError(null);

    try {
      let schemaJson: Record<string, unknown> = {};
      if (seoForm.schema_json.trim()) {
        const parsed = JSON.parse(seoForm.schema_json);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Schema JSON precisa ser um objeto JSON válido.");
        }
        schemaJson = parsed as Record<string, unknown>;
      }

      await upsertWebsiteBuilderSeo(selectedWebsite.id, {
        page_id: seoScope === "page" ? selectedPageId : null,
        title: seoForm.title.trim(),
        description: seoForm.description.trim(),
        canonical_url: seoForm.canonical_url.trim(),
        og_image_asset_id: seoForm.og_image_asset_id || null,
        schema_json: schemaJson,
      });

      await refreshWebsiteDomainsAndSeo(selectedWebsite.id);
      await refreshWebsiteVersions(selectedWebsite.id);
    } catch (seoError) {
      setError(seoError instanceof Error ? seoError.message : "Não foi possível salvar o SEO.");
    } finally {
      setIsBusy(false);
    }
  }

  const configuredApiUrl = getConfiguredApiUrl();
  const databaseReady = foundationStatus?.database.configured ?? false;
  const r2Ready = foundationStatus?.storage.configured ?? false;

  return (
    <ModulePage session={session} module={module}>
      <section className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <strong className="text-foreground">Website Builder - Fase 1</strong>
            <p className="mt-1">
              Fundacao com MySQL, Prisma, APIs e storage preparado. O editor visual avancado, dominio e publicacao automatica entram nas proximas fases.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={isBusy}>
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
            Atualizar dados reais
          </Button>
        </div>
      </section>

      <section className="mb-4 grid gap-3 xl:grid-cols-3">
        <EnvironmentStatusCard
          label="Backend seguro"
          value={configuredApiUrl ?? "Aguardando URL publicada"}
          ready={Boolean(configuredApiUrl)}
          detail={
            configuredApiUrl
              ? configuredApiUrl === "/api"
                ? "Chamadas do módulo usando /api na mesma implantação Vercel."
                : "URL de API configurada para chamadas do módulo."
              : "Configure a API para sair do modo localhost em produção."
          }
        />
        <EnvironmentStatusCard
          label="MySQL / Prisma"
          value={databaseReady ? "Configurado" : "Pendente"}
          ready={databaseReady}
          detail={foundationStatus?.database.message ?? "Status ainda não carregado pela API segura."}
        />
        <EnvironmentStatusCard
          label={foundationStatus?.storage.provider === "cloudflare_r2" ? "Cloudflare R2" : "Cloudinary"}
          value={r2Ready ? "Configurado" : "Pendente"}
          ready={r2Ready}
          detail={
            foundationStatus
              ? foundationStatus.storage.missing.length > 0
                ? `Faltando: ${foundationStatus.storage.missing.join(", ")}`
                : foundationStatus.storage.message
              : "Status ainda não carregado pela API segura."
          }
        />
      </section>

      <NextStepPanel apiUrl={configuredApiUrl} foundationStatus={foundationStatus} />

      <ConfigurationAssistant
        apiUrl={configuredApiUrl}
        foundationStatus={foundationStatus}
        copiedSetup={copiedSetup}
        onCopy={(label, content) => void handleCopySetup(label, content)}
      />

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="mb-6 grid gap-4 xl:grid-cols-2">
        <form onSubmit={handleCreateBlank} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <FolderPlus className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Criar site em branco</h2>
              <p className="mt-1 text-sm text-muted-foreground">Cria website e página home vazia no MySQL, sem dados fictícios.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <TextField label="Nome do site" value={blankForm.name} onChange={(name) => setBlankForm({ ...blankForm, name })} />
            <TextField label="Slug" value={blankForm.slug} onChange={(slug) => setBlankForm({ ...blankForm, slug: normalizeSlug(slug) })} />
          </div>
          <Button type="submit" className="mt-4" disabled={isBusy || !databaseReady || !blankForm.name.trim()}>
            <Plus className="size-4" />
            Criar site em branco
          </Button>
        </form>

        <form onSubmit={handleCloneTemplate} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Copy className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Clonar template estrutural</h2>
              <p className="mt-1 text-sm text-muted-foreground">Usa apenas estrutura de template. Sem imóveis, leads ou conteúdo falso de produção.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Template</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                value={cloneForm.template_id}
                onChange={(event) => setCloneForm({ ...cloneForm, template_id: event.target.value })}
              >
                {templates.length === 0 ? <option value="">Nenhum template seedado</option> : null}
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <TextField label="Nome do site" value={cloneForm.name} onChange={(name) => setCloneForm({ ...cloneForm, name })} />
            <TextField label="Slug" value={cloneForm.slug} onChange={(slug) => setCloneForm({ ...cloneForm, slug: normalizeSlug(slug) })} />
          </div>
          <Button type="submit" className="mt-4" disabled={isBusy || !databaseReady || !cloneForm.template_id || !cloneForm.name.trim()}>
            <Copy className="size-4" />
            Clonar template
          </Button>
        </form>
      </section>

      {websites.length === 0 && !isBusy ? (
        <EmptyState
          icon={Globe2}
          title="Nenhum site criado ainda"
          description="Crie um site em branco ou clone um template estrutural para iniciar o Website Builder com dados reais no MySQL."
        />
      ) : (
        <section className="mb-6 grid gap-4 xl:grid-cols-3">
          {websites.map((website) => (
            <article
              key={website.id}
              className={
                selectedWebsite?.id === website.id
                  ? "rounded-lg border border-primary bg-primary/5 p-4"
                  : "rounded-lg border border-border bg-card p-4"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{website.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">/{website.slug}</p>
                </div>
                <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{website.status}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <Metric label="Páginas" value={website._count?.pages ?? website.pages?.length ?? 0} />
                <Metric label="Assets" value={website._count?.assets ?? 0} />
                <Metric label="Versões" value={website._count?.versions ?? 0} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setSelectedWebsite(website)}>
                  <Layers3 className="size-4" />
                  Editar estrutura
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link
                    to="/app/site/builder/editor/$websiteId"
                    params={{ websiteId: website.id }}
                    onClick={() => {
                      setSelectedWebsite(website);
                    }}
                  >
                    <Pencil className="size-4" />
                    Editor visual
                  </Link>
                </Button>
                      <Button type="button" variant="outline" asChild>
                        <Link
                          to="/app/site/builder/preview/$websiteId"
                          params={{ websiteId: website.id }}
                          onClick={() => {
                            setSelectedWebsite(website);
                          }}
                        >
                          <Eye className="size-4" />
                          Visualizar
                        </Link>
                      </Button>
                <Button type="button" variant="outline" onClick={() => void handleDeleteWebsite(website)}>
                  <Trash2 className="size-4" />
                  Excluir
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}

      {selectedWebsite ? (
        <section className="grid gap-4 xl:grid-cols-3">
          <StructureColumn
            title="Páginas"
            description="Páginas reais vinculadas ao site selecionado."
            icon={FileText}
            form={
              <form onSubmit={handleCreatePage} className="grid gap-2">
                <TextField label="Título" value={pageForm.title} onChange={(title) => setPageForm({ ...pageForm, title })} />
                <TextField label="Slug" value={pageForm.slug} onChange={(slug) => setPageForm({ ...pageForm, slug: normalizeSlug(slug) })} />
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Tipo</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3"
                    value={pageForm.type}
                    onChange={(event) => setPageForm({ ...pageForm, type: event.target.value as WebsiteBuilderPageRecord["pageType"] })}
                  >
                    <option value="home">Home</option>
                    <option value="property">Página do imóvel</option>
                    <option value="about">Sobre</option>
                    <option value="contact">Contato</option>
                    <option value="terms">Termos</option>
                    <option value="privacy">Privacidade</option>
                    <option value="custom">Personalizada</option>
                  </select>
                </label>
                <Button type="submit" disabled={isBusy || !pageForm.title.trim()}>
                  <Plus className="size-4" />
                  Criar página
                </Button>
              </form>
            }
          >
            {pages.map((page, pageIndex) => (
              <StructureItem
                key={page.id}
                active={page.id === selectedPageId}
                title={page.title}
                subtitle={`/${page.slug} - ordem ${page.sortOrder} - ${page._count?.sections ?? 0} seção(ões)`}
                onClick={() => {
                  setSelectedPageId(page.id);
                  void refreshPageSections(page.id);
                }}
                onMoveUp={pageIndex > 0 ? () => handleMovePage(pageIndex, -1) : undefined}
                onMoveDown={pageIndex < pages.length - 1 ? () => handleMovePage(pageIndex, 1) : undefined}
                onDelete={async () => {
                  await deleteWebsiteBuilderPage(page.id);
                  await refreshSelectedStructure(selectedWebsite.id);
                }}
              />
            ))}
          </StructureColumn>

          <StructureColumn
            title="Seções"
            description={selectedPage ? `Página: ${selectedPage.title}` : "Selecione uma página."}
            icon={Layers3}
            form={
              <div className="grid gap-4">
                <form onSubmit={handleCreateSection} className="grid gap-2">
                  <TextField label="Nome" value={sectionForm.name} onChange={(name) => setSectionForm({ ...sectionForm, name })} />
                  <TextField label="Tipo" value={sectionForm.type} onChange={(type) => setSectionForm({ ...sectionForm, type })} />
                  <Button type="submit" disabled={isBusy || !selectedPage || !sectionForm.name.trim()}>
                    <Plus className="size-4" />
                    Criar seção
                  </Button>
                </form>

                <form onSubmit={handleCreateSectionFromBlock} className="grid gap-2 border-t border-border pt-4">
                  <div>
                    <h3 className="text-sm font-semibold">Biblioteca de blocos</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Adiciona uma seção pronta estrutural. Imóveis e leads continuam vindo só de dados reais.
                    </p>
                  </div>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Categoria</span>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3"
                      value={blockCategoryFilter}
                      onChange={(event) => {
                        const nextCategory = event.target.value;
                        const nextBlocks =
                          nextCategory === "all" ? sectionBlocks : sectionBlocks.filter((block) => block.category === nextCategory);
                        setBlockCategoryFilter(nextCategory);
                        if (!nextBlocks.some((block) => block.key === selectedBlockKey)) {
                          setSelectedBlockKey(nextBlocks[0]?.key ?? "");
                        }
                      }}
                    >
                      <option value="all">Todas as categorias</option>
                      {blockCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Bloco pronto</span>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3"
                      value={selectedBlockKey}
                      onChange={(event) => setSelectedBlockKey(event.target.value)}
                    >
                      {filteredSectionBlocks.length === 0 ? <option value="">Nenhum bloco disponível</option> : null}
                      {filteredSectionBlocks.map((block) => (
                        <option key={block.key} value={block.key}>
                          {block.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedBlock ? (
                    <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                      <div className="font-medium text-foreground">{selectedBlock.name}</div>
                      <p className="mt-1">{selectedBlock.description}</p>
                      <p className="mt-2">
                        {selectedBlock.components.length} componente(s) inicial(is) - tipo {selectedBlock.sectionType}
                      </p>
                    </div>
                  ) : null}
                  <Button type="submit" disabled={isBusy || !selectedPage || !selectedBlockKey}>
                    <Plus className="size-4" />
                    Adicionar bloco pronto
                  </Button>
                </form>
              </div>
            }
          >
            {sections.map((section, sectionIndex) => (
              <StructureItem
                key={section.id}
                active={section.id === selectedSectionId}
                title={section.name}
                subtitle={`${section.sectionType} - ordem ${section.sortOrder} - ${section._count?.components ?? 0} componente(s)`}
                onClick={() => {
                  setSelectedSectionId(section.id);
                  void refreshSectionComponents(section.id);
                }}
                onMoveUp={sectionIndex > 0 ? () => handleMoveSection(sectionIndex, -1) : undefined}
                onMoveDown={sectionIndex < sections.length - 1 ? () => handleMoveSection(sectionIndex, 1) : undefined}
                onDelete={async () => {
                  await deleteWebsiteBuilderSection(section.id);
                  if (selectedPage) await refreshPageSections(selectedPage.id);
                }}
              />
            ))}
          </StructureColumn>

          <StructureColumn
            title="Componentes"
            description={selectedSection ? `Seção: ${selectedSection.name}` : "Selecione uma seção."}
            icon={Database}
            form={
              <form onSubmit={handleCreateComponent} className="grid gap-2">
                <TextField label="Nome" value={componentForm.name} onChange={(name) => setComponentForm({ ...componentForm, name })} />
                <TextField label="Tipo" value={componentForm.type} onChange={(type) => setComponentForm({ ...componentForm, type })} />
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Conteúdo inicial</span>
                  <textarea
                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2"
                    value={componentForm.text}
                    onChange={(event) => setComponentForm({ ...componentForm, text: event.target.value })}
                  />
                </label>
                <Button type="submit" disabled={isBusy || !selectedSection || !componentForm.name.trim()}>
                  <Plus className="size-4" />
                  Criar componente
                </Button>
              </form>
            }
          >
            {components.map((component, componentIndex) => (
              <StructureItem
                key={component.id}
                active={component.id === selectedComponentId}
                title={component.name}
                subtitle={`${component.componentType} - ordem ${component.sortOrder} - ${component.isVisible ? "visível" : "oculto"}`}
                onClick={() => setSelectedComponentId(component.id)}
                onMoveUp={componentIndex > 0 ? () => handleMoveComponent(componentIndex, -1) : undefined}
                onMoveDown={componentIndex < components.length - 1 ? () => handleMoveComponent(componentIndex, 1) : undefined}
                onDelete={async () => {
                  await deleteWebsiteBuilderComponent(component.id);
                  if (selectedSection) await refreshSectionComponents(selectedSection.id);
                }}
              />
            ))}
          </StructureColumn>
        </section>
      ) : null}

      {selectedWebsite ? (
        <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Image className="size-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Biblioteca de assets</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Arquivos do site vinculados ao MySQL e enviados ao storage configurado quando as credenciais estiverem prontas.
                </p>
              </div>
            </div>

            <form onSubmit={handleUploadAsset} className="grid gap-3 rounded-lg border border-border bg-background p-3 md:grid-cols-[1fr_170px_auto] md:items-end">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Arquivo</span>
                <input
                  type="file"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  onChange={handleAssetFileChange}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Tipo</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  value={assetType}
                  onChange={(event) => setAssetType(event.target.value as WebsiteBuilderAsset["assetType"])}
                >
                  <option value="image">Imagem</option>
                  <option value="video">Vídeo</option>
                  <option value="document">Documento</option>
                  <option value="icon">Ícone</option>
                  <option value="font">Fonte</option>
                  <option value="other">Outro</option>
                </select>
              </label>
              <Button type="submit" disabled={isBusy || !assetFile}>
                {isBusy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                Enviar
              </Button>
            </form>

            {assetMessage ? (
              <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                {assetMessage}
              </div>
            ) : null}

            <div className="mt-4 grid gap-2">
              {assets.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                  Nenhum asset enviado ainda. Sem storage configurado, o envio retorna erro controlado e nada e salvo no navegador.
                </p>
              ) : (
                assets.map((asset) => (
                  <article key={asset.id} className="rounded-md border border-border bg-background p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm font-medium">{asset.fileName}</div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {asset.assetType} - {asset.status} - {formatFileSize(asset.fileSize)}
                        </p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">{asset.storageKey}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {asset.publicUrl ? (
                          <Button type="button" variant="outline" size="sm" asChild>
                            <a href={asset.publicUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="size-4" />
                              Abrir
                            </a>
                          </Button>
                        ) : null}
                        <Button type="button" variant="outline" size="sm" onClick={() => void handleDeleteAsset(asset)}>
                          <Trash2 className="size-4" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <History className="size-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Histórico e publicação</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Versões estruturais criadas a cada alteração. Restauração e publicação entram nas próximas fases.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              {versions.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                  Nenhuma versão registrada ainda.
                </p>
              ) : (
                versions.slice(0, 8).map((version) => (
                  <article key={version.id} className="rounded-md border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Versão {version.versionNumber}</div>
                        <p className="mt-1 text-xs text-muted-foreground">{version.label ?? "Alteração estrutural"}</p>
                      </div>
                      <span className="text-right text-xs text-muted-foreground">{formatDateTime(version.createdAt)}</span>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">Logs de publicação</h3>
              <div className="mt-2 grid gap-2">
                {publishLogs.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                    Nenhuma publicação executada nesta fase.
                  </p>
                ) : (
                  publishLogs.slice(0, 5).map((log) => (
                    <article key={log.id} className="rounded-md border border-border bg-background p-3 text-sm">
                      <div className="font-medium">{log.status}</div>
                      <p className="mt-1 text-xs text-muted-foreground">{log.message ?? "Sem mensagem."}</p>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>
        </section>
      ) : null}

      {selectedWebsite ? (
        <section className="mt-6 grid gap-4 xl:grid-cols-2">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Globe2 className="size-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Domínios</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Preparação de domínio por site. Verificação DNS, SSL e publicação real entram nas próximas fases.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateDomain} className="grid gap-3 rounded-lg border border-border bg-background p-3 md:grid-cols-[1fr_auto] md:items-end">
              <TextField
                label="Domínio ou subdomínio"
                value={domainForm.domain}
                onChange={(domain) => setDomainForm({ ...domainForm, domain })}
              />
              <Button type="submit" disabled={isBusy || !domainForm.domain.trim()}>
                <Plus className="size-4" />
                Adicionar
              </Button>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={domainForm.is_primary}
                  onChange={(event) => setDomainForm({ ...domainForm, is_primary: event.target.checked })}
                />
                Definir como domínio principal
              </label>
            </form>

            <div className="mt-4 grid gap-2">
              {domains.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                  Nenhum domínio configurado. O site ainda fica apenas na estrutura interna.
                </p>
              ) : (
                domains.map((domain) => (
                  <article key={domain.id} className="rounded-md border border-border bg-background p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{domain.domain}</span>
                          {domain.isPrimary ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">principal</span>
                          ) : null}
                          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                            {domain.status}
                          </span>
                        </div>
                        <DnsRecords dnsJson={domain.dnsJson} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!domain.isPrimary ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => void handleSetPrimaryDomain(domain)}>
                            Principal
                          </Button>
                        ) : null}
                        <Button type="button" variant="outline" size="sm" onClick={() => void handleDeleteDomain(domain)}>
                          <Trash2 className="size-4" />
                          Desativar
                        </Button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Search className="size-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">SEO básico</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configure SEO global ou da página selecionada. Sitemap, robots e publicação entram depois.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveSeo} className="grid gap-3 rounded-lg border border-border bg-background p-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Escopo</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  value={seoScope}
                  onChange={(event) => setSeoScope(event.target.value as "global" | "page")}
                >
                  <option value="global">SEO global do site</option>
                  <option value="page" disabled={!selectedPage}>
                    Página selecionada{selectedPage ? `: ${selectedPage.title}` : ""}
                  </option>
                </select>
              </label>
              <TextField label="Meta title" value={seoForm.title} onChange={(title) => setSeoForm({ ...seoForm, title })} />
              <label className="text-sm">
                <span className="mb-1 block font-medium">Meta description</span>
                <textarea
                  className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2"
                  value={seoForm.description}
                  maxLength={320}
                  onChange={(event) => setSeoForm({ ...seoForm, description: event.target.value })}
                />
              </label>
              <TextField
                label="Canonical URL"
                value={seoForm.canonical_url}
                onChange={(canonical_url) => setSeoForm({ ...seoForm, canonical_url })}
              />
              <label className="text-sm">
                <span className="mb-1 block font-medium">OG image</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  value={seoForm.og_image_asset_id}
                  onChange={(event) => setSeoForm({ ...seoForm, og_image_asset_id: event.target.value })}
                >
                  <option value="">Nenhuma imagem</option>
                  {assets
                    .filter((asset) => asset.assetType === "image" && asset.status !== "deleted")
                    .map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.fileName}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Schema JSON</span>
                <textarea
                  className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                  value={seoForm.schema_json}
                  onChange={(event) => setSeoForm({ ...seoForm, schema_json: event.target.value })}
                />
              </label>
              <Button type="submit" disabled={isBusy || (seoScope === "page" && !selectedPage)}>
                <Save className="size-4" />
                Salvar SEO
              </Button>
            </form>
          </section>
        </section>
      ) : null}

      {selectedWebsite ? (
        <section className="mt-6 grid gap-4 xl:grid-cols-[420px_1fr]">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Pencil className="size-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Edição rápida</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ajustes estruturais para preparar o canvas visual da próxima fase.
                </p>
              </div>
            </div>

            <div className="grid gap-4">
              {selectedPage ? (
                <form onSubmit={handleUpdatePage} className="rounded-lg border border-border bg-background p-3">
                  <h3 className="text-sm font-semibold">Página selecionada</h3>
                  <div className="mt-3 grid gap-2">
                    <TextField label="Título" value={pageEditForm.title} onChange={(title) => setPageEditForm({ ...pageEditForm, title })} />
                    <TextField label="Slug" value={pageEditForm.slug} onChange={(slug) => setPageEditForm({ ...pageEditForm, slug: normalizeSlug(slug) })} />
                    <label className="text-sm">
                      <span className="mb-1 block font-medium">Tipo</span>
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3"
                        value={pageEditForm.type}
                        onChange={(event) =>
                          setPageEditForm({ ...pageEditForm, type: event.target.value as WebsiteBuilderPageRecord["pageType"] })
                        }
                      >
                        <option value="home">Home</option>
                        <option value="property">Página do imóvel</option>
                        <option value="about">Sobre</option>
                        <option value="contact">Contato</option>
                        <option value="landing">Landing page</option>
                        <option value="blog">Blog</option>
                        <option value="terms">Termos</option>
                        <option value="privacy">Privacidade</option>
                        <option value="custom">Personalizada</option>
                      </select>
                    </label>
                    <Button type="submit" disabled={isBusy}>
                      <Save className="size-4" />
                      Salvar página
                    </Button>
                  </div>
                </form>
              ) : null}

              {selectedSection ? (
                <form onSubmit={handleUpdateSection} className="rounded-lg border border-border bg-background p-3">
                  <h3 className="text-sm font-semibold">Seção selecionada</h3>
                  <div className="mt-3 grid gap-2">
                    <TextField label="Nome" value={sectionEditForm.name} onChange={(name) => setSectionEditForm({ ...sectionEditForm, name })} />
                    <TextField label="Tipo" value={sectionEditForm.type} onChange={(type) => setSectionEditForm({ ...sectionEditForm, type })} />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={sectionEditForm.is_visible}
                        onChange={(event) => setSectionEditForm({ ...sectionEditForm, is_visible: event.target.checked })}
                      />
                      Seção visível
                    </label>
                    <Button type="submit" disabled={isBusy}>
                      <Save className="size-4" />
                      Salvar seção
                    </Button>
                  </div>
                </form>
              ) : null}

              {selectedComponent ? (
                <form onSubmit={handleUpdateComponent} className="rounded-lg border border-border bg-background p-3">
                  <h3 className="text-sm font-semibold">Componente selecionado</h3>
                  <div className="mt-3 grid gap-2">
                    <TextField label="Nome" value={componentEditForm.name} onChange={(name) => setComponentEditForm({ ...componentEditForm, name })} />
                    <TextField label="Tipo" value={componentEditForm.type} onChange={(type) => setComponentEditForm({ ...componentEditForm, type })} />
                    <label className="text-sm">
                      <span className="mb-1 block font-medium">Texto/conteúdo</span>
                      <textarea
                        className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2"
                        value={componentEditForm.text}
                        onChange={(event) => setComponentEditForm({ ...componentEditForm, text: event.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={componentEditForm.is_visible}
                        onChange={(event) => setComponentEditForm({ ...componentEditForm, is_visible: event.target.checked })}
                      />
                      Componente visível
                    </label>
                    <Button type="submit" disabled={isBusy}>
                      <Save className="size-4" />
                      Salvar componente
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          </section>

          <BuilderPreview
            website={selectedWebsite}
            page={selectedPage}
            sections={sections}
            components={components}
          />
        </section>
      ) : null}
    </ModulePage>
  );
}

function NextStepPanel({
  apiUrl,
  foundationStatus,
}: {
  apiUrl: string | null;
  foundationStatus: WebsiteBuilderFoundationStatus | null;
}) {
  const databaseReady = foundationStatus?.database.configured ?? false;
  const storageReady = foundationStatus?.storage.configured ?? false;
  const steps = [
    {
      title: "1. Publicar backend seguro",
      status: apiUrl ? "Pronto" : "Agora",
      active: !apiUrl,
      done: Boolean(apiUrl),
      description: apiUrl
        ? apiUrl === "/api"
          ? "O frontend usa /api na mesma implantação Vercel."
          : "O frontend já sabe qual backend público usar."
        : "Publicar backend na Vercel Functions e usar /api na mesma implantação. Sem isso, o builder fica em modo protegido.",
    },
    {
      title: "2. Ligar MySQL real",
      status: databaseReady ? "Pronto" : apiUrl ? "Agora" : "Depois",
      active: Boolean(apiUrl) && !databaseReady,
      done: databaseReady,
      description: databaseReady
        ? "DATABASE_URL está configurada para o módulo Website Builder."
        : "Criar o banco MySQL, preencher DATABASE_URL e rodar prisma:validate, migrate e seed.",
    },
    {
      title: "3. Ligar Cloudinary",
      status: storageReady ? "Pronto" : databaseReady ? "Agora" : "Depois",
      active: databaseReady && !storageReady,
      done: storageReady,
      description: storageReady
        ? "O storage de mídias já está pronto para assets reais."
        : "Preencher CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET.",
    },
    {
      title: "4. Testar site em branco",
      status: databaseReady && storageReady ? "Agora" : "Depois",
      active: databaseReady && storageReady,
      done: false,
      description: "Criar um site em branco, clonar um template estrutural e confirmar gravação real no MySQL.",
    },
  ];

  return (
    <section className="mb-6 rounded-lg border border-primary/20 bg-card p-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Próximo passo</p>
          <h2 className="mt-1 text-base font-semibold">Estamos fechando a Fase 1 do Website Builder</h2>
        </div>
        <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Editor visual completo só entra na Fase 2
        </span>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-4">
        {steps.map((step) => (
          <article
            key={step.title}
            className={
              step.active
                ? "rounded-lg border border-primary bg-primary/5 p-3"
                : step.done
                  ? "rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3"
                  : "rounded-lg border border-border bg-background p-3"
            }
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold">{step.title}</h3>
              <span
                className={
                  step.active
                    ? "rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                    : step.done
                      ? "rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300"
                      : "rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                }
              >
                {step.status}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ConfigurationAssistant({
  apiUrl,
  foundationStatus,
  copiedSetup,
  onCopy,
}: {
  apiUrl: string | null;
  foundationStatus: WebsiteBuilderFoundationStatus | null;
  copiedSetup: string | null;
  onCopy: (label: string, content: string) => void;
}) {
  const databaseReady = foundationStatus?.database.configured ?? false;
  const storageReady = foundationStatus?.storage.configured ?? false;
  const missingStorage = foundationStatus?.storage.missing ?? [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ];
  const envSnippet = buildWebsiteBuilderEnvSnippet(apiUrl);
  const commandsSnippet = buildWebsiteBuilderCommandSnippet();
  const checklist = [
    {
      label: "Backend publicado",
      ready: Boolean(apiUrl),
      detail: apiUrl
        ? apiUrl === "/api"
          ? "Chamadas protegidas usando /api na mesma implantação Vercel."
          : `Chamadas protegidas apontando para ${apiUrl}.`
        : "Configure a API /api da Vercel antes de usar em produção.",
    },
    {
      label: "MySQL conectado",
      ready: databaseReady,
      detail: foundationStatus?.database.message ?? "Aguardando resposta da API segura.",
    },
    {
      label: "Prisma migrado",
      ready: databaseReady,
      detail: databaseReady
        ? "Execute as migrations e o seed estrutural no backend conectado ao mesmo DATABASE_URL."
        : "Assim que o MySQL existir, rode Prisma generate, migrate e seed estrutural.",
    },
    {
      label: foundationStatus?.storage.provider === "cloudflare_r2" ? "Cloudflare R2" : "Cloudinary",
      ready: storageReady,
      detail: storageReady ? "Storage pronto para midias do builder." : `Variaveis pendentes: ${missingStorage.join(", ")}`,
    },
  ];

  return (
    <section className="mb-6 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assistente de configuração</p>
          <h2 className="mt-1 text-base font-semibold">Preparação técnica do Website Builder</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Use este painel para ligar a Fase 1 ao ambiente real. Ele não grava nada no navegador e não cria dados de produção falsos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onCopy("env", envSnippet)}>
            <Copy className="size-4" />
            {copiedSetup === "env" ? "Copiado" : "Copiar .env"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onCopy("commands", commandsSnippet)}>
            <Copy className="size-4" />
            {copiedSetup === "commands" ? "Copiado" : "Copiar comandos"}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        {checklist.map((item) => (
          <article
            key={item.label}
            className={
              item.ready
                ? "rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3"
                : "rounded-lg border border-border bg-background p-3"
            }
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{item.label}</h3>
              <span
                className={
                  item.ready
                    ? "rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300"
                    : "rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                }
              >
                {item.ready ? "OK" : "Pendente"}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SetupCodeBlock title="Variáveis necessárias" content={envSnippet} />
        <SetupCodeBlock title="Comandos de preparação" content={commandsSnippet} />
      </div>
    </section>
  );
}

function SetupCodeBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
        <code>{content}</code>
      </pre>
    </div>
  );
}

function DnsRecords({ dnsJson }: { dnsJson: Record<string, unknown> }) {
  const records = Array.isArray(dnsJson.records) ? dnsJson.records : [];

  if (records.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">DNS pendente de geração.</p>;
  }

  return (
    <div className="mt-3 grid gap-2">
      {records.map((record, index) => {
        const item = typeof record === "object" && record ? (record as Record<string, unknown>) : {};
        return (
          <div key={index} className="rounded-md border border-border bg-muted/40 p-2 text-xs">
            <div className="font-medium text-foreground">
              {String(item.type ?? "DNS")} - {String(item.name ?? "@")}
            </div>
            <p className="mt-1 break-all text-muted-foreground">{String(item.value ?? "")}</p>
            {item.purpose ? <p className="mt-1 text-muted-foreground">{String(item.purpose)}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

function EnvironmentStatusCard({
  label,
  value,
  ready,
  detail,
}: {
  label: string;
  value: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <article
      className={
        ready
          ? "rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4"
          : "rounded-lg border border-amber-500/30 bg-amber-500/10 p-4"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <h2 className="mt-1 break-all text-sm font-semibold text-foreground">{value}</h2>
        </div>
        <span
          className={
            ready
              ? "rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300"
              : "rounded-full bg-amber-500/15 px-2 py-1 text-xs text-amber-700 dark:text-amber-300"
          }
        >
          {ready ? "Pronto" : "Pendente"}
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        className="h-10 w-full rounded-md border border-input bg-background px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="text-base font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function BuilderPreview({
  website,
  page,
  sections,
  components,
}: {
  website: WebsiteBuilderWebsite;
  page: WebsiteBuilderPageRecord | null;
  sections: WebsiteBuilderSection[];
  components: WebsiteBuilderComponent[];
}) {
  const theme = website.themeJson ?? {};
  const colors = typeof theme.colors === "object" && theme.colors ? (theme.colors as Record<string, string>) : {};
  const primary = colors.primary || "#c89b3c";
  const background = colors.background || "#0f172a";
  const foreground = colors.foreground || "#ffffff";

  return (
    <section id="builder-preview" className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Monitor className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Prévia estrutural</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Renderização simples da estrutura salva no MySQL. O canvas visual entra na próxima fase.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          {page ? `/${page.slug}` : "Selecione uma página"}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{website.name}</div>
            <div className="text-xs text-muted-foreground">/{website.slug}</div>
          </div>
          <div className="h-3 w-24 rounded-full" style={{ backgroundColor: primary }} />
        </div>

        <div className="p-4">
          <div className="overflow-hidden rounded-lg" style={{ backgroundColor: background, color: foreground }}>
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-xs uppercase tracking-[0.18em]" style={{ color: primary }}>
                {page?.pageType ?? "pagina"}
              </p>
              <h3 className="mt-2 text-2xl font-semibold">{page?.title ?? "Nenhuma página selecionada"}</h3>
            </div>

            {sections.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/70">
                Esta página ainda não possui seções. Crie uma seção para começar a montar a estrutura.
              </div>
            ) : (
              <div className="grid gap-4 p-4">
                {sections.map((section) => {
                  const sectionComponents = components.filter((component) => component.sectionId === section.id);
                  return (
                    <article
                      key={section.id}
                      className={section.isVisible ? "rounded-lg border border-white/15 bg-white/10 p-4" : "rounded-lg border border-dashed border-white/20 bg-white/5 p-4 opacity-60"}
                    >
                      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h4 className="text-sm font-semibold">{section.name}</h4>
                          <p className="text-xs text-white/60">{section.sectionType}</p>
                        </div>
                        {!section.isVisible ? <span className="text-xs text-white/60">Oculta</span> : null}
                      </div>
                      {sectionComponents.length === 0 ? (
                        <p className="mt-3 text-sm text-white/60">Nenhum componente nesta seção.</p>
                      ) : (
                        <div className="mt-3 grid gap-2">
                          {sectionComponents.map((component) => (
                            <div
                              key={component.id}
                              className={component.isVisible ? "rounded-md bg-white/10 p-3" : "rounded-md bg-white/5 p-3 opacity-60"}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: primary }}>
                                  {component.componentType}
                                </span>
                                {!component.isVisible ? <span className="text-xs text-white/60">Oculto</span> : null}
                              </div>
                              <p className="mt-2 text-sm leading-6 text-white/85">{readComponentText(component) || component.name}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function StructureColumn({
  title,
  description,
  icon: Icon,
  form,
  children,
}: {
  title: string;
  description: string;
  icon: typeof FileText;
  form: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mb-4 rounded-lg border border-border bg-background p-3">{form}</div>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

function StructureItem({
  title,
  subtitle,
  active,
  onClick,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  title: string;
  subtitle: string;
  active?: boolean;
  onClick?: () => void;
  onMoveUp?: () => void | Promise<void>;
  onMoveDown?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  return (
    <div className={active ? "rounded-md border border-primary bg-primary/5 p-3" : "rounded-md border border-border bg-background p-3"}>
      <button type="button" className="w-full text-left" onClick={onClick}>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{subtitle}</span>
      </button>
      {onMoveUp || onMoveDown || onDelete ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {onMoveUp ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void onMoveUp()}>
              <ArrowUp className="size-4" />
              Subir
            </Button>
          ) : null}
          {onMoveDown ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void onMoveDown()}>
              <ArrowDown className="size-4" />
              Descer
            </Button>
          ) : null}
          {onDelete ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void onDelete()}>
              <Trash2 className="size-4" />
              Excluir
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function readComponentText(component: WebsiteBuilderComponent) {
  const props = component.propsJson ?? {};
  const candidates = [props.text, props.title, props.label, props.value, props.heading];
  const match = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof match === "string" ? match : "";
}

function normalizeSlug(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "site"
  );
}

function buildWebsiteBuilderEnvSnippet(apiUrl: string | null) {
  return [
    "# VITE_IMOBIFLOW_API_URL é opcional; sem ela o frontend usa /api na Vercel.",
    `# VITE_IMOBIFLOW_API_URL=${apiUrl && apiUrl !== "/api" ? apiUrl : "https://api-opcional.seudominio.com"}`,
    "DATABASE_URL=mysql://USUARIO:SENHA@HOST:PORTA/imobiflow?connection_limit=1&connect_timeout=15&sslaccept=accept_invalid_certs",
    "PRISMA_MIGRATE_DATABASE_URL=",
    "IMOBIFLOW_AUTH_PROVIDER=mysql",
    "STORAGE_PROVIDER=cloudinary",
    "CLOUDINARY_CLOUD_NAME=",
    "CLOUDINARY_API_KEY=",
    "CLOUDINARY_API_SECRET=",
    "CLOUDINARY_UPLOAD_FOLDER=imobiflow",
  ].join("\n");
}

function buildWebsiteBuilderCommandSnippet() {
  return [
    "npm run prisma:generate",
    "npm run prisma:migrate",
    "npm run prisma:seed",
    "npm run build",
    "npm run deploy:vercel",
  ].join("\n");
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function copyTextToClipboard(content: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      return;
    } catch {
      // Some embedded browsers block the async Clipboard API without a user permission prompt.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard unavailable");
  }
}

function inferAssetType(mimeType: string): WebsiteBuilderAsset["assetType"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.includes("font")) return "font";
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("sheet")) return "document";
  return "other";
}

function formatFileSize(size: number | null) {
  if (!size) return "tamanho não informado";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: unitIndex === 0 ? 0 : 1 })} ${units[unitIndex]}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
