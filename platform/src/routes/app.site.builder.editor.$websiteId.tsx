import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Code2,
  Eye,
  ExternalLink,
  FileText,
  GripVertical,
  Image,
  Layers3,
  Loader2,
  Monitor,
  MousePointer2,
  Plus,
  Redo2,
  Save,
  Search,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Undo2,
  Upload,
  Video,
} from "lucide-react";
import { type CSSProperties, FormEvent, useEffect, useRef, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { getBuilderPreviewPropertyDetailUrl } from "@/product/public-site-helpers";
import { listAllPropertyDetails, type Property } from "@/product/real-estate";
import { getSiteSettings } from "@/product/sites";
import {
  createWebsiteBuilderPage,
  createWebsiteBuilderComponent,
  createWebsiteBuilderSection,
  deleteWebsiteBuilderAsset,
  deleteWebsiteBuilderComponent,
  deleteWebsiteBuilderPage,
  deleteWebsiteBuilderSection,
  getWebsiteBuilderWebsite,
  listWebsiteBuilderAssets,
  listWebsiteBuilderComponents,
  listWebsiteBuilderPages,
  listWebsiteBuilderSections,
  listWebsiteBuilderVersions,
  updateWebsiteBuilderComponent,
  updateWebsiteBuilderPage,
  updateWebsiteBuilderSection,
  updateWebsiteBuilderWebsite,
  requestWebsiteBuilderAssetUpload,
  restoreWebsiteBuilderVersion,
  type WebsiteBuilderAsset,
  type WebsiteBuilderComponent,
  type WebsiteBuilderPage as WebsiteBuilderPageRecord,
  type WebsiteBuilderSection,
  type WebsiteBuilderVersion,
  type WebsiteBuilderWebsite,
} from "@/product/website-builder";
import { useSessionGuard } from "@/product/use-session-guard";
import {
  BUILDER_EDITOR_SANDBOX,
  createSandboxedBuilderPreviewDocument,
  sanitizeBuilderPreviewHtml,
} from "@/product/website-preview-security";

export const Route = createFileRoute("/app/site/builder/editor/$websiteId")({
  component: WebsiteBuilderVisualEditorPage,
});

type EditorViewport = "desktop" | "tablet" | "mobile";
type Selection =
  | { type: "page"; id: string }
  | { type: "section"; id: string }
  | { type: "component"; id: string };

type DomElementStylePatch = Partial<{
  color: string;
  backgroundColor: string;
  backgroundImage: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  textAlign: string;
  width: string;
  height: string;
  padding: string;
  margin: string;
  gap: string;
  borderRadius: string;
  opacity: string;
  display: string;
  position: string;
  objectFit: string;
  transform: string;
  transformStyle: string;
  transition: string;
  boxShadow: string;
  filter: string;
  backdropFilter: string;
  outline: string;
  outlineOffset: string;
  letterSpacing: string;
  border: string;
  borderColor: string;
  textShadow: string;
  animation: string;
  animationDelay: string;
  animationDuration: string;
  animationTimingFunction: string;
  animationIterationCount: string;
  willChange: string;
  backgroundSize: string;
  backgroundPosition: string;
  overflow: string;
  isolation: string;
  clipPath: string;
  minHeight: string;
  zIndex: string;
}>;

type DomElementPatch = {
  patchId: string;
  command?:
    | "undo"
    | "redo"
    | "copy"
    | "paste"
    | "preview"
    | "save"
    | "delete"
    | "duplicate"
    | "deselect"
    | "bring-front"
    | "send-back"
    | "forward"
    | "backward"
    | "toggle-hidden"
    | "toggle-locked"
    | "select";
  selector?: string;
  moveX?: number;
  moveY?: number;
  insertHtml?: string;
  insertPlacement?: "beforebegin" | "afterend" | "beforeend" | "afterbegin";
  insertMode?: "section" | "component";
  text?: string;
  href?: string;
  src?: string;
  alt?: string;
  x?: number;
  y?: number;
  optionIndex?: number;
  optionText?: string;
  optionHref?: string;
  style?: DomElementStylePatch;
};

type DomElementOption = {
  index: number;
  label: string;
  href: string;
};

type DomElementKind = "button" | "link" | "text" | "image" | "video" | "section" | "background" | "card" | "icon" | "selector" | "generic";

type LeftPanelTab = "library" | "layers" | "pages";
type BuilderLibraryKind = "section" | "component" | "future" | "element";
type BuilderLibraryItem = {
  id?: string;
  name: string;
  category: string;
  description: string;
  kind: BuilderLibraryKind;
  componentType?: "heading" | "text" | "button" | "image" | "video";
  sectionType?: string;
  tags: string[];
};

const builderLibraryItems: BuilderLibraryItem[] = [
  {
    name: "Gerar bloco automatico",
    category: "Gerar",
    description: "Cria um bloco estrutural com titulo, texto e chamada para o site.",
    kind: "section",
    sectionType: "generated",
    tags: ["automatico", "ia", "secao"],
  },
  ...[
    ["generator-rectangle", "Retângulo", "Forma retangular livre para moldar fundos e cards."],
    ["generator-square", "Quadrado", "Forma quadrada redimensionável."],
    ["generator-circle", "Círculo", "Forma circular para badges, fotos e decoração."],
    ["generator-ellipse", "Elipse", "Forma oval editável."],
    ["generator-horizontal-line", "Linha horizontal", "Linha para divisores e guias."],
    ["generator-vertical-line", "Linha vertical", "Linha vertical para layout."],
    ["generator-diagonal-line", "Linha diagonal", "Linha diagonal para composição visual."],
    ["generator-arrow", "Seta", "Seta editável para fluxos e CTAs."],
    ["generator-container", "Container", "Área livre para agrupar elementos."],
    ["generator-grid", "Grid", "Grade editável para cards e imagens."],
    ["generator-columns", "Colunas", "Layout em colunas para composições."],
    ["generator-text", "Texto livre", "Texto livre editável."],
    ["generator-title", "Título", "Título grande editável."],
    ["generator-button", "Botão", "Botão com link e estilo editável."],
    ["generator-image", "Imagem", "Imagem editável com máscara e sombra."],
    ["generator-video", "Vídeo", "Vídeo editável."],
    ["generator-glass", "Box vidro", "Glassmorphism com transparência e blur."],
    ["generator-gradient", "Fundo gradiente", "Fundo com gradiente premium."],
    ["generator-blob", "Blob orgânico", "Forma orgânica abstrata."],
    ["generator-3d", "Elemento 3D", "Objeto com profundidade e perspectiva."],
  ].map(([id, name, description]): BuilderLibraryItem => ({
    id,
    name,
    category: "Gerar",
    description,
    kind: id.includes("container") || id.includes("grid") || id.includes("columns") || id.includes("gradient") ? "section" : "element",
    tags: ["figma", "canva", "livre"],
  })),
  {
    name: "Hero imobiliario premium",
    category: "Blocos",
    description: "Abertura de alto padrao com titulo, subtitulo, botoes e area visual.",
    kind: "section",
    sectionType: "hero",
    tags: ["hero", "home", "premium"],
  },
  {
    name: "Vitrine de imoveis",
    category: "Produto",
    description: "Grade para publicar imoveis reais conectados ao ImobiFlow.",
    kind: "section",
    sectionType: "property_grid",
    tags: ["imoveis", "produto", "vitrine"],
  },
  {
    name: "Galeria do imovel",
    category: "Produto",
    description: "Bloco para fotos, videos e tour do imovel em destaque.",
    kind: "section",
    sectionType: "property_gallery",
    tags: ["imovel", "galeria", "fotos"],
  },
  {
    name: "Formulario de contato",
    category: "Formularios",
    description: "Formulario para capturar leads e enviar para o CRM.",
    kind: "section",
    sectionType: "contact_form",
    tags: ["lead", "contato", "crm"],
  },
  {
    name: "Inscricao por e-mail",
    category: "Formularios",
    description: "Captura de e-mail para campanhas e oportunidades.",
    kind: "section",
    sectionType: "email_signup",
    tags: ["email", "lead", "newsletter"],
  },
  {
    name: "Menu",
    category: "Links",
    description: "Navegacao editavel para paginas internas e links externos.",
    kind: "section",
    sectionType: "navigation",
    tags: ["menu", "links", "header"],
  },
  {
    name: "Rodape completo",
    category: "Rodape",
    description: "Rodape com politicas, redes sociais, contato e direitos autorais.",
    kind: "section",
    sectionType: "footer",
    tags: ["rodape", "politicas", "redes"],
  },
  {
    name: "Titulo",
    category: "Basico",
    description: "Texto principal com hierarquia visual.",
    kind: "component",
    componentType: "heading",
    tags: ["texto", "titulo"],
  },
  {
    name: "Texto",
    category: "Basico",
    description: "Paragrafo ou bloco de conteudo editavel.",
    kind: "component",
    componentType: "text",
    tags: ["texto", "paragrafo"],
  },
  {
    name: "Botao",
    category: "Basico",
    description: "Botao com texto, link, estilo e redirecionamento.",
    kind: "component",
    componentType: "button",
    tags: ["botao", "cta", "link"],
  },
  {
    name: "Imagem",
    category: "Basico",
    description: "Imagem editavel com tamanho, posicao e descricao.",
    kind: "component",
    componentType: "image",
    tags: ["imagem", "foto", "media"],
  },
  {
    name: "Video",
    category: "Basico",
    description: "Video ou chamada de midia para paginas premium.",
    kind: "component",
    componentType: "video",
    tags: ["video", "media"],
  },
  {
    name: "Logo",
    category: "Basico",
    description: "Area de logo da imobiliaria com imagem e link.",
    kind: "component",
    componentType: "image",
    tags: ["logo", "marca"],
  },
  {
    name: "Espacador",
    category: "Layout",
    description: "Controle de respiro visual entre secoes e elementos.",
    kind: "component",
    componentType: "text",
    tags: ["layout", "espaco"],
  },
  {
    name: "Grupo",
    category: "Layout",
    description: "Agrupamento de elementos para organizar o design.",
    kind: "section",
    sectionType: "group",
    tags: ["grupo", "layout"],
  },
  {
    name: "Card de colecao",
    category: "Colecao",
    description: "Card para bairros, tipos de imovel, categorias ou campanhas.",
    kind: "section",
    sectionType: "collection_card",
    tags: ["colecao", "card"],
  },
  {
    name: "Texto jumbo",
    category: "Decorativo",
    description: "Texto grande para destaque editorial e visual premium.",
    kind: "component",
    componentType: "heading",
    tags: ["decorativo", "texto", "jumbo"],
  },
  {
    name: "Slider de comparacao",
    category: "Decorativo",
    description: "Comparacao visual antes/depois para fotos ou reformas.",
    kind: "future",
    tags: ["slider", "comparacao", "efeito"],
  },
  {
    name: "Liquid personalizado",
    category: "Personalizado",
    description: "Bloco para codigo personalizado em fases avancadas.",
    kind: "future",
    tags: ["codigo", "custom", "liquid"],
  },
  {
    name: "Icone",
    category: "Basico",
    description: "Icone visual para beneficios, menus e botoes.",
    kind: "future",
    tags: ["icone", "visual"],
  },
  {
    name: "Botao de interesse",
    category: "Produto",
    description: "Botao conectado ao lead do imovel ou WhatsApp.",
    kind: "component",
    componentType: "button",
    tags: ["imovel", "lead", "whatsapp"],
  },
  {
    name: "Preco do imovel",
    category: "Produto",
    description: "Campo de valor conectado aos dados reais do imovel.",
    kind: "component",
    componentType: "heading",
    tags: ["preco", "imovel", "valor"],
  },
  {
    name: "Produtos recomendados",
    category: "Produto",
    description: "Lista de imoveis semelhantes para paginas individuais.",
    kind: "section",
    sectionType: "recommended_properties",
    tags: ["imoveis", "recomendados"],
  },
];

const builderLibraryExpansionItems: BuilderLibraryItem[] = [
  {
    id: "empty-section-fluid",
    name: "Seção vazia editável",
    description: "Cria uma área limpa para montar qualquer bloco, ordenar e editar livremente.",
    category: "Secoes vazias",
    kind: "section",
    tags: ["secao", "vazio", "layout"],
  },
  {
    id: "hero-real-estate-complete",
    name: "Hero imobiliário completo",
    description: "Hero real com fundo, título, subtítulo, CTAs, busca, métricas e destaque comercial.",
    category: "Cabecalhos",
    kind: "section",
    tags: ["hero", "imobiliaria", "premium"],
  },
  {
    id: "property-showcase-grid-real",
    name: "Vitrine de imóveis real",
    description: "Cards de imóveis publicados para venda ou locação, com foto, preço, código e CTA.",
    category: "Imoveis",
    kind: "section",
    tags: ["imovel", "vitrine", "cards"],
  },
  {
    id: "property-gallery-paginated",
    name: "Galeria de imóveis paginada",
    description: "Galeria com limite configurável, paginação e cards para mostrar muitos imóveis.",
    category: "Imoveis",
    kind: "section",
    tags: ["galeria", "imoveis", "paginacao"],
  },
  {
    id: "property-carousel-premium",
    name: "Carrossel de cards de imóveis",
    description: "Carrossel horizontal com imóveis reais, navegação e destaque visual premium.",
    category: "Imoveis",
    kind: "section",
    tags: ["carrossel", "imoveis", "cards"],
  },
  {
    id: "contact-form-complete",
    name: "Formulário de contato completo",
    description: "Nome, telefone, e-mail, assunto, mensagem e botão para gerar lead.",
    category: "Formularios",
    kind: "section",
    tags: ["formulario", "contato", "lead"],
  },
  {
    id: "email-signup-real",
    name: "Inscrição por e-mail",
    description: "Bloco de captação simples para newsletter, novidades e oportunidades.",
    category: "Formularios",
    kind: "section",
    tags: ["email", "newsletter", "captacao"],
  },
  {
    id: "owner-capture-real",
    name: "Captação de proprietários",
    description: "CTA e formulário para proprietários anunciarem imóveis na imobiliária.",
    category: "Formularios",
    kind: "section",
    tags: ["proprietario", "captacao", "anunciar"],
  },
  {
    id: "premium-footer-complete",
    name: "Rodapé imobiliário completo",
    description: "Logo, contatos, redes sociais, políticas, links e WhatsApp.",
    category: "Rodape",
    kind: "section",
    tags: ["rodape", "footer", "links"],
  },
  {
    id: "video-background-section",
    name: "Seção com vídeo de fundo",
    description: "Área premium com vídeo em background, overlay, chamada e botões.",
    category: "Fundos",
    kind: "section",
    tags: ["video", "fundo", "cinematografico"],
  },
  {
    id: "ios-glass-panel",
    name: "Painel vidro iOS",
    description: "Elemento com blur, transparência, relevo, borda luminosa e profundidade.",
    category: "Efeitos",
    kind: "element",
    tags: ["vidro", "glass", "blur"],
  },
  {
    id: "shape-rectangle-free",
    name: "Retângulo livre",
    description: "Forma editável estilo Figma para criar fundos, molduras e composições.",
    category: "Basico",
    kind: "element",
    tags: ["forma", "figma", "retangulo"],
  },
  {
    id: "shape-circle-free",
    name: "Círculo livre",
    description: "Forma circular editável para decoração, imagens, badges e camadas.",
    category: "Basico",
    kind: "element",
    tags: ["forma", "circulo", "camada"],
  },
  {
    id: "line-divider-premium",
    name: "Linha e divisor",
    description: "Linha editável para separar seções, criar setas e guias visuais.",
    category: "Divisores",
    kind: "element",
    tags: ["linha", "divisor", "layout"],
  },
  {
    id: "premium-button-glow",
    name: "Botão brilho premium",
    description: "Botão com dourado, hover, brilho e link editável.",
    category: "Botoes",
    kind: "element",
    tags: ["botao", "glow", "link"],
  },
  {
    id: "magnetic-button",
    name: "Botão magnético",
    description: "Botão pronto para interação de hover e microanimação.",
    category: "Animacoes",
    kind: "element",
    tags: ["botao", "magnetic", "hover"],
  },
  {
    id: "title-editorial",
    name: "Título editorial",
    description: "Texto grande premium para chamadas, capas e destaques.",
    category: "Textos",
    kind: "element",
    tags: ["titulo", "texto", "editorial"],
  },
  {
    id: "text-reveal-block",
    name: "Texto com reveal",
    description: "Bloco de texto preparado para animação de entrada.",
    category: "Animacoes",
    kind: "element",
    tags: ["texto", "reveal", "scroll"],
  },
  {
    id: "premium-property-card",
    name: "Card de imóvel premium",
    description: "Card isolado de imóvel com imagem, preço, local e CTA.",
    category: "Cards",
    kind: "element",
    tags: ["card", "imovel", "produto"],
  },
  {
    id: "floating-card-3d",
    name: "Card 3D flutuante",
    description: "Card com profundidade, sombra e movimento 3D.",
    category: "3D",
    kind: "element",
    tags: ["card", "3d", "profundidade"],
  },
  {
    id: "animated-icon-badge",
    name: "Ícone animado",
    description: "Badge com ícone, brilho e estado editável.",
    category: "Icones",
    kind: "element",
    tags: ["icone", "badge", "animado"],
  },
  {
    id: "luxury-menu-header",
    name: "Menu premium",
    description: "Cabeçalho com logo, links, CTA e tema preto/dourado.",
    category: "Menus",
    kind: "section",
    tags: ["menu", "header", "links"],
  },
  {
    id: "mesh-gradient-background",
    name: "Fundo mesh gradient",
    description: "Fundo visual com gradiente sofisticado para seções.",
    category: "Fundos",
    kind: "element",
    tags: ["fundo", "gradiente", "mesh"],
  },
  {
    id: "parallax-depth-section",
    name: "Seção parallax com profundidade",
    description: "Seção com camadas para efeito de profundidade e scroll.",
    category: "Animacoes 3D",
    kind: "section",
    tags: ["parallax", "3d", "scroll"],
  },
  {
    id: "free-square-shape",
    name: "Quadrado livre",
    description: "Forma quadrada redimensionável para montar layouts no estilo Figma.",
    category: "Formas",
    kind: "element",
    tags: ["quadrado", "forma", "figma"],
  },
  {
    id: "free-ellipse-shape",
    name: "Elipse livre",
    description: "Forma oval editável para fundos, máscaras, fotos e decoração.",
    category: "Formas",
    kind: "element",
    tags: ["elipse", "forma", "oval"],
  },
  {
    id: "organic-blob-shape",
    name: "Shape orgânico blob",
    description: "Forma orgânica abstrata para composições decorativas premium.",
    category: "Decorativos",
    kind: "element",
    tags: ["blob", "organico", "abstrato"],
  },
  {
    id: "horizontal-line-free",
    name: "Linha horizontal",
    description: "Linha horizontal editável para divisões, setas e composição.",
    category: "Linhas",
    kind: "element",
    tags: ["linha", "horizontal", "divisor"],
  },
  {
    id: "vertical-line-free",
    name: "Linha vertical",
    description: "Linha vertical editável para guias visuais e separações.",
    category: "Linhas",
    kind: "element",
    tags: ["linha", "vertical"],
  },
  {
    id: "diagonal-line-free",
    name: "Linha diagonal",
    description: "Linha diagonal para composições editoriais e direcionamento visual.",
    category: "Linhas",
    kind: "element",
    tags: ["linha", "diagonal"],
  },
  {
    id: "arrow-line-free",
    name: "Seta",
    description: "Seta editável para indicar fluxo, CTA ou navegação.",
    category: "Linhas",
    kind: "element",
    tags: ["seta", "linha", "direcao"],
  },
  {
    id: "free-container",
    name: "Container livre",
    description: "Container editável para agrupar, sobrepor e organizar elementos.",
    category: "Layouts",
    kind: "section",
    tags: ["container", "grupo", "layout"],
  },
  {
    id: "free-grid",
    name: "Grid livre",
    description: "Grade responsiva para organizar cards, imagens ou textos.",
    category: "Layouts",
    kind: "section",
    tags: ["grid", "layout", "colunas"],
  },
  {
    id: "free-columns",
    name: "Colunas livres",
    description: "Duas colunas editáveis para textos, imagens e CTAs.",
    category: "Layouts",
    kind: "section",
    tags: ["colunas", "layout"],
  },
  {
    id: "free-text",
    name: "Texto livre",
    description: "Texto editável livre para posicionar, redimensionar e estilizar.",
    category: "Textos",
    kind: "element",
    tags: ["texto", "livre"],
  },
  {
    id: "free-subtitle",
    name: "Subtítulo livre",
    description: "Subtítulo editável para seções, cards e chamadas.",
    category: "Textos",
    kind: "element",
    tags: ["subtitulo", "texto"],
  },
  {
    id: "free-image",
    name: "Imagem livre",
    description: "Imagem editável com tamanho, borda, sombra, máscara e link.",
    category: "Imagens",
    kind: "element",
    tags: ["imagem", "foto"],
  },
  {
    id: "free-video",
    name: "Vídeo livre",
    description: "Vídeo editável para incorporar ou usar em composições.",
    category: "Videos",
    kind: "element",
    tags: ["video", "midia"],
  },
  {
    id: "background-image-section",
    name: "Fundo com imagem",
    description: "Seção com imagem de fundo editável, overlay e conteúdo.",
    category: "Fundos",
    kind: "section",
    tags: ["fundo", "imagem"],
  },
  {
    id: "simple-3d-element",
    name: "Elemento 3D simples",
    description: "Objeto com perspectiva, profundidade, sombra e rotação 3D editável.",
    category: "Elementos 3D",
    kind: "element",
    tags: ["3d", "perspectiva", "profundidade"],
  },
  {
    id: "floating-depth-element",
    name: "Elemento com profundidade",
    description: "Elemento flutuante com sombra, relevo e z-index para sobreposição.",
    category: "Elementos 3D",
    kind: "element",
    tags: ["profundidade", "z-index", "sombra"],
  },
  ...[
    "Header premium",
    "Cabecalho transparente",
    "Hero com busca de imoveis",
    "Hero com video",
    "CTA WhatsApp",
    "Sobre a imobiliaria",
    "Como trabalhamos",
    "Diferenciais",
    "Depoimentos",
    "FAQ",
    "Mapa e localizacao",
    "Banner de captacao",
    "Linha do tempo",
    "Estatisticas premium",
    "Equipe da imobiliaria",
    "Parceiros e selos",
  ].map((name): BuilderLibraryItem => ({
    name,
    category: "Blocos",
    description: "Secao pronta para montar paginas imobiliarias completas.",
    kind: "section",
    sectionType: slugifyBuilderType(name),
    tags: ["secao", "site", "premium"],
  })),
  ...[
    "Botao secundario",
    "Botao WhatsApp",
    "Botao com icone",
    "Titulo pequeno",
    "Subtitulo",
    "Paragrafo rico",
    "Lista com icones",
    "Badge",
    "Numero em destaque",
    "Linha divisoria",
    "Retangulo",
    "Circulo",
    "Forma organica",
    "Seta",
    "Moldura glass",
    "Linha curva",
    "Imagem arredondada",
    "Logo da imobiliaria",
    "Video incorporado",
    "Card simples",
  ].map((name): BuilderLibraryItem => ({
    name,
    category: "Basico",
    description: "Elemento basico editavel para texto, midia, botoes e composicao.",
    kind: "component",
    componentType: inferLibraryComponentType(name),
    tags: ["elemento", "basico", "editavel"],
  })),
  ...[
    "Cartao do imovel",
    "Titulo do imovel",
    "Descricao do imovel",
    "Preco do imovel",
    "Caracteristicas do imovel",
    "Galeria compacta",
    "Dormitorios",
    "Suites",
    "Banheiros",
    "Vagas",
    "Area util",
    "Condominio e IPTU",
    "Imoveis semelhantes",
    "Botao tenho interesse",
    "Botao agendar visita",
    "Codigo do imovel",
    "Tags do imovel",
  ].map((name): BuilderLibraryItem => ({
    name,
    category: "Produto",
    description: "Bloco adaptado para imoveis reais cadastrados no ImobiFlow.",
    kind: name.includes("semelhantes") || name.includes("Caracteristicas") ? "section" : "component",
    componentType: inferLibraryComponentType(name),
    sectionType: slugifyBuilderType(name),
    tags: ["imovel", "produto", "crm"],
  })),
  ...[
    "Formulario de interesse",
    "Formulario anuncie seu imovel",
    "Formulario de visita",
    "Campo nome",
    "Campo telefone",
    "Campo email",
    "Campo mensagem",
    "Select de assunto",
    "Checkbox LGPD",
  ].map((name): BuilderLibraryItem => ({
    name,
    category: "Formularios",
    description: "Elemento de formulario para captar leads e enviar ao CRM.",
    kind: name.startsWith("Formulario") ? "section" : "component",
    componentType: "text",
    sectionType: slugifyBuilderType(name),
    tags: ["lead", "formulario", "crm"],
  })),
  ...[
    "Espacador vertical",
    "Grupo de elementos",
    "Duas colunas",
    "Tres colunas",
    "Grid responsivo",
    "Container centralizado",
    "Secao expansivel",
    "Abas",
    "Carrossel",
    "Slider",
  ].map((name): BuilderLibraryItem => ({
    name,
    category: "Layout",
    description: "Estrutura para organizar elementos, colunas e responsividade.",
    kind: name.includes("Espacador") ? "component" : "section",
    componentType: "text",
    sectionType: slugifyBuilderType(name),
    tags: ["layout", "estrutura", "responsivo"],
  })),
  ...[
    "Link de pop-up",
    "Menu principal",
    "Menu mobile",
    "Link externo",
    "Link para pagina",
    "Rede social",
    "WhatsApp fixo",
    "Ancora da pagina",
  ].map((name): BuilderLibraryItem => ({
    name,
    category: "Links",
    description: "Controle de navegacao, redirecionamento e links do site.",
    kind: name.includes("Menu") ? "section" : "component",
    componentType: name.includes("WhatsApp") || name.includes("Link") ? "button" : "text",
    sectionType: slugifyBuilderType(name),
    tags: ["link", "menu", "navegacao"],
  })),
  ...[
    "Colecao de imoveis",
    "Cartao da colecao",
    "Titulo da colecao",
    "Filtro da colecao",
    "Carrossel da colecao",
    "Grade da colecao",
    "Colecao de bairros",
    "Colecao de oportunidades",
  ].map((name): BuilderLibraryItem => ({
    name,
    category: "Colecao",
    description: "Conjunto editavel para agrupar imoveis, bairros, oportunidades e listas comerciais.",
    kind: name.includes("Colecao") || name.includes("Grade") || name.includes("Carrossel") ? "section" : "component",
    componentType: inferLibraryComponentType(name),
    sectionType: slugifyBuilderType(name),
    tags: ["colecao", "imoveis", "lista"],
  })),
  ...[
    "Bloco HTML livre",
    "CSS personalizado",
    "Script externo",
    "Widget embed",
    "Componente Liquid",
    "Mapa personalizado",
    "Popup customizado",
    "Janela modal",
    "Forma livre",
    "Linha vetorial",
    "Mascara visual",
    "Container absoluto",
  ].map((name): BuilderLibraryItem => ({
    name,
    category: "Personalizado",
    description: "Elemento livre para criar experiencias sob medida, com codigo, formas, embeds e layout manual.",
    kind: name.includes("Bloco") || name.includes("Widget") || name.includes("Mapa") || name.includes("Popup") ? "section" : "component",
    componentType: inferLibraryComponentType(name),
    sectionType: slugifyBuilderType(name),
    tags: ["custom", "codigo", "livre"],
  })),
  ...[
    "Marca de selecao",
    "Texto jumbo",
    "Fundo glassmorphism",
    "Glow dourado",
    "Separador elegante",
    "Sombra premium",
    "Moldura de imagem",
    "Faixa decorativa",
  ].map((name): BuilderLibraryItem => ({
    name,
    category: "Decorativo",
    description: "Detalhe visual para deixar a pagina mais sofisticada.",
    kind: "component",
    componentType: inferLibraryComponentType(name),
    tags: ["decorativo", "visual", "efeito"],
  })),
  ...[
    "Fade ao rolar",
    "Slide suave",
    "Parallax leve",
    "Hover brilho dourado",
    "Card 3D",
    "Tilt no mouse",
    "Imagem com reveal",
    "Botao magnetico",
    "Spotlight dourado",
    "Border shine premium",
    "Liquid hover",
    "Ripple premium",
    "Magnetic lift",
    "Image zoom cinematic",
    "Golden frame",
    "Frosted depth",
    "Soft shadow lift",
    "Mouse spotlight",
    "Cinematic mask",
    "Gallery reveal premium",
    "Map card glow",
    "Luxury hover glass",
    "Real estate showcase",
    "Awwwards reveal",
  ].map((name): BuilderLibraryItem => ({
    name,
    category: "Efeitos",
    description: "Preset visual para aplicar movimento e interacao ao bloco.",
    kind: "section",
    sectionType: slugifyBuilderType(name),
    tags: ["efeito", "animacao", "premium"],
  })),
  ...[
    "Fade in",
    "Fade up",
    "Slide left",
    "Slide right",
    "Scale reveal",
    "Blur reveal",
    "Text reveal",
    "Typing text",
    "Pulse suave",
    "Floating",
    "Shimmer",
    "Loading premium",
    "Bounce premium",
    "Elastic pop",
    "Rotate reveal",
    "Flip reveal",
    "Ken burns",
    "Float infinito",
    "Pulse glow forte",
    "Wave text",
    "Marquee suave",
    "Slide up stagger",
    "Zoom luxury",
    "Blur cinematic",
    "Glow breathing",
  ].map((name): BuilderLibraryItem => ({
    name,
    category: "Animacoes",
    description: "Preset de animacao visual para testar movimento no canvas.",
    kind: "section",
    sectionType: slugifyBuilderType(name),
    tags: ["animacao", "motion", "scroll"],
  })),
  ...[
    "Flip 3D animado",
    "Orbit 3D loop",
    "Depth scroll 3D",
    "Card hover 3D",
    "Photo stack motion",
    "Hero layers 3D",
    "Perspective reveal",
    "Golden extrusion motion",
  ].map((name): BuilderLibraryItem => ({
    name,
    category: "Animacoes 3D",
    description: "Animacao 3D para dar profundidade, camadas, perspectiva e movimento premium.",
    kind: "section",
    sectionType: slugifyBuilderType(name),
    tags: ["3d", "motion", "profundidade"],
  })),
  ...[
    "Card tilt 3D",
    "Hero 3D",
    "Profundidade com sombra",
    "Parallax em camadas",
    "Objeto flutuante 3D",
    "Perspectiva no mouse",
    "Galeria cinematografica",
    "Reveal de imagem 3D",
    "Orbita 3D",
    "Card flip 3D",
    "Real estate depth",
    "Luxury perspective hero",
    "Shadow floor 3D",
    "Layered glass 3D",
    "Golden extrusion",
    "Photo stack 3D",
    "Floating badge 3D",
    "Depth hover premium",
    "Cinematic property card 3D",
  ].map((name): BuilderLibraryItem => ({
    name,
    category: "3D",
    description: "Estrutura visual para simular efeitos 3D e profundidade.",
    kind: "section",
    sectionType: slugifyBuilderType(name),
    tags: ["3d", "profundidade", "premium"],
  })),
  ...[
    "Fundo aurora",
    "Fundo com particulas",
    "Mesh gradient",
    "Luzes em movimento",
    "Grid animado",
    "Glass premium",
    "Neon discreto",
    "Metalico dourado",
    "Aurora dourada forte",
    "Spotlight radial",
    "Luxury black gold",
    "Particles premium",
    "Grid futurista",
    "Blurred glass lights",
    "Animated gold lines",
    "Noise elegante",
    "Cinematic dark room",
    "Gradient luxury motion",
    "Fundo com video",
    "Video hero full screen",
    "Video cinemático escuro",
  ].map((name): BuilderLibraryItem => ({
    name,
    category: "Fundos",
    description: "Fundo visual premium para secoes, heroes e vitrines.",
    kind: "section",
    sectionType: slugifyBuilderType(name),
    tags: ["fundo", "visual", "premium"],
  })),
  ...[
    "Direitos autorais",
    "Links de politicas",
    "Links de redes sociais",
    "Dados de contato",
    "Logo no rodape",
    "Mapa no rodape",
    "Icones de pagamento",
  ].map((name): BuilderLibraryItem => ({
    name,
    category: "Rodape",
    description: "Elemento para compor o rodape completo do site.",
    kind: name.includes("rodape") || name.includes("Mapa") ? "section" : "component",
    componentType: inferLibraryComponentType(name),
    sectionType: slugifyBuilderType(name),
    tags: ["rodape", "site", "contato"],
  })),
];

const builderLibraryCatalogItems = [...builderLibraryItems, ...builderLibraryExpansionItems];
const builderLibraryCategories = ["Todos", ...Array.from(new Set(builderLibraryCatalogItems.map((item) => item.category)))];
const defaultOpenLibraryCategories: string[] = [];
const libraryCategoryLabels: Record<string, string> = {
  Basico: "Básico",
  Cabecalhos: "Cabeçalho",
  Colecao: "Coleção",
  Formularios: "Formulários",
  Icones: "Ícones",
  Imoveis: "Imóveis",
  Produto: "Produtos",
  Rodape: "Rodapé",
  "Secoes vazias": "Seções vazias",
  Videos: "Vídeos",
};

function libraryCategoryLabel(category: string) {
  return libraryCategoryLabels[category] ?? category;
}

function slugifyBuilderType(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function inferLibraryComponentType(name: string): NonNullable<BuilderLibraryItem["componentType"]> {
  const normalized = slugifyBuilderType(name);
  if (normalized.includes("botao") || normalized.includes("whatsapp") || normalized.includes("link")) return "button";
  if (normalized.includes("imagem") || normalized.includes("logo") || normalized.includes("foto") || normalized.includes("moldura")) return "image";
  if (normalized.includes("video")) return "video";
  if (normalized.includes("titulo") || normalized.includes("preco") || normalized.includes("numero") || normalized.includes("jumbo")) return "heading";
  return "text";
}

function builderLibrarySectionStyle(item: BuilderLibraryItem): Record<string, unknown> {
  const category = item.category.toLowerCase();
  if (category.includes("3d")) {
    return { padding: "96px 28px", background: "linear-gradient(135deg, #070707, #17110a)", borderRadius: "28px", transform: "perspective(900px)" };
  }
  if (category.includes("efeito") || category.includes("animac")) {
    return { padding: "88px 28px", background: "linear-gradient(135deg, rgba(8,8,8,.96), rgba(203,164,74,.16))", borderRadius: "24px" };
  }
  if (category.includes("fundo")) {
    return { padding: "110px 28px", background: "radial-gradient(circle at 20% 20%, rgba(203,164,74,.35), transparent 32%), #080806", borderRadius: "24px" };
  }
  if (category.includes("produto")) {
    return { padding: "82px 28px", background: "#101010", borderRadius: "20px" };
  }
  return { padding: "76px 28px", background: "rgba(255,255,255,.035)", borderRadius: "20px" };
}

function builderLibraryComponentStyle(item: BuilderLibraryItem): Record<string, unknown> {
  const type = item.componentType ?? inferLibraryComponentType(item.name);
  if (type === "button") return { background: "#c8a24b", color: "#080806", borderRadius: "999px", padding: "14px 22px", fontWeight: 800 };
  if (type === "heading") return { color: "#ffffff", fontSize: "42px", fontWeight: 900, lineHeight: 1.05 };
  if (type === "image") return { borderRadius: "20px", minHeight: "180px", background: "linear-gradient(135deg, #2b2111, #080806)" };
  if (type === "video") return { borderRadius: "20px", minHeight: "220px", background: "#111111" };
  return { color: "rgba(255,255,255,.78)", fontSize: "16px", lineHeight: 1.7 };
}

function builderLibraryAnimationPreset(item: BuilderLibraryItem): Record<string, unknown> {
  const normalized = slugifyBuilderType(`${item.category} ${item.name}`);
  if (normalized.includes("3d") || normalized.includes("tilt")) return { type: "tilt_3d", perspective: 900, rotate: 8, duration: 450 };
  if (normalized.includes("parallax")) return { type: "parallax", depth: 24, duration: 700 };
  if (normalized.includes("slide")) return { type: "slide", direction: normalized.includes("right") ? "right" : "left", duration: 520 };
  if (normalized.includes("blur")) return { type: "blur_reveal", blur: 18, duration: 520 };
  if (normalized.includes("scale")) return { type: "scale", from: 0.92, duration: 420 };
  if (normalized.includes("pulse")) return { type: "pulse", intensity: 0.12, duration: 1200 };
  return { type: "fade_up", duration: 420, easing: "ease-out" };
}

function createLibraryStarterComponents(section: WebsiteBuilderSection, item: BuilderLibraryItem, createdAt: string): WebsiteBuilderComponent[] {
  const base = {
    companyId: section.companyId,
    websiteId: section.websiteId,
    pageId: section.pageId,
    sectionId: section.id,
    parentComponentId: null,
    responsiveJson: {},
    interactionJson: {},
    isVisible: true,
    isLocked: false,
    createdAt,
    updatedAt: createdAt,
  };
  const makeComponent = (
    suffix: string,
    name: string,
    componentType: string,
    sortOrder: number,
    propsJson: Record<string, unknown>,
    styleJson: Record<string, unknown>,
  ): WebsiteBuilderComponent => ({
    ...base,
    id: `${section.id}_${suffix}`,
    name,
    componentType,
    sortOrder,
    propsJson,
    styleJson,
    animationJson: sortOrder === 0 ? builderLibraryAnimationPreset(item) : {},
  });

  if (item.category === "Produto") {
    return [
      makeComponent("heading", item.name, "heading", 0, { text: item.name }, builderLibraryComponentStyle({ ...item, componentType: "heading" })),
      makeComponent("text", "Descricao do bloco", "text", 1, { text: item.description }, builderLibraryComponentStyle({ ...item, componentType: "text" })),
      makeComponent("button", "Tenho interesse", "button", 2, { label: "Tenho interesse", href: "#contato" }, builderLibraryComponentStyle({ ...item, componentType: "button" })),
    ];
  }

  if (item.category === "Formularios") {
    return [
      makeComponent("heading", item.name, "heading", 0, { text: item.name }, builderLibraryComponentStyle({ ...item, componentType: "heading" })),
      makeComponent("text", "Campos do formulario", "text", 1, { text: "Nome, telefone, e-mail e mensagem." }, builderLibraryComponentStyle({ ...item, componentType: "text" })),
      makeComponent("button", "Enviar", "button", 2, { label: "Enviar lead", href: "#lead" }, builderLibraryComponentStyle({ ...item, componentType: "button" })),
    ];
  }

  return [
    makeComponent("heading", item.name, "heading", 0, { text: item.name }, builderLibraryComponentStyle({ ...item, componentType: "heading" })),
    makeComponent("text", "Texto de apoio", "text", 1, { text: item.description }, builderLibraryComponentStyle({ ...item, componentType: "text" })),
    makeComponent("button", "Botao principal", "button", 2, { label: "Editar chamada", href: "#topo" }, builderLibraryComponentStyle({ ...item, componentType: "button" })),
  ];
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
type DiscoveredSitePage = {
  title: string;
  slug: string;
  previewPath: string;
  pageType: WebsiteBuilderPageRecord["pageType"];
};

const sitePageBlueprints = [
  { title: "Pagina inicial", slug: "home", pageType: "home", previewPath: "#topo" },
  { title: "Imoveis", slug: "imoveis", pageType: "property", previewPath: "#imoveis" },
  { title: "Venda", slug: "venda", pageType: "property", previewPath: "#venda" },
  { title: "Locacao", slug: "locacao", pageType: "property", previewPath: "#locacao" },
  { title: "Sobre", slug: "sobre", pageType: "about", previewPath: "#sobre" },
  { title: "Como trabalhamos", slug: "como-trabalhamos", pageType: "custom", previewPath: "#como-trabalhamos" },
  { title: "Contato", slug: "contato", pageType: "contact", previewPath: "#contato" },
  { title: "Anuncie seu imovel", slug: "anuncie-seu-imovel", pageType: "landing", previewPath: "#anuncie" },
  { title: "Termos de uso", slug: "termos", pageType: "terms", previewPath: "#termos" },
  { title: "Politica de privacidade", slug: "politica-de-privacidade", pageType: "privacy", previewPath: "#privacidade" },
] satisfies DiscoveredSitePage[];

const editorBlockCatalog = [
  { category: "Blocos", items: ["Bloco vazio", "Secao premium", "Grade de conteudo"] },
  { category: "Apps", items: ["App externo", "Widget integrado"] },
  { category: "Gerar", items: ["Gerar um bloco automatico"] },
  { category: "Básico", items: ["Botão", "Imagem", "Logo", "Página", "Texto", "Título", "Vídeo", "Ícone"] },
  { category: "Coleção", items: ["Cartão da coleção", "Título da coleção"] },
  { category: "Decorativo", items: ["Marca de seleção", "Slider de comparação", "Texto jumbo"] },
  { category: "Formulários", items: ["Formulário de contato", "Inscrição por e-mail"] },
  { category: "Layout", items: ["Espaçador", "Grupo", "Seção expansível"] },
  { category: "Links", items: ["Link de pop-up", "Menu"] },
  { category: "Personalizado", items: ["Liquid personalizado"] },
  {
    category: "Produto / Imóvel",
    items: [
      "Botões de compra",
      "Cartão do produto",
      "Descrição",
      "Estoque do produto",
      "Estrelas de avaliação",
      "Instruções especiais",
      "Preço",
      "Produtos recomendados",
      "SKU",
      "Seletor de variantes",
      "Swatches",
      "Título",
    ],
  },
  { category: "Rodapé", items: ["Direitos autorais", "Links de políticas", "Links de redes sociais", "Seguir no Shop", "Ícones de pagamento"] },
] as const;
type DragState =
  | { type: "section"; id: string }
  | { type: "component"; id: string; sectionId: string }
  | null;

type EditorPropertyForm = {
  name: string;
  slug: string;
  type: string;
  text: string;
  visible: boolean;
  backgroundColor: string;
  textColor: string;
  borderRadius: string;
  paddingY: string;
};

const defaultPublicSitePreviewUrl = "/site/magnificopaginainicial#topo";

type ThemeForm = {
  background: string;
  foreground: string;
  primary: string;
  secondary: string;
  muted: string;
  headingFont: string;
  bodyFont: string;
  cardRadius: string;
  buttonRadius: string;
};

function createEditorFallbackWebsite(websiteId: string): WebsiteBuilderWebsite {
  const now = new Date().toISOString();
  return {
    id: websiteId,
    companyId: "preview-company",
    name: "Site da imobiliária",
    slug: "site-em-edicao",
    status: "draft",
    templateId: null,
    themeJson: {},
    settingsJson: {
      live_editor_url: defaultPublicSitePreviewUrl,
      external_preview_url: defaultPublicSitePreviewUrl,
    },
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    _count: {
      pages: 1,
      assets: 0,
      versions: 0,
    },
  };
}

function createEditorFallbackHomePage(websiteId: string): WebsiteBuilderPageRecord {
  const now = new Date().toISOString();
  return {
    id: `${websiteId}-home`,
    companyId: "preview-company",
    websiteId,
    title: "Página inicial",
    slug: "home",
    pageType: "home",
    status: "draft",
    sortOrder: 0,
    seoJson: {},
    settingsJson: {
      preview_path: "#topo",
      preview_url: defaultPublicSitePreviewUrl,
    },
    createdAt: now,
    updatedAt: now,
    _count: {
      sections: 0,
    },
  };
}

function WebsiteBuilderVisualEditorPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname.endsWith("/code")) {
    return <Outlet />;
  }

  return <WebsiteBuilderVisualEditorWorkspace />;
}

function WebsiteBuilderVisualEditorWorkspace() {
  const { websiteId } = Route.useParams();
  const { isLoading, session } = useSessionGuard();
  const [authFallbackReady, setAuthFallbackReady] = useState(false);
  const [website, setWebsite] = useState<WebsiteBuilderWebsite | null>(() => createEditorFallbackWebsite(websiteId));
  const [pages, setPages] = useState<WebsiteBuilderPageRecord[]>(() => [createEditorFallbackHomePage(websiteId)]);
  const [sections, setSections] = useState<WebsiteBuilderSection[]>([]);
  const [componentsBySection, setComponentsBySection] = useState<Record<string, WebsiteBuilderComponent[]>>({});
  const [assets, setAssets] = useState<WebsiteBuilderAsset[]>([]);
  const [versions, setVersions] = useState<WebsiteBuilderVersion[]>([]);
  const [siteProperties, setSiteProperties] = useState<Property[]>([]);
  const [publicSitePreviewUrl, setPublicSitePreviewUrl] = useState(defaultPublicSitePreviewUrl);
  const [pagePreviewPaths, setPagePreviewPaths] = useState<Record<string, string>>(() => ({
    ...blueprintPreviewPathMap(),
    home: defaultPublicSitePreviewUrl,
    "pagina-inicial": defaultPublicSitePreviewUrl,
  }));
  const [leftPanelTab, setLeftPanelTab] = useState<LeftPanelTab>("library");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryCategory, setLibraryCategory] = useState("Todos");
  const [openLibraryCategories, setOpenLibraryCategories] = useState<string[]>(defaultOpenLibraryCategories);
  const filteredBuilderLibraryItems = useMemo(() => {
    const term = librarySearch.trim().toLowerCase();
    return builderLibraryCatalogItems.filter((item) => {
      const matchesCategory = libraryCategory === "Todos" || item.category === libraryCategory;
      const searchable = [item.name, item.category, item.description, ...item.tags].join(" ").toLowerCase();
      return matchesCategory && (!term || searchable.includes(term));
    });
  }, [libraryCategory, librarySearch]);
  const groupedBuilderLibraryItems = useMemo(() => {
    const term = librarySearch.trim().toLowerCase();
    const filtered = builderLibraryCatalogItems.filter((item) => {
      const searchable = [item.name, item.category, libraryCategoryLabel(item.category), item.description, ...item.tags].join(" ").toLowerCase();
      return !term || searchable.includes(term);
    });
    const groups = new Map<string, BuilderLibraryItem[]>();
    filtered.forEach((item) => {
      const current = groups.get(item.category) ?? [];
      current.push(item);
      groups.set(item.category, current);
    });
    return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
  }, [librarySearch]);

  const [selectedAssetFile, setSelectedAssetFile] = useState<File | null>(null);
  const [assetInputKey, setAssetInputKey] = useState(0);
  const [selectedPageId, setSelectedPageId] = useState(`${websiteId}-home`);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedDomElement, setSelectedDomElement] = useState<InspectedElement | null>(null);
  const [domLayers, setDomLayers] = useState<DomLayerNode[]>([]);
  const [domElementPatch, setDomElementPatch] = useState<DomElementPatch | null>(null);
  const [viewport, setViewport] = useState<EditorViewport>("desktop");
  const [themeForm, setThemeForm] = useState<ThemeForm>(() => emptyThemeForm());
  const [propertyForm, setPropertyForm] = useState<EditorPropertyForm>({
    name: "",
    slug: "",
    type: "",
    text: "",
    visible: true,
    backgroundColor: "",
    textColor: "",
    borderRadius: "",
    paddingY: "",
  });
  const [formUndoStack, setFormUndoStack] = useState<EditorPropertyForm[]>([]);
  const [formRedoStack, setFormRedoStack] = useState<EditorPropertyForm[]>([]);
  const [dragState, setDragState] = useState<DragState>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flatComponents = useMemo(
    () => Object.values(componentsBySection).flat().sort((left, right) => left.sortOrder - right.sortOrder),
    [componentsBySection],
  );

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? pages[0] ?? null,
    [pages, selectedPageId],
  );
  const selectedSection = useMemo(
    () => sections.find((section) => selection?.type === "section" && section.id === selection.id) ?? null,
    [sections, selection],
  );
  const selectedComponent = useMemo(
    () => flatComponents.find((component) => selection?.type === "component" && component.id === selection.id) ?? null,
    [flatComponents, selection],
  );
  const selectedPageForProperties = selection?.type === "page" ? pages.find((page) => page.id === selection.id) ?? null : null;
  const websiteWithDraftTheme = useMemo(
    () => (website ? { ...website, themeJson: mergeWebsiteTheme(website.themeJson, themeForm) } : null),
    [themeForm, website],
  );
  const editorLiveSiteUrl = useMemo(
    () => resolveLiveEditorUrl(website, readRecordString(website?.settingsJson ?? {}, "external_preview_url"), publicSitePreviewUrl),
    [publicSitePreviewUrl, website],
  );
  const CurrentViewportIcon = viewportIcon(viewport);

  function ensureEditorFallbackState() {
    const fallbackWebsite = createEditorFallbackWebsite(websiteId);
    const fallbackPage = createEditorFallbackHomePage(websiteId);

    setWebsite((current) => current ?? fallbackWebsite);
    setPages((current) => (current.length ? current : [fallbackPage]));
    setSelectedPageId((current) => current || fallbackPage.id);
    setPagePreviewPaths((current) => ({
      ...blueprintPreviewPathMap(),
      home: defaultPublicSitePreviewUrl,
      "pagina-inicial": defaultPublicSitePreviewUrl,
      [normalizeSlug(fallbackPage.slug)]: defaultPublicSitePreviewUrl,
      ...current,
    }));
    setPublicSitePreviewUrl((current) => current || defaultPublicSitePreviewUrl);
    setError(null);
  }

  function selectBuilderNode(nextSelection: Selection | null) {
    setSelectedDomElement(null);
    setSelection(nextSelection);
  }

  function handleDomElementSelect(element: InspectedElement) {
    setSelection(null);
    setSelectedDomElement(element);
  }

  function updateDomElementDraft(patch: Omit<DomElementPatch, "patchId">) {
    const nextPatch = { ...patch, patchId: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
    setDomElementPatch(nextPatch);
    setSelectedDomElement((current) => (current ? mergeInspectedElementPatch(current, nextPatch) : current));
  }

  function toggleLibraryCategory(category: string) {
    setOpenLibraryCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category],
    );
  }

  function sendCanvasCommand(command: NonNullable<DomElementPatch["command"]>) {
    updateDomElementDraft({ command });
  }

  function cleanStandalonePreviewHtml(html: string) {
    try {
      const parsed = new DOMParser().parseFromString(html, "text/html");
      parsed
        .querySelectorAll<HTMLElement>(
          [
            ".imobiflow-selection-box",
            ".imobiflow-resize-handle",
            ".imobiflow-guide-line",
            ".imobiflow-distance-line",
            ".imobiflow-distance-badge",
            ".imobiflow-measure-badge",
            ".imobiflow-context-menu",
            ".imobiflow-block-palette",
            ".imobiflow-section-insert-line",
            "[data-imobiflow-editor-layer='true']",
          ].join(","),
        )
        .forEach((element) => element.remove());

      parsed.querySelectorAll<HTMLElement>("[class]").forEach((element) => {
        Array.from(element.classList).forEach((className) => {
          if (className.startsWith("imobiflow-") && className !== "imobiflow-preview-root") {
            element.classList.remove(className);
          }
        });
      });

      parsed.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
        const outline = element.style.outline.toLowerCase();
        const boxShadow = element.style.boxShadow.toLowerCase();
        if (
          outline.includes("38bdf8") ||
          outline.includes("0ea5e9") ||
          outline.includes("rgb(56, 189, 248)") ||
          outline.includes("rgb(14, 165, 233)")
        ) {
          element.style.outline = "";
          element.style.outlineOffset = "";
        }
        if (boxShadow.includes("14, 165, 233") || boxShadow.includes("56, 189, 248")) {
          element.style.boxShadow = "";
        }
        if (element.style.cursor === "move" || element.style.cursor === "grabbing") element.style.cursor = "";
        if (element.style.userSelect === "none") element.style.userSelect = "";
        if (element.style.willChange === "transform") element.style.willChange = "";
      });

      parsed
        .querySelectorAll<HTMLElement>(
          "[data-imobiflow-builder-selected],[data-resize-direction],[data-imobiflow-editor-layer]",
        )
        .forEach((element) => {
          element.removeAttribute("data-imobiflow-builder-selected");
          element.removeAttribute("data-resize-direction");
          element.removeAttribute("data-imobiflow-editor-layer");
        });

      return sanitizeBuilderPreviewHtml(`<!doctype html>${parsed.documentElement.outerHTML}`);
    } catch {
      return sanitizeBuilderPreviewHtml(html);
    }
  }

  function openHtmlPreviewInNewTab(html: string) {
    if (!html.trim()) return;
    const safePreviewDocument = createSandboxedBuilderPreviewDocument(cleanStandalonePreviewHtml(html));
    const blob = new Blob([safePreviewDocument], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function handleOpenSavedOrRealSite() {
    const rawSavedCanvasHtml = readRecordString(website?.settingsJson ?? {}, "builder_canvas_html");
    const savedCanvasHtml = isUsableSavedBuilderCanvasHtml(rawSavedCanvasHtml) ? rawSavedCanvasHtml : "";
    if (savedCanvasHtml) {
      openHtmlPreviewInNewTab(savedCanvasHtml);
      return;
    }
    if (editorLiveSiteUrl) window.open(editorLiveSiteUrl, "_blank", "noopener,noreferrer");
  }

  async function handleCanvasSnapshotSave(snapshotHtml: string) {
    if (!website) return;
    setIsBusy(true);
    setError(null);

    try {
      const response = await updateWebsiteBuilderWebsite(website.id, {
        settings_json: {
          ...website.settingsJson,
          builder_canvas_html: sanitizeBuilderPreviewHtml(snapshotHtml),
          builder_canvas_page_id: selectedPage?.id ?? "",
          builder_canvas_saved_at: new Date().toISOString(),
        },
      });
      setWebsite(response.website);
      await loadVersions();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o canvas atual.");
    } finally {
      setIsBusy(false);
    }
  }

  function sendCanvasMove(moveX: number, moveY: number) {
    updateDomElementDraft({ moveX, moveY });
  }

  function selectCanvasLayer(layer: DomLayerNode) {
    updateDomElementDraft({ command: "select", selector: layer.selector });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAuthFallbackReady(true);
      ensureEditorFallbackState();
    }, 900);

    return () => window.clearTimeout(timer);
  }, [websiteId]);

  useEffect(() => {
    if (isLoading && !authFallbackReady) return;
    void loadWebsite();
  }, [authFallbackReady, isLoading, session, websiteId]);

  useEffect(() => {
    if (!website) return;
    setThemeForm(themeFormFromWebsite(website));
  }, [website?.id]);

  useEffect(() => {
    const handleEditorShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (isTyping) return;

      const isShortcut = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (event.key === "Escape") {
        event.preventDefault();
        sendCanvasCommand("deselect");
        setSelectedDomElement(null);
        return;
      }

      if (["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
        const dy = event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0;
        sendCanvasMove(dx, dy);
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedDomElement) {
        event.preventDefault();
        sendCanvasCommand("delete");
        return;
      }

      if (!isShortcut) return;

      if (key === "z") {
        event.preventDefault();
        sendCanvasCommand(event.shiftKey ? "redo" : "undo");
        return;
      }

      if (key === "y") {
        event.preventDefault();
        sendCanvasCommand("redo");
        return;
      }

      if (key === "c") {
        event.preventDefault();
        sendCanvasCommand("copy");
        return;
      }

      if (key === "v") {
        event.preventDefault();
        sendCanvasCommand("paste");
        return;
      }

      if (key === "d") {
        event.preventDefault();
        sendCanvasCommand("duplicate");
        return;
      }

      if (key === "s") {
        event.preventDefault();
        sendCanvasCommand("save");
      }
    };

    window.addEventListener("keydown", handleEditorShortcut);
    return () => window.removeEventListener("keydown", handleEditorShortcut);
  }, [domElementPatch?.patchId]);

  useEffect(() => {
    if (!selectedPageId) return;
    void loadPageStructure(selectedPageId);
  }, [selectedPageId]);

  useEffect(() => {
    setFormUndoStack([]);
    setFormRedoStack([]);

    if (selectedComponent) {
      setPropertyForm({
        name: selectedComponent.name,
        slug: "",
        type: selectedComponent.componentType,
        text: readComponentText(selectedComponent),
        visible: selectedComponent.isVisible,
        backgroundColor: readRecordString(selectedComponent.styleJson, "backgroundColor"),
        textColor: readRecordString(selectedComponent.styleJson, "color"),
        borderRadius: readRecordNumberString(selectedComponent.styleJson, "borderRadius"),
        paddingY: readRecordNumberString(selectedComponent.styleJson, "paddingY"),
      });
      return;
    }

    if (selectedSection) {
      setPropertyForm({
        name: selectedSection.name,
        slug: "",
        type: selectedSection.sectionType,
        text: readRecordString(selectedSection.propsJson, "title") || readRecordString(selectedSection.propsJson, "eyebrow"),
        visible: selectedSection.isVisible,
        backgroundColor: readRecordString(selectedSection.styleJson, "backgroundColor"),
        textColor: readRecordString(selectedSection.styleJson, "color"),
        borderRadius: readRecordNumberString(selectedSection.styleJson, "borderRadius"),
        paddingY: readRecordNumberString(selectedSection.styleJson, "paddingY"),
      });
      return;
    }

    if (selectedPageForProperties) {
      setPropertyForm({
        name: selectedPageForProperties.title,
        slug: selectedPageForProperties.slug,
        type: selectedPageForProperties.pageType,
        text: "",
        visible: selectedPageForProperties.status !== "hidden",
        backgroundColor: "",
        textColor: "",
        borderRadius: "",
        paddingY: "",
      });
    }
  }, [selectedComponent, selectedSection, selectedPageForProperties]);

  async function ensureKnownWebsitePages(currentPages: WebsiteBuilderPageRecord[]) {
    const normalizedSlugs = new Set(currentPages.map((page) => normalizeSlug(page.slug || page.title)));
    const createdPages: WebsiteBuilderPageRecord[] = [];

    for (const blueprint of sitePageBlueprints) {
      if (normalizedSlugs.has(blueprint.slug)) continue;

      try {
        const response = await createWebsiteBuilderPage(websiteId, {
          title: blueprint.title,
          slug: blueprint.slug,
          page_type: blueprint.pageType,
          status: "draft",
          sort_order: currentPages.length + createdPages.length,
          seo_json: {},
          settings_json: { preview_path: blueprint.previewPath },
        });
        createdPages.push(response.page);
        normalizedSlugs.add(blueprint.slug);
      } catch {
        // Em preview/protecao, o editor continua com as paginas que o backend retornou.
      }
    }

    return [...currentPages, ...createdPages].sort((left, right) => {
      const orderLeft = typeof left.sortOrder === "number" ? left.sortOrder : 999;
      const orderRight = typeof right.sortOrder === "number" ? right.sortOrder : 999;
      return orderLeft - orderRight || left.title.localeCompare(right.title);
    });
  }

  async function handleDiscoveredPages(discoveredPages: DiscoveredSitePage[]) {
    if (!discoveredPages.length) return;

    setPagePreviewPaths((current) => {
      const next = { ...current };
      discoveredPages.forEach((page) => {
        next[page.slug] = page.previewPath;
      });
      return next;
    });

    const existingSlugs = new Set(pages.map((page) => normalizeSlug(page.slug || page.title)));
    const createdPages: WebsiteBuilderPageRecord[] = [];

    for (const discovered of discoveredPages) {
      if (existingSlugs.has(discovered.slug)) continue;
      try {
        const response = await createWebsiteBuilderPage(websiteId, {
          title: discovered.title,
          slug: discovered.slug,
          page_type: discovered.pageType,
          status: "draft",
          sort_order: pages.length + createdPages.length,
          seo_json: {},
          settings_json: { preview_path: discovered.previewPath },
        });
        createdPages.push(response.page);
        existingSlugs.add(discovered.slug);
      } catch {
        // Se a API estiver protegida, mantemos a descoberta apenas no mapa visual do editor.
      }
    }

    if (createdPages.length) {
      setPages((current) => [...current, ...createdPages]);
    }
  }

  async function handleCreatePage() {
    const title = window.prompt("Nome da nova pagina");
    if (!title?.trim()) return;

    const slugPrompt = window.prompt("Slug da pagina", normalizeSlug(title));
    const slug = normalizeSlug(slugPrompt || title);
    if (!slug) return;

    setIsBusy(true);
    try {
      const response = await createWebsiteBuilderPage(websiteId, {
        title: title.trim(),
        slug,
        page_type: "custom",
        status: "draft",
        sort_order: pages.length,
        seo_json: {},
        settings_json: {},
      });
      setPages((current) => [...current, response.page]);
      setSelectedPageId(response.page.id);
      selectBuilderNode({ type: "page", id: response.page.id });
      await loadPageStructure(response.page.id);
    } finally {
      setIsBusy(false);
    }
  }

  async function loadWebsite() {
    setError(null);
    setIsBusy(true);
    try {
      const [websiteResponse, pageResponse, versionResponse, assetResponse] = await Promise.all([
        getWebsiteBuilderWebsite(websiteId),
        listWebsiteBuilderPages(websiteId),
        listWebsiteBuilderVersions(websiteId),
        listWebsiteBuilderAssets(websiteId),
      ]);
        setWebsite(websiteResponse.website);
        const preparedPages = await ensureKnownWebsitePages(pageResponse.pages);
        const pagesForEditor = preparedPages.length ? preparedPages : [createEditorFallbackHomePage(websiteResponse.website.id || websiteId)];
        setPages(pagesForEditor);
        setPagePreviewPaths((current) => ({
          ...blueprintPreviewPathMap(),
          home: defaultPublicSitePreviewUrl,
          "pagina-inicial": defaultPublicSitePreviewUrl,
          ...previewPathMapFromPages(pagesForEditor),
          ...current,
        }));
      setVersions(versionResponse.versions);
      setAssets(assetResponse.assets);
        const currentPageStillExists = Boolean(selectedPageId && pagesForEditor.some((page) => page.id === selectedPageId));
        const firstPageId = currentPageStillExists ? selectedPageId : pagesForEditor[0]?.id || "";
      setSelectedPageId(firstPageId);
      if (firstPageId) {
        selectBuilderNode({ type: "page", id: firstPageId });
        await loadPageStructure(firstPageId);
      }
      void loadPublishedProperties();
      void loadPublicSitePreviewUrl();
    } catch (loadError) {
      ensureEditorFallbackState();
      setError(null);
    } finally {
      setIsBusy(false);
    }
  }

  async function loadPublicSitePreviewUrl() {
    try {
      const response = await getSiteSettings();
      const slug = response.site?.slug;
      setPublicSitePreviewUrl(slug ? `/site/${slug}#topo` : defaultPublicSitePreviewUrl);
    } catch {
      setPublicSitePreviewUrl(defaultPublicSitePreviewUrl);
    }
  }

  async function loadPageStructure(pageId: string) {
    setError(null);
    const sectionResponse = await listWebsiteBuilderSections(pageId);
    setSections(sectionResponse.sections);

    const entries = await Promise.all(
      sectionResponse.sections.map(async (section) => {
        const componentResponse = await listWebsiteBuilderComponents(section.id);
        return [section.id, componentResponse.components] as const;
      }),
    );

    setComponentsBySection(Object.fromEntries(entries));
  }

  async function loadVersions() {
    const response = await listWebsiteBuilderVersions(websiteId);
    setVersions(response.versions);
  }

  async function loadAssets() {
    const response = await listWebsiteBuilderAssets(websiteId);
    setAssets(response.assets);
  }

  async function loadPublishedProperties() {
    try {
      const response = await listAllPropertyDetails();
      setSiteProperties(
        response.properties
          .filter((property) => property.status === "available" || Boolean(property.published_at))
          .slice(0, 6),
      );
    } catch {
      setSiteProperties([]);
    }
  }

  async function handleAddPage() {
    if (!website) return;

    setIsBusy(true);
    setError(null);

    try {
      const nextNumber = pages.length + 1;
      const response = await createWebsiteBuilderPage(website.id, {
        title: `Nova página ${nextNumber}`,
        slug: normalizeSlug(`pagina-${nextNumber}`),
        page_type: "custom",
        status: "draft",
        sort_order: pages.length,
      });
      setPages((current) => [...current, response.page]);
      setSelectedPageId(response.page.id);
      selectBuilderNode({ type: "page", id: response.page.id });
      setSections([]);
      setComponentsBySection({});
      await loadVersions();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Não foi possível criar a página.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleAddSection() {
    if (!selectedPage) return;
    if (editorLiveSiteUrl || publicSitePreviewUrl || readRecordString(website?.settingsJson ?? {}, "external_preview_url")) {
      updateDomElementDraft({
        insertHtml: libraryBlockHtml(
          {
            name: "Secao vazia",
            category: "Layout",
            description: "Secao vazia para ordenar, editar e montar livremente.",
            kind: "section",
            sectionType: "empty_section",
            tags: ["secao", "vazia", "layout"],
          },
          siteProperties,
          website?.name ?? "Site da imobiliaria",
          website?.id ?? websiteId,
        ),
        insertPlacement: selectedDomElement ? "afterend" : "beforeend",
      });
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const response = await createWebsiteBuilderSection(selectedPage.id, {
        name: "Nova seção",
        section_type: "content",
        sort_order: sections.length,
        props_json: { title: "Nova seção" },
      });
      selectBuilderNode({ type: "section", id: response.section.id });
      await loadPageStructure(selectedPage.id);
      await loadVersions();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Não foi possível criar a seção.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleAddComponent(section: WebsiteBuilderSection, componentType = "text") {
    setIsBusy(true);
    setError(null);
    try {
      const current = componentsBySection[section.id] ?? [];
      const preset = componentPreset(componentType);
      const response = await createWebsiteBuilderComponent(section.id, {
        name: preset.name,
        component_type: preset.componentType,
        sort_order: current.length,
        props_json: preset.propsJson,
      });
      selectBuilderNode({ type: "component", id: response.component.id });
      await loadPageStructure(section.pageId);
      await loadVersions();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Não foi possível criar o componente.");
    } finally {
      setIsBusy(false);
    }
  }

  async function saveCurrentProperties() {
    if (!selection) return;

    setIsBusy(true);
    setError(null);

    try {
      if (selection.type === "page" && selectedPageForProperties) {
        await updateWebsiteBuilderPage(selection.id, {
          title: propertyForm.name,
          slug: normalizeSlug(propertyForm.slug || propertyForm.name),
          page_type: propertyForm.type as WebsiteBuilderPageRecord["pageType"],
          status: propertyForm.visible ? selectedPageForProperties.status === "hidden" ? "draft" : selectedPageForProperties.status : "hidden",
        });
        await loadWebsite();
        await loadVersions();
      }

      if (selection.type === "section" && selectedSection) {
        await updateWebsiteBuilderSection(selection.id, {
          name: propertyForm.name,
          section_type: propertyForm.type || selectedSection.sectionType,
          is_visible: propertyForm.visible,
          props_json: { ...selectedSection.propsJson, title: propertyForm.text },
          style_json: mergeStyleJson(selectedSection.styleJson, propertyForm),
        });
        await loadPageStructure(selectedSection.pageId);
        await loadVersions();
      }

      if (selection.type === "component" && selectedComponent) {
        await updateWebsiteBuilderComponent(selection.id, {
          name: propertyForm.name,
          component_type: propertyForm.type || selectedComponent.componentType,
          is_visible: propertyForm.visible,
          props_json: {
            ...selectedComponent.propsJson,
            [componentTextKey(selectedComponent)]: propertyForm.text,
          },
          style_json: mergeStyleJson(selectedComponent.styleJson, propertyForm),
        });
        await loadPageStructure(selectedComponent.pageId);
        await loadVersions();
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar as propriedades.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSaveProperties(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveCurrentProperties();
  }

  async function handleSaveTheme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!website) return;

    setIsBusy(true);
    setError(null);

    try {
      const response = await updateWebsiteBuilderWebsite(website.id, {
        theme_json: mergeWebsiteTheme(website.themeJson, themeForm),
      });
      setWebsite(response.website);
      await loadVersions();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o tema global.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRestoreVersion(version: WebsiteBuilderVersion) {
    setIsBusy(true);
    setError(null);
    try {
      await restoreWebsiteBuilderVersion(websiteId, version.id);
      await loadWebsite();
      await loadVersions();
      if (selectedPageId) await loadPageStructure(selectedPageId);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Não foi possível restaurar esta versão.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleAddLibraryItem(item: BuilderLibraryItem) {
    setError(null);

    const hasLiveEditor = Boolean(editorLiveSiteUrl || publicSitePreviewUrl || readRecordString(website?.settingsJson ?? {}, "external_preview_url"));
    if (hasLiveEditor && selectedDomElement && isVisualEffectLibraryItem(item)) {
      updateDomElementDraft(libraryDomElementPatch(item, selectedDomElement.kind));
      return;
    }

    if (hasLiveEditor) {
      const insertMode = isSectionLibraryItem(item) ? "section" : "component";
      updateDomElementDraft({
        insertHtml: libraryBlockHtml(item, siteProperties, website?.name ?? "Site da imobiliaria", website?.id ?? websiteId),
        insertPlacement: selectedDomElement ? "afterend" : "beforeend",
        insertMode,
      });
      return;
    }

    let targetPage = selectedPage ?? pages[0] ?? null;
    if (!targetPage) {
      if (!website) {
        setError("Aguarde o site carregar para adicionar itens da biblioteca.");
        return;
      }

      setIsBusy(true);
      try {
        const response = await createWebsiteBuilderPage(website.id, {
          title: "Página inicial",
          slug: "home",
          page_type: "home",
          status: "draft",
          sort_order: 0,
        });
        targetPage = response.page;
        setPages([response.page]);
        setSelectedPageId(response.page.id);
        setSections([]);
        setComponentsBySection({});
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : "Não foi possível criar a página automaticamente.");
        return;
      } finally {
        setIsBusy(false);
      }
    }

    const createdAt = new Date().toISOString();
    const localId = `${item.kind === "component" ? "component" : "section"}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const baseSection: WebsiteBuilderSection = {
      id: localId,
      companyId: targetPage.companyId,
      websiteId: targetPage.websiteId,
      pageId: targetPage.id,
      name: item.name,
      sectionType: item.sectionType ?? (slugifyBuilderType(item.name) || "content"),
      sortOrder: sections.length,
      propsJson: {
        title: item.name,
        description: item.description,
        source: "builder_library",
      },
      styleJson: builderLibrarySectionStyle(item),
      responsiveJson: {},
      animationJson: builderLibraryAnimationPreset(item),
      isVisible: true,
      createdAt,
      updatedAt: createdAt,
    };

    if (item.kind !== "component") {
      const starterComponents = createLibraryStarterComponents(baseSection, item, createdAt);
      setSections((current) => [...current, baseSection]);
      setComponentsBySection((current) => ({ ...current, [baseSection.id]: starterComponents }));
      selectBuilderNode({ type: "section", id: baseSection.id });
      return;
    }

    let targetSection = selectedSection ?? sections[0] ?? null;
    let createdContainer: WebsiteBuilderSection | null = null;
    if (!targetSection) {
      createdContainer = {
        ...baseSection,
        id: `section_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: "Secao livre",
        sectionType: "freeform",
        propsJson: { title: "Secao livre", source: "builder_library" },
      };
      targetSection = createdContainer;
    }

    const currentComponents = componentsBySection[targetSection.id] ?? [];
    const preset = componentPreset(item.componentType ?? "text");
    const component: WebsiteBuilderComponent = {
      id: localId,
      companyId: targetSection.companyId,
      websiteId: targetSection.websiteId,
      pageId: targetSection.pageId,
      sectionId: targetSection.id,
      parentComponentId: null,
      name: item.name,
      componentType: item.componentType ?? preset.componentType,
      sortOrder: currentComponents.length,
      propsJson: {
        ...preset.propsJson,
        text: item.name,
        label: item.name,
        title: item.name,
        description: item.description,
        source: "builder_library",
      },
      styleJson: builderLibraryComponentStyle(item),
      responsiveJson: {},
      animationJson: builderLibraryAnimationPreset(item),
      interactionJson: {},
      isVisible: true,
      isLocked: false,
      createdAt,
      updatedAt: createdAt,
    };

    if (createdContainer) {
      setSections((current) => [...current, createdContainer]);
    }
    setComponentsBySection((current) => ({
      ...current,
      [targetSection.id]: [...(current[targetSection.id] ?? []), component],
    }));
    selectBuilderNode({ type: "component", id: component.id });
  }

  async function handleUploadAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!website || !selectedAssetFile) return;

    setIsBusy(true);
    setError(null);

    try {
      const content = await readFileAsDataUrl(selectedAssetFile);
      await requestWebsiteBuilderAssetUpload({
        website_id: website.id,
        asset_type: inferAssetType(selectedAssetFile),
        file_name: selectedAssetFile.name,
        mime_type: selectedAssetFile.type || "application/octet-stream",
        file_size: selectedAssetFile.size,
        content_base64: content,
        metadata_json: {
          originalName: selectedAssetFile.name,
          uploadedFrom: "website_builder_editor",
        },
      });

      setSelectedAssetFile(null);
      setAssetInputKey((current) => current + 1);
      await loadAssets();
      await loadVersions();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Nao foi possivel enviar o arquivo para o storage.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteAsset(asset: WebsiteBuilderAsset) {
    setIsBusy(true);
    setError(null);

    try {
      await deleteWebsiteBuilderAsset(asset.id);
      await loadAssets();
      await loadVersions();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Não foi possível remover o asset.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleApplyAsset(asset: WebsiteBuilderAsset) {
    if (!selection || asset.status !== "uploaded" || !asset.publicUrl) return;

    setIsBusy(true);
    setError(null);

    try {
      if (selection.type === "section" && selectedSection) {
        await updateWebsiteBuilderSection(selectedSection.id, {
          name: selectedSection.name,
          section_type: selectedSection.sectionType,
          props_json: {
            ...selectedSection.propsJson,
            backgroundAssetId: asset.id,
            backgroundUrl: asset.publicUrl,
            backgroundFileName: asset.fileName,
          },
        });
        await loadPageStructure(selectedSection.pageId);
        await loadVersions();
      }

      if (selection.type === "component" && selectedComponent) {
        await updateWebsiteBuilderComponent(selectedComponent.id, {
          name: selectedComponent.name,
          component_type: selectedComponent.componentType,
          props_json: mergeComponentAssetProps(selectedComponent.propsJson, asset),
        });
        await loadPageStructure(selectedComponent.pageId);
        await loadVersions();
      }
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Não foi possível aplicar o asset selecionado.");
    } finally {
      setIsBusy(false);
    }
  }

  function updatePropertyDraft(patch: Partial<EditorPropertyForm>) {
    setFormUndoStack((stack) => [...stack, propertyForm].slice(-30));
    setFormRedoStack([]);
    setPropertyForm((current) => ({ ...current, ...patch }));
  }

  function updateThemeDraft(patch: Partial<ThemeForm>) {
    setThemeForm((current) => ({ ...current, ...patch }));
  }

  function handleUndoDraft() {
    const previous = formUndoStack.at(-1);
    if (!previous) return;

    setFormUndoStack((stack) => stack.slice(0, -1));
    setFormRedoStack((stack) => [propertyForm, ...stack].slice(0, 30));
    setPropertyForm(previous);
  }

  function handleRedoDraft() {
    const next = formRedoStack[0];
    if (!next) return;

    setFormRedoStack((stack) => stack.slice(1));
    setFormUndoStack((stack) => [...stack, propertyForm].slice(-30));
    setPropertyForm(next);
  }

  async function handleDeleteSelection() {
    if (!selection) return;

    if (selection.type === "page" && pages.length <= 1) {
      setError("O site precisa manter pelo menos uma página.");
      return;
    }

    const confirmDelete = window.confirm("Deseja remover o item selecionado?");
    if (!confirmDelete) return;

    setIsBusy(true);
    setError(null);

    try {
      if (selection.type === "component" && selectedComponent) {
        await deleteWebsiteBuilderComponent(selectedComponent.id);
        await loadPageStructure(selectedComponent.pageId);
      }

      if (selection.type === "section" && selectedSection) {
        await deleteWebsiteBuilderSection(selectedSection.id);
        await loadPageStructure(selectedSection.pageId);
      }

      if (selection.type === "page" && selectedPageForProperties) {
        await deleteWebsiteBuilderPage(selectedPageForProperties.id);
        await loadWebsite();
      }

      selectBuilderNode(null);
      await loadVersions();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Não foi possível remover o item selecionado.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDropSectionAtIndex(targetIndex: number) {
    if (dragState?.type !== "section") {
      setDragState(null);
      return;
    }

    const reordered = moveByIdToIndex(sections, dragState.id, targetIndex);
    if (!reordered) {
      setDragState(null);
      return;
    }

    await persistSectionOrder(reordered);
  }

  async function handleDropSection(targetSectionId: string) {
    if (dragState?.type !== "section" || dragState.id === targetSectionId) {
      setDragState(null);
      return;
    }

    const reordered = moveById(sections, dragState.id, targetSectionId);
    if (!reordered) {
      setDragState(null);
      return;
    }

    setSections(reordered.map((section, index) => ({ ...section, sortOrder: index })));
    await persistSectionOrder(reordered);
  }

  async function persistSectionOrder(reordered: WebsiteBuilderSection[]) {
    setSections(reordered.map((section, index) => ({ ...section, sortOrder: index })));
    setIsBusy(true);
    setError(null);

    try {
      await Promise.all(
        reordered.map((section, index) =>
          updateWebsiteBuilderSection(section.id, {
            name: section.name,
            section_type: section.sectionType,
            sort_order: index,
          }),
        ),
      );
      if (selectedPage) await loadPageStructure(selectedPage.id);
      await loadVersions();
    } catch (dropError) {
      setError(dropError instanceof Error ? dropError.message : "Não foi possível reordenar as seções.");
      if (selectedPage) await loadPageStructure(selectedPage.id);
    } finally {
      setIsBusy(false);
      setDragState(null);
    }
  }

  async function handleDropComponentAtIndex(targetSectionId: string, targetIndex: number) {
    if (dragState?.type !== "component" || dragState.sectionId !== targetSectionId) {
      setDragState(null);
      return;
    }

    const current = componentsBySection[targetSectionId] ?? [];
    const reordered = moveByIdToIndex(current, dragState.id, targetIndex);
    if (!reordered) {
      setDragState(null);
      return;
    }

    await persistComponentOrder(targetSectionId, reordered);
  }

  async function handleDropComponent(targetSectionId: string, targetComponentId: string) {
    if (dragState?.type !== "component" || dragState.sectionId !== targetSectionId || dragState.id === targetComponentId) {
      setDragState(null);
      return;
    }

    const current = componentsBySection[targetSectionId] ?? [];
    const reordered = moveById(current, dragState.id, targetComponentId);
    if (!reordered) {
      setDragState(null);
      return;
    }

    await persistComponentOrder(targetSectionId, reordered);
  }

  async function persistComponentOrder(targetSectionId: string, reordered: WebsiteBuilderComponent[]) {
    setComponentsBySection((state) => ({
      ...state,
      [targetSectionId]: reordered.map((component, index) => ({ ...component, sortOrder: index })),
    }));
    setIsBusy(true);
    setError(null);

    try {
      await Promise.all(
        reordered.map((component, index) =>
          updateWebsiteBuilderComponent(component.id, {
            name: component.name,
            component_type: component.componentType,
            sort_order: index,
          }),
        ),
      );
      const target = sections.find((section) => section.id === targetSectionId);
      if (target) await loadPageStructure(target.pageId);
      await loadVersions();
    } catch (dropError) {
      setError(dropError instanceof Error ? dropError.message : "Não foi possível reordenar os componentes.");
      const target = sections.find((section) => section.id === targetSectionId);
      if (target) await loadPageStructure(target.pageId);
    } finally {
      setIsBusy(false);
      setDragState(null);
    }
  }

  if (isLoading && !authFallbackReady && !website) {
    return <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm text-white/70">Validando acesso...</main>;
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-neutral-950 text-white">
      <header className="z-40 shrink-0 border-b border-white/10 bg-neutral-950/95 px-4 py-3 backdrop-blur">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" asChild>
            <Link to="/app/site/builder">
              <ArrowLeft className="size-4" />
              Builder
            </Link>
          </Button>
          <Button
            type="button"
            size="sm"
            className="border border-amber-300/70 bg-amber-400 text-neutral-950 shadow-sm hover:bg-amber-300 hover:text-neutral-950"
            asChild
          >
            <Link to="/app/site/builder/editor/$websiteId/code" params={{ websiteId }}>
              <Code2 className="size-4" />
              Código
            </Link>
          </Button>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">Fase 2 - Editor visual</p>
            <h1 className="text-lg font-semibold">{website?.name ?? "Website Builder"}</h1>
          </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9 border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white disabled:opacity-40"
              onClick={() => (editorLiveSiteUrl ? sendCanvasCommand("undo") : handleUndoDraft())}
              disabled={!editorLiveSiteUrl && formUndoStack.length === 0}
              title="Desfazer última alteração"
            >
              <Undo2 className="size-4" />
            </Button>
            <div className="inline-flex overflow-hidden rounded-md border border-white/15 bg-neutral-900 shadow-sm">
              <select
                className="h-9 min-w-[210px] border-0 bg-transparent px-3 text-sm font-medium text-white outline-none transition focus:bg-white/5"
                value={selectedPageId}
                onChange={(event) => {
                  setSelectedPageId(event.target.value);
                  selectBuilderNode({ type: "page", id: event.target.value });
                }}
              >
                {pages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.title}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="icon"
                className="h-9 w-10 rounded-none border-l border-white/15 bg-violet-600 text-white shadow-none hover:bg-violet-500 hover:text-white"
                onClick={() => setViewport(nextViewport(viewport))}
                title={`Visualização: ${viewportLabel(viewport)}`}
              >
                <CurrentViewportIcon className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                className="h-9 w-10 rounded-none border-l border-white/15 bg-neutral-800 text-white shadow-none hover:bg-neutral-700 hover:text-white"
                onClick={() => void handleCreatePage()}
                title="Criar nova pagina"
              >
                <Plus className="size-4" />
              </Button>
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9 border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white disabled:opacity-40"
              onClick={() => (editorLiveSiteUrl ? sendCanvasCommand("redo") : handleRedoDraft())}
              disabled={!editorLiveSiteUrl && formRedoStack.length === 0}
              title="Refazer alteração"
            >
              <Redo2 className="size-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              className="border border-amber-300/60 bg-amber-400 text-neutral-950 shadow-sm hover:bg-amber-300 hover:text-neutral-950"
              onClick={() => sendCanvasCommand("save")}
              disabled={isBusy}
            >
              <Save className="size-4" />
              Salvar
            </Button>
            {editorLiveSiteUrl ||
            isUsableSavedBuilderCanvasHtml(readRecordString(website?.settingsJson ?? {}, "builder_canvas_html")) ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                onClick={handleOpenSavedOrRealSite}
              >
                <ExternalLink className="size-4" />
                Abrir site real
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
              onClick={() => sendCanvasCommand("preview")}
            >
              <Eye className="size-4" />
              Visualizar
            </Button>
          </div>
        </div>
      </header>

      {error ? <div className="border-b border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}

      <section className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[290px_minmax(0,1fr)_330px]">
        <aside className="min-h-0 overflow-y-auto border-b border-white/10 bg-white/[0.03] p-4 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">Estrutura</p>
              <h2 className="text-sm font-semibold">Páginas e blocos</h2>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-white/15 bg-neutral-900 text-white hover:bg-white/10 hover:text-white disabled:bg-neutral-900/60 disabled:text-white/35"
                onClick={() => void handleAddSection()}
                disabled={!selectedPage || isBusy}
              >
                <Plus className="size-4" />
                Seção
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-neutral-950 p-2">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/40 p-1">
              {(["library", "layers", "pages"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setLeftPanelTab(tab)}
                  className={`rounded-lg px-2 py-2 text-[11px] font-black transition ${
                    leftPanelTab === tab ? "bg-amber-400 text-black" : "text-white/55 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {tab === "library" ? "Biblioteca" : tab === "layers" ? "Camadas" : "Páginas"}
                </button>
              ))}
            </div>
          </div>

          {leftPanelTab === "library" ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-neutral-950 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
                  <input
                    value={librarySearch}
                    onChange={(event) => setLibrarySearch(event.target.value)}
                    placeholder="Buscar bloco, texto, botão, imóvel..."
                    className="w-full rounded-xl border border-white/10 bg-black/40 py-2 pl-9 pr-3 text-xs font-semibold text-white outline-none transition placeholder:text-white/35 focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-neutral-950 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Biblioteca enterprise</p>
                    <h3 className="text-sm font-black text-white">Categorias expansíveis</h3>
                  </div>
                  <Sparkles className="size-4 text-amber-300" />
                </div>
                <div className="grid max-h-[calc(100vh-310px)] gap-2 overflow-y-auto pr-1">
                  {groupedBuilderLibraryItems.map((group) => {
                    const forcedOpen = Boolean(librarySearch.trim());
                    const isOpen = forcedOpen || openLibraryCategories.includes(group.category);
                    return (
                      <section key={group.category} className="overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.035]">
                        <button
                          type="button"
                          onClick={() => toggleLibraryCategory(group.category)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-white/[0.06]"
                        >
                          <div>
                            <p className="text-sm font-black text-white">{libraryCategoryLabel(group.category)}</p>
                            <p className="text-[11px] font-semibold text-white/40">{group.items.length} elemento(s)</p>
                          </div>
                          <span
                            className={`grid size-7 place-items-center rounded-full border border-white/10 bg-black/30 text-amber-200 transition ${
                              isOpen ? "rotate-45 border-amber-300 bg-amber-300 text-black" : ""
                            }`}
                          >
                            <Plus className="size-4" />
                          </span>
                        </button>
                        {isOpen ? (
                          <div className="grid gap-2 border-t border-white/10 p-2">
                            {group.items.map((item) => (
                              <button
                                key={`${item.category}-${item.name}-${item.id ?? ""}`}
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleAddLibraryItem(item)}
                                className="group rounded-[18px] border border-white/10 bg-black/25 p-3 text-left shadow-[0_18px_50px_rgba(0,0,0,.16)] transition hover:-translate-y-0.5 hover:border-amber-300/70 hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <LibraryVisualPreview item={item} />
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-black text-white">{item.name}</p>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/45">{item.description}</p>
                                  </div>
                                  <span className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-[10px] font-black uppercase text-amber-200">
                                    {isVisualEffectLibraryItem(item) ? "Efeito" : item.kind === "component" ? "Elemento" : "Bloco"}
                                  </span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-1">
                                  {item.tags.slice(0, 3).map((tag) => (
                                    <span key={tag} className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-white/55">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                                <div className="mt-3 rounded-xl bg-white/[0.06] py-2 text-center text-[11px] font-black text-white transition group-hover:bg-amber-300 group-hover:text-black">
                                  {selectedDomElement && isVisualEffectLibraryItem(item) ? "Aplicar efeito" : "Adicionar ao site"}
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                  {groupedBuilderLibraryItems.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-white/15 p-3 text-xs text-white/45">Nenhum elemento encontrado.</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {leftPanelTab === "layers" ? (
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.07] p-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-200">Camadas reais do canvas</p>
                <p className="mt-1 text-xs leading-relaxed text-white/50">
                  Clique em uma camada para selecionar no site. Use os controles para ocultar, bloquear e ajustar profundidade.
                </p>
              </div>
              <div className="grid max-h-[calc(100vh-260px)] gap-1 overflow-auto pr-1">
                {domLayers.map((layer) => (
                  <article
                    key={layer.selector}
                    className={`rounded-xl border p-2 transition ${
                      selectedDomElement?.selector === layer.selector ? "border-sky-300 bg-sky-400/15" : "border-white/10 bg-neutral-950"
                    }`}
                    style={{ marginLeft: Math.min(layer.depth, 5) * 10 }}
                  >
                    <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => selectCanvasLayer(layer)}>
                      <Layers3 className="size-3.5 shrink-0 text-white/45" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-white">{layer.label}</span>
                        <span className="block truncate text-[11px] text-white/40">
                          {elementKindLabel(layer.kind)} · {layer.tag} · z {layer.zIndex || "auto"}
                        </span>
                      </span>
                    </button>
                    <div className="mt-2 grid grid-cols-4 gap-1">
                      <button
                        type="button"
                        className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/70 hover:bg-white/10"
                        onClick={() => {
                          selectCanvasLayer(layer);
                          updateDomElementDraft({ command: "toggle-hidden", selector: layer.selector });
                        }}
                      >
                        {layer.hidden ? "Exibir" : "Ocultar"}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/70 hover:bg-white/10"
                        onClick={() => {
                          selectCanvasLayer(layer);
                          updateDomElementDraft({ command: "toggle-locked", selector: layer.selector });
                        }}
                      >
                        {layer.locked ? "Desbloq." : "Bloq."}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/70 hover:bg-white/10"
                        onClick={() => {
                          selectCanvasLayer(layer);
                          updateDomElementDraft({ command: "bring-front", selector: layer.selector });
                        }}
                      >
                        Frente
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/70 hover:bg-white/10"
                        onClick={() => {
                          selectCanvasLayer(layer);
                          updateDomElementDraft({ command: "send-back", selector: layer.selector });
                        }}
                      >
                        Trás
                      </button>
                    </div>
                  </article>
                ))}
                {domLayers.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/15 p-3 text-xs text-white/45">
                    As camadas aparecem aqui quando o site real terminar de carregar no canvas.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {leftPanelTab === "pages" ? (
            <div className="mt-4 grid gap-3">
            {pages.map((page) => (
              <button
                key={page.id}
                type="button"
                className={nodeButtonClass(selection?.type === "page" && selection.id === page.id)}
                onClick={() => {
                  setSelectedPageId(page.id);
                  selectBuilderNode({ type: "page", id: page.id });
                }}
              >
                <FileText className="size-4" />
                <span>
                  <span className="block font-medium">{page.title}</span>
                  <span className="block text-xs text-white/45">/{page.slug}</span>
                </span>
              </button>
            ))}

            <div className="mt-2 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs font-semibold leading-relaxed text-amber-50">
              A aba Biblioteca adiciona blocos reais diretamente no site. Esta aba fica focada em paginas e secoes existentes para organizar a estrutura.
            </div>

            <div className="mt-2 border-t border-white/10 pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-white/45">Estrutura atual</p>
              <div className="grid gap-2">
                {sections.map((section) => (
                  <div
                    key={section.id}
                    className="rounded-lg border border-white/10 bg-white/[0.03] p-2"
                    draggable
                    onDragStart={() => setDragState({ type: "section", id: section.id })}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => void handleDropSection(section.id)}
                  >
                    <button
                      type="button"
                      className={nodeButtonClass(selection?.type === "section" && selection.id === section.id)}
                      onClick={() => selectBuilderNode({ type: "section", id: section.id })}
                    >
                      <GripVertical className="size-4 text-white/40" />
                      <Layers3 className="size-4" />
                      <span>
                        <span className="block font-medium">{section.name}</span>
                        <span className="block text-xs text-white/45">{section.sectionType}</span>
                      </span>
                    </button>
                    <div className="mt-2 grid gap-1 pl-4">
                      {(componentsBySection[section.id] ?? []).map((component) => (
                        <button
                          key={component.id}
                          type="button"
                          className={nodeButtonClass(selection?.type === "component" && selection.id === component.id, "py-2 text-xs")}
                          draggable
                          onDragStart={() => setDragState({ type: "component", id: component.id, sectionId: section.id })}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => void handleDropComponent(section.id, component.id)}
                          onClick={() => selectBuilderNode({ type: "component", id: component.id })}
                        >
                          <GripVertical className="size-3.5 text-white/40" />
                          <MousePointer2 className="size-3.5" />
                          <span className="truncate">{component.name}</span>
                        </button>
                      ))}
                      <div className="grid grid-cols-2 gap-1 pt-1">
                        {["heading", "text", "image", "video", "button"].map((componentType) => (
                          <button
                            key={componentType}
                            type="button"
                            className="flex items-center gap-1 rounded-md px-2 py-2 text-left text-[11px] text-white/50 hover:bg-white/10 hover:text-white"
                            onClick={() => void handleAddComponent(section, componentType)}
                          >
                            <Plus className="size-3.5" />
                            {componentTypeLabel(componentType)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                {sections.length === 0 ? <p className="rounded-lg border border-dashed border-white/15 p-3 text-sm text-white/45">Crie a primeira seção para começar.</p> : null}
              </div>
            </div>
          </div>
          ) : null}
        </aside>

        <section className={editorLiveSiteUrl ? "min-h-0 overflow-hidden bg-neutral-900" : "min-h-0 overflow-auto bg-neutral-900 px-4 py-6"}>
          <div className={editorLiveSiteUrl ? liveSiteFrameClass(viewport) : viewportFrameClass(viewport)}>
            <EditorCanvas
              website={websiteWithDraftTheme}
              page={selectedPage}
              sections={sections}
              componentsBySection={componentsBySection}
              properties={siteProperties}
              externalPreviewUrl={readRecordString(website?.settingsJson ?? {}, "external_preview_url")}
              fallbackLiveSiteUrl={publicSitePreviewUrl}
              pagePreviewPaths={pagePreviewPaths}
              selection={selection}
              dragState={dragState}
              onSelect={selectBuilderNode}
              domElementPatch={domElementPatch}
              onDomElementSelect={handleDomElementSelect}
              onDomLayersChange={setDomLayers}
              onDiscoveredPages={(discoveredPages) => void handleDiscoveredPages(discoveredPages)}
              onCanvasSnapshotSave={(snapshotHtml) => void handleCanvasSnapshotSave(snapshotHtml)}
              onSectionDragStart={(sectionId) => setDragState({ type: "section", id: sectionId })}
              onComponentDragStart={(sectionId, componentId) => setDragState({ type: "component", id: componentId, sectionId })}
              onDropSectionAtIndex={(targetIndex) => void handleDropSectionAtIndex(targetIndex)}
              onDropComponentAtIndex={(sectionId, targetIndex) => void handleDropComponentAtIndex(sectionId, targetIndex)}
              onDragEnd={() => setDragState(null)}
            />
          </div>
        </section>

        <aside className="min-h-0 overflow-y-auto border-t border-white/10 bg-white/[0.04] p-4 xl:border-l xl:border-t-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">Propriedades</p>
              <h2 className="text-sm font-semibold">{selectedDomElement ? domElementTitle(selectedDomElement) : selectionLabel(selection)}</h2>
            </div>
            {isBusy ? <Loader2 className="size-4 animate-spin text-white/55" /> : null}
          </div>

          {selectedDomElement ? (
            <DomElementPropertiesPanel
              element={selectedDomElement}
              pages={pages}
              onChange={updateDomElementDraft}
              codeEditorPath={`/app/site/builder/editor/${websiteId}/code`}
            />
          ) : null}

          <form onSubmit={handleSaveTheme} className="mb-4 rounded-lg border border-white/10 bg-neutral-950 p-3">
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Tema global</p>
              <p className="mt-1 text-xs text-white/45">Salva em theme_json no MySQL e atualiza o canvas em tempo real.</p>
            </div>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <EditorField label="Fundo" value={themeForm.background} onChange={(background) => updateThemeDraft({ background })} placeholder="#080806" />
                <EditorField label="Texto" value={themeForm.foreground} onChange={(foreground) => updateThemeDraft({ foreground })} placeholder="#ffffff" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <EditorField label="Dourado" value={themeForm.primary} onChange={(primary) => updateThemeDraft({ primary })} placeholder="#c8a24b" />
                <EditorField label="Secundária" value={themeForm.secondary} onChange={(secondary) => updateThemeDraft({ secondary })} placeholder="#111827" />
              </div>
              <EditorField label="Cor neutra" value={themeForm.muted} onChange={(muted) => updateThemeDraft({ muted })} placeholder="#737373" />
              <div className="grid grid-cols-2 gap-3">
                <EditorField label="Fonte títulos" value={themeForm.headingFont} onChange={(headingFont) => updateThemeDraft({ headingFont })} placeholder="Inter" />
                <EditorField label="Fonte textos" value={themeForm.bodyFont} onChange={(bodyFont) => updateThemeDraft({ bodyFont })} placeholder="Inter" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <EditorField label="Raio cards" value={themeForm.cardRadius} onChange={(cardRadius) => updateThemeDraft({ cardRadius })} placeholder="16" />
                <EditorField label="Raio botões" value={themeForm.buttonRadius} onChange={(buttonRadius) => updateThemeDraft({ buttonRadius })} placeholder="999" />
              </div>
              <Button type="submit" size="sm" disabled={!website || isBusy}>
                <Save className="size-4" />
                Salvar tema
              </Button>
            </div>
          </form>

          <section className="mb-4 rounded-lg border border-white/10 bg-neutral-950 p-3">
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Biblioteca de imagens e vídeos</p>
              <p className="mt-1 text-xs text-white/45">Envie arquivos para usar em botoes, fundos, imagens e secoes do site. O storage configurado mantem os assets fora do navegador.</p>
            </div>
            <form onSubmit={handleUploadAsset} className="grid gap-3">
              <label className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-3 text-sm text-white/65">
                <span className="mb-2 flex items-center gap-2 font-medium text-white/75">
                  <Upload className="size-4" />
                  Selecionar arquivo
                </span>
                <input
                  key={assetInputKey}
                  type="file"
                  className="w-full text-xs text-white/60 file:mr-3 file:rounded-md file:border-0 file:bg-amber-400 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-neutral-950"
                  accept="image/*,video/*,.pdf,.doc,.docx,.csv,.xls,.xlsx"
                  onChange={(event) => setSelectedAssetFile(event.target.files?.[0] ?? null)}
                />
                {selectedAssetFile ? <span className="mt-2 block text-xs text-white/45">{formatFileSize(selectedAssetFile.size)}</span> : null}
              </label>
              <Button type="submit" size="sm" disabled={!selectedAssetFile || !website || isBusy}>
                <Upload className="size-4" />
                Enviar para storage
              </Button>
            </form>
            <div className="mt-3 grid max-h-44 gap-2 overflow-auto pr-1">
              {assets.slice(0, 8).map((asset) => (
                <article key={asset.id} className="grid gap-2 rounded-md border border-white/10 bg-white/[0.03] p-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {asset.assetType === "video" ? <Video className="size-4 shrink-0 text-white/45" /> : <Image className="size-4 shrink-0 text-white/45" />}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-white">{asset.fileName}</p>
                      <p className="text-[11px] text-white/45">
                        {asset.assetType} · {asset.status}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleApplyAsset(asset)}
                      disabled={isBusy || !selection || selection.type === "page" || asset.status !== "uploaded" || !asset.publicUrl}
                    >
                      Aplicar
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleDeleteAsset(asset)} disabled={isBusy}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </article>
              ))}
              {assets.length === 0 ? <p className="rounded-md border border-dashed border-white/15 p-3 text-xs text-white/45">Nenhum asset enviado ainda.</p> : null}
            </div>
          </section>

          {selection ? (
            <form onSubmit={handleSaveProperties} className="grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleUndoDraft} disabled={formUndoStack.length === 0}>
                  <Undo2 className="size-4" />
                  Desfazer
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleRedoDraft} disabled={formRedoStack.length === 0}>
                  <Redo2 className="size-4" />
                  Refazer
                </Button>
              </div>
              <EditorField label="Nome" value={propertyForm.name} onChange={(name) => updatePropertyDraft({ name })} />
              {selection.type === "page" ? (
                <EditorField label="Slug" value={propertyForm.slug} onChange={(slug) => updatePropertyDraft({ slug: normalizeSlug(slug) })} />
              ) : null}
              <EditorField label="Tipo" value={propertyForm.type} onChange={(type) => updatePropertyDraft({ type })} />
              {selection.type !== "page" ? (
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-white/75">Texto principal</span>
                  <textarea
                    className="min-h-32 w-full resize-y rounded-md border border-white/15 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                    value={propertyForm.text}
                    onChange={(event) => updatePropertyDraft({ text: event.target.value })}
                  />
                </label>
              ) : null}
              {selection.type !== "page" ? (
                <section className="rounded-lg border border-white/10 bg-neutral-950 p-3">
                  <div className="mb-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Design básico</p>
                    <p className="mt-1 text-xs text-white/45">Esses campos já salvam em style_json no MySQL.</p>
                  </div>
                  <div className="grid gap-3">
                    <EditorField
                      label="Cor de fundo"
                      value={propertyForm.backgroundColor}
                      onChange={(backgroundColor) => updatePropertyDraft({ backgroundColor })}
                      placeholder="#111827"
                    />
                    <EditorField
                      label="Cor do texto"
                      value={propertyForm.textColor}
                      onChange={(textColor) => updatePropertyDraft({ textColor })}
                      placeholder="#ffffff"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <EditorField
                        label="Raio"
                        value={propertyForm.borderRadius}
                        onChange={(borderRadius) => updatePropertyDraft({ borderRadius })}
                        placeholder="12"
                      />
                      <EditorField
                        label="Espaço vertical"
                        value={propertyForm.paddingY}
                        onChange={(paddingY) => updatePropertyDraft({ paddingY })}
                        placeholder="48"
                      />
                    </div>
                  </div>
                </section>
              ) : null}
              <label className="flex items-center gap-2 rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white/75">
                <input
                  type="checkbox"
                  checked={propertyForm.visible}
                  onChange={(event) => updatePropertyDraft({ visible: event.target.checked })}
                />
                Visível no site
              </label>
              <Button type="submit" disabled={isBusy}>
                <Save className="size-4" />
                Salvar no MySQL
              </Button>
            </form>
          ) : selectedDomElement ? null : (
            <p className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-white/50">
              Clique em uma página, seção ou componente para editar.
            </p>
          )}

          <section className="mt-4 rounded-lg border border-white/10 bg-neutral-950 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Histórico MySQL</p>
                <p className="mt-1 text-xs text-white/45">Últimas versões persistidas no banco.</p>
              </div>
              <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-white/50">{versions.length}</span>
            </div>
            <div className="grid max-h-52 gap-2 overflow-auto pr-1">
              {versions.slice(0, 8).map((version) => (
                <button
                  key={version.id}
                  type="button"
                  className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition hover:border-amber-300/45 hover:bg-amber-300/10"
                  onClick={() => void handleRestoreVersion(version)}
                  disabled={isBusy}
                  title="Restaurar o builder para esta versão"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">Versão {version.versionNumber}</p>
                    <time className="text-[11px] text-white/40">{formatDateTime(version.createdAt)}</time>
                  </div>
                  <p className="mt-1 text-xs text-white/50">{version.label ?? "Alteração salva"}</p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200">Restaurar esta versão</p>
                </button>
              ))}
              {versions.length === 0 ? <p className="rounded-md border border-dashed border-white/15 p-3 text-xs text-white/45">Nenhuma versão salva ainda.</p> : null}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function EditorCanvas({
  website,
  page,
  sections,
  componentsBySection,
  properties,
  externalPreviewUrl,
  fallbackLiveSiteUrl,
  pagePreviewPaths,
  selection,
  dragState,
  onSelect,
  domElementPatch,
  onDomElementSelect,
  onDomLayersChange,
  onDiscoveredPages,
  onCanvasSnapshotSave,
  onSectionDragStart,
  onComponentDragStart,
  onDropSectionAtIndex,
  onDropComponentAtIndex,
  onDragEnd,
}: {
  website: WebsiteBuilderWebsite | null;
  page: WebsiteBuilderPageRecord | null;
  sections: WebsiteBuilderSection[];
  componentsBySection: Record<string, WebsiteBuilderComponent[]>;
  properties: Property[];
  externalPreviewUrl?: string;
  fallbackLiveSiteUrl?: string;
  pagePreviewPaths: Record<string, string>;
  selection: Selection | null;
  dragState: DragState;
  onSelect: (selection: Selection) => void;
  domElementPatch: DomElementPatch | null;
  onDomElementSelect: (element: InspectedElement) => void;
  onDomLayersChange: (layers: DomLayerNode[]) => void;
  onDiscoveredPages: (pages: DiscoveredSitePage[]) => void;
  onCanvasSnapshotSave: (snapshotHtml: string) => void;
  onSectionDragStart: (sectionId: string) => void;
  onComponentDragStart: (sectionId: string, componentId: string) => void;
  onDropSectionAtIndex: (targetIndex: number) => void;
  onDropComponentAtIndex: (sectionId: string, targetIndex: number) => void;
  onDragEnd: () => void;
}) {
  const theme = website?.themeJson ?? {};
  const colors = isRecord(theme.colors) ? theme.colors : {};
  const fonts = isRecord(theme.fonts) ? theme.fonts : {};
  const radius = isRecord(theme.radius) ? theme.radius : {};
  const primary = readRecordString(colors, "primary") || "#c8a24b";
  const background = readRecordString(colors, "background") || "#080806";
  const foreground = readRecordString(colors, "foreground") || "#ffffff";
  const headingFont = readRecordString(fonts, "heading") || undefined;
  const bodyFont = readRecordString(fonts, "body") || undefined;
  const cardRadius = numericOrUndefined(readRecordNumberString(radius, "cards")) ?? 16;
  const buttonRadius = numericOrUndefined(readRecordNumberString(radius, "buttons")) ?? 999;
  const liveEditorUrl = resolveLiveEditorUrlForPage(website, externalPreviewUrl, fallbackLiveSiteUrl, page, pagePreviewPaths);
  const safeLiveEditorUrl = isBuilderSafeSitePreviewUrl(liveEditorUrl) ? liveEditorUrl : defaultPublicSitePreviewUrl;
  const canShowLiveSite = Boolean(safeLiveEditorUrl);
  const shouldRenderImportedSnapshot =
    !canShowLiveSite &&
    (website?.settingsJson.import_mode === "project_package" ||
      website?.settingsJson.import_source === "local_folder");

  if (canShowLiveSite || shouldRenderImportedSnapshot) {
    return (
      <div className="h-full overflow-hidden bg-white">
        {shouldRenderImportedSnapshot ? (
          <ImportedSiteSnapshot
            website={website}
            page={page}
            sections={sections}
            componentsBySection={componentsBySection}
            primary={primary}
            headingFont={headingFont}
          />
        ) : (
          <LiveSiteInspectorFrame
            src={safeLiveEditorUrl}
            codeEditorUrl={`/app/site/builder/editor/${website?.id ?? ""}/code`}
            domElementPatch={domElementPatch}
            onDomElementSelect={onDomElementSelect}
            onDomLayersChange={onDomLayersChange}
            onDiscoveredPages={onDiscoveredPages}
            onCanvasSnapshotSave={onCanvasSnapshotSave}
          />
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 shadow-2xl" style={{ backgroundColor: background, color: foreground, fontFamily: bodyFont }}>
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-5">
        <button type="button" className="text-left" onClick={() => page && onSelect({ type: "page", id: page.id })}>
          <p className="text-xs uppercase tracking-[0.22em]" style={{ color: primary }}>
            Editor visual
          </p>
          <h2 className="mt-1 text-xl font-semibold" style={{ fontFamily: headingFont }}>
            {website?.name ?? "Site sem nome"}
          </h2>
        </button>
        <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/55">/{page?.slug ?? "sem-pagina"}</span>
      </header>

      {sections.length === 0 ? (
        <section className="px-6 py-24 text-center text-sm text-white/60">Esta página ainda não possui seções.</section>
      ) : (
        <>
          <CanvasDropZone
            active={dragState?.type === "section"}
            label="Soltar seção no início"
            onDrop={() => onDropSectionAtIndex(0)}
          />
          {sections.map((section, sectionIndex) => {
          const components = componentsBySection[section.id] ?? [];
          const sectionStyle = buildCanvasStyle(section.styleJson, { paddingY: 48, borderRadius: 0 });
          const sectionBackgroundUrl = readRecordString(section.propsJson, "backgroundUrl");
          return (
            <div key={section.id}>
              <section
                className={canvasSelectionClass(selection?.type === "section" && selection.id === section.id, section.isVisible)}
                style={sectionBackgroundUrl ? withBackgroundImage(sectionStyle, sectionBackgroundUrl) : sectionStyle}
                draggable
                onDragStart={() => onSectionDragStart(section.id)}
                onDragEnd={onDragEnd}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect({ type: "section", id: section.id });
                }}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/55">{section.sectionType}</span>
                  <span className="text-xs text-white/40">Arraste para reorganizar</span>
                  {!section.isVisible ? <span className="text-xs text-white/45">Oculta</span> : null}
                </div>
                {readRecordString(section.propsJson, "title") ? (
                  <h3 className="mb-5 text-2xl font-semibold leading-tight" style={{ fontFamily: headingFont }}>
                    {readRecordString(section.propsJson, "title")}
                  </h3>
                ) : null}
                <CanvasDropZone
                  active={dragState?.type === "component" && dragState.sectionId === section.id}
                  label="Soltar componente no início da seção"
                  compact
                  onDrop={() => onDropComponentAtIndex(section.id, 0)}
                />
                {components.length === 0 ? (
                  <SectionEmptyPreview section={section} primary={primary} cardRadius={cardRadius} properties={properties} />
                ) : (
                  <div className="grid gap-3">
                    {components.map((component, componentIndex) => (
                      <div key={component.id}>
                        <ComponentBlock
                          component={component}
                          primary={primary}
                          headingFont={headingFont}
                          cardRadius={cardRadius}
                          buttonRadius={buttonRadius}
                          selected={selection?.type === "component" && selection.id === component.id}
                          onSelect={() => onSelect({ type: "component", id: component.id })}
                          onDragStart={() => onComponentDragStart(section.id, component.id)}
                          onDragEnd={onDragEnd}
                        />
                        <CanvasDropZone
                          active={dragState?.type === "component" && dragState.sectionId === section.id}
                          label={`Soltar depois de ${component.name}`}
                          compact
                          onDrop={() => onDropComponentAtIndex(section.id, componentIndex + 1)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <CanvasDropZone
                active={dragState?.type === "section"}
                label={`Soltar seção depois de ${section.name}`}
                onDrop={() => onDropSectionAtIndex(sectionIndex + 1)}
              />
            </div>
          );
          })}
        </>
      )}
    </div>
  );
}

function ComponentBlock({
  component,
  primary,
  headingFont,
  cardRadius,
  buttonRadius,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  component: WebsiteBuilderComponent;
  primary: string;
  headingFont?: string;
  cardRadius: number;
  buttonRadius: number;
  selected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const text = readComponentText(component) || component.name;
  const assetUrl = readComponentAssetUrl(component);
  const inlineStyle = buildCanvasStyle(component.styleJson, { paddingY: 16, borderRadius: cardRadius });
  const baseClass = selected
    ? "rounded-lg border border-amber-300 bg-amber-300/10 p-4 ring-2 ring-amber-300/35"
    : component.isVisible
      ? "rounded-lg border border-white/10 bg-white/[0.06] p-4 hover:border-white/25"
      : "rounded-lg border border-dashed border-white/10 bg-white/[0.03] p-4 opacity-60";

  return (
    <button
      type="button"
      className={`${baseClass} text-left transition`}
      style={inlineStyle}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <span className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: primary }}>
        {component.componentType}
      </span>
      {component.componentType === "heading" ? (
        <h3 className="mt-2 text-3xl font-semibold leading-tight" style={{ fontFamily: headingFont }}>
          {text}
        </h3>
      ) : component.componentType === "image" || component.componentType === "video" || (assetUrl && component.componentType !== "button" && component.componentType !== "heading") ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
          {!assetUrl ? (
            <div className="flex h-56 w-full items-center justify-center bg-white/[0.04] text-sm text-white/45">
              Selecione um asset na lateral para preencher esta mídia.
            </div>
          ) : component.componentType === "video" || readRecordString(component.propsJson, "videoUrl") ? (
            <video className="h-56 w-full bg-black object-cover" src={assetUrl} controls />
          ) : (
            <img className="h-56 w-full object-cover" src={assetUrl} alt={readRecordString(component.propsJson, "alt") || component.name} />
          )}
        </div>
      ) : component.componentType === "button" ? (
        <span className="mt-3 inline-flex px-4 py-2 text-sm font-semibold text-neutral-950" style={{ backgroundColor: primary, borderRadius: buttonRadius }}>
          {readRecordString(component.propsJson, "label") || text}
        </span>
      ) : (
        <p className="mt-2 text-sm leading-6 text-white/78">{text}</p>
      )}
    </button>
  );
}

function ImportedSiteSnapshot({
  website,
  page,
  sections,
  componentsBySection,
  primary,
  headingFont,
}: {
  website: WebsiteBuilderWebsite | null;
  page: WebsiteBuilderPageRecord | null;
  sections: WebsiteBuilderSection[];
  componentsBySection: Record<string, WebsiteBuilderComponent[]>;
  primary: string;
  headingFont?: string;
}) {
  const firstSection = sections[0] ?? null;
  const firstComponents = firstSection ? componentsBySection[firstSection.id] ?? [] : [];
  const settings = website?.settingsJson ?? {};
  const importedAssets = readImportedAssets(settings);
  const projectSummary = isRecord(settings.imported_project_summary) ? settings.imported_project_summary : {};
  const importedComponents = readImportedPathList(settings, "imported_component_files").slice(0, 12);
  const importedStyles = readImportedPathList(settings, "imported_style_files").slice(0, 8);
  const importedRoutes = readImportedPathList(settings, "imported_routes").slice(0, 8);
  const heroImage =
    readRecordString(firstSection?.propsJson ?? {}, "backgroundUrl") ||
    importedAssets.find((asset) => asset.url.match(/\.(png|jpe?g|webp|gif|svg)$/i))?.url ||
    "";
  const heading = findComponentByType(firstComponents, "heading")?.propsJson
    ? readRecordString(findComponentByType(firstComponents, "heading")?.propsJson ?? {}, "text")
    : firstSection?.name || website?.name || "Site importado";
  const textComponents = firstComponents
    .filter((component) => component.componentType.includes("text") || component.componentType === "text")
    .slice(0, 3);

  return (
    <div className="bg-[#080806] text-white">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
        <div>
          <p className="text-xs uppercase tracking-[0.28em]" style={{ color: primary }}>
            Site importado do GitHub
          </p>
          <h3 className="mt-1 text-xl font-semibold" style={{ fontFamily: headingFont }}>
            {website?.name ?? "Projeto importado"}
          </h3>
        </div>
        <nav className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.16em] text-white/55">
          <span>Home</span>
          <span>Imóveis</span>
          <span>Sobre</span>
          <span>Contato</span>
        </nav>
      </header>
      <section className="relative min-h-[520px] overflow-hidden px-6 py-20">
        {heroImage ? <img className="absolute inset-0 h-full w-full object-cover opacity-45" src={heroImage} alt="" /> : null}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/25" />
        <div className="relative max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.42em]" style={{ color: primary }}>
            {page?.title ?? "Página importada"}
          </p>
          <h1 className="mt-5 text-5xl font-semibold leading-[0.96] md:text-7xl" style={{ fontFamily: headingFont }}>
            {heading}
          </h1>
          <div className="mt-6 max-w-2xl space-y-3 text-base leading-7 text-white/72">
            {textComponents.length ? (
              textComponents.map((component) => <p key={component.id}>{readComponentText(component)}</p>)
            ) : (
              <p>Estrutura importada do repositório, pronta para ser editada no builder do ImobiFlow.</p>
            )}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <span className="rounded-full px-6 py-3 text-sm font-semibold text-neutral-950" style={{ backgroundColor: primary }}>
              Explorar imóveis
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white">
              Atendimento exclusivo
            </span>
          </div>
        </div>
      </section>
      <section className="grid gap-3 border-t border-white/10 bg-white/[0.03] px-6 py-6 md:grid-cols-4">
        {[
          ["Páginas", readRecordNumberString(projectSummary, "pages") || String(sections.length)],
          ["Componentes", readRecordNumberString(projectSummary, "components") || String(importedComponents.length)],
          ["Estilos", readRecordNumberString(projectSummary, "styles") || String(importedStyles.length)],
          ["Mídias", readRecordNumberString(projectSummary, "assets") || String(importedAssets.length)],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-white/42">{label}</p>
            <p className="mt-2 text-2xl font-semibold" style={{ color: primary }}>
              {value}
            </p>
          </article>
        ))}
      </section>
      {importedAssets.length ? (
        <section className="border-t border-white/10 px-6 py-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em]" style={{ color: primary }}>
                Assets importados
              </p>
              <h4 className="mt-2 text-xl font-semibold">Imagens e mídias detectadas no projeto</h4>
            </div>
            <span className="text-xs text-white/45">{importedAssets.length} arquivo(s)</span>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {importedAssets.slice(0, 8).map((asset) => (
              <article key={asset.path} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                {asset.url.match(/\.(png|jpe?g|webp|gif|svg|avif)$/i) ? (
                  <img className="h-32 w-full object-cover" src={asset.url} alt={asset.path} />
                ) : (
                  <div className="flex h-32 items-center justify-center text-xs text-white/45">Mídia</div>
                )}
                <p className="truncate px-3 py-2 text-xs text-white/58">{asset.path}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section className="grid gap-4 border-t border-white/10 px-6 py-8 md:grid-cols-3">
        {[
          ["Rotas", importedRoutes],
          ["Componentes", importedComponents],
          ["Estilos", importedStyles],
        ].map(([label, paths]) => (
          <article key={label as string} className="rounded-xl border border-white/10 bg-white/[0.05] p-5">
            <p className="text-xs uppercase tracking-[0.18em]" style={{ color: primary }}>
              {label as string}
            </p>
            <div className="mt-3 space-y-2">
              {(paths as string[]).length ? (
                (paths as string[]).slice(0, 6).map((pathName) => (
                  <p key={pathName} className="truncate rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/58">
                    {pathName}
                  </p>
                ))
              ) : (
                <p className="text-sm text-white/45">Nada detectado nesta categoria.</p>
              )}
            </div>
          </article>
        ))}
      </section>
      <section className="grid gap-4 border-t border-white/10 px-6 py-8 md:grid-cols-3">
        {sections.slice(0, 3).map((section) => (
          <article key={section.id} className="rounded-xl border border-white/10 bg-white/[0.05] p-5">
            <p className="text-xs uppercase tracking-[0.18em]" style={{ color: primary }}>
              {section.sectionType}
            </p>
            <h4 className="mt-2 font-semibold">{section.name}</h4>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/58">
              {readRecordString(section.propsJson, "sourceFile") || "Seção detectada e convertida para edição."}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}

function SectionEmptyPreview({
  section,
  primary,
  cardRadius,
  properties,
}: {
  section: WebsiteBuilderSection;
  primary: string;
  cardRadius: number;
  properties: Property[];
}) {
  if (section.sectionType === "property_grid" || section.sectionType === "property_carousel") {
    if (properties.length > 0) {
      return (
        <div className="grid gap-3 md:grid-cols-3">
          {properties.slice(0, 3).map((property) => (
            <PropertyPreviewCard key={property.id} property={property} primary={primary} cardRadius={cardRadius} />
          ))}
        </div>
      );
    }

    return (
      <div className="grid gap-3 md:grid-cols-3">
        {["Foto principal", "Dados do imóvel", "Lead interessado"].map((label) => (
          <div key={label} className="min-h-36 rounded-lg border border-white/10 bg-white/[0.06] p-4" style={{ borderRadius: cardRadius }}>
            <div className="mb-4 flex h-16 items-center justify-center rounded-md border border-dashed border-white/15 bg-white/[0.04]">
              <Image className="size-5 text-white/35" />
            </div>
            <p className="text-sm font-semibold text-white">{label}</p>
            <p className="mt-1 text-xs leading-5 text-white/48">Aguardando imóveis liberados para o site.</p>
          </div>
        ))}
      </div>
    );
  }

  if (section.sectionType.includes("form")) {
    return (
      <div className="grid gap-3 rounded-lg border border-dashed border-white/15 p-4" style={{ borderRadius: cardRadius }}>
        <div className="h-10 rounded-md border border-white/10 bg-white/[0.04]" />
        <div className="h-10 rounded-md border border-white/10 bg-white/[0.04]" />
        <div className="h-10 rounded-md text-neutral-950" style={{ backgroundColor: primary }} />
      </div>
    );
  }

  return <div className="rounded-lg border border-dashed border-white/15 p-6 text-sm text-white/50">Nenhum componente nesta seção.</div>;
}

function PropertyPreviewCard({
  property,
  primary,
  cardRadius,
}: {
  property: Property;
  primary: string;
  cardRadius: number;
}) {
  const coverUrl = propertyCoverUrl(property);
  const price = property.sale_price_cents ? formatMoneyCents(property.sale_price_cents) : property.rent_price_cents ? `${formatMoneyCents(property.rent_price_cents)}/mês` : "Valor sob consulta";
  const location = [property.neighborhood, property.city, property.state].filter(Boolean).join(", ");

  return (
    <article className="overflow-hidden border border-white/10 bg-white/[0.06]" style={{ borderRadius: cardRadius }}>
      <div className="flex h-32 items-center justify-center bg-white/[0.04]">
        {coverUrl ? <img className="h-full w-full object-cover" src={coverUrl} alt={property.title} /> : <Image className="size-6 text-white/35" />}
      </div>
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-950" style={{ backgroundColor: primary }}>
            {propertyOperationLabel(property.operation)}
          </span>
          <span className="text-[11px] text-white/45">{property.code ?? "sem código"}</span>
        </div>
        <h4 className="line-clamp-2 text-sm font-semibold text-white">{property.title}</h4>
        <p className="mt-1 truncate text-xs text-white/48">{location || "Localização não informada"}</p>
        <p className="mt-3 text-sm font-semibold" style={{ color: primary }}>
          {price}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/55">
          {property.private_area ? <span>{property.private_area} m²</span> : null}
          {property.bedrooms ? <span>{property.bedrooms} dorm.</span> : null}
          {property.parking_spaces ? <span>{property.parking_spaces} vaga(s)</span> : null}
        </div>
      </div>
    </article>
  );
}

function CanvasDropZone({
  active,
  label,
  compact = false,
  onDrop,
}: {
  active: boolean;
  label: string;
  compact?: boolean;
  onDrop: () => void;
}) {
  return (
    <div
      className={[
        "transition-all",
        compact ? "py-1" : "py-2",
        active ? "opacity-100" : "pointer-events-none opacity-0",
      ].join(" ")}
      onDragOver={(event) => {
        if (!active) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        if (!active) return;
        event.preventDefault();
        event.stopPropagation();
        onDrop();
      }}
    >
      <div
        className={[
          "flex items-center justify-center rounded-full border border-amber-300/55 bg-amber-300/10 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100",
          compact ? "min-h-7" : "min-h-9",
        ].join(" ")}
      >
        {label}
      </div>
    </div>
  );
}

type InspectedElement = {
  label: string;
  kind: DomElementKind;
  tag: string;
  selector: string;
  text: string;
  href: string;
  src: string;
  alt: string;
  className: string;
  options: DomElementOption[];
  width: number;
  height: number;
  x: number;
  y: number;
  color: string;
  background: string;
  backgroundImage: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  textAlign: string;
  widthStyle: string;
  heightStyle: string;
  padding: string;
  margin: string;
  gap: string;
  borderRadius: string;
  opacity: string;
  display: string;
  position: string;
  objectFit: string;
  transform: string;
  animation: string;
  zIndex: string;
  boxShadow: string;
  filter: string;
  backdropFilter: string;
  border: string;
  backgroundSize: string;
  backgroundPosition: string;
};

type DomLayerNode = {
  selector: string;
  label: string;
  kind: DomElementKind;
  tag: string;
  depth: number;
  zIndex: string;
  hidden: boolean;
  locked: boolean;
};

type ElementRectSnapshot = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type CanvasInteraction =
  | {
      mode: "move";
      element: HTMLElement;
      startClientX: number;
      startClientY: number;
      startTranslateX: number;
      startTranslateY: number;
      startRect: {
        left: number;
        right: number;
        top: number;
        bottom: number;
        width: number;
        height: number;
      };
      candidateRects: ElementRectSnapshot[];
      baseTransform: string;
      previousTransition: string;
      hasMoved: boolean;
    }
  | {
      mode: "resize";
      element: HTMLElement;
      direction: ResizeDirection;
      startClientX: number;
      startClientY: number;
      startWidth: number;
      startHeight: number;
      startTranslateX: number;
      startTranslateY: number;
      candidateRects: ElementRectSnapshot[];
      baseTransform: string;
      previousTransition: string;
      hasMoved: boolean;
    }
  | null;

function buildEditableCanvasDocumentHtml({
  website,
  page,
  sections,
  componentsBySection,
  properties,
  primary,
  background,
  foreground,
  headingFont,
  bodyFont,
  cardRadius,
  buttonRadius,
}: {
  website: WebsiteBuilderWebsite | null;
  page: WebsiteBuilderPageRecord | null;
  sections: WebsiteBuilderSection[];
  componentsBySection: Record<string, WebsiteBuilderComponent[]>;
  properties: Property[];
  primary: string;
  background: string;
  foreground: string;
  headingFont?: string;
  bodyFont?: string;
  cardRadius: number;
  buttonRadius: number;
  liveEditorUrl: string;
}) {
  const title = website?.name || "Site da imobiliária";
  const safePrimary = primary || "#d4af37";
  const heroImage =
    readImportedAssets(website?.settingsJson ?? {}).find((asset) => asset.url.match(/\.(png|jpe?g|webp|gif)$/i))?.url ||
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=85";
  const propertyCards = buildEditablePropertyCardsHtml(properties, safePrimary, cardRadius, website?.id ?? "");
  const sectionsHtml = sections.length
    ? sections
        .map((section, index) =>
          buildEditableSectionHtml(section, componentsBySection[section.id] ?? [], index, safePrimary, cardRadius, buttonRadius, properties, website?.id ?? ""),
        )
        .join("\n")
    : `
      <section id="topo" class="hero" data-editable="true">
        <img class="hero-bg" src="${escapeHtml(heroImage)}" alt="" data-editable="true" />
        <div class="hero-content" data-editable="true">
          <span class="eyebrow" data-editable="true">${escapeHtml(page?.title || "Imobiliária familiar de alto padrão")}</span>
          <h1 data-editable="true">Imóveis selecionados com atendimento familiar e alto padrão</h1>
          <p class="lead" data-editable="true">Uma vitrine imobiliária premium preparada para venda, locação, captação de proprietários e geração de leads pelo ImobiFlow.</p>
          <div class="actions" data-editable="true"><a class="premium-button" href="#imoveis" data-editable="true">Ver imóveis</a><a class="ghost-button" href="#contato" data-editable="true">Anunciar meu imóvel</a></div>
        </div>
      </section>
      <section id="imoveis" class="section" data-editable="true">
        <div class="section-head" data-editable="true"><div data-editable="true"><span class="eyebrow" data-editable="true">Vitrine</span><h2 data-editable="true">Imóveis em destaque</h2></div><p class="muted" data-editable="true">Imóveis selecionados para venda, locação e captação premium.</p></div>
        <div class="property-grid" data-editable="true">${propertyCards}</div>
      </section>
      <section id="sobre" class="section" data-editable="true"><div class="stack" data-editable="true"><span class="eyebrow" data-editable="true">Sobre</span><h2 data-editable="true">${escapeHtml(title)} com curadoria e confiança</h2><p class="lead" data-editable="true">Atendimento consultivo para compra, venda, locação e apresentação de imóveis de alto padrão.</p></div></section>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { --gold:${safePrimary}; --bg:${background || "#080806"}; --fg:${foreground || "#fff"}; }
    * { box-sizing:border-box; }
    html, body { margin:0; min-height:100%; background:var(--bg); color:var(--fg); font-family:${bodyFont || "Inter, Arial, sans-serif"}; }
    body { overflow-x:hidden; }
    a, button, [data-editable="true"] { cursor:move; }
    img, video { max-width:100%; display:block; }
    h1,h2,h3,p { margin:0; }
    h1,h2,h3 { font-family:${headingFont || "Inter, Arial, sans-serif"}; }
    .site-shell { min-height:100vh; background:var(--bg); color:var(--fg); }
    .site-header { position:sticky; top:0; z-index:10; display:flex; align-items:center; justify-content:space-between; gap:24px; padding:20px 6vw; border-bottom:1px solid rgba(255,255,255,.1); background:rgba(8,8,6,.82); backdrop-filter:blur(20px); }
    .brand { display:flex; align-items:center; gap:12px; font-weight:950; letter-spacing:.08em; text-transform:uppercase; }
    .brand-mark { width:44px; height:44px; display:grid; place-items:center; border:1px solid rgba(212,175,55,.45); border-radius:14px; color:var(--gold); background:rgba(255,255,255,.06); }
    .site-nav { display:flex; flex-wrap:wrap; gap:18px; font-size:12px; font-weight:850; letter-spacing:.14em; text-transform:uppercase; }
    .site-nav a { color:rgba(255,255,255,.72); text-decoration:none; }
    .hero { position:relative; min-height:86vh; display:grid; align-items:center; overflow:hidden; padding:110px 6vw; isolation:isolate; }
    .hero-bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:.58; z-index:-2; }
    .hero::after { content:""; position:absolute; inset:0; z-index:-1; background:linear-gradient(90deg,rgba(0,0,0,.88),rgba(0,0,0,.48),rgba(0,0,0,.2)); }
    .hero-content,.stack { max-width:980px; display:grid; gap:24px; }
    .eyebrow,.tag { width:max-content; border:1px solid rgba(212,175,55,.45); border-radius:999px; padding:9px 14px; background:rgba(255,255,255,.08); color:var(--gold); font-weight:900; letter-spacing:.16em; text-transform:uppercase; font-size:12px; }
    h1 { max-width:1100px; font-size:clamp(48px,7vw,104px); line-height:.94; }
    h2 { font-size:clamp(34px,5vw,68px); line-height:1; }
    .lead { max-width:760px; color:rgba(255,255,255,.78); font-size:20px; line-height:1.65; }
    .actions { display:flex; flex-wrap:wrap; gap:14px; }
    .premium-button,.ghost-button { display:inline-flex; align-items:center; justify-content:center; min-height:46px; padding:0 24px; border-radius:${buttonRadius}px; font-weight:900; text-decoration:none; }
    .premium-button { background:linear-gradient(135deg,var(--gold),#f8e7a6); color:#111; box-shadow:0 18px 46px rgba(212,175,55,.28); }
    .ghost-button { border:1px solid rgba(255,255,255,.28); color:#fff; background:rgba(255,255,255,.08); backdrop-filter:blur(18px); }
    .section,.editable-section { padding:80px 6vw; border-top:1px solid rgba(255,255,255,.08); }
    .section-head { display:flex; align-items:end; justify-content:space-between; gap:24px; margin-bottom:34px; }
    .muted { color:rgba(255,255,255,.62); }
    .property-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; }
    .property-card,.component-card { overflow:hidden; border:1px solid rgba(255,255,255,.14); border-radius:${cardRadius}px; background:rgba(255,255,255,.07); box-shadow:0 24px 70px rgba(0,0,0,.34); }
    a.property-card { display:block; color:inherit; text-decoration:none; cursor:pointer; transition:transform .22s ease,border-color .22s ease,box-shadow .22s ease; }
    a.property-card:hover { transform:translateY(-4px); border-color:var(--gold); box-shadow:0 28px 86px rgba(212,175,55,.2); }
    .property-image { height:220px; width:100%; object-fit:cover; background:#111; }
    .property-body { padding:20px; display:grid; gap:12px; }
    .price { color:#fff; font-size:25px; font-weight:950; }
    .features { display:flex; flex-wrap:wrap; gap:8px; color:rgba(255,255,255,.68); font-size:12px; }
    .feature { border:1px solid rgba(255,255,255,.12); border-radius:999px; padding:7px 10px; }
    .component-card { padding:22px; }
    .component-stack { display:grid; gap:16px; max-width:1160px; margin:0 auto; }
    .footer { padding:60px 6vw; border-top:1px solid rgba(255,255,255,.1); background:#050505; display:grid; grid-template-columns:1.2fr .8fr .8fr; gap:24px; }
    @media (max-width:900px) { .site-nav { display:none; } .property-grid,.footer { grid-template-columns:1fr; } h1 { font-size:48px; } }
  </style>
</head>
<body>
  <main class="site-shell" data-imobiflow-editor-root="true" data-editable="true">
    <header class="site-header" data-editable="true">
      <div class="brand" data-editable="true"><span class="brand-mark" data-editable="true">M</span><span data-editable="true">${escapeHtml(title)}</span></div>
      <nav class="site-nav" data-editable="true"><a href="#topo" data-editable="true">Home</a><a href="#imoveis" data-editable="true">Imóveis</a><a href="#sobre" data-editable="true">Sobre</a><a href="#contato" data-editable="true">Contato</a></nav>
      <a class="premium-button" href="#contato" data-editable="true">Falar no WhatsApp</a>
    </header>
    ${sectionsHtml}
    <footer class="footer" id="contato" data-editable="true"><div data-editable="true"><h3 data-editable="true">${escapeHtml(title)}</h3><p class="muted" data-editable="true">Atendimento familiar, imóveis selecionados e experiência premium.</p></div><div data-editable="true"><strong data-editable="true">Contato</strong><p class="muted" data-editable="true">WhatsApp, telefone e e-mail para atendimento rápido.</p></div><div data-editable="true"><strong data-editable="true">Consultoria</strong><p class="muted" data-editable="true">Venda, locação, avaliação e captação de proprietários.</p></div></footer>
  </main>
</body>
</html>`;
}

function buildEditableSectionHtml(
  section: WebsiteBuilderSection,
  components: WebsiteBuilderComponent[],
  index: number,
  primary: string,
  cardRadius: number,
  buttonRadius: number,
  properties: Property[],
  websiteId: string,
) {
  const title = readRecordString(section.propsJson, "title") || section.name || `Seção ${index + 1}`;
  const backgroundUrl = readRecordString(section.propsJson, "backgroundUrl");
  const backgroundStyle = backgroundUrl ? `background:linear-gradient(90deg,rgba(0,0,0,.82),rgba(0,0,0,.42)),url('${escapeHtml(backgroundUrl)}') center/cover no-repeat;` : "";
  const inner = components.length
    ? components.map((component) => buildEditableComponentHtml(component, primary, cardRadius, buttonRadius, properties, websiteId)).join("\n")
    : `<div class="component-card" data-editable="true"><span class="tag" data-editable="true">${escapeHtml(section.sectionType)}</span><h2 data-editable="true">${escapeHtml(title)}</h2><p class="muted" data-editable="true">Seção editável. Adicione blocos da biblioteca ou selecione este conteúdo para mover e redimensionar.</p></div>`;
  return `<section class="editable-section" data-editable="true" data-imobiflow-section-id="${escapeHtml(section.id)}" style="${backgroundStyle}"><div class="component-stack" data-editable="true">${inner}</div></section>`;
}

function buildEditableComponentHtml(component: WebsiteBuilderComponent, primary: string, cardRadius: number, buttonRadius: number, properties: Property[], websiteId: string) {
  const text = readComponentText(component) || component.name || component.componentType;
  const assetUrl = readComponentAssetUrl(component);
  const href = readRecordString(component.propsJson, "href") || "#";
  if (component.componentType.includes("property") || component.componentType.includes("imovel")) {
    return `<div class="property-grid" data-editable="true">${buildEditablePropertyCardsHtml(properties, primary, cardRadius, websiteId)}</div>`;
  }
  if (component.componentType === "heading" || component.componentType.includes("title")) return `<h2 data-editable="true">${escapeHtml(text)}</h2>`;
  if (component.componentType === "button") return `<a class="premium-button" href="${escapeHtml(href)}" data-editable="true" style="border-radius:${buttonRadius}px">${escapeHtml(text)}</a>`;
  if (component.componentType === "image") return `<img src="${escapeHtml(assetUrl || "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1200&q=85")}" alt="${escapeHtml(text)}" data-editable="true" style="width:100%;border-radius:${cardRadius}px;object-fit:cover;max-height:520px;" />`;
  if (component.componentType === "video") return `<video src="${escapeHtml(assetUrl)}" controls muted playsinline data-editable="true" style="width:100%;border-radius:${cardRadius}px;background:#111;min-height:260px;"></video>`;
  return `<div class="component-card" data-editable="true" style="border-radius:${cardRadius}px"><span class="tag" data-editable="true">${escapeHtml(componentTypeLabel(component.componentType))}</span><p data-editable="true">${escapeHtml(text)}</p></div>`;
}

function buildEditablePropertyCardsHtml(properties: Property[], primary: string, cardRadius: number, websiteId: string) {
  const source = properties.slice(0, 6);
  if (!source.length) {
    return `<div class="component-card" data-editable="true" style="grid-column:1/-1;border-radius:${cardRadius}px"><span class="tag" data-editable="true" style="color:${primary}">Imóveis reais</span><p class="muted" data-editable="true">Nenhum imóvel publicado ainda. Quando houver imóveis reais, os cards aparecem aqui automaticamente.</p></div>`;
  }
  return source
    .map((property, index) => {
      const price = property.sale_price_cents || property.rent_price_cents || 0;
      const city = [property.neighborhood, property.city].filter(Boolean).join(", ") || "Bairro nobre";
      const image = propertyCoverUrl(property);
      const detailUrl = websiteId ? getBuilderPreviewPropertyDetailUrl(websiteId, property) : "#";
      const imageHtml = image
        ? `<img class="property-image" src="${escapeHtml(image)}" alt="${escapeHtml(property.title)}" data-editable="true" />`
        : `<div class="property-image" data-editable="true" style="display:grid;place-items:center;background:linear-gradient(135deg,#1b1407,#d4af37);color:#080806;font-weight:950;">Imóvel ${index + 1}</div>`;
      return `<a class="property-card" href="${escapeHtml(detailUrl)}" target="_top" data-editable="true" data-imobiflow-property-card="${escapeHtml(property.id)}" data-imobiflow-property-url="${escapeHtml(detailUrl)}" style="border-radius:${cardRadius}px">${imageHtml}<div class="property-body" data-editable="true"><span class="tag" data-editable="true" style="color:${primary}">${property.sale_price_cents ? "Venda" : "Locação"}</span><h3 data-editable="true">${escapeHtml(property.title)}</h3><p class="muted" data-editable="true">${escapeHtml(city)}</p><strong class="price" data-editable="true">${formatCurrencyFromCents(price)}</strong><div class="features" data-editable="true"><span class="feature" data-editable="true">${property.private_area ?? property.total_area ?? 0} m²</span><span class="feature" data-editable="true">${property.bedrooms ?? 0} dorm.</span><span class="feature" data-editable="true">${property.bathrooms ?? 0} banh.</span><span class="feature" data-editable="true">${property.parking_spaces ?? 0} vagas</span></div></div></a>`;
    })
    .join("\n");
}

function formatCurrencyFromCents(value: number | null | undefined) {
  return ((value ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function LiveSiteInspectorFrame({
  src,
  snapshotHtml,
  codeEditorUrl,
  domElementPatch,
  onDomElementSelect,
  onDomLayersChange,
  onDiscoveredPages,
  onCanvasSnapshotSave,
}: {
  src: string;
  snapshotHtml?: string;
  codeEditorUrl: string;
  domElementPatch: DomElementPatch | null;
  onDomElementSelect: (element: InspectedElement) => void;
  onDomLayersChange: (layers: DomLayerNode[]) => void;
  onDiscoveredPages: (pages: DiscoveredSitePage[]) => void;
  onCanvasSnapshotSave: (snapshotHtml: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const highlightedElementRef = useRef<HTMLElement | null>(null);
  const selectedElementRef = useRef<HTMLElement | null>(null);
  const interactionRef = useRef<CanvasInteraction>(null);
  const selectionBoxRef = useRef<HTMLDivElement | null>(null);
  const resizeHandlesRef = useRef<Partial<Record<ResizeDirection, HTMLDivElement>>>({});
  const horizontalGuideRef = useRef<HTMLDivElement | null>(null);
  const verticalGuideRef = useRef<HTMLDivElement | null>(null);
  const distanceLineXRef = useRef<HTMLDivElement | null>(null);
  const distanceLineYRef = useRef<HTMLDivElement | null>(null);
  const distanceBadgeXRef = useRef<HTMLDivElement | null>(null);
  const distanceBadgeYRef = useRef<HTMLDivElement | null>(null);
  const measureBadgeRef = useRef<HTMLDivElement | null>(null);
  const sectionInsertLineRef = useRef<HTMLButtonElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const blockPaletteRef = useRef<HTMLDivElement | null>(null);
  const copiedElementRef = useRef<HTMLElement | null>(null);
  const multiSelectedElementsRef = useRef<HTMLElement[]>([]);
  const historyRef = useRef<string[]>([]);
  const redoHistoryRef = useRef<string[]>([]);
  const lastSnapshotRef = useRef("");
  const safeSrc = isBuilderSafeSitePreviewUrl(src) ? src : defaultPublicSitePreviewUrl;
  const safeSnapshotHtml = useMemo(
    () => (snapshotHtml ? sanitizeBuilderPreviewHtml(snapshotHtml) : ""),
    [snapshotHtml],
  );
  const iframeKey = safeSnapshotHtml
    ? `snapshot-${safeSnapshotHtml.length}-${safeSnapshotHtml.slice(0, 80)}`
    : `src-${safeSrc}`;

  useEffect(() => {
    if (!domElementPatch) return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    if (domElementPatch.patchId && doc.body.dataset.imobiflowLastAppliedPatchId === domElementPatch.patchId) return;
    if (domElementPatch.patchId) doc.body.dataset.imobiflowLastAppliedPatchId = domElementPatch.patchId;

    const selectorTarget = domElementPatch.selector ? findElementBySelector(doc, domElementPatch.selector) : null;
    if (selectorTarget) selectElement(selectorTarget);

    if (domElementPatch.command) {
      const selected = selectorTarget ?? selectedElementRef.current;
      if (domElementPatch.command === "undo") undoCanvasChange(doc);
      if (domElementPatch.command === "redo") redoCanvasChange(doc);
      if (domElementPatch.command === "copy" && selected) copiedElementRef.current = selected.cloneNode(true) as HTMLElement;
      if (domElementPatch.command === "paste" && copiedElementRef.current) pasteCanvasElement(doc, selected);
      if (domElementPatch.command === "duplicate" && selected) {
        copiedElementRef.current = selected.cloneNode(true) as HTMLElement;
        pasteCanvasElement(doc, selected);
      }
      if (domElementPatch.command === "delete" && selected) removeCanvasElement(doc, selected);
      if (domElementPatch.command === "deselect") {
        selectedElementRef.current = null;
        updateOverlay(null);
        hideContextPanels();
      }
      if (domElementPatch.command === "toggle-hidden" && selected) toggleCanvasElementHidden(doc, selected);
      if (domElementPatch.command === "toggle-locked" && selected) toggleCanvasElementLocked(doc, selected);
      if (domElementPatch.command === "bring-front" && selected) changeCanvasElementDepth(doc, selected, 999);
      if (domElementPatch.command === "send-back" && selected) changeCanvasElementDepth(doc, selected, -1);
      if (domElementPatch.command === "forward" && selected) changeCanvasElementDepth(doc, selected, 1, true);
      if (domElementPatch.command === "backward" && selected) changeCanvasElementDepth(doc, selected, -1, true);
      if (domElementPatch.command === "select" && selected) selectElement(selected);
      if (domElementPatch.command === "preview") openCurrentCanvasPreview(doc);
      if (domElementPatch.command === "save") {
        const previewHtml = buildCurrentCanvasPreviewHtml(doc);
        if (isUsableSavedBuilderCanvasHtml(previewHtml)) onCanvasSnapshotSave(previewHtml);
      }
      return;
    }

    if ((domElementPatch.moveX || domElementPatch.moveY) && selectedElementRef.current) {
      captureBeforeChange(doc);
      moveCanvasElement(selectedElementRef.current, domElementPatch.moveX ?? 0, domElementPatch.moveY ?? 0);
      updateOverlay(selectedElementRef.current);
      onDomElementSelect(inspectElement(selectedElementRef.current));
      refreshSnapshot(doc);
      return;
    }

    if (domElementPatch.insertHtml) {
      insertHtmlBlockIntoDocument(
        doc,
        domElementPatch.insertHtml,
        domElementPatch.insertPlacement ?? "beforeend",
        domElementPatch.insertMode ?? "section",
      );
      return;
    }

    if (!selectedElementRef.current) return;
    const element = selectedElementRef.current;
    applyDomElementPatch(element, domElementPatch);
    updateOverlay(element);
    onDomElementSelect(inspectElement(element));
  }, [domElementPatch]);
  const originalOutlineRef = useRef("");
  const originalCursorRef = useRef("");

  function clearHighlight() {
    const highlighted = highlightedElementRef.current;
    if (!highlighted) return;
    highlighted.style.outline = originalOutlineRef.current;
    highlighted.style.cursor = originalCursorRef.current;
    highlightedElementRef.current = null;
  }

  function ensureEditorLayer(doc: Document) {
    if (selectionBoxRef.current && selectionBoxRef.current.ownerDocument !== doc) selectionBoxRef.current = null;
    if (horizontalGuideRef.current && horizontalGuideRef.current.ownerDocument !== doc) horizontalGuideRef.current = null;
    if (verticalGuideRef.current && verticalGuideRef.current.ownerDocument !== doc) verticalGuideRef.current = null;
    if (distanceLineXRef.current && distanceLineXRef.current.ownerDocument !== doc) distanceLineXRef.current = null;
    if (distanceLineYRef.current && distanceLineYRef.current.ownerDocument !== doc) distanceLineYRef.current = null;
    if (distanceBadgeXRef.current && distanceBadgeXRef.current.ownerDocument !== doc) distanceBadgeXRef.current = null;
    if (distanceBadgeYRef.current && distanceBadgeYRef.current.ownerDocument !== doc) distanceBadgeYRef.current = null;
    if (measureBadgeRef.current && measureBadgeRef.current.ownerDocument !== doc) measureBadgeRef.current = null;
    if (contextMenuRef.current && contextMenuRef.current.ownerDocument !== doc) contextMenuRef.current = null;
    if (blockPaletteRef.current && blockPaletteRef.current.ownerDocument !== doc) blockPaletteRef.current = null;
    if (Object.values(resizeHandlesRef.current).some((handle) => handle && handle.ownerDocument !== doc)) {
      resizeHandlesRef.current = {};
    }

    if (!doc.getElementById("imobiflow-editor-style")) {
      const style = doc.createElement("style");
      style.id = "imobiflow-editor-style";
      style.textContent = `
        .imobiflow-selection-box {
          position: fixed;
          z-index: 2147483644;
          pointer-events: none;
          border: 2px solid #0ea5e9;
          box-shadow: 0 0 0 99999px rgba(2, 6, 23, .04), 0 0 0 1px rgba(255, 255, 255, .65) inset;
          border-radius: 8px;
        }
        .imobiflow-resize-handle {
          position: fixed;
          z-index: 2147483646;
          width: 12px;
          height: 12px;
          border: 2px solid #fff;
          background: #0ea5e9;
          border-radius: 999px;
          box-shadow: 0 8px 20px rgba(14, 165, 233, .32);
          pointer-events: auto;
        }
        .imobiflow-resize-n,
        .imobiflow-resize-s {
          width: 34px;
          height: 8px;
        }
        .imobiflow-resize-e,
        .imobiflow-resize-w {
          width: 8px;
          height: 34px;
        }
        .imobiflow-resize-n, .imobiflow-resize-s { cursor: ns-resize; }
        .imobiflow-resize-e, .imobiflow-resize-w { cursor: ew-resize; }
        .imobiflow-resize-ne, .imobiflow-resize-sw { cursor: nesw-resize; }
        .imobiflow-resize-nw, .imobiflow-resize-se { cursor: nwse-resize; }
        .imobiflow-guide {
          position: fixed;
          z-index: 2147483645;
          pointer-events: none;
          background: #ef4444;
          box-shadow: 0 0 0 1px rgba(2, 6, 23, .38), 0 0 18px rgba(239, 68, 68, .45);
        }
        .imobiflow-guide-x { height: 2px; left: 0; right: 0; }
        .imobiflow-guide-y { width: 2px; top: 0; bottom: 0; }
        .imobiflow-distance-line {
          position: fixed;
          z-index: 2147483645;
          pointer-events: none;
          background: rgba(239, 68, 68, .95);
          box-shadow: 0 0 0 1px rgba(2, 6, 23, .28);
        }
        .imobiflow-distance-line-x { height: 2px; }
        .imobiflow-distance-line-y { width: 2px; }
        .imobiflow-measure-badge {
          position: fixed;
          z-index: 2147483646;
          pointer-events: none;
          padding: 6px 8px;
          border-radius: 999px;
          background: rgba(2, 6, 23, .88);
          color: #fff;
          font: 600 11px/1.2 Inter, Arial, sans-serif;
          box-shadow: 0 10px 30px rgba(2, 6, 23, .28);
          backdrop-filter: blur(10px);
        }
        .imobiflow-distance-badge {
          position: fixed;
          z-index: 2147483646;
          pointer-events: none;
          padding: 4px 7px;
          border-radius: 999px;
          background: rgba(239, 68, 68, .96);
          color: #fff;
          font: 700 10px/1.1 Inter, Arial, sans-serif;
        }
        .imobiflow-dragging,
        .imobiflow-dragging * {
          cursor: grabbing !important;
          user-select: none !important;
        }
        .imobiflow-section-insert-line {
          position: fixed;
          z-index: 2147483643;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 28px;
          border: 0;
          background: transparent;
          pointer-events: auto;
          cursor: pointer;
        }
        .imobiflow-section-insert-line::before {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          height: 2px;
          background: #0ea5e9;
          box-shadow: 0 0 20px rgba(14,165,233,.75);
        }
        .imobiflow-section-insert-line span {
          position: relative;
          z-index: 1;
          display: grid;
          place-items: center;
          width: 26px;
          height: 26px;
          border-radius: 999px;
          background: #0ea5e9;
          color: #fff;
          font: 900 18px/1 Inter, Arial, sans-serif;
          box-shadow: 0 10px 28px rgba(14,165,233,.36);
        }
        .imobiflow-multi-selected {
          outline: 2px dashed #22c55e !important;
          outline-offset: 4px !important;
        }
        .imobiflow-context-menu,
        .imobiflow-block-palette {
          position: fixed;
          z-index: 2147483647;
          min-width: 220px;
          max-width: min(360px, calc(100vw - 24px));
          max-height: calc(100vh - 24px);
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 8px;
          border: 1px solid rgba(255, 255, 255, .12);
          border-radius: 14px;
          background: rgba(10, 10, 10, .94);
          color: #fff;
          box-shadow: 0 24px 80px rgba(0, 0, 0, .38);
          backdrop-filter: blur(18px);
          font: 500 13px/1.2 Inter, Arial, sans-serif;
        }
        .imobiflow-context-action {
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: inherit;
          padding: 9px 10px;
          text-align: left;
          cursor: pointer;
        }
        .imobiflow-context-action:hover {
          background: rgba(255, 255, 255, .1);
        }
        .imobiflow-context-title {
          margin: 2px 4px 8px;
          padding: 8px 10px;
          border-radius: 10px;
          background: rgba(14, 165, 233, .16);
          color: #e0f2fe;
          font: 700 11px/1.35 Inter, Arial, sans-serif;
        }
        .imobiflow-context-title small {
          display: block;
          margin-top: 3px;
          color: rgba(224, 242, 254, .72);
          font: 600 10px/1.25 Inter, Arial, sans-serif;
        }
        .imobiflow-context-action[data-danger="true"] {
          color: #fecaca;
        }
        .imobiflow-context-divider {
          height: 1px;
          margin: 6px 4px;
          background: rgba(255, 255, 255, .12);
        }
        .imobiflow-block-category {
          margin: 8px 4px 5px;
          color: #facc15;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
      `;
      doc.head.appendChild(style);
    }

    function createLayerDiv(className: string) {
      const div = doc.createElement("div");
      div.className = className;
      div.hidden = true;
      doc.body.appendChild(div);
      return div;
    }

    selectionBoxRef.current ??= createLayerDiv("imobiflow-selection-box");
    (["nw", "n", "ne", "e", "se", "s", "sw", "w"] as ResizeDirection[]).forEach((direction) => {
      if (resizeHandlesRef.current[direction]) return;
      const handle = createLayerDiv(`imobiflow-resize-handle imobiflow-resize-${direction}`);
      handle.dataset.resizeDirection = direction;
      resizeHandlesRef.current[direction] = handle;
    });
    horizontalGuideRef.current ??= createLayerDiv("imobiflow-guide imobiflow-guide-x");
    verticalGuideRef.current ??= createLayerDiv("imobiflow-guide imobiflow-guide-y");
    distanceLineXRef.current ??= createLayerDiv("imobiflow-distance-line imobiflow-distance-line-x");
    distanceLineYRef.current ??= createLayerDiv("imobiflow-distance-line imobiflow-distance-line-y");
    distanceBadgeXRef.current ??= createLayerDiv("imobiflow-distance-badge");
    distanceBadgeYRef.current ??= createLayerDiv("imobiflow-distance-badge");
    measureBadgeRef.current ??= createLayerDiv("imobiflow-measure-badge");
    if (!sectionInsertLineRef.current) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "imobiflow-section-insert-line";
      button.hidden = true;
      button.innerHTML = "<span>+</span>";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const selected = selectedElementRef.current;
        if (!selected) return;
        const section = findPageSectionElement(selected);
        if (!section) return;
        captureBeforeChange(doc);
        const template = doc.createElement("template");
        template.innerHTML = emptyCanvasSectionHtml();
        const nextSection = template.content.firstElementChild as HTMLElement | null;
        if (!nextSection) return;
        section.insertAdjacentElement("afterend", nextSection);
        selectElement(nextSection);
        refreshSnapshot(doc);
      });
      doc.body.appendChild(button);
      sectionInsertLineRef.current = button;
    }
    contextMenuRef.current ??= createLayerDiv("imobiflow-context-menu");
    blockPaletteRef.current ??= createLayerDiv("imobiflow-block-palette");
  }

  function hideGuides() {
    if (horizontalGuideRef.current) horizontalGuideRef.current.hidden = true;
    if (verticalGuideRef.current) verticalGuideRef.current.hidden = true;
    if (distanceLineXRef.current) distanceLineXRef.current.hidden = true;
    if (distanceLineYRef.current) distanceLineYRef.current.hidden = true;
    if (distanceBadgeXRef.current) distanceBadgeXRef.current.hidden = true;
    if (distanceBadgeYRef.current) distanceBadgeYRef.current.hidden = true;
  }

  function updateOverlay(element: HTMLElement | null, label?: string) {
    const box = selectionBoxRef.current;
    const badge = measureBadgeRef.current;
    const handles = resizeHandlesRef.current;
    if (!box || !badge || !element) {
      if (box) box.hidden = true;
      Object.values(handles).forEach((handle) => {
        if (handle) handle.hidden = true;
      });
      if (badge) badge.hidden = true;
      if (sectionInsertLineRef.current) sectionInsertLineRef.current.hidden = true;
      hideGuides();
      return;
    }

    const rect = element.getBoundingClientRect();
    box.hidden = false;
    box.style.left = `${Math.round(rect.left)}px`;
    box.style.top = `${Math.round(rect.top)}px`;
    box.style.width = `${Math.round(rect.width)}px`;
    box.style.height = `${Math.round(rect.height)}px`;

    const positions: Record<ResizeDirection, { left: number; top: number }> = {
      nw: { left: rect.left - 6, top: rect.top - 6 },
      ne: { left: rect.right - 6, top: rect.top - 6 },
      se: { left: rect.right - 6, top: rect.bottom - 6 },
      sw: { left: rect.left - 6, top: rect.bottom - 6 },
      n: { left: rect.left + rect.width / 2 - 17, top: rect.top - 4 },
      e: { left: rect.right - 4, top: rect.top + rect.height / 2 - 17 },
      s: { left: rect.left + rect.width / 2 - 17, top: rect.bottom - 4 },
      w: { left: rect.left - 4, top: rect.top + rect.height / 2 - 17 },
    };
    (Object.keys(positions) as ResizeDirection[]).forEach((direction) => {
      const handle = handles[direction];
      if (!handle) return;
      handle.hidden = false;
      handle.style.left = `${Math.round(positions[direction].left)}px`;
      handle.style.top = `${Math.round(positions[direction].top)}px`;
    });

    badge.hidden = false;
    badge.textContent = label ?? `${Math.round(rect.width)} x ${Math.round(rect.height)} px · X ${Math.round(rect.left)} · Y ${Math.round(rect.top)}`;
    badge.style.left = `${Math.round(rect.left)}px`;
    badge.style.top = `${Math.max(8, Math.round(rect.top - 34))}px`;

    const section = findPageSectionElement(element);
    const insertLine = sectionInsertLineRef.current;
    if (insertLine && section && section === element) {
      insertLine.hidden = false;
      insertLine.style.left = `${Math.round(rect.left)}px`;
      insertLine.style.top = `${Math.round(rect.bottom - 14)}px`;
      insertLine.style.width = `${Math.round(rect.width)}px`;
    } else if (insertLine) {
      insertLine.hidden = true;
    }
  }

  function findPageSectionElement(element: HTMLElement | null) {
    if (!element) return null;
    const section = element.closest("section, header, footer") as HTMLElement | null;
    if (!section) return null;
    if (isEditorLayerElement(section)) return null;
    return section;
  }

  function emptyCanvasSectionHtml() {
    return `<section data-imobiflow-block="empty-section" data-editable="true" style="position:relative;min-height:360px;padding:70px 6vw;background:#080806;color:#fff;isolation:isolate;overflow:hidden;">
      <div data-editable="true" style="max-width:1180px;margin:0 auto;min-height:220px;border:2px dashed rgba(14,165,233,.48);border-radius:28px;background:rgba(255,255,255,.04);display:grid;place-items:center;text-align:center;padding:34px;">
        <div data-editable="true"><span data-editable="true" style="color:#38bdf8;font-weight:900;letter-spacing:.16em;text-transform:uppercase;">Nova seção</span><h2 data-editable="true" style="margin:12px 0 8px;font-size:38px;line-height:1;">Seção vazia editável</h2><p data-editable="true" style="margin:0;color:rgba(255,255,255,.68);">Adicione elementos da biblioteca, imagens, vídeos, formas e efeitos.</p></div>
      </div>
    </section>`;
  }

  function isPageSectionElement(element: HTMLElement | null) {
    return Boolean(element && findPageSectionElement(element) === element);
  }

  function toggleMultiSelectElement(element: HTMLElement) {
    if (element === element.ownerDocument.body || element === element.ownerDocument.documentElement) return;
    const current = multiSelectedElementsRef.current.filter((item) => item.isConnected);
    const exists = current.includes(element);
    if (exists) {
      element.classList.remove("imobiflow-multi-selected");
      multiSelectedElementsRef.current = current.filter((item) => item !== element);
      return;
    }

    element.classList.add("imobiflow-multi-selected");
    multiSelectedElementsRef.current = [...current, element];
  }

  function clearMultiSelection() {
    multiSelectedElementsRef.current.forEach((element) => element.classList.remove("imobiflow-multi-selected"));
    multiSelectedElementsRef.current = [];
  }

  function reorderPageSectionAfterDrag(doc: Document, element: HTMLElement, baseTransform: string) {
    if (!isPageSectionElement(element)) return false;
    const parent = element.parentElement;
    if (!parent) return false;

    const siblings = Array.from(parent.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child !== element && !isEditorLayerElement(child) && isPageSectionElement(child),
    );
    if (!siblings.length) return false;

    const draggedRect = element.getBoundingClientRect();
    const targetBefore = siblings.find((candidate) => {
      const candidateRect = candidate.getBoundingClientRect();
      return draggedRect.top < candidateRect.top + candidateRect.height / 2;
    });

    element.style.transform = baseTransform;
    element.dataset.imobiflowTranslateX = "0";
    element.dataset.imobiflowTranslateY = "0";
    element.dataset.imobiflowBaseTransform = baseTransform;

    if (targetBefore) {
      if (targetBefore !== element.nextElementSibling) parent.insertBefore(element, targetBefore);
    } else if (parent.lastElementChild !== element) {
      parent.appendChild(element);
    }

    selectElement(element);
    updateOverlay(element);
    refreshSnapshot(doc);
    return true;
  }

  function inspectElement(element: HTMLElement): InspectedElement {
    const ownerWindow = element.ownerDocument.defaultView;
    const style = ownerWindow?.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    const tag = element.tagName.toLowerCase();
    const closestLink = element.closest("a") as HTMLAnchorElement | null;
    const backgroundOwner = findBackgroundImageOwner(element);
    const backgroundOwnerStyle = backgroundOwner && backgroundOwner !== element ? ownerWindow?.getComputedStyle(backgroundOwner) : style;
    const href = tag === "a" ? element.getAttribute("href") ?? "" : closestLink?.getAttribute("href") ?? element.getAttribute("data-imobiflow-href") ?? "";
    const src =
      tag === "img" || tag === "video"
        ? (element as HTMLImageElement | HTMLVideoElement).currentSrc || (element as HTMLImageElement | HTMLVideoElement).src || ""
        : extractCssImageUrl(backgroundOwnerStyle?.backgroundImage ?? "");
    const alt = element.getAttribute("alt") ?? element.getAttribute("aria-label") ?? "";
    const kind = detectElementKind(element, style, backgroundOwner);

    return {
      label: text ? text.slice(0, 72) : element.getAttribute("aria-label") ?? element.getAttribute("alt") ?? tag,
      kind,
      tag,
      selector: elementSelectorPath(element),
      text,
      href,
      src,
      alt,
      className: element.className.toString(),
      options: inspectElementOptions(element),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      color: style?.color ?? "",
      background: style?.backgroundColor ?? "",
      backgroundImage: backgroundOwnerStyle?.backgroundImage && backgroundOwnerStyle.backgroundImage !== "none" ? backgroundOwnerStyle.backgroundImage : "",
      fontSize: style?.fontSize ?? "",
      fontWeight: style?.fontWeight ?? "",
      lineHeight: style?.lineHeight ?? "",
      textAlign: style?.textAlign ?? "",
      widthStyle: element.style.width || `${Math.round(rect.width)}px`,
      heightStyle: element.style.height || `${Math.round(rect.height)}px`,
      padding: style?.padding ?? "",
      margin: style?.margin ?? "",
      gap: style?.gap ?? "",
      borderRadius: style?.borderRadius ?? "",
      opacity: style?.opacity ?? "",
      display: style?.display ?? "",
      position: style?.position ?? "",
      objectFit: style?.objectFit ?? "",
      transform: style?.transform && style.transform !== "none" ? style.transform : "sem transform",
      animation: style?.animationName && style.animationName !== "none" ? style.animationName : "sem animação",
      zIndex: style?.zIndex ?? "",
      boxShadow: style?.boxShadow ?? "",
      filter: style?.filter ?? "",
      backdropFilter: style?.backdropFilter ?? "",
      border: style?.border ?? "",
      backgroundSize: backgroundOwnerStyle?.backgroundSize ?? "",
      backgroundPosition: backgroundOwnerStyle?.backgroundPosition ?? "",
    };
  }

  function ensureImobiflowEffectStyles(doc: Document) {
    if (doc.getElementById("imobiflow-builder-effect-keyframes")) return;

    const style = doc.createElement("style");
    style.id = "imobiflow-builder-effect-keyframes";
    style.textContent = `
      @keyframes imobiflow-pulse-gold {
        0%, 100% { filter: saturate(1); box-shadow: 0 0 0 1px rgba(244,208,111,.38), 0 18px 48px rgba(212,175,55,.22); }
        50% { filter: saturate(1.28) brightness(1.08); box-shadow: 0 0 0 2px rgba(244,208,111,.92), 0 0 72px rgba(244,208,111,.58), 0 24px 72px rgba(0,0,0,.36); }
      }
      @keyframes imobiflow-float-soft {
        0%, 100% { transform: translate3d(0, -4px, 0) scale(1); }
        50% { transform: translate3d(0, -18px, 0) scale(1.018); }
      }
      @keyframes imobiflow-tilt-showcase {
        0% { transform: perspective(1000px) rotateX(7deg) rotateY(-10deg) translate3d(0, -8px, 0); }
        100% { transform: perspective(1000px) rotateX(-2deg) rotateY(9deg) translate3d(0, -12px, 0); }
      }
      @keyframes imobiflow-shimmer-sweep {
        0% { background-position: 220% 50%; }
        100% { background-position: -80% 50%; }
      }
      @keyframes imobiflow-aurora-field {
        0%, 100% { background-position: 0% 50%; filter: saturate(1); }
        50% { background-position: 100% 50%; filter: saturate(1.22) brightness(1.05); }
      }
      @keyframes imobiflow-reveal-pop {
        0% { opacity: .45; transform: translate3d(0, 18px, 0) scale(.96); filter: blur(10px) saturate(.8); }
        70% { opacity: 1; transform: translate3d(0, -5px, 0) scale(1.025); filter: blur(0) saturate(1.12); }
        100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0) saturate(1); }
      }
      @keyframes imobiflow-glass-breathe {
        0%, 100% { backdrop-filter: blur(14px); box-shadow: 0 24px 70px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.16); }
        50% { backdrop-filter: blur(24px); box-shadow: 0 36px 100px rgba(0,0,0,.38), 0 0 48px rgba(244,208,111,.18), inset 0 1px 0 rgba(255,255,255,.3); }
      }
      @keyframes imobiflow-ken-burns {
        0% { transform: scale(1.015); filter: saturate(1.04) contrast(1.02); }
        100% { transform: scale(1.075); filter: saturate(1.22) contrast(1.08); }
      }
      @keyframes imobiflow-elastic-pop {
        0% { transform: scale(.9); filter: blur(8px); opacity: .65; }
        55% { transform: scale(1.08); filter: blur(0); opacity: 1; }
        82% { transform: scale(.985); }
        100% { transform: scale(1.02); }
      }
      @keyframes imobiflow-text-wave {
        0%, 100% { transform: translateY(0); text-shadow: 0 0 18px rgba(244,208,111,.2); }
        50% { transform: translateY(-6px); text-shadow: 0 0 42px rgba(244,208,111,.56); }
      }
    `;

    doc.head.appendChild(style);
  }

  function applyDomElementPatch(element: HTMLElement, patch: DomElementPatch) {
    if (patch.text !== undefined && element.tagName !== "IMG" && element.tagName !== "VIDEO") {
      element.textContent = patch.text;
    }

    if (patch.href !== undefined) {
      const link = element.tagName === "A" ? element : element.closest("a");
      if (link) {
        link.setAttribute("href", patch.href);
      } else {
        element.setAttribute("data-imobiflow-href", patch.href);
      }
    }

    if (patch.alt !== undefined) {
      element.setAttribute(element.tagName === "IMG" ? "alt" : "aria-label", patch.alt);
    }

if (patch.src !== undefined) {
  if (element.tagName === "IMG" || element.tagName === "VIDEO") {
    (element as HTMLImageElement | HTMLVideoElement).src = patch.src;
  } else if (patch.src.trim()) {
    if (isVideoUrl(patch.src)) {
      ensureBackgroundVideo(element, patch.src);
    } else {
      const backgroundOwner = findBackgroundImageOwner(element) ?? element;
      backgroundOwner.style.backgroundImage = cssImageValue(patch.src);
    }
  }
}

    if (patch.optionIndex !== undefined) {
      applyElementOptionPatch(element, patch.optionIndex, patch.optionText, patch.optionHref);
    }

    if (patch.x !== undefined || patch.y !== undefined) {
      const rect = element.getBoundingClientRect();
      const targetX = patch.x ?? Math.round(rect.left);
      const targetY = patch.y ?? Math.round(rect.top);
      const translateX = getTranslateValue(element, "x") + targetX - rect.left;
      const translateY = getTranslateValue(element, "y") + targetY - rect.top;
      const baseTransform = element.dataset.imobiflowBaseTransform ?? element.dataset.imobiflowOriginalTransform ?? stripTranslateFromTransform(element.style.transform);
      setTranslateValue(element, translateX, translateY, baseTransform);
    }

    if (patch.style) {
      ensureImobiflowEffectStyles(element.ownerDocument);
      if (patch.style.animation) {
        element.style.animation = "none";
        void element.offsetWidth;
      }
      for (const [key, value] of Object.entries(patch.style)) {
        if (value === undefined) continue;
    if (key === "backgroundImage") {
      const backgroundOwner = findBackgroundImageOwner(element) ?? element;
      if (isVideoUrl(value)) {
        ensureBackgroundVideo(element, value);
      } else {
        const backgroundVideo = findBackgroundVideo(element);
        if (backgroundVideo) {
          backgroundVideo.style.display = "none";
        }
        backgroundOwner.style.backgroundImage = value.trim() ? cssImageValue(value) : "";
      }
      continue;
    }
        element.style.setProperty(camelToKebabCase(key), value);
      }
    }
  }

  function detectElementKind(element: HTMLElement, style: CSSStyleDeclaration | undefined, backgroundOwner?: HTMLElement | null): DomElementKind {
    const tag = element.tagName.toLowerCase();
    if (tag === "button" || element.getAttribute("role") === "button") return "button";
    if (tag === "a") return "link";
    if (tag === "img") return "image";
    if (tag === "video") return "video";
    if (tag === "select" || element.getAttribute("role") === "combobox" || isMenuLikeElement(element)) return "selector";
    if (tag === "svg" || tag === "path") return "icon";
    if (tag === "section" || tag === "main" || tag === "header" || tag === "footer") return "section";
    if (tag === "body" || tag === "html" || backgroundOwner) return "background";
    if (tag === "article" || element.className.toString().toLowerCase().includes("card")) return "card";
    if ((style?.backgroundImage ?? "none") !== "none" && element.children.length > 0) return "background";
    if (/^h[1-6]$/.test(tag) || ["p", "span", "strong", "small", "label"].includes(tag)) return "text";
    return "generic";
  }

  function findBackgroundImageOwner(element: HTMLElement) {
    let current: HTMLElement | null = element;
    while (current && current.tagName !== "HTML") {
      const style = current.ownerDocument.defaultView?.getComputedStyle(current);
      if (style?.backgroundImage && style.backgroundImage !== "none") return current;
      current = current.parentElement;
    }
    return null;
  }

  function isMenuLikeElement(element: HTMLElement) {
    const selector = "nav a, nav button, [role='menuitem'], [role='option'], option";
    if (element.matches("nav, [role='menu'], [role='listbox']")) return true;
    return element.querySelectorAll(selector).length >= 2;
  }

  function inspectElementOptions(element: HTMLElement): DomElementOption[] {
    if (element.tagName === "SELECT") {
      return Array.from((element as HTMLSelectElement).options).map((option, index) => ({
        index,
        label: option.textContent?.trim() ?? "",
        href: option.value ?? "",
      }));
    }

    const optionNodes = Array.from(element.querySelectorAll<HTMLElement>("a, button, [role='menuitem'], [role='option'], option")).slice(0, 24);
    return optionNodes.map((option, index) => ({
      index,
      label: (option.textContent ?? "").replace(/\s+/g, " ").trim(),
      href: option.tagName === "A" ? option.getAttribute("href") ?? "" : option.getAttribute("value") ?? option.getAttribute("data-imobiflow-href") ?? "",
    }));
  }

  function applyElementOptionPatch(element: HTMLElement, optionIndex: number, optionText?: string, optionHref?: string) {
    if (element.tagName === "SELECT") {
      const option = (element as HTMLSelectElement).options[optionIndex];
      if (!option) return;
      if (optionText !== undefined) option.textContent = optionText;
      if (optionHref !== undefined) option.value = optionHref;
      return;
    }

    const option = Array.from(element.querySelectorAll<HTMLElement>("a, button, [role='menuitem'], [role='option'], option"))[optionIndex];
    if (!option) return;
    if (optionText !== undefined) option.textContent = optionText;
    if (optionHref !== undefined) {
      if (option.tagName === "A") option.setAttribute("href", optionHref);
      else option.setAttribute("data-imobiflow-href", optionHref);
    }
  }

  function elementSelectorPath(element: HTMLElement) {
    if (element.dataset.imobiflowLayerId) return `[data-imobiflow-layer-id="${element.dataset.imobiflowLayerId}"]`;
    const parts: string[] = [];
    let current: HTMLElement | null = element;
    while (current && current.tagName !== "HTML" && parts.length < 6) {
      const tag = current.tagName.toLowerCase();
      const id = current.id ? `#${current.id}` : "";
      const className = current.className
        .toString()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((item) => `.${item.replace(/[^a-z0-9_-]/gi, "")}`)
        .join("");
      parts.unshift(`${tag}${id}${className}`);
      current = current.parentElement;
    }
    return parts.join(" > ");
  }

  function extractCssImageUrl(value: string) {
    const match = value.match(/url\((['"]?)(.*?)\1\)/);
    return match?.[2] ?? "";
  }

function isVideoUrl(value: string) {
  return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(value.trim());
}

function findBackgroundVideo(element: HTMLElement) {
  return element.querySelector<HTMLVideoElement>(
    "video[data-imobiflow-background], video[data-imobiflow-background-video]",
  );
}

function ensureBackgroundVideo(element: HTMLElement, src: string) {
  let video = findBackgroundVideo(element);
  if (!video) {
    video = element.ownerDocument.createElement("video");
    video.dataset.imobiflowBackground = "true";
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("aria-hidden", "true");
    video.style.position = "absolute";
    video.style.inset = "0";
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";
    video.style.zIndex = "0";
    video.style.pointerEvents = "none";
    element.prepend(video);
  }

  video.src = src;
  video.style.display = "block";
  const currentPosition = element.ownerDocument.defaultView?.getComputedStyle(element).position;
  if (!currentPosition || currentPosition === "static") {
    element.style.position = "relative";
  }
  element.style.overflow = element.style.overflow || "hidden";
  Array.from(element.children).forEach((child) => {
    if (child === video || !(child instanceof HTMLElement)) return;
    const childPosition = element.ownerDocument.defaultView?.getComputedStyle(child).position;
    if (!childPosition || childPosition === "static") {
      child.style.position = "relative";
    }
    if (!child.style.zIndex) {
      child.style.zIndex = "1";
    }
  });
  return video;
}

function cssImageValue(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^(url\(|linear-gradient|radial-gradient|none)/i.test(trimmed)) return trimmed;
    return `url("${trimmed}")`;
  }

  function camelToKebabCase(value: string) {
    return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  }

  function isEditorLayerElement(element: HTMLElement) {
    return element.className.toString().includes("imobiflow-");
  }

  function canInspectElement(element: HTMLElement) {
    return !["SCRIPT", "STYLE", "META", "LINK", "TITLE"].includes(element.tagName) && !isEditorLayerElement(element);
  }

  function ensureLayerSelector(element: HTMLElement, index = 0) {
    if (!element.dataset.imobiflowLayerId) {
      element.dataset.imobiflowLayerId = `layer-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
    }
    return `[data-imobiflow-layer-id="${element.dataset.imobiflowLayerId}"]`;
  }

  function layerLabelForElement(element: HTMLElement) {
    const explicit = element.dataset.imobiflowName || element.getAttribute("aria-label") || element.getAttribute("alt") || "";
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    return (explicit || text || element.id || element.tagName.toLowerCase()).slice(0, 80);
  }

  function shouldIncludeLayerElement(element: HTMLElement) {
    if (!canInspectElement(element) || element.tagName === "HTML") return false;
    if (["SCRIPT", "STYLE", "META", "LINK", "TITLE", "BR"].includes(element.tagName)) return false;
    const rect = element.getBoundingClientRect();
    const tag = element.tagName.toLowerCase();
    const hasMeaningfulTag = /^(body|main|header|footer|section|article|div|form|nav|button|a|h[1-6]|p|span|img|video|svg|ul|ol|li|input|select|textarea)$/i.test(tag);
    const hasBox = rect.width > 4 && rect.height > 4;
    const hasText = Boolean((element.textContent ?? "").trim());
    const hasMedia = ["IMG", "VIDEO", "SVG", "INPUT", "SELECT", "TEXTAREA"].includes(element.tagName);
    return hasMeaningfulTag && (hasBox || hasText || hasMedia || tag === "body" || tag === "main");
  }

  function getDomLayerSnapshot(doc: Document): DomLayerNode[] {
    const all = Array.from(doc.body.querySelectorAll<HTMLElement>("body, main, header, footer, section, article, div, form, nav, button, a, h1, h2, h3, h4, h5, h6, p, span, img, video, svg, ul, ol, li, input, select, textarea"));
    const source = [doc.body, ...all].filter((element, index, list) => list.indexOf(element) === index).filter(shouldIncludeLayerElement);
    return source.slice(0, 180).map((element, index) => {
      const style = doc.defaultView?.getComputedStyle(element);
      const backgroundOwner = findBackgroundImageOwner(element);
      return {
        selector: ensureLayerSelector(element, index),
        label: layerLabelForElement(element),
        kind: detectElementKind(element, style, backgroundOwner),
        tag: element.tagName.toLowerCase(),
        depth: Math.max(0, parentDepth(element) - 1),
        zIndex: style?.zIndex === "auto" ? "" : style?.zIndex ?? "",
        hidden: element.dataset.imobiflowHidden === "true" || style?.display === "none" || style?.visibility === "hidden",
        locked: element.dataset.imobiflowLocked === "true",
      };
    });
  }

  function refreshDomLayers(doc: Document) {
    onDomLayersChange(getDomLayerSnapshot(doc));
  }

  function parentDepth(element: HTMLElement) {
    let depth = 0;
    let current = element.parentElement;
    while (current && current !== element.ownerDocument.documentElement) {
      if (!isEditorLayerElement(current)) depth += 1;
      current = current.parentElement;
    }
    return depth;
  }

  function pickInspectableElement(doc: Document, event: MouseEvent | PointerEvent | Event) {
    const pointerEvent = event as MouseEvent;
    const elementsFromPoint =
      typeof pointerEvent.clientX === "number" && typeof pointerEvent.clientY === "number"
        ? doc.elementsFromPoint(pointerEvent.clientX, pointerEvent.clientY)
        : [];
    const eventTarget = event.target as HTMLElement | null;
    const FrameHTMLElement = doc.defaultView?.HTMLElement;
    const inspectablePointElements = elementsFromPoint
      .filter((item): item is HTMLElement => Boolean(FrameHTMLElement && item instanceof FrameHTMLElement && canInspectElement(item) && item.tagName !== "HTML"))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= 1 && rect.height >= 1)
      .sort((left, right) => left.rect.width * left.rect.height - right.rect.width * right.rect.height)
      .map(({ element }) => element);
    const targetList = [
      ...inspectablePointElements,
      eventTarget && eventTarget.style ? eventTarget : null,
      eventTarget?.closest?.("button, a, h1, h2, h3, h4, p, span, img, svg, article, form, header, footer, section") ?? null,
      doc.querySelector("main"),
      doc.querySelector("section"),
      doc.body,
    ];

    for (const item of targetList) {
      const element = item as HTMLElement | null;
      if (!element || !element.style || !canInspectElement(element)) continue;
      if (element.tagName === "HTML") continue;
      return element;
    }

    return doc.body;
  }

  function selectElement(element: HTMLElement) {
    clearMultiSelection();
    selectedElementRef.current = element;
    onDomElementSelect(inspectElement(element));
    updateOverlay(element);
    refreshDomLayers(element.ownerDocument);
  }

  function findMainInsertionTarget(doc: Document) {
    return (doc.querySelector("main") as HTMLElement | null) ?? doc.body;
  }

  function ensureUsableInspectorDocument(doc: Document) {
    const bodyText = (doc.body?.innerText || doc.body?.textContent || "").toLowerCase();
    const titleText = (doc.title || "").toLowerCase();
    const looksBrokenPreview =
      bodyText.includes("site não encontrado") ||
      bodyText.includes("site nao encontrado") ||
      bodyText.includes("não foi possível carregar") ||
      bodyText.includes("nao foi possivel carregar") ||
      looksLikeImobiFlowMarketingPage(bodyText, titleText) ||
      bodyText.includes("site público conectado aos imóveis reais") ||
      bodyText.includes("site publico conectado aos imoveis reais") ||
      bodyText.includes("website builder com mysql") ||
      bodyText.includes("fase 2 - editor visual") ||
      bodyText.includes("biblioteca enterprise") ||
      bodyText.includes("categorias expansíveis") ||
      bodyText.includes("categorias expansiveis") ||
      bodyText.includes("páginas e blocos") ||
      bodyText.includes("paginas e blocos") ||
      bodyText.includes("tema global") ||
      bodyText.includes("assets r2") ||
      bodyText.includes("layout, tamanho e posição") ||
      bodyText.includes("layout, tamanho e posicao") ||
      bodyText.includes("sombra, vidro e relevo") ||
      bodyText.includes("abrir builder") ||
      bodyText.includes("acesso antecipado ao produto saas") ||
      titleText.includes("not found") ||
      bodyText.includes("404");

    if (!looksBrokenPreview || doc.body.dataset.imobiflowEditableFallback === "true") return;

    doc.body.dataset.imobiflowEditableFallback = "true";
    doc.documentElement.style.margin = "0";
    doc.documentElement.style.minHeight = "100%";
    doc.body.style.margin = "0";
    doc.body.style.minHeight = "100%";
    doc.body.style.background = "#080806";
    doc.body.style.color = "#ffffff";
    doc.body.style.fontFamily = "Inter, Arial, sans-serif";
    doc.body.innerHTML = `
      <main data-imobiflow-editor-root="true" data-editable="true" style="min-height:100vh;background:#080806;color:#fff;overflow:hidden;">
        <section id="topo" data-imobiflow-block="starter-hero" data-editable="true" style="position:relative;min-height:86vh;padding:110px 6vw;display:grid;align-items:center;background:linear-gradient(90deg,rgba(0,0,0,.84),rgba(0,0,0,.38)),url('https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=85') center/cover no-repeat;">
          <div data-editable="true" style="max-width:980px;display:grid;gap:24px;">
            <span data-editable="true" style="width:max-content;border:1px solid rgba(212,175,55,.45);border-radius:999px;padding:10px 16px;background:rgba(255,255,255,.08);backdrop-filter:blur(18px);color:#d4af37;font-weight:900;letter-spacing:.16em;text-transform:uppercase;">Imobiliária familiar</span>
            <h1 data-editable="true" style="font-size:clamp(46px,7vw,96px);line-height:.95;margin:0;font-weight:900;">Imóveis selecionados com atendimento familiar e alto padrão</h1>
            <p data-editable="true" style="max-width:720px;font-size:20px;line-height:1.65;color:rgba(255,255,255,.78);margin:0;">Curadoria premium para venda, locação, captação de proprietários e atendimento consultivo em imóveis de alto padrão.</p>
            <a data-editable="true" href="#contato" style="width:max-content;border-radius:999px;background:#d4af37;color:#080806;text-decoration:none;font-weight:900;padding:16px 26px;">Falar com especialista</a>
          </div>
        </section>
      </main>
    `;
  }

  function findElementBySelector(doc: Document, selector: string) {
    try {
      return doc.querySelector(selector) as HTMLElement | null;
    } catch {
      return null;
    }
  }

  function pasteCanvasElement(doc: Document, selected: HTMLElement | null) {
    if (!copiedElementRef.current) return;
    captureBeforeChange(doc);
    const pasted = copiedElementRef.current.cloneNode(true) as HTMLElement;
    pasted.removeAttribute("data-imobiflow-layer-id");
    pasted.dataset.imobiflowName = `${pasted.dataset.imobiflowName ?? pasted.getAttribute("aria-label") ?? pasted.tagName.toLowerCase()} copia`;
    if (selected && selected !== doc.body && selected !== doc.documentElement) selected.insertAdjacentElement("afterend", pasted);
    else findMainInsertionTarget(doc).appendChild(pasted);
    selectElement(pasted);
    refreshSnapshot(doc);
  }

  function removeCanvasElement(doc: Document, element: HTMLElement) {
    if (element === doc.body || element === doc.documentElement) return;
    captureBeforeChange(doc);
    element.remove();
    selectedElementRef.current = null;
    updateOverlay(null);
    refreshSnapshot(doc);
  }

  function toggleCanvasElementHidden(doc: Document, element: HTMLElement) {
    if (element === doc.body || element === doc.documentElement) return;
    captureBeforeChange(doc);
    const isHidden = element.dataset.imobiflowHidden === "true" || element.style.display === "none";
    if (isHidden) {
      element.style.display = element.dataset.imobiflowPreviousDisplay ?? "";
      element.dataset.imobiflowHidden = "false";
    } else {
      element.dataset.imobiflowPreviousDisplay = element.style.display;
      element.style.display = "none";
      element.dataset.imobiflowHidden = "true";
    }
    refreshSnapshot(doc);
  }

  function toggleCanvasElementLocked(doc: Document, element: HTMLElement) {
    captureBeforeChange(doc);
    const locked = element.dataset.imobiflowLocked === "true";
    element.dataset.imobiflowLocked = locked ? "false" : "true";
    element.style.pointerEvents = locked ? "" : "none";
    element.style.outline = locked ? element.style.outline : "2px dashed rgba(250,204,21,.9)";
    refreshSnapshot(doc);
  }

  function changeCanvasElementDepth(doc: Document, element: HTMLElement, value: number, relative = false) {
    if (element === doc.body || element === doc.documentElement) return;
    captureBeforeChange(doc);
    const style = doc.defaultView?.getComputedStyle(element);
    if (!element.style.position && style?.position === "static") element.style.position = "relative";
    const current = Number.parseInt(style?.zIndex ?? element.style.zIndex ?? "0", 10);
    const next = relative ? (Number.isFinite(current) ? current : 0) + value : value;
    element.style.zIndex = String(next);
    selectElement(element);
    refreshSnapshot(doc);
  }

  function moveCanvasElement(element: HTMLElement, dx: number, dy: number) {
    const baseTransform = element.dataset.imobiflowBaseTransform ?? element.dataset.imobiflowOriginalTransform ?? stripTranslateFromTransform(element.style.transform);
    setTranslateValue(element, getTranslateValue(element, "x") + dx, getTranslateValue(element, "y") + dy, baseTransform);
  }

  function insertHtmlBlockIntoDocument(
    doc: Document,
    html: string,
    placement: "beforebegin" | "afterend" | "beforeend" | "afterbegin",
    mode: "section" | "component",
  ) {
    const template = doc.createElement("template");
    template.innerHTML = html.trim();
    const firstElement = template.content.firstElementChild as HTMLElement | null;
    if (!firstElement) return;

    captureBeforeChange(doc);
    const selected = selectedElementRef.current;
    const mainTarget = findMainInsertionTarget(doc);

    if (mode === "section") {
      const selectedSection =
        selected && selected !== doc.body && selected !== doc.documentElement
          ? (selected.closest("section, header, footer, article") as HTMLElement | null)
          : null;
      if (selectedSection && selectedSection.parentElement) {
        selectedSection.insertAdjacentElement(placement === "beforebegin" ? "beforebegin" : "afterend", firstElement);
      } else {
        mainTarget.appendChild(firstElement);
      }
    } else {
      const target = selected && selected !== doc.body && selected !== doc.documentElement ? selected : mainTarget;
      if (target === mainTarget) target.appendChild(firstElement);
      else target.insertAdjacentElement(placement === "beforebegin" ? "beforebegin" : "afterend", firstElement);
    }

    ensureImobiflowEffectStyles(doc);
    firstElement.scrollIntoView({ behavior: "smooth", block: "center" });
    selectElement(firstElement);
    refreshSnapshot(doc);
  }

  function hideContextPanels() {
    if (contextMenuRef.current) contextMenuRef.current.hidden = true;
    if (blockPaletteRef.current) blockPaletteRef.current.hidden = true;
  }

  function positionFloatingPanel(panel: HTMLDivElement, x: number, y: number) {
    const view = panel.ownerDocument.defaultView ?? window;
    panel.hidden = false;
    const width = Math.min(Math.max(panel.offsetWidth || 260, 220), 380);
    const height = Math.min(panel.scrollHeight || panel.offsetHeight || 320, view.innerHeight - 24);
    const left = Math.min(Math.max(8, x), Math.max(8, view.innerWidth - width - 8));
    const top = Math.min(Math.max(8, y), Math.max(8, view.innerHeight - height - 8));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }

  function resetEditorLayerRefs() {
    selectionBoxRef.current = null;
    resizeHandlesRef.current = {};
    horizontalGuideRef.current = null;
    verticalGuideRef.current = null;
    distanceLineXRef.current = null;
    distanceLineYRef.current = null;
    distanceBadgeXRef.current = null;
    distanceBadgeYRef.current = null;
    measureBadgeRef.current = null;
    sectionInsertLineRef.current = null;
    contextMenuRef.current = null;
    blockPaletteRef.current = null;
    multiSelectedElementsRef.current = [];
  }

  function getEditableSnapshot(doc: Document) {
    const clone = doc.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll<HTMLElement>("[class*='imobiflow-']").forEach((element) => element.remove());
    return clone.innerHTML;
  }

  function captureBeforeChange(doc: Document) {
    const snapshot = getEditableSnapshot(doc);
    if (!lastSnapshotRef.current) lastSnapshotRef.current = snapshot;
    if (historyRef.current.at(-1) !== snapshot) {
      historyRef.current.push(snapshot);
      historyRef.current = historyRef.current.slice(-80);
    }
    redoHistoryRef.current = [];
  }

  function refreshSnapshot(doc: Document) {
    lastSnapshotRef.current = getEditableSnapshot(doc);
    refreshDomLayers(doc);
  }

  function restoreSnapshot(doc: Document, snapshot: string) {
    doc.body.innerHTML = snapshot;
    selectedElementRef.current = null;
    resetEditorLayerRefs();
    ensureEditorLayer(doc);
    hideContextPanels();
    updateOverlay(null);
    lastSnapshotRef.current = snapshot;
    onDiscoveredPages(discoverSitePagesFromDocument(doc, src));
    refreshDomLayers(doc);
  }

  function buildCurrentCanvasPreviewHtml(doc: Document) {
    const headClone = doc.head.cloneNode(true) as HTMLElement;
    const bodyClone = doc.body.cloneNode(true) as HTMLElement;
    const baseHref = doc.location?.origin ? `${doc.location.origin}/` : window.location.origin + "/";

    headClone.querySelectorAll<HTMLElement>("#imobiflow-editor-style").forEach((element) => element.remove());
    removeEditorArtifacts(bodyClone);
    absolutizePreviewUrls(headClone, doc.location.href);
    absolutizePreviewUrls(bodyClone, doc.location.href);

    const base = doc.createElement("base");
    base.href = baseHref;
    headClone.insertBefore(base, headClone.firstChild);

    const previewGuardStyle = doc.createElement("style");
    previewGuardStyle.textContent = `
      html, body { margin: 0; min-height: 100%; }
      [data-imobiflow-hidden="true"] { display: none !important; }
      .imobiflow-preview-root img, .imobiflow-preview-root video { max-width: 100%; }
    `;
    headClone.appendChild(previewGuardStyle);

    const htmlAttributes = Array.from(doc.documentElement.attributes)
      .map((attribute) => `${attribute.name}="${escapeHtml(attribute.value)}"`)
      .join(" ");
    bodyClone.classList.add("imobiflow-preview-root");
    const bodyAttributes = Array.from(bodyClone.attributes)
      .map((attribute) => `${attribute.name}="${escapeHtml(attribute.value)}"`)
      .join(" ");
    return sanitizeBuilderPreviewHtml(
      `<!doctype html><html ${htmlAttributes}><head>${headClone.innerHTML}</head><body ${bodyAttributes}>${bodyClone.innerHTML}</body></html>`,
    );
  }

  function openCurrentCanvasPreview(doc: Document) {
    const html = buildCurrentCanvasPreviewHtml(doc);
    const safePreviewDocument = createSandboxedBuilderPreviewDocument(html);
    const blob = new Blob([safePreviewDocument], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      const anchor = doc.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function removeEditorArtifacts(root: HTMLElement) {
    root
      .querySelectorAll<HTMLElement>(
        [
          ".imobiflow-selection-box",
          ".imobiflow-resize-handle",
          ".imobiflow-guide-line",
          ".imobiflow-distance-line",
          ".imobiflow-distance-badge",
          ".imobiflow-measure-badge",
          ".imobiflow-context-menu",
          ".imobiflow-block-palette",
          ".imobiflow-section-insert-line",
          "[data-imobiflow-editor-layer='true']",
        ].join(","),
      )
      .forEach((element) => element.remove());

    root.querySelectorAll<HTMLElement>(".imobiflow-multi-selected").forEach((element) => {
      element.classList.remove("imobiflow-multi-selected");
    });

    root.querySelectorAll<HTMLElement>("[data-imobiflow-builder-selected]").forEach((element) => {
      element.removeAttribute("data-imobiflow-builder-selected");
      element.style.outline = "";
      element.style.outlineOffset = "";
      element.style.cursor = "";
    });
  }

  function absolutizePreviewUrls(root: HTMLElement, baseUrl: string) {
    const attributes = ["href", "src", "poster"];
    root.querySelectorAll<HTMLElement>("*").forEach((element) => {
      attributes.forEach((attribute) => {
        const value = element.getAttribute(attribute);
        if (!value || value.startsWith("#") || value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("mailto:") || value.startsWith("tel:")) return;
        try {
          element.setAttribute(attribute, new URL(value, baseUrl).toString());
        } catch {
          // Mantem o valor original quando nao for uma URL navegavel.
        }
      });
    });
  }

  function undoCanvasChange(doc: Document) {
    const previous = historyRef.current.pop();
    if (previous === undefined) return;
    redoHistoryRef.current.push(getEditableSnapshot(doc));
    restoreSnapshot(doc, previous);
  }

  function redoCanvasChange(doc: Document) {
    const next = redoHistoryRef.current.pop();
    if (next === undefined) return;
    historyRef.current.push(getEditableSnapshot(doc));
    restoreSnapshot(doc, next);
  }

  function createActionButton(doc: Document, label: string, onClick: () => void, danger = false) {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "imobiflow-context-action";
    button.dataset.danger = String(danger);
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function createGeneratedBlock(doc: Document, label: string) {
    const normalized = label.toLowerCase();

    if (normalized.includes("botao") || normalized.includes("compra")) {
      const button = doc.createElement("button");
      button.textContent = label;
      button.style.cssText =
        "display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 22px;border:0;border-radius:999px;background:#d6a536;color:#080806;font-weight:800;cursor:pointer;";
      return button;
    }

    if (normalized.includes("imagem") || normalized.includes("logo")) {
      const figure = doc.createElement("figure");
      figure.style.cssText =
        "display:flex;align-items:center;justify-content:center;min-height:180px;border:1px dashed rgba(214,165,54,.7);border-radius:18px;background:rgba(214,165,54,.12);color:#d6a536;font-weight:800;";
      figure.textContent = label;
      return figure;
    }

    if (normalized.includes("video")) {
      const video = doc.createElement("div");
      video.style.cssText =
        "display:flex;align-items:center;justify-content:center;min-height:220px;border-radius:18px;background:#080806;color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);font-weight:800;";
      video.textContent = label;
      return video;
    }

    const block = doc.createElement(normalized.includes("secao") || normalized.includes("grupo") ? "section" : "div");
    block.style.cssText =
      "display:block;min-height:72px;padding:22px;border-radius:18px;background:rgba(255,255,255,.08);color:inherit;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);";
    block.textContent = label;
    return block;
  }

  function insertBlockAroundSelected(doc: Document, label: string, placement: "before" | "after") {
    const selected = selectedElementRef.current;
    if (!selected || selected === doc.body || selected === doc.documentElement) return;
    captureBeforeChange(doc);
    const block = createGeneratedBlock(doc, label);
    selected.insertAdjacentElement(placement === "before" ? "beforebegin" : "afterend", block);
    hideContextPanels();
    selectElement(block);
    refreshSnapshot(doc);
  }

  function showBlockPalette(doc: Document, x: number, y: number, placement: "before" | "after") {
    const panel = blockPaletteRef.current;
    if (!panel) return;
    panel.innerHTML = "";

    editorBlockCatalog.forEach((group) => {
      const title = doc.createElement("div");
      title.className = "imobiflow-block-category";
      title.textContent = group.category;
      panel.appendChild(title);

      group.items.forEach((item) => {
        panel.appendChild(createActionButton(doc, item, () => insertBlockAroundSelected(doc, item, placement)));
      });
    });

    positionFloatingPanel(panel, x, y);
  }

  function showElementMenu(doc: Document, event: MouseEvent | PointerEvent) {
    const selected = selectedElementRef.current;
    const menu = contextMenuRef.current;
    if (!selected || !menu) return;

    menu.innerHTML = "";
    const rect = selected.getBoundingClientRect();
    const title = doc.createElement("div");
    title.className = "imobiflow-context-title";
    title.innerHTML = `${selected.dataset.imobiflowName || selected.getAttribute("aria-label") || selected.tagName.toLowerCase()}<small>${selected.tagName.toLowerCase()} · ${Math.round(rect.width)} x ${Math.round(rect.height)} px · X ${Math.round(rect.left)} · Y ${Math.round(rect.top)}</small>`;
    menu.appendChild(title);
    menu.appendChild(
      createActionButton(doc, "Copiar", () => {
        copiedElementRef.current = selected.cloneNode(true) as HTMLElement;
        hideContextPanels();
      }),
    );
    menu.appendChild(
      createActionButton(doc, "Colar", () => {
        const copied = copiedElementRef.current ? (copiedElementRef.current.cloneNode(true) as HTMLElement) : null;
        if (copied && selected !== doc.body && selected !== doc.documentElement) {
          captureBeforeChange(doc);
          selected.insertAdjacentElement("afterend", copied);
          selectElement(copied);
          refreshSnapshot(doc);
        }
        hideContextPanels();
      }),
    );
    menu.appendChild(
      createActionButton(doc, "Duplicar", () => {
        if (selected === doc.body || selected === doc.documentElement) return;
        captureBeforeChange(doc);
        const clone = selected.cloneNode(true) as HTMLElement;
        selected.insertAdjacentElement("afterend", clone);
        hideContextPanels();
        selectElement(clone);
        refreshSnapshot(doc);
      }),
    );
    menu.appendChild(
      createActionButton(doc, "Renomear", () => {
        const nextName = window.prompt("Novo nome do elemento", selected.dataset.imobiflowName || selected.getAttribute("aria-label") || selected.tagName.toLowerCase());
        if (nextName?.trim()) {
          captureBeforeChange(doc);
          selected.dataset.imobiflowName = nextName.trim();
          selected.setAttribute("aria-label", nextName.trim());
          updateOverlay(selected, nextName.trim());
          refreshSnapshot(doc);
        }
        hideContextPanels();
      }),
    );
    menu.appendChild(
      createActionButton(doc, "Editar texto", () => {
        const currentText = selected.textContent?.replace(/\s+/g, " ").trim() ?? "";
        const nextText = window.prompt("Texto do elemento", currentText);
        if (nextText !== null) {
          captureBeforeChange(doc);
          selected.textContent = nextText;
          selectElement(selected);
          refreshSnapshot(doc);
        }
        hideContextPanels();
      }),
    );
    menu.appendChild(
      createActionButton(doc, "Editar texto direto", () => {
        captureBeforeChange(doc);
        selected.contentEditable = "true";
        selected.focus();
        selected.dataset.imobiflowTextEditing = "true";
        selected.style.cursor = "text";
        selectElement(selected);
        hideContextPanels();
      }),
    );
    menu.appendChild(
      createActionButton(doc, "Selecionar seção", () => {
        const section = selected.closest("section, header, footer, main, article") as HTMLElement | null;
        if (section && canInspectElement(section)) selectElement(section);
        hideContextPanels();
      }),
    );
    menu.appendChild(
      createActionButton(doc, "Selecionar fundo", () => {
        selectElement(doc.body);
        hideContextPanels();
      }),
    );
    menu.appendChild(
      createActionButton(doc, "Ocultar", () => {
        captureBeforeChange(doc);
        selected.dataset.imobiflowHidden = "true";
        selected.dataset.imobiflowPreviousDisplay = selected.style.display;
        selected.style.display = "none";
        selectedElementRef.current = null;
        hideContextPanels();
        updateOverlay(null);
        refreshSnapshot(doc);
      }),
    );
    menu.appendChild(
      createActionButton(doc, "Mostrar ocultos", () => {
        captureBeforeChange(doc);
        doc.querySelectorAll<HTMLElement>("[data-imobiflow-hidden='true']").forEach((element) => {
          element.style.display = element.dataset.imobiflowPreviousDisplay ?? "";
          delete element.dataset.imobiflowHidden;
          delete element.dataset.imobiflowPreviousDisplay;
        });
        refreshSnapshot(doc);
        hideContextPanels();
      }),
    );

    const divider = doc.createElement("div");
    divider.className = "imobiflow-context-divider";
    menu.appendChild(divider);
    menu.appendChild(createActionButton(doc, "Adicionar bloco antes", () => showBlockPalette(doc, event.clientX + 12, event.clientY, "before")));
    menu.appendChild(createActionButton(doc, "Adicionar bloco depois", () => showBlockPalette(doc, event.clientX + 12, event.clientY, "after")));
    menu.appendChild(
      createActionButton(doc, "Editar codigo", () => {
        hideContextPanels();
        window.location.href = codeEditorUrl;
      }),
    );
    menu.appendChild(
      createActionButton(
        doc,
        "Remover",
        () => {
          if (selected !== doc.body && selected !== doc.documentElement) {
            captureBeforeChange(doc);
            selected.remove();
            selectedElementRef.current = null;
            updateOverlay(null);
            refreshSnapshot(doc);
          }
          hideContextPanels();
        },
        true,
      ),
    );

    positionFloatingPanel(menu, event.clientX, event.clientY);
  }

  function getTranslateValue(element: HTMLElement, axis: "x" | "y") {
    const key = axis === "x" ? "imobiflowTranslateX" : "imobiflowTranslateY";
    return Number(element.dataset[key] ?? 0);
  }

  function setTranslateValue(element: HTMLElement, x: number, y: number, baseTransform: string) {
    element.dataset.imobiflowTranslateX = String(x);
    element.dataset.imobiflowTranslateY = String(y);
    element.dataset.imobiflowBaseTransform = baseTransform;
    element.style.transform = `${baseTransform} translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`.trim();
    element.style.willChange = "transform";
  }

  function stripTranslateFromTransform(value: string) {
    return value
      .replace(/translate3d\([^)]*\)/gi, "")
      .replace(/translateX\([^)]*\)/gi, "")
      .replace(/translateY\([^)]*\)/gi, "")
      .replace(/translate\([^)]*\)/gi, "")
      .trim();
  }

  function getCandidateRects(doc: Document, current: HTMLElement) {
    return Array.from(doc.querySelectorAll<HTMLElement>("section, article, header, footer, main, div, img, a, button, h1, h2, h3, p"))
      .filter((element) => element !== current && canInspectElement(element))
      .slice(0, 140)
      .map((element) => rectSnapshot(element.getBoundingClientRect()))
      .filter((rect) => rect.width > 8 && rect.height > 8);
  }

  function rectSnapshot(rect: DOMRect): ElementRectSnapshot {
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };
  }

  function showDistanceLines(rect: ElementRectSnapshot, candidateRects: ElementRectSnapshot[]) {
    let nearestX: { distance: number; from: number; to: number; y: number } | null = null;
    let nearestY: { distance: number; from: number; to: number; x: number } | null = null;

    for (const candidate of candidateRects) {
      const overlapsY = rect.bottom >= candidate.top && rect.top <= candidate.bottom;
      const overlapsX = rect.right >= candidate.left && rect.left <= candidate.right;
      const overlapTop = Math.max(rect.top, candidate.top);
      const overlapBottom = Math.min(rect.bottom, candidate.bottom);
      const overlapLeft = Math.max(rect.left, candidate.left);
      const overlapRight = Math.min(rect.right, candidate.right);
      const horizontalY = overlapTop + Math.max(0, overlapBottom - overlapTop) / 2;
      const verticalX = overlapLeft + Math.max(0, overlapRight - overlapLeft) / 2;

      const horizontalOptions = [
        { distance: Math.abs(candidate.left - rect.right), from: rect.right, to: candidate.left, y: horizontalY },
        { distance: Math.abs(rect.left - candidate.right), from: candidate.right, to: rect.left, y: horizontalY },
      ];
      const verticalOptions = [
        { distance: Math.abs(candidate.top - rect.bottom), from: rect.bottom, to: candidate.top, x: verticalX },
        { distance: Math.abs(rect.top - candidate.bottom), from: candidate.bottom, to: rect.top, x: verticalX },
      ];

      if (overlapsY) {
        for (const option of horizontalOptions) {
          if (!nearestX || option.distance < nearestX.distance) nearestX = option;
        }
      }

      if (overlapsX) {
        for (const option of verticalOptions) {
          if (!nearestY || option.distance < nearestY.distance) nearestY = option;
        }
      }
    }

    if (nearestX && distanceLineXRef.current && distanceBadgeXRef.current) {
      const left = Math.min(nearestX.from, nearestX.to);
      const width = Math.abs(nearestX.to - nearestX.from);
      distanceLineXRef.current.hidden = width <= 1;
      distanceLineXRef.current.style.left = `${Math.round(left)}px`;
      distanceLineXRef.current.style.top = `${Math.round(nearestX.y)}px`;
      distanceLineXRef.current.style.width = `${Math.round(width)}px`;
      distanceBadgeXRef.current.hidden = width <= 1;
      distanceBadgeXRef.current.textContent = `${Math.round(nearestX.distance)}px`;
      distanceBadgeXRef.current.style.left = `${Math.round(left + width / 2 - 18)}px`;
      distanceBadgeXRef.current.style.top = `${Math.round(nearestX.y - 18)}px`;
    } else {
      if (distanceLineXRef.current) distanceLineXRef.current.hidden = true;
      if (distanceBadgeXRef.current) distanceBadgeXRef.current.hidden = true;
    }

    if (nearestY && distanceLineYRef.current && distanceBadgeYRef.current) {
      const top = Math.min(nearestY.from, nearestY.to);
      const height = Math.abs(nearestY.to - nearestY.from);
      distanceLineYRef.current.hidden = height <= 1;
      distanceLineYRef.current.style.left = `${Math.round(nearestY.x)}px`;
      distanceLineYRef.current.style.top = `${Math.round(top)}px`;
      distanceLineYRef.current.style.height = `${Math.round(height)}px`;
      distanceBadgeYRef.current.hidden = height <= 1;
      distanceBadgeYRef.current.textContent = `${Math.round(nearestY.distance)}px`;
      distanceBadgeYRef.current.style.left = `${Math.round(nearestY.x + 6)}px`;
      distanceBadgeYRef.current.style.top = `${Math.round(top + height / 2 - 8)}px`;
    } else {
      if (distanceLineYRef.current) distanceLineYRef.current.hidden = true;
      if (distanceBadgeYRef.current) distanceBadgeYRef.current.hidden = true;
    }
  }

  function snapMovement(
    startRect: { left: number; right: number; top: number; bottom: number; width: number; height: number },
    candidateRects: ElementRectSnapshot[],
    rawDx: number,
    rawDy: number,
  ) {
    const threshold = 6;
    let bestX: { delta: number; guide: number; distance: number } | null = null;
    let bestY: { delta: number; guide: number; distance: number } | null = null;

    const next = {
      left: startRect.left + rawDx,
      right: startRect.right + rawDx,
      centerX: startRect.left + rawDx + startRect.width / 2,
      top: startRect.top + rawDy,
      bottom: startRect.bottom + rawDy,
      centerY: startRect.top + rawDy + startRect.height / 2,
    };

    for (const rect of candidateRects) {
      const xTargets = [rect.left, rect.right, rect.centerX];
      const yTargets = [rect.top, rect.bottom, rect.centerY];
      const xPoints = [next.left, next.right, next.centerX];
      const yPoints = [next.top, next.bottom, next.centerY];

      for (const target of xTargets) {
        for (const point of xPoints) {
          const distance = Math.abs(point - target);
          if (distance <= threshold && (!bestX || distance < bestX.distance)) {
            bestX = { delta: target - point, guide: target, distance };
          }
        }
      }

      for (const target of yTargets) {
        for (const point of yPoints) {
          const distance = Math.abs(point - target);
          if (distance <= threshold && (!bestY || distance < bestY.distance)) {
            bestY = { delta: target - point, guide: target, distance };
          }
        }
      }
    }

    const dx = rawDx + (bestX?.delta ?? 0);
    const dy = rawDy + (bestY?.delta ?? 0);
    const guideX = bestX?.guide ?? null;
    const guideY = bestY?.guide ?? null;

    if (verticalGuideRef.current) {
      verticalGuideRef.current.hidden = guideX === null;
      if (guideX !== null) verticalGuideRef.current.style.left = `${Math.round(guideX)}px`;
    }
    if (horizontalGuideRef.current) {
      horizontalGuideRef.current.hidden = guideY === null;
      if (guideY !== null) horizontalGuideRef.current.style.top = `${Math.round(guideY)}px`;
    }

    return { dx, dy, guideX, guideY };
  }

  function installInspector() {
    cleanupRef.current?.();
    cleanupRef.current = null;
    clearHighlight();

    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      ensureUsableInspectorDocument(doc);
      if (selectedElementRef.current && selectedElementRef.current.ownerDocument !== doc) {
        selectedElementRef.current = null;
      }
      ensureEditorLayer(doc);
      onDiscoveredPages(discoverSitePagesFromDocument(doc, safeSrc));
      refreshDomLayers(doc);
      if (
        domElementPatch?.insertHtml &&
        domElementPatch.patchId &&
        doc.body.dataset.imobiflowLastAppliedPatchId !== domElementPatch.patchId
      ) {
        doc.body.dataset.imobiflowLastAppliedPatchId = domElementPatch.patchId;
        insertHtmlBlockIntoDocument(
          doc,
          domElementPatch.insertHtml,
          domElementPatch.insertPlacement ?? "beforeend",
          domElementPatch.insertMode ?? "section",
        );
      }

      const handlePointerOver = (event: Event) => {
        if (interactionRef.current) return;
        const element = pickInspectableElement(doc, event);
        if (!canInspectElement(element) || element === highlightedElementRef.current) return;

        clearHighlight();
        highlightedElementRef.current = element;
        originalOutlineRef.current = element.style.outline;
        originalCursorRef.current = element.style.cursor;
        element.style.outline = "2px solid #38bdf8";
        element.style.cursor = "move";
      };

      const handleClick = (event: Event) => {
        const target = event.target as HTMLElement | null;
        if (target && isEditorLayerElement(target)) return;
        const element = pickInspectableElement(doc, event);
        if (!canInspectElement(element)) return;
        event.preventDefault();
        event.stopPropagation();
        const mouseEvent = event as MouseEvent;
        if (mouseEvent.ctrlKey && mouseEvent.shiftKey) {
          toggleMultiSelectElement(element);
          return;
        }
        selectElement(element);
        hideContextPanels();
      };

      const handleNavigationInEditMode = (event: Event) => {
        const target = event.target as HTMLElement | null;
        if (!target || isEditorLayerElement(target)) return;
        const navigable = target.closest?.("a, button, [role='button'], [onclick]") as HTMLElement | null;
        if (!navigable || isEditorLayerElement(navigable)) return;
        event.preventDefault();
        event.stopPropagation();
        const element = pickInspectableElement(doc, event);
        if (canInspectElement(element)) selectElement(element);
      };

      const handleContextMenu = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (target && isEditorLayerElement(target)) return;
        const element = pickInspectableElement(doc, event);
        if (!canInspectElement(element)) return;
        event.preventDefault();
        event.stopPropagation();
        selectElement(element);
        showElementMenu(doc, event);
      };

      const handlePointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        const target = event.target;
        if (!target || !(target as HTMLElement).style) return;
        const element = target as HTMLElement;
        const resizeDirection = element.dataset.resizeDirection as ResizeDirection | undefined;

        if (resizeDirection && selectedElementRef.current) {
          event.preventDefault();
          event.stopPropagation();
          captureBeforeChange(doc);
          element.setPointerCapture?.(event.pointerId);
          const rect = selectedElementRef.current.getBoundingClientRect();
          const previousTransition = selectedElementRef.current.style.transition;
          selectedElementRef.current.style.transition = "none";
          selectedElementRef.current.style.userSelect = "none";
          doc.body.classList.add("imobiflow-dragging");
          interactionRef.current = {
            mode: "resize",
            element: selectedElementRef.current,
            direction: resizeDirection,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startWidth: rect.width,
            startHeight: rect.height,
            startTranslateX: getTranslateValue(selectedElementRef.current, "x"),
            startTranslateY: getTranslateValue(selectedElementRef.current, "y"),
            candidateRects: getCandidateRects(doc, selectedElementRef.current),
            baseTransform: selectedElementRef.current.dataset.imobiflowBaseTransform ?? "",
            previousTransition,
            hasMoved: false,
          };
          doc.defaultView?.addEventListener("pointermove", handlePointerMove, true);
          doc.defaultView?.addEventListener("pointerup", handlePointerUp, true);
          return;
        }

        if (isEditorLayerElement(element)) return;

        const pickedElement = pickInspectableElement(doc, event);
        if (!canInspectElement(pickedElement)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.ctrlKey && event.shiftKey) {
          hideContextPanels();
          toggleMultiSelectElement(pickedElement);
          return;
        }
        hideContextPanels();
        captureBeforeChange(doc);
        element.setPointerCapture?.(event.pointerId);
        selectElement(pickedElement);

        const computedTransform = doc.defaultView?.getComputedStyle(pickedElement).transform;
        const baseTransform = pickedElement.dataset.imobiflowBaseTransform ?? (computedTransform && computedTransform !== "none" ? computedTransform : "");
        const rect = pickedElement.getBoundingClientRect();
        const previousTransition = pickedElement.style.transition;
        pickedElement.style.transition = "none";
        pickedElement.style.userSelect = "none";
        pickedElement.draggable = false;
        doc.body.classList.add("imobiflow-dragging");
        interactionRef.current = {
          mode: "move",
          element: pickedElement,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startTranslateX: getTranslateValue(pickedElement, "x"),
          startTranslateY: getTranslateValue(pickedElement, "y"),
          startRect: {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          },
          candidateRects: getCandidateRects(doc, pickedElement),
          baseTransform,
          previousTransition,
          hasMoved: false,
        };
        doc.defaultView?.addEventListener("pointermove", handlePointerMove, true);
        doc.defaultView?.addEventListener("pointerup", handlePointerUp, true);
      };

      const handlePointerMove = (event: PointerEvent) => {
        const interaction = interactionRef.current;
        if (!interaction) return;
        event.preventDefault();
        event.stopPropagation();

        if (interaction.mode === "move") {
          const rawDx = event.clientX - interaction.startClientX;
          const rawDy = event.clientY - interaction.startClientY;
          if (!interaction.hasMoved && Math.hypot(rawDx, rawDy) < 9) return;
          interaction.hasMoved = true;
          const snapped = snapMovement(interaction.startRect, interaction.candidateRects, rawDx, rawDy);
          const nextX = interaction.startTranslateX + snapped.dx;
          const nextY = interaction.startTranslateY + snapped.dy;
          setTranslateValue(interaction.element, nextX, nextY, interaction.baseTransform);
          const rect = rectSnapshot(interaction.element.getBoundingClientRect());
          updateOverlay(interaction.element, `${Math.round(rect.width)} x ${Math.round(rect.height)} px · X ${Math.round(rect.left)} · Y ${Math.round(rect.top)}`);
          showDistanceLines(rect, interaction.candidateRects);
        }

        if (interaction.mode === "resize") {
          const rawDx = event.clientX - interaction.startClientX;
          const rawDy = event.clientY - interaction.startClientY;
          if (!interaction.hasMoved && Math.hypot(rawDx, rawDy) < 7) return;
          interaction.hasMoved = true;
          const growsEast = interaction.direction.includes("e");
          const growsWest = interaction.direction.includes("w");
          const growsSouth = interaction.direction.includes("s");
          const growsNorth = interaction.direction.includes("n");
          const width = Math.max(16, Math.round(interaction.startWidth + (growsEast ? rawDx : 0) - (growsWest ? rawDx : 0)));
          const height = Math.max(16, Math.round(interaction.startHeight + (growsSouth ? rawDy : 0) - (growsNorth ? rawDy : 0)));
          const nextX = interaction.startTranslateX + (growsWest ? interaction.startWidth - width : 0);
          const nextY = interaction.startTranslateY + (growsNorth ? interaction.startHeight - height : 0);
          interaction.element.style.width = `${width}px`;
          interaction.element.style.height = `${height}px`;
          interaction.element.style.maxWidth = "none";
          if (growsWest || growsNorth) {
            setTranslateValue(interaction.element, nextX, nextY, interaction.baseTransform);
          }
          const rect = rectSnapshot(interaction.element.getBoundingClientRect());
          updateOverlay(interaction.element, `${width} x ${height} px · X ${Math.round(rect.left)} · Y ${Math.round(rect.top)}`);
          showDistanceLines(rect, interaction.candidateRects);
        }
      };

      const handlePointerUp = () => {
        const interaction = interactionRef.current;
        interactionRef.current = null;
        if (interaction) {
          interaction.element.style.transition = interaction.previousTransition;
          interaction.element.style.userSelect = "";
          interaction.element.style.willChange = "";
          if (interaction.hasMoved) {
            const reordered =
              interaction.mode === "move" &&
              isPageSectionElement(interaction.element) &&
              reorderPageSectionAfterDrag(doc, interaction.element, interaction.baseTransform);
            if (!reordered) refreshSnapshot(doc);
          }
        }
        doc.body.classList.remove("imobiflow-dragging");
        hideGuides();
        const selected = selectedElementRef.current;
        if (selected) {
          updateOverlay(selected);
          onDomElementSelect(inspectElement(selected));
        }
        doc.defaultView?.removeEventListener("pointermove", handlePointerMove, true);
        doc.defaultView?.removeEventListener("pointerup", handlePointerUp, true);
      };

      const handleScroll = () => updateOverlay(selectedElementRef.current);
      const handleResize = () => updateOverlay(selectedElementRef.current);
      const handleKeyDown = (event: KeyboardEvent) => {
        const selected = selectedElementRef.current;
        const isShortcut = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();

        if (isShortcut && key === "z") {
          event.preventDefault();
          event.stopPropagation();
          if (event.shiftKey) redoCanvasChange(doc);
          else undoCanvasChange(doc);
          return;
        }

        if (isShortcut && key === "y") {
          event.preventDefault();
          event.stopPropagation();
          redoCanvasChange(doc);
          return;
        }

        if (isShortcut && key === "c") {
          if (!selected) return;
          event.preventDefault();
          event.stopPropagation();
          copiedElementRef.current = selected.cloneNode(true) as HTMLElement;
          return;
        }

        if (isShortcut && key === "v") {
          if (!selected || !copiedElementRef.current || selected === doc.documentElement) return;
          event.preventDefault();
          event.stopPropagation();
          captureBeforeChange(doc);
          const pasted = copiedElementRef.current.cloneNode(true) as HTMLElement;
          if (selected === doc.body) selected.appendChild(pasted);
          else selected.insertAdjacentElement("afterend", pasted);
          selectElement(pasted);
          refreshSnapshot(doc);
          return;
        }

        if (event.key !== "Delete" && event.key !== "Backspace") return;
        if (!selected || selected === doc.body) return;
        event.preventDefault();
        event.stopPropagation();
        captureBeforeChange(doc);
        selected.dataset.imobiflowHidden = "true";
        selected.dataset.imobiflowPreviousDisplay = selected.style.display;
        selected.style.display = "none";
        selectedElementRef.current = null;
        updateOverlay(null);
        refreshSnapshot(doc);
      };

      doc.addEventListener("mouseover", handlePointerOver, true);
      doc.addEventListener("click", handleClick, true);
      doc.addEventListener("submit", handleNavigationInEditMode, true);
      doc.addEventListener("contextmenu", handleContextMenu, true);
      doc.addEventListener("pointerdown", handlePointerDown, true);
      doc.addEventListener("keydown", handleKeyDown, true);
      doc.defaultView?.addEventListener("scroll", handleScroll, true);
      doc.defaultView?.addEventListener("resize", handleResize, true);

      cleanupRef.current = () => {
        doc.removeEventListener("mouseover", handlePointerOver, true);
        doc.removeEventListener("click", handleClick, true);
        doc.removeEventListener("submit", handleNavigationInEditMode, true);
        doc.removeEventListener("contextmenu", handleContextMenu, true);
        doc.removeEventListener("pointerdown", handlePointerDown, true);
        doc.removeEventListener("keydown", handleKeyDown, true);
        doc.defaultView?.removeEventListener("scroll", handleScroll, true);
        doc.defaultView?.removeEventListener("resize", handleResize, true);
        doc.defaultView?.removeEventListener("pointermove", handlePointerMove, true);
        doc.defaultView?.removeEventListener("pointerup", handlePointerUp, true);
        clearHighlight();
        updateOverlay(null);
      };
    } catch {}
  }

  useEffect(() => {
    installInspector();
    return () => cleanupRef.current?.();
  }, [safeSrc, safeSnapshotHtml]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      <iframe
        key={iframeKey}
        ref={iframeRef}
        className="h-full w-full border-0 bg-white"
        sandbox={BUILDER_EDITOR_SANDBOX}
        referrerPolicy="no-referrer"
        src={safeSnapshotHtml ? undefined : safeSrc}
        srcDoc={safeSnapshotHtml || undefined}
        title="Site real em edição"
        onLoad={installInspector}
      />
    </div>
  );
}

function ViewportButton({
  label,
  active,
  onClick,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: typeof Monitor;
}) {
  return (
    <Button type="button" variant={active ? "default" : "outline"} size="sm" onClick={onClick}>
      <Icon className="size-4" />
      {label}
    </Button>
  );
}

function nextViewport(viewport: EditorViewport): EditorViewport {
  if (viewport === "desktop") return "tablet";
  if (viewport === "tablet") return "mobile";
  return "desktop";
}

function viewportLabel(viewport: EditorViewport) {
  if (viewport === "desktop") return "Desktop";
  if (viewport === "tablet") return "Tablet";
  return "Mobile";
}

function viewportIcon(viewport: EditorViewport): typeof Monitor {
  if (viewport === "desktop") return Monitor;
  if (viewport === "tablet") return Tablet;
  return Smartphone;
}

function EditorField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-white/75">{label}</span>
      <input
        className="h-10 w-full rounded-md border border-white/15 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-amber-400"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const colorValue = normalizeColorInput(value);

  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-white/75">{label}</span>
      <div className="flex overflow-hidden rounded-md border border-white/15 bg-neutral-950 focus-within:border-amber-400">
        <input
          type="color"
          className="h-10 w-12 cursor-pointer border-0 bg-transparent p-1"
          value={colorValue}
          onChange={(event) => onChange(event.target.value)}
          title="Escolher cor visualmente"
        />
        <input
          className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  );
}

function LinkSuggestionField({
  label,
  value,
  suggestions,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  suggestions: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const filteredSuggestions = suggestions
    .filter((suggestion) => `${suggestion.label} ${suggestion.value}`.toLowerCase().includes(value.toLowerCase().replace("/", "")))
    .slice(0, 6);

  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-white/75">{label}</span>
      <input
        className="h-10 w-full rounded-md border border-white/15 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-amber-400"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {filteredSuggestions.length > 0 ? (
        <div className="mt-2 grid gap-1 rounded-md border border-white/10 bg-neutral-950 p-1">
          {filteredSuggestions.map((suggestion) => (
            <button
              key={`${suggestion.label}-${suggestion.value}`}
              type="button"
              className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-white/70 hover:bg-amber-300/10 hover:text-amber-100"
              onClick={() => onChange(suggestion.value)}
            >
              <span className="truncate">{suggestion.label}</span>
              <span className="shrink-0 text-white/40">{suggestion.value}</span>
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

function DomElementPropertiesPanel({
  element,
  pages,
  onChange,
  codeEditorPath,
}: {
  element: InspectedElement;
  pages: WebsiteBuilderPageRecord[];
  onChange: (patch: Omit<DomElementPatch, "patchId">) => void;
  codeEditorPath: string;
}) {
  const canEditText = ["button", "link", "text", "card", "section", "generic"].includes(element.kind) && element.kind !== "selector";
  const canEditLink = ["button", "link", "card", "image"].includes(element.kind);
  const canEditMedia = ["image", "video", "background", "section", "card"].includes(element.kind);
  const pageSuggestions = pages.map((page) => ({
    label: page.title,
    value: page.slug === "home" ? "/" : `/${page.slug}`,
  }));

  return (
    <section className="mb-4 rounded-lg border border-sky-400/25 bg-sky-400/[0.07] p-3">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-200">Elemento selecionado</p>
        <p className="mt-1 text-sm font-semibold text-white">{elementKindLabel(element.kind)}</p>
        <details className="mt-1 text-xs text-white/45">
          <summary className="cursor-pointer text-white/55">Ver caminho técnico do elemento</summary>
          <p className="mt-1 break-all rounded-md border border-white/10 bg-neutral-950 p-2">{element.selector}</p>
        </details>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <EditorField label="Posição X" value={String(element.x)} placeholder="0" onChange={(x) => onChange({ x: numericInputValue(x, element.x) })} />
        <EditorField label="Posição Y" value={String(element.y)} placeholder="0" onChange={(y) => onChange({ y: numericInputValue(y, element.y) })} />
      </div>

      <div className="grid gap-3">
        {canEditText ? (
          <label className="text-sm">
            <span className="mb-1 block font-medium text-white/75">Texto</span>
            <textarea
              className="min-h-24 w-full resize-y rounded-md border border-white/15 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-300"
              value={element.text}
              placeholder="Texto do elemento"
              onChange={(event) => onChange({ text: event.target.value })}
            />
          </label>
        ) : null}

        {canEditLink ? (
          <LinkSuggestionField
            label="Redirecionamento / link"
            value={element.href}
            placeholder="/contato ou https://..."
            suggestions={pageSuggestions}
            onChange={(href) => onChange({ href })}
          />
        ) : null}

        {element.kind === "selector" && element.options.length > 0 ? (
          <section className="rounded-lg border border-white/10 bg-neutral-950 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Opções do seletor ou menu</p>
            <p className="mb-3 text-xs text-white/45">Edite cada opção separadamente para manter o texto e o destino corretos.</p>
            <div className="grid max-h-72 gap-3 overflow-auto pr-1">
              {element.options.map((option) => (
                <div key={option.index} className="rounded-md border border-white/10 bg-white/[0.03] p-2">
                  <EditorField
                    label={`Texto da opção ${option.index + 1}`}
                    value={option.label}
                    onChange={(optionText) => onChange({ optionIndex: option.index, optionText })}
                  />
                  <div className="mt-2">
                    <LinkSuggestionField
                      label="Destino"
                      value={option.href}
                      placeholder="/imoveis ou https://..."
                      suggestions={pageSuggestions}
                      onChange={(optionHref) => onChange({ optionIndex: option.index, optionHref })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {canEditMedia ? (
          <>
            <EditorField
              label={element.kind === "background" || element.kind === "section" ? "Imagem de fundo / URL" : "Imagem ou vídeo / URL"}
              value={element.src}
              placeholder="https://..."
              onChange={(src) => onChange({ src })}
            />
            <EditorField
              label="Texto alternativo / acessibilidade"
              value={element.alt}
              placeholder="Descrição da imagem ou seção"
              onChange={(alt) => onChange({ alt })}
            />
          </>
        ) : null}

        <section className="rounded-lg border border-white/10 bg-neutral-950 p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Cores e tipografia</p>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <ColorField label="Cor texto" value={element.color} placeholder="#ffffff" onChange={(color) => onChange({ style: { color } })} />
              <ColorField
                label="Fundo"
                value={element.background}
                placeholder="#111827"
                onChange={(backgroundColor) => onChange({ style: { backgroundColor } })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EditorField label="Tamanho da letra" value={element.fontSize} placeholder="48px" onChange={(fontSize) => onChange({ style: { fontSize } })} />
              <EditorField label="Espessura da fonte" value={element.fontWeight} placeholder="400 normal / 700 negrito" onChange={(fontWeight) => onChange({ style: { fontWeight } })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EditorField label="Altura linha" value={element.lineHeight} placeholder="1.15" onChange={(lineHeight) => onChange({ style: { lineHeight } })} />
              <DomSelectField
                label="Alinhamento"
                value={element.textAlign}
                options={["left", "center", "right", "justify"]}
                onChange={(textAlign) => onChange({ style: { textAlign } })}
              />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-neutral-950 p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Layout, tamanho e posição</p>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <EditorField label="Largura" value={element.widthStyle} placeholder="320px" onChange={(width) => onChange({ style: { width } })} />
              <EditorField label="Altura" value={element.heightStyle} placeholder="180px" onChange={(height) => onChange({ style: { height } })} />
            </div>
            <EditorField label="Espaçamento interno" value={element.padding} placeholder="16px 24px" onChange={(padding) => onChange({ style: { padding } })} />
            <EditorField label="Margem" value={element.margin} placeholder="0 auto" onChange={(margin) => onChange({ style: { margin } })} />
            <EditorField label="Distância entre itens / gap" value={element.gap} placeholder="16px" onChange={(gap) => onChange({ style: { gap } })} />
            <div className="grid grid-cols-2 gap-3">
              <EditorField label="Raio" value={element.borderRadius} placeholder="16px" onChange={(borderRadius) => onChange({ style: { borderRadius } })} />
              <EditorField label="Opacidade" value={element.opacity} placeholder="1" onChange={(opacity) => onChange({ style: { opacity } })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DomSelectField
                label="Display"
                value={element.display}
                options={["block", "inline-block", "flex", "grid", "none"]}
                onChange={(display) => onChange({ style: { display } })}
              />
              <DomSelectField
                label="Posição"
                value={element.position}
                options={["static", "relative", "absolute", "fixed", "sticky"]}
                onChange={(position) => onChange({ style: { position } })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EditorField label="Camada / z-index" value={element.zIndex} placeholder="10" onChange={(zIndex) => onChange({ style: { zIndex } })} />
              <EditorField label="Borda" value={element.border} placeholder="1px solid #d4af37" onChange={(border) => onChange({ style: { border } })} />
            </div>
          </div>
        </section>

        {canEditMedia ? (
          <section className="rounded-lg border border-white/10 bg-neutral-950 p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Imagem, vídeo, fundo e gradiente</p>
            <div className="grid gap-3">
              <EditorField
                label="Fundo CSS / gradiente"
                value={element.backgroundImage}
                placeholder='url("..."), linear-gradient(...) ou https://video.mp4'
                onChange={(backgroundImage) => onChange({ style: { backgroundImage } })}
              />
              <div className="grid grid-cols-2 gap-3">
                <EditorField
                  label="Tamanho do fundo"
                  value={element.backgroundSize}
                  placeholder="cover"
                  onChange={(backgroundSize) => onChange({ style: { backgroundSize } })}
                />
                <EditorField
                  label="Posição do fundo"
                  value={element.backgroundPosition}
                  placeholder="center"
                  onChange={(backgroundPosition) => onChange({ style: { backgroundPosition } })}
                />
              </div>
              <DomSelectField
                label="Ajuste da imagem"
                value={element.objectFit}
                options={["cover", "contain", "fill", "scale-down", "none"]}
                onChange={(objectFit) => onChange({ style: { objectFit } })}
              />
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-white/10 bg-neutral-950 p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Sombra, vidro e relevo</p>
          <div className="grid gap-3">
            <EditorField label="Sombra" value={element.boxShadow} placeholder="0 24px 70px rgba(0,0,0,.24)" onChange={(boxShadow) => onChange({ style: { boxShadow } })} />
            <EditorField label="Filtro / blur" value={element.filter} placeholder="blur(0px) saturate(1.1)" onChange={(filter) => onChange({ style: { filter } })} />
            <EditorField label="Vidro / backdrop blur" value={element.backdropFilter} placeholder="blur(18px) saturate(140%)" onChange={(backdropFilter) => onChange({ style: { backdropFilter } })} />
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-neutral-950 p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Movimento, 3D e animação</p>
          <div className="grid gap-3">
            <EditorField
              label="Transform / 3D"
              value={element.transform}
              placeholder="perspective(900px) rotateX(8deg) scale(1)"
              onChange={(transform) => onChange({ style: { transform } })}
            />
            <EditorField
              label="Animação"
              value={element.animation}
              placeholder="imobiflow-float-soft 4s ease-in-out infinite"
              onChange={(animation) => onChange({ style: { animation } })}
            />
            <div className="grid grid-cols-2 gap-3">
              <EditorField label="Duração" value="" placeholder="4s" onChange={(animationDuration) => onChange({ style: { animationDuration } })} />
              <EditorField label="Delay" value="" placeholder=".2s" onChange={(animationDelay) => onChange({ style: { animationDelay } })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" size="sm" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={() => onChange({ style: { animation: "imobiflow-float-soft 4s ease-in-out infinite" } })}>
                Floating
              </Button>
              <Button type="button" variant="outline" size="sm" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={() => onChange({ style: { animation: "imobiflow-pulse-gold 2.8s ease-in-out infinite" } })}>
                Glow
              </Button>
              <Button type="button" variant="outline" size="sm" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={() => onChange({ style: { transform: "perspective(900px) rotateX(8deg) rotateY(-10deg) translateZ(0)", transformStyle: "preserve-3d" } })}>
                3D
              </Button>
              <Button type="button" variant="outline" size="sm" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={() => onChange({ style: { backdropFilter: "blur(22px) saturate(150%)", backgroundColor: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.22)" } })}>
                Vidro
              </Button>
            </div>
          </div>
        </section>

        <Button variant="outline" size="sm" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" asChild>
          <a href={codeEditorPath}>
            <Code2 className="size-4" />
            Editar código deste site
          </a>
        </Button>
      </div>
    </section>
  );
}

function DomSelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-white/75">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-white/15 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-amber-400"
        value={value || options[0] || ""}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function mergeInspectedElementPatch(element: InspectedElement, patch: DomElementPatch): InspectedElement {
  const next = { ...element };
  if (patch.text !== undefined) {
    next.text = patch.text;
    next.label = patch.text ? patch.text.slice(0, 72) : next.label;
  }
  if (patch.href !== undefined) next.href = patch.href;
  if (patch.src !== undefined) next.src = patch.src;
  if (patch.alt !== undefined) next.alt = patch.alt;
  if (patch.x !== undefined) next.x = patch.x;
  if (patch.y !== undefined) next.y = patch.y;
  if (patch.optionIndex !== undefined) {
    next.options = next.options.map((option) =>
      option.index === patch.optionIndex
        ? {
            ...option,
            label: patch.optionText ?? option.label,
            href: patch.optionHref ?? option.href,
          }
        : option,
    );
  }
  if (!patch.style) return next;

  if (patch.style.color !== undefined) next.color = patch.style.color;
  if (patch.style.backgroundColor !== undefined) next.background = patch.style.backgroundColor;
  if (patch.style.backgroundImage !== undefined) next.backgroundImage = patch.style.backgroundImage;
  if (patch.style.fontSize !== undefined) next.fontSize = patch.style.fontSize;
  if (patch.style.fontWeight !== undefined) next.fontWeight = patch.style.fontWeight;
  if (patch.style.lineHeight !== undefined) next.lineHeight = patch.style.lineHeight;
  if (patch.style.textAlign !== undefined) next.textAlign = patch.style.textAlign;
  if (patch.style.width !== undefined) {
    next.widthStyle = patch.style.width;
    next.width = parsePixels(patch.style.width, next.width);
  }
  if (patch.style.height !== undefined) {
    next.heightStyle = patch.style.height;
    next.height = parsePixels(patch.style.height, next.height);
  }
  if (patch.style.padding !== undefined) next.padding = patch.style.padding;
  if (patch.style.margin !== undefined) next.margin = patch.style.margin;
  if (patch.style.gap !== undefined) next.gap = patch.style.gap;
  if (patch.style.borderRadius !== undefined) next.borderRadius = patch.style.borderRadius;
  if (patch.style.opacity !== undefined) next.opacity = patch.style.opacity;
  if (patch.style.display !== undefined) next.display = patch.style.display;
  if (patch.style.position !== undefined) next.position = patch.style.position;
  if (patch.style.objectFit !== undefined) next.objectFit = patch.style.objectFit;
  if (patch.style.transform !== undefined) next.transform = patch.style.transform;
  if (patch.style.animation !== undefined) next.animation = patch.style.animation;
  if (patch.style.zIndex !== undefined) next.zIndex = patch.style.zIndex;
  if (patch.style.boxShadow !== undefined) next.boxShadow = patch.style.boxShadow;
  if (patch.style.filter !== undefined) next.filter = patch.style.filter;
  if (patch.style.backdropFilter !== undefined) next.backdropFilter = patch.style.backdropFilter;
  if (patch.style.border !== undefined) next.border = patch.style.border;
  if (patch.style.backgroundSize !== undefined) next.backgroundSize = patch.style.backgroundSize;
  if (patch.style.backgroundPosition !== undefined) next.backgroundPosition = patch.style.backgroundPosition;
  return next;
}

function parsePixels(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function numericInputValue(value: string, fallback: number) {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function normalizeColorInput(value: string) {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  const rgb = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((part) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, "0"))
      .join("")}`;
  }
  return "#ffffff";
}

function domElementTitle(element: InspectedElement) {
  return `${elementKindLabel(element.kind)} selecionado`;
}

function elementKindLabel(kind: DomElementKind) {
  const labels: Record<DomElementKind, string> = {
    button: "Botão",
    link: "Link",
    text: "Texto",
    image: "Imagem",
    video: "Vídeo",
    section: "Seção",
    background: "Fundo com imagem",
    card: "Card",
    icon: "Ícone",
    selector: "Seletor / menu",
    generic: "Bloco / container",
  };
  return labels[kind];
}

function isUsableSavedBuilderCanvasHtml(html: string) {
  const normalized = html.trim().toLowerCase();
  if (normalized.length < 80) return false;
  if (!/<(main|section|header|footer|article|img|video|h1|h2|p|a|button)\b/i.test(html)) return false;
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const titleText = titleMatch?.[1]?.toLowerCase() ?? "";

  const brokenSignals = [
    "carregando editor",
    "site nao encontrado",
    "site não encontrado",
    "esta página não carregou",
    "esta pagina nao carregou",
    "não foi possível carregar esta área",
    "nao foi possivel carregar esta area",
    "website builder - fase",
    "fase 2 - editor visual",
    "app/site/builder/editor",
    "/app/site/builder",
    "website builder com mysql",
    "site público conectado aos imóveis reais",
    "site publico conectado aos imoveis reais",
    "a fundação do novo construtor",
    "a fundacao do novo construtor",
    "abrir builder",
    "biblioteca camadas páginas",
    "biblioteca camadas paginas",
    "biblioteca enterprise",
    "categorias expansíveis",
    "categorias expansiveis",
    "páginas e blocos",
    "paginas e blocos",
    "tema global",
    "salva em theme_json",
    "assets r2",
    "layout, tamanho e posição",
    "layout, tamanho e posicao",
    "sombra, vidro e relevo",
    "nada selecionado",
    "propriedades</p>",
    "propriedades</span>",
    "acesso antecipado ao produto saas",
    "imobiflow preview - site em branco",
    "imobiflow preview",
    "soltar seção",
    "soltar secao",
    "editor visual</p>",
    "imóveis que unem desejo, confiança",
    "imoveis que unem desejo, confianca",
    "data-imobiflow-editor-layer",
    "imobiflow-selection-box",
    "imobiflow-resize-handle",
    "imobiflow-section-insert-line",
    "o sistema imobiliário que elimina planilhas",
    "o sistema imobiliario que elimina planilhas",
    "a nova geração de software imobiliário",
    "a nova geracao de software imobiliario",
    "solicitar demonstração",
    "solicitar demonstracao",
    "teste grátis",
    "teste gratis",
  ];

  if (normalized.includes("editor visual") && normalized.includes("site em branco")) return false;
  if (looksLikeImobiFlowMarketingPage(normalized, titleText)) return false;

  return !brokenSignals.some((signal) => normalized.includes(signal));
}

function looksLikeImobiFlowMarketingPage(bodyText: string, titleText = "") {
  const normalized = `${titleText} ${bodyText}`.toLowerCase();
  const marketingSignals = [
    "o sistema imobiliário que elimina planilhas",
    "o sistema imobiliario que elimina planilhas",
    "a nova geração de software imobiliário",
    "a nova geracao de software imobiliario",
    "solicitar demonstração",
    "solicitar demonstracao",
    "ver plataforma funcionando",
    "teste grátis",
    "teste gratis",
  ];

  if (marketingSignals.some((signal) => normalized.includes(signal))) return true;
  return (
    normalized.includes("imobiflow") &&
    normalized.includes("produto") &&
    normalized.includes("quem usa") &&
    normalized.includes("resultados") &&
    normalized.includes("planos") &&
    normalized.includes("faq")
  );
}

function isBuilderSafeSitePreviewUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/" || trimmed === "#" || trimmed.startsWith("/app") || trimmed.startsWith("/login")) return false;

  if (trimmed.startsWith("/site/")) return true;
  if (trimmed.startsWith("#")) return false;

  try {
    const url = new URL(trimmed, typeof window !== "undefined" ? window.location.origin : "https://imobifloww-main.vercel.app");
    if (url.pathname === "/" || url.pathname.startsWith("/app") || url.pathname.startsWith("/login")) return false;
    return url.pathname.startsWith("/site/");
  } catch {
    return false;
  }
}

function resolveLiveEditorUrl(
  website: WebsiteBuilderWebsite | null,
  externalPreviewUrl?: string,
  fallbackLiveSiteUrl?: string,
) {
  const storedLiveEditorUrl = readRecordString(website?.settingsJson ?? {}, "live_editor_url");
  const storedExternalPreviewUrl = externalPreviewUrl || readRecordString(website?.settingsJson ?? {}, "external_preview_url");
  const candidates = [storedLiveEditorUrl, fallbackLiveSiteUrl ?? "", storedExternalPreviewUrl];

  return candidates.find(isBuilderSafeSitePreviewUrl) ?? "";
}
function resolveLiveEditorUrlForPage(
  website: WebsiteBuilderWebsite | null,
  externalPreviewUrl: string | undefined,
  fallbackLiveSiteUrl: string | undefined,
  page: WebsiteBuilderPageRecord | null,
  pagePreviewPaths: Record<string, string>,
) {
  const baseUrl = resolveLiveEditorUrl(website, externalPreviewUrl, fallbackLiveSiteUrl);
  if (!baseUrl || !page) return baseUrl;

  const previewPath =
    readRecordString(page.settingsJson, "preview_path") ||
    readRecordString(page.settingsJson, "preview_url") ||
    pagePreviewPaths[normalizeSlug(page.slug || page.title)] ||
    inferPreviewPathFromSlug(page.slug);

  return applyPreviewPath(baseUrl, previewPath);
}

function applyPreviewPath(baseUrl: string, previewPath: string) {
  if (!previewPath) return baseUrl;
  if (/^https?:\/\//i.test(previewPath)) return isBuilderSafeSitePreviewUrl(previewPath) ? previewPath : baseUrl;

  const fallbackOrigin = typeof window !== "undefined" ? window.location.origin : "https://imobifloww-main.vercel.app";
  try {
    const url = new URL(baseUrl, fallbackOrigin);
    if (previewPath === "/") return isBuilderSafeSitePreviewUrl(baseUrl) ? `${url.pathname}${url.search}${url.hash}` : "";
    if (previewPath.startsWith("#")) {
      url.hash = previewPath.slice(1);
      return `${url.pathname}${url.search}${url.hash}`;
    }
    if (previewPath.startsWith("/")) return isBuilderSafeSitePreviewUrl(previewPath) ? previewPath : baseUrl;

    const cleanBase = url.pathname.replace(/\/$/, "");
    url.pathname = `${cleanBase}/${previewPath.replace(/^\//, "")}`;
    url.hash = "";
    const resolved = `${url.pathname}${url.search}`;
    return isBuilderSafeSitePreviewUrl(resolved) ? resolved : baseUrl;
  } catch {
    if (previewPath.startsWith("#")) return `${baseUrl.split("#")[0]}${previewPath}`;
    const resolved = previewPath.startsWith("/") ? previewPath : `${baseUrl.replace(/\/$/, "")}/${previewPath}`;
    return isBuilderSafeSitePreviewUrl(resolved) ? resolved : baseUrl;
  }
}
function inferPreviewPathFromSlug(slug: string) {
  const normalized = normalizeSlug(slug);
  if (!normalized || normalized === "home" || normalized === "inicio" || normalized === "topo") return "#topo";
  if (["imoveis", "venda", "locacao", "sobre", "contato", "termos", "privacidade"].includes(normalized)) return `#${normalized}`;
  if (normalized === "politica-de-privacidade") return "#privacidade";
  return normalized;
}

function blueprintPreviewPathMap() {
  return Object.fromEntries(sitePageBlueprints.map((page) => [page.slug, page.previewPath]));
}

function previewPathMapFromPages(pages: WebsiteBuilderPageRecord[]) {
  return Object.fromEntries(
    pages
      .map((page) => [normalizeSlug(page.slug || page.title), readRecordString(page.settingsJson, "preview_path") || readRecordString(page.settingsJson, "preview_url")] as const)
      .filter(([, previewPath]) => Boolean(previewPath)),
  );
}

function discoverSitePagesFromDocument(doc: Document, currentSrc: string): DiscoveredSitePage[] {
  const base = new URL(currentSrc, doc.defaultView?.location.origin ?? "https://imobifloww-main.vercel.app");
  const discovered = new Map<string, DiscoveredSitePage>();

  doc.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const rawHref = anchor.getAttribute("href") ?? "";
    if (!rawHref || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:") || rawHref.startsWith("whatsapp:")) return;

    let url: URL;
    try {
      url = new URL(rawHref, base);
    } catch {
      return;
    }

    if (url.origin !== base.origin && !rawHref.startsWith("#")) return;
    const samePageHash = rawHref.startsWith("#") || (url.pathname === base.pathname && Boolean(url.hash));
    const sameSitePath = url.pathname.startsWith("/site/");
    if (!samePageHash && !sameSitePath) return;

    const previewPath = samePageHash ? url.hash || "#topo" : `${url.pathname}${url.search}${url.hash}`;
    const label =
      anchor.textContent?.replace(/\s+/g, " ").trim() ||
      anchor.getAttribute("aria-label") ||
      anchor.getAttribute("title") ||
      previewPath.replace(/^#/, "").replace(/[-_]/g, " ");
    const slug = normalizeSlug(previewPath.startsWith("#") ? previewPath.slice(1) || label : url.pathname.split("/").filter(Boolean).at(-1) || label);
    if (!slug || discovered.has(slug)) return;

    discovered.set(slug, {
      title: titleCase(label || slug),
      slug,
      previewPath,
      pageType: inferPageTypeFromSlug(slug),
    });
  });

  return [...discovered.values()];
}

function inferPageTypeFromSlug(slug: string): WebsiteBuilderPageRecord["pageType"] {
  const normalized = normalizeSlug(slug);
  if (normalized === "home" || normalized === "topo" || normalized === "inicio") return "home";
  if (["imoveis", "venda", "locacao", "alugar", "comprar"].includes(normalized)) return "property";
  if (normalized === "sobre") return "about";
  if (normalized === "contato") return "contact";
  if (normalized.includes("termo")) return "terms";
  if (normalized.includes("privacidade")) return "privacy";
  return "custom";
}

function titleCase(value: string) {
  return value
    .replace(/[-_#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function findComponentByType(components: WebsiteBuilderComponent[], type: string) {
  return components.find((component) => component.componentType === type || component.componentType.includes(type));
}

function readImportedAssets(settings: Record<string, unknown>) {
  const assets = settings.imported_assets;
  if (!Array.isArray(assets)) return [];
  return assets.filter(isRecord).flatMap((asset) => {
    const path = readRecordString(asset, "path");
    const url = readRecordString(asset, "url");
    return path && url ? [{ path, url }] : [];
  });
}

function readImportedPathList(settings: Record<string, unknown>, key: string) {
  const items = settings[key];
  if (!Array.isArray(items)) return [];
  return items.filter(isRecord).flatMap((item) => {
    const path = readRecordString(item, "path");
    return path ? [path] : [];
  });
}

function viewportFrameClass(viewport: EditorViewport) {
  if (viewport === "mobile") return "mx-auto max-w-[390px]";
  if (viewport === "tablet") return "mx-auto max-w-[820px]";
  return "mx-auto max-w-6xl";
}

function liveSiteFrameClass(viewport: EditorViewport) {
  if (viewport === "mobile") return "mx-auto h-full max-w-[390px] overflow-hidden";
  if (viewport === "tablet") return "mx-auto h-full max-w-[820px] overflow-hidden";
  return "h-full w-full overflow-hidden";
}

function nodeButtonClass(active: boolean, extra = "") {
  return [
    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition",
    active ? "bg-amber-400 text-neutral-950" : "text-white/70 hover:bg-white/10 hover:text-white",
    extra,
  ].join(" ");
}

function canvasSelectionClass(selected: boolean, visible: boolean) {
  const base = "border-b border-white/10 px-6 py-12 transition";
  const state = selected ? "bg-amber-300/10 outline outline-2 outline-amber-300/45" : "hover:bg-white/[0.03]";
  return `${base} ${state} ${visible ? "" : "opacity-60"}`;
}

function selectionLabel(selection: Selection | null) {
  if (!selection) return "Nada selecionado";
  if (selection.type === "page") return "Página";
  if (selection.type === "section") return "Seção";
  return "Componente";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function inferAssetType(file: File): WebsiteBuilderAsset["assetType"] {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.includes("font")) return "font";
  if (file.type.includes("pdf") || file.type.includes("document") || file.type.includes("sheet") || file.type.includes("csv")) return "document";
  return "other";
}

function propertyCoverUrl(property: Property) {
  const cover = property.property_media?.find((media) => media.is_cover) ?? property.property_media?.[0];
  return cover?.url ?? "";
}

function formatMoneyCents(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function propertyOperationLabel(operation: Property["operation"]) {
  if (operation === "sale") return "Venda";
  if (operation === "rent") return "Locação";
  return "Venda e locação";
}

function isVisualEffectLibraryItem(item: BuilderLibraryItem) {
  return ["Efeitos", "Animacoes", "Animacoes 3D", "3D"].includes(item.category);
}

function isSectionLibraryItem(item: BuilderLibraryItem) {
  if (item.kind === "section") return true;
  if (["Blocos", "Produto", "Formularios", "Layout", "Colecao", "Rodape", "Fundos", "Personalizado"].includes(item.category)) return true;
  return false;
}

function libraryPreviewStyle(item: BuilderLibraryItem): CSSProperties {
  const normalized = slugifyBuilderType(`${item.category} ${item.name}`);
  const base: CSSProperties = {
    background: "linear-gradient(135deg, rgba(255,255,255,.08), rgba(200,162,75,.18))",
  };

  if (normalized.includes("3d") || normalized.includes("tilt") || normalized.includes("profundidade")) {
    return {
      ...base,
      background: "linear-gradient(135deg, #080806, #2b2111 56%, #d3a93e)",
      boxShadow: "0 18px 45px rgba(200,162,75,.24)",
      transform: "perspective(680px) rotateX(9deg) rotateY(-10deg)",
    };
  }

  if (normalized.includes("aurora") || normalized.includes("mesh") || normalized.includes("luzes")) {
    return {
      ...base,
      background:
        "radial-gradient(circle at 18% 26%, rgba(215,181,86,.75), transparent 28%), radial-gradient(circle at 72% 26%, rgba(117,63,255,.55), transparent 30%), radial-gradient(circle at 42% 86%, rgba(31,170,255,.42), transparent 34%), #080806",
    };
  }

  if (normalized.includes("glass") || normalized.includes("blur")) {
    return {
      ...base,
      background: "linear-gradient(135deg, rgba(255,255,255,.28), rgba(255,255,255,.04))",
      backdropFilter: "blur(18px)",
      border: "1px solid rgba(255,255,255,.24)",
    };
  }

  if (normalized.includes("neon") || normalized.includes("glow") || normalized.includes("brilho")) {
    return {
      ...base,
      background: "linear-gradient(135deg, #080806, #1c1406)",
      boxShadow: "0 0 0 1px rgba(238,197,91,.75), 0 0 44px rgba(238,197,91,.42)",
    };
  }

  if (normalized.includes("botao") || item.componentType === "button") {
    return {
      ...base,
      background: "linear-gradient(135deg, #f4d06f, #b88924)",
      borderRadius: "999px",
      boxShadow: "0 16px 38px rgba(200,162,75,.28)",
    };
  }

  if (normalized.includes("imagem") || item.componentType === "image") {
    return {
      ...base,
      background: "linear-gradient(135deg, rgba(8,8,6,.2), rgba(8,8,6,.6)), url('/placeholder.svg') center/cover",
      borderRadius: "22px",
      boxShadow: "0 18px 50px rgba(0,0,0,.4)",
    };
  }

  return base;
}

function LibraryVisualPreview({ item }: { item: BuilderLibraryItem }) {
  const normalized = slugifyBuilderType(`${item.id ?? ""} ${item.category} ${item.name}`);
  const shellClass = "mb-3 overflow-hidden rounded-2xl border border-white/10 bg-black/50 p-2";
  const frameClass = "relative h-32 overflow-hidden rounded-xl";

  if (normalized.includes("header") || normalized.includes("cabecalho") || normalized.includes("menu")) {
    return (
      <div className={shellClass}>
        <div className={`${frameClass} bg-[#080806] p-3`}>
          <div className="flex items-center justify-between rounded-xl border border-amber-300/25 bg-black/55 px-3 py-2 shadow-[0_18px_45px_rgba(0,0,0,.35)]">
            <div className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-lg bg-amber-300 text-[10px] font-black text-black">M</div>
              <div>
                <div className="h-2 w-16 rounded-full bg-white/90" />
                <div className="mt-1 h-1.5 w-10 rounded-full bg-amber-200/70" />
              </div>
            </div>
            <div className="hidden gap-1.5 sm:flex">
              <div className="h-2 w-7 rounded-full bg-white/45" />
              <div className="h-2 w-7 rounded-full bg-white/45" />
              <div className="h-2 w-7 rounded-full bg-white/45" />
            </div>
            <div className="h-6 w-14 rounded-full bg-amber-300" />
          </div>
          <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">
            Header com logo, menu e CTA
          </div>
        </div>
      </div>
    );
  }

  if (item.category === "Gerar" || normalized.includes("forma") || normalized.includes("linha") || normalized.includes("quadrado") || normalized.includes("circulo") || normalized.includes("elipse")) {
    return (
      <div className={shellClass}>
        <div className={`${frameClass} bg-[radial-gradient(circle_at_20%_20%,rgba(244,208,111,.28),transparent_30%),#101010]`}>
          <div className="absolute left-3 top-3 h-10 w-16 rounded-xl bg-amber-300/85 shadow-[0_12px_34px_rgba(244,208,111,.35)]" />
          <div className="absolute right-5 top-4 size-11 rounded-full bg-white/20 backdrop-blur" />
          <div className="absolute bottom-4 left-5 h-0.5 w-24 rotate-[-12deg] bg-sky-300 shadow-[0_0_18px_rgba(125,211,252,.7)]" />
          <div className="absolute bottom-3 right-5 h-8 w-14 rounded-[50%] bg-amber-300/25 ring-1 ring-amber-200/50" />
        </div>
      </div>
    );
  }

  if (normalized.includes("hero")) {
    return (
      <div className={shellClass}>
        <div className={`${frameClass} bg-[linear-gradient(90deg,rgba(0,0,0,.88),rgba(0,0,0,.28)),url('https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=600&q=60')] bg-cover bg-center`}>
          <div className="absolute left-4 top-4 h-2 w-24 rounded-full bg-amber-300/80" />
          <div className="absolute left-4 top-8 h-3 w-36 rounded bg-white/90" />
          <div className="absolute left-4 top-14 h-2 w-28 rounded bg-white/55" />
          <div className="absolute bottom-3 left-4 h-5 w-24 rounded-full bg-amber-300" />
          <div className="absolute bottom-3 left-32 h-5 w-20 rounded-full border border-white/50 bg-white/10" />
        </div>
      </div>
    );
  }

  if (normalized.includes("texto_jumbo") || normalized.includes("jumbo")) {
    return (
      <div className={shellClass}>
        <div className={`${frameClass} bg-[radial-gradient(circle_at_78%_74%,rgba(244,208,111,.32),transparent_30%),#0b0b0a] p-3`}>
          <div className="h-2 w-20 rounded-full bg-amber-300/80" />
          <div className="mt-3 h-6 w-36 rounded bg-white/95" />
          <div className="mt-1 h-6 w-28 rounded bg-white/80" />
          <div className="absolute bottom-3 left-3 h-2 w-28 rounded bg-white/25" />
          <div className="absolute right-4 top-5 size-14 rounded-full bg-amber-300/20 blur-sm" />
        </div>
      </div>
    );
  }

  if (normalized.includes("imovel") || normalized.includes("vitrine") || normalized.includes("galeria") || normalized.includes("carrossel") || normalized.includes("produto")) {
    return (
      <div className={shellClass}>
        <div className={`${frameClass} bg-[#f7f4ed] p-2`}>
          <div className="mb-2 flex items-end justify-between">
            <div>
              <div className="h-1.5 w-14 rounded bg-amber-600" />
              <div className="mt-1 h-3 w-28 rounded bg-neutral-950" />
            </div>
            <div className="h-5 w-14 rounded-full bg-neutral-950" />
          </div>
          <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="overflow-hidden rounded-lg bg-white shadow-sm">
              <div className="h-10 bg-[linear-gradient(135deg,#d4af37,#111827)] bg-cover" />
              <div className="space-y-1 p-2">
                <div className="h-1.5 rounded bg-neutral-900/80" />
                <div className="h-1.5 w-2/3 rounded bg-neutral-500/60" />
                <div className="h-2 w-14 rounded-full bg-amber-500/80" />
                <div className="flex gap-1">
                  <div className="h-1.5 w-4 rounded bg-neutral-300" />
                  <div className="h-1.5 w-4 rounded bg-neutral-300" />
                  <div className="h-1.5 w-4 rounded bg-neutral-300" />
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>
      </div>
    );
  }

  if (item.category === "Efeitos" || item.category === "Animacoes" || item.category === "Animacoes 3D" || normalized.includes("efeito") || normalized.includes("animacao")) {
    if (normalized.includes("glass") || normalized.includes("blur") || normalized.includes("transpar")) {
      return (
        <div className={shellClass}>
          <div className={`${frameClass} bg-[linear-gradient(135deg,#080806,#2a1d08)] p-4`}>
            <div className="absolute left-5 top-5 size-16 animate-pulse rounded-full bg-amber-300/45 blur-xl" />
            <div className="absolute bottom-4 right-6 size-20 rounded-full bg-sky-300/25 blur-2xl" />
            <div className="relative grid h-full place-items-center rounded-2xl border border-white/25 bg-white/15 text-center text-xs font-black uppercase tracking-[0.18em] text-white shadow-[0_24px_70px_rgba(0,0,0,.45)] backdrop-blur-xl">
              Glass + Blur
            </div>
          </div>
        </div>
      );
    }

    if (normalized.includes("tilt") || normalized.includes("3d") || normalized.includes("flip")) {
      return (
        <div className={shellClass}>
          <div className={`${frameClass} bg-[#080806]`} style={{ perspective: "700px" }}>
            <div className="absolute left-1/2 top-1/2 h-20 w-28 -translate-x-1/2 -translate-y-1/2 animate-[pulse_2s_ease-in-out_infinite] rounded-2xl border border-amber-200/45 bg-gradient-to-br from-white/20 to-amber-300/30 shadow-[0_34px_80px_rgba(0,0,0,.55)]" style={{ transform: "translate(-50%, -50%) rotateX(15deg) rotateY(-18deg)" }} />
            <div className="absolute bottom-4 left-1/2 h-2 w-24 -translate-x-1/2 rounded-full bg-black/55 blur" />
            <div className="absolute right-4 top-4 rounded-full bg-amber-300 px-2 py-1 text-[10px] font-black text-black">3D</div>
          </div>
        </div>
      );
    }

    return (
      <div className={shellClass}>
        <div className={`${frameClass} bg-[radial-gradient(circle_at_18%_24%,rgba(244,208,111,.32),transparent_30%),#080806]`}>
          <div className="absolute inset-3 rounded-xl border border-amber-200/20 bg-white/[0.04]" />
          <div className="absolute left-4 top-5 h-11 w-20 animate-pulse rounded-2xl bg-amber-300/80 shadow-[0_0_34px_rgba(244,208,111,.55)]" />
          <div className="absolute bottom-5 left-1/2 h-8 w-24 -translate-x-1/2 animate-bounce rounded-full border border-white/25 bg-white/15 backdrop-blur" />
          <div className="absolute right-5 top-4 size-9 animate-spin rounded-full border-2 border-amber-300/70 border-t-transparent" />
          <div className="absolute bottom-4 right-5 h-14 w-14 rotate-12 rounded-xl bg-gradient-to-br from-white/25 to-amber-300/35 shadow-[0_24px_60px_rgba(0,0,0,.45)]" />
        </div>
      </div>
    );
  }

  if (normalized.includes("form") || normalized.includes("contato") || normalized.includes("email") || normalized.includes("lead")) {
    return (
      <div className={shellClass}>
        <div className={`${frameClass} grid grid-cols-[1fr_1.1fr] gap-3 bg-neutral-950 p-3`}>
          <div className="space-y-2">
            <div className="h-2 w-16 rounded bg-amber-300" />
            <div className="h-3 w-24 rounded bg-white/80" />
            <div className="h-2 w-20 rounded bg-white/30" />
          </div>
          <div className="grid gap-1.5 rounded-xl border border-white/10 bg-white/10 p-2">
            <div className="h-3 rounded bg-white/80" />
            <div className="h-3 rounded bg-white/80" />
            <div className="h-3 rounded bg-white/80" />
            <div className="h-4 rounded bg-amber-300" />
          </div>
        </div>
      </div>
    );
  }

  if (normalized.includes("3d") || normalized.includes("profundidade") || normalized.includes("tilt")) {
    return (
      <div className={shellClass}>
        <div className={`${frameClass} bg-[radial-gradient(circle_at_70%_20%,rgba(244,208,111,.45),transparent_32%),#080806]`}>
          <div className="absolute left-8 top-5 h-16 w-28 rotate-[-8deg] rounded-2xl border border-amber-200/40 bg-white/15 shadow-[0_30px_70px_rgba(0,0,0,.55)] backdrop-blur-xl" />
          <div className="absolute bottom-5 right-6 h-7 w-16 rotate-[10deg] rounded-xl bg-amber-300/80 shadow-[0_20px_50px_rgba(244,208,111,.3)]" />
        </div>
      </div>
    );
  }

  if (normalized.includes("video") || normalized.includes("imagem") || normalized.includes("fundo")) {
    return (
      <div className={shellClass}>
        <div className={`${frameClass} bg-[linear-gradient(135deg,rgba(0,0,0,.25),rgba(0,0,0,.55)),url('https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=600&q=60')] bg-cover bg-center`}>
          <div className="absolute inset-3 rounded-xl border border-white/20" />
          {normalized.includes("video") ? <div className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 text-center text-lg leading-10 text-black">▶</div> : null}
        </div>
      </div>
    );
  }

  if (normalized.includes("menu") || normalized.includes("rodape") || normalized.includes("link")) {
    return (
      <div className={shellClass}>
        <div className={`${frameClass} bg-neutral-950 p-3`}>
          <div className="flex items-center justify-between gap-2">
            <div className="h-5 w-20 rounded bg-amber-300" />
            <div className="flex gap-1">
              <div className="h-2 w-8 rounded bg-white/50" />
              <div className="h-2 w-8 rounded bg-white/50" />
              <div className="h-2 w-8 rounded bg-white/50" />
            </div>
          </div>
          <div className="absolute inset-x-3 bottom-3 grid grid-cols-3 gap-2">
            <div className="h-7 rounded bg-white/10" />
            <div className="h-7 rounded bg-white/10" />
            <div className="h-7 rounded bg-white/10" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className={frameClass} style={libraryPreviewStyle(item)}>
        <div className="absolute inset-x-4 top-4 h-2 rounded-full bg-white/20" />
        <div className="absolute bottom-4 left-4 h-8 w-20 rounded-xl bg-white/15" />
        <div className="absolute bottom-4 right-4 h-8 w-8 rounded-full bg-amber-300/80 shadow-[0_0_28px_rgba(244,208,111,.65)]" />
      </div>
    </div>
  );
}

function libraryDomElementPatch(item: BuilderLibraryItem, targetKind?: DomElementKind): Omit<DomElementPatch, "patchId"> {
  const normalized = slugifyBuilderType(`${item.category} ${item.name}`);
  const style: DomElementStylePatch = {
    transition: "transform 260ms ease, box-shadow 260ms ease, filter 260ms ease, background 260ms ease, color 260ms ease",
    outline: "2px solid rgba(244,208,111,.82)",
    outlineOffset: "5px",
    willChange: "transform, filter, box-shadow, background-position",
  };

  if (item.category === "Blocos" || item.category === "Layout" || targetKind === "section" || targetKind === "background") {
    Object.assign(style, {
      minHeight: item.category === "Blocos" ? "420px" : undefined,
      padding: item.category === "Layout" ? "48px" : "72px 28px",
      borderRadius: "32px",
      backgroundImage:
        "radial-gradient(circle at 14% 18%, rgba(244,208,111,.28), transparent 30%), linear-gradient(135deg, rgba(8,8,6,.96), rgba(35,25,10,.92))",
      backgroundSize: "160% 160%",
      boxShadow: "0 36px 100px rgba(0,0,0,.42), inset 0 0 0 1px rgba(244,208,111,.24)",
      overflow: "hidden",
      animation: "imobiflow-aurora-field 7s ease-in-out infinite",
    });
  }

  if (targetKind === "button" || normalized.includes("botao")) {
    Object.assign(style, {
      backgroundImage: "linear-gradient(135deg, #ffe28a, #d4af37 52%, #9b6e16)",
      color: "#080806",
      borderRadius: "999px",
      padding: "15px 26px",
      fontWeight: "800",
      boxShadow: "0 0 0 1px rgba(255,226,138,.62), 0 18px 48px rgba(212,175,55,.42)",
      transform: "translate3d(0, -3px, 0) scale(1.03)",
      animation: "imobiflow-pulse-gold 1.8s ease-in-out infinite",
    });
  }

  if (targetKind === "text" || normalized.includes("texto") || normalized.includes("titulo") || normalized.includes("jumbo")) {
    Object.assign(style, {
      color: "#ffffff",
      letterSpacing: normalized.includes("jumbo") ? "0.02em" : "0",
      textAlign: "inherit",
      textShadow: "0 0 28px rgba(244,208,111,.34), 0 12px 36px rgba(0,0,0,.38)",
      animation: normalized.includes("wave") || normalized.includes("text") ? "imobiflow-text-wave 1.6s ease-in-out infinite" : "imobiflow-reveal-pop .9s ease both",
    });
  }

  if (targetKind === "image" || normalized.includes("imagem") || normalized.includes("reveal")) {
    Object.assign(style, {
      borderRadius: "26px",
      objectFit: "cover",
      filter: "saturate(1.18) contrast(1.08)",
      boxShadow: "0 32px 90px rgba(0,0,0,.55), 0 0 0 1px rgba(244,208,111,.22)",
      transform: "scale(1.035)",
      animation: normalized.includes("ken") || normalized.includes("zoom") || normalized.includes("cinematic") ? "imobiflow-ken-burns 4.8s ease-in-out infinite alternate" : "imobiflow-reveal-pop .9s ease both",
    });
  }

  if (targetKind === "card" || normalized.includes("card") || normalized.includes("produto")) {
    Object.assign(style, {
      borderRadius: "24px",
      backgroundColor: "rgba(8,8,6,.72)",
      backdropFilter: "blur(18px)",
      border: "1px solid rgba(212,175,55,.28)",
      boxShadow: "0 34px 96px rgba(0,0,0,.52), 0 0 0 1px rgba(244,208,111,.24)",
      transform: "translate3d(0, -6px, 0)",
      animation: "imobiflow-float-soft 2.8s ease-in-out infinite",
    });
  }

  if (normalized.includes("3d") || normalized.includes("tilt") || normalized.includes("profundidade") || normalized.includes("perspectiva") || normalized.includes("depth") || normalized.includes("orbita") || normalized.includes("flip")) {
    Object.assign(style, {
      transform: normalized.includes("flip")
        ? "perspective(1000px) rotateY(14deg) rotateX(3deg) translateZ(0)"
        : "perspective(1000px) rotateX(7deg) rotateY(-9deg) translate3d(0, -8px, 0)",
      transformStyle: "preserve-3d",
      boxShadow: "0 42px 110px rgba(0,0,0,.58), 0 0 0 1px rgba(244,208,111,.34), 0 0 54px rgba(244,208,111,.18)",
      filter: "saturate(1.14) contrast(1.04)",
      animation: "imobiflow-tilt-showcase 2.7s ease-in-out infinite alternate",
    });
  }

  if (normalized.includes("parallax") || normalized.includes("floating") || normalized.includes("flutuante")) {
    Object.assign(style, {
      transform: "translate3d(0, -14px, 0)",
      boxShadow: "0 32px 84px rgba(0,0,0,.42)",
      animation: "imobiflow-float-soft 2.4s ease-in-out infinite",
    });
  }

  if (normalized.includes("glow") || normalized.includes("brilho") || normalized.includes("neon") || normalized.includes("metalico")) {
    Object.assign(style, {
      boxShadow: "0 0 0 2px rgba(244,208,111,.72), 0 0 58px rgba(244,208,111,.56), 0 26px 72px rgba(0,0,0,.38)",
      borderColor: "rgba(244,208,111,.56)",
      animation: "imobiflow-pulse-gold 1.7s ease-in-out infinite",
    });
  }

  if (normalized.includes("glass") || normalized.includes("blur")) {
    Object.assign(style, {
      backgroundColor: "rgba(255,255,255,.16)",
      backdropFilter: "blur(20px)",
      border: "1px solid rgba(255,255,255,.22)",
      boxShadow: "0 34px 90px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.22)",
      animation: "imobiflow-glass-breathe 2.6s ease-in-out infinite",
    });
  }

  if (normalized.includes("aurora") || normalized.includes("mesh") || normalized.includes("particulas") || normalized.includes("grid") || normalized.includes("fundo") || normalized.includes("spotlight") || normalized.includes("gradient")) {
    Object.assign(style, {
      backgroundImage:
        "radial-gradient(circle at 16% 18%, rgba(244,208,111,.58), transparent 26%), radial-gradient(circle at 84% 16%, rgba(110,76,255,.34), transparent 28%), radial-gradient(circle at 48% 92%, rgba(28,170,255,.24), transparent 34%), linear-gradient(135deg, rgba(8,8,6,.98), rgba(31,24,12,.94))",
      backgroundSize: "180% 180%",
      color: "#ffffff",
      animation: "imobiflow-aurora-field 6.5s ease-in-out infinite",
    });
  }

  if (normalized.includes("shimmer") || normalized.includes("shine") || normalized.includes("loading")) {
    Object.assign(style, {
      backgroundImage: "linear-gradient(110deg, rgba(255,255,255,.04), rgba(244,208,111,.5), rgba(255,255,255,.06))",
      backgroundSize: "240% 100%",
      animation: "imobiflow-shimmer-sweep 1.6s linear infinite",
      boxShadow: "0 0 0 1px rgba(244,208,111,.35), 0 18px 54px rgba(244,208,111,.22)",
    });
  }

  if (normalized.includes("bounce") || normalized.includes("elastic") || normalized.includes("pop")) {
    Object.assign(style, {
      animation: "imobiflow-elastic-pop 1.1s cubic-bezier(.2,1.4,.35,1) both",
      transform: "scale(1.04)",
    });
  }

  if (normalized.includes("fade") || normalized.includes("slide") || normalized.includes("scale") || normalized.includes("reveal") || normalized.includes("awwwards")) {
    Object.assign(style, {
      transform: style.transform ?? "translate3d(0, -4px, 0) scale(1.01)",
      opacity: "1",
      filter: style.filter ?? "saturate(1.04)",
      animation: "imobiflow-reveal-pop .95s ease both",
    });
  }

  return { style };
}

function libraryBlockHtml(item: BuilderLibraryItem, properties: Property[], websiteName = "Site da imobiliaria", websiteId = "") {
  const normalized = slugifyBuilderType(`${item.category} ${item.name}`);
  const safeName = escapeHtml(item.name);
  const visibleProperties = properties.filter((property) => property.status === "available" || property.status === "reserved").slice(0, 8);
  const cards = visibleProperties.length > 0 ? visibleProperties : properties.slice(0, 8);
  const blockId = `imobiflow-block-${slugifyBuilderType(item.name)}-${Date.now()}`;
  const sectionStyle =
    "position:relative;isolation:isolate;overflow:hidden;padding:82px 28px;background:#080806;color:#fff;font-family:Inter,Arial,sans-serif;";
  const innerStyle = "max-width:1180px;margin:0 auto;position:relative;z-index:1;";
  const eyebrow =
    '<span style="display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(212,175,55,.45);border-radius:999px;padding:8px 12px;background:rgba(212,175,55,.12);color:#f3d77b;font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;">ImobiFlow Builder</span>';
  const firstProperty = cards[0] ?? null;

  if (normalized.includes("header") || normalized.includes("cabecalho") || item.id === "luxury-menu-header") {
    return `<header id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" style="position:sticky;top:0;z-index:80;background:rgba(8,8,6,.78);backdrop-filter:blur(22px) saturate(145%);border-bottom:1px solid rgba(212,175,55,.24);color:#fff;font-family:Inter,Arial,sans-serif;">
      <div data-editable="true" style="max-width:1240px;margin:0 auto;min-height:82px;padding:0 6vw;display:flex;align-items:center;justify-content:space-between;gap:22px;">
        <a data-editable="true" href="#topo" style="display:flex;align-items:center;gap:12px;color:#fff;text-decoration:none;">
          <span data-editable="true" style="display:grid;place-items:center;width:48px;height:48px;border-radius:16px;background:linear-gradient(135deg,#d4af37,#7a5a12);color:#080806;font-weight:950;box-shadow:0 16px 42px rgba(212,175,55,.25);">M</span>
          <strong data-editable="true" style="font-size:21px;letter-spacing:.02em;">${escapeHtml(websiteName)}</strong>
        </a>
        <nav data-editable="true" style="display:flex;align-items:center;justify-content:center;gap:24px;color:rgba(255,255,255,.78);font-size:14px;font-weight:800;">
          <a data-editable="true" href="#imoveis" style="color:inherit;text-decoration:none;">Imóveis</a>
          <a data-editable="true" href="#venda" style="color:inherit;text-decoration:none;">Venda</a>
          <a data-editable="true" href="#locacao" style="color:inherit;text-decoration:none;">Locação</a>
          <a data-editable="true" href="#sobre" style="color:inherit;text-decoration:none;">Sobre</a>
          <a data-editable="true" href="#contato" style="color:inherit;text-decoration:none;">Contato</a>
        </nav>
        <a data-editable="true" href="#contato" style="display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:#d4af37;color:#080806;text-decoration:none;font-weight:950;padding:13px 20px;box-shadow:0 16px 42px rgba(212,175,55,.28);">Falar no WhatsApp</a>
      </div>
    </header>`;
  }

  if (item.id?.startsWith("generator-")) {
    const generatorMap: Record<string, Partial<BuilderLibraryItem>> = {
      "generator-rectangle": { id: "shape-rectangle-free", category: "Formas", kind: "element" },
      "generator-square": { id: "free-square-shape", category: "Formas", kind: "element" },
      "generator-circle": { id: "shape-circle-free", category: "Formas", kind: "element" },
      "generator-ellipse": { id: "free-ellipse-shape", category: "Formas", kind: "element" },
      "generator-horizontal-line": { id: "horizontal-line-free", category: "Linhas", kind: "element" },
      "generator-vertical-line": { id: "vertical-line-free", category: "Linhas", kind: "element" },
      "generator-diagonal-line": { id: "diagonal-line-free", category: "Linhas", kind: "element" },
      "generator-arrow": { id: "arrow-line-free", category: "Linhas", kind: "element" },
      "generator-container": { id: "free-container", category: "Layouts", kind: "section" },
      "generator-grid": { id: "free-grid", category: "Layouts", kind: "section" },
      "generator-columns": { id: "free-columns", category: "Layouts", kind: "section" },
      "generator-text": { id: "free-text", category: "Textos", kind: "element" },
      "generator-title": { id: "title-editorial", category: "Textos", kind: "element" },
      "generator-button": { id: "premium-button-glow", category: "Botoes", kind: "element" },
      "generator-image": { id: "free-image", category: "Imagens", kind: "element" },
      "generator-video": { id: "free-video", category: "Videos", kind: "element" },
      "generator-glass": { id: "ios-glass-panel", category: "Efeitos", kind: "element" },
      "generator-gradient": { id: "mesh-gradient-background", category: "Fundos", kind: "element" },
      "generator-blob": { id: "organic-blob-shape", category: "Decorativos", kind: "element" },
      "generator-3d": { id: "simple-3d-element", category: "Elementos 3D", kind: "element" },
    };
    return libraryBlockHtml({ ...item, ...generatorMap[item.id] }, properties, websiteName, websiteId);
  }

  if (item.id === "free-container" || normalized.includes("container_livre") || normalized.includes("grupo_de_elementos")) {
    return `<section id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" style="position:relative;min-height:420px;padding:64px 6vw;background:rgba(8,8,6,.96);color:#fff;isolation:isolate;overflow:hidden;">
      <div data-editable="true" style="max-width:1180px;margin:0 auto;min-height:260px;border:2px dashed rgba(212,175,55,.38);border-radius:32px;background:rgba(255,255,255,.04);backdrop-filter:blur(18px);display:grid;place-items:center;padding:36px;">
        <div data-editable="true" style="text-align:center;max-width:560px;">
          <span data-editable="true" style="color:#d4af37;font-weight:900;letter-spacing:.16em;text-transform:uppercase;">Container livre</span>
          <h2 data-editable="true" style="margin:12px 0 8px;font-size:42px;line-height:1;">Arraste elementos para esta área</h2>
          <p data-editable="true" style="margin:0;color:rgba(255,255,255,.72);line-height:1.7;">Use como grupo, seção vazia, moldura, fundo ou área de composição livre.</p>
        </div>
      </div>
    </section>`;
  }

  if (item.id === "free-grid" || normalized.includes("grid_livre") || normalized.includes("grid_responsivo")) {
    return `<section id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" style="padding:76px 6vw;background:#f7f4ed;color:#111;">
      <div data-editable="true" style="max-width:1180px;margin:0 auto;display:grid;gap:24px;">
        <h2 data-editable="true" style="font-size:clamp(34px,5vw,64px);line-height:1;margin:0;">Grid livre editável</h2>
        <div data-editable="true" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;">
          ${[1, 2, 3, 4].map((index) => `<article data-editable="true" style="min-height:180px;border-radius:24px;background:#fff;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.09);"><strong data-editable="true">Card ${index}</strong><p data-editable="true" style="color:#666;">Edite texto, tamanho, cor, fundo e ordem.</p></article>`).join("")}
        </div>
      </div>
    </section>`;
  }

  if (item.id === "free-columns" || normalized.includes("duas_colunas") || normalized.includes("tres_colunas") || normalized.includes("colunas_livres")) {
    return `<section id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" style="padding:82px 6vw;background:#080806;color:#fff;">
      <div data-editable="true" style="max-width:1180px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:28px;align-items:center;">
        <div data-editable="true" style="display:grid;gap:14px;"><span data-editable="true" style="color:#d4af37;font-weight:900;letter-spacing:.16em;text-transform:uppercase;">Coluna editável</span><h2 data-editable="true" style="font-size:52px;line-height:1;margin:0;">Layout livre para compor páginas.</h2><p data-editable="true" style="color:rgba(255,255,255,.72);line-height:1.7;">Troque textos, imagens, cores, fundos e reposicione tudo no canvas.</p></div>
        <div data-editable="true" style="min-height:360px;border-radius:32px;background:linear-gradient(135deg,rgba(212,175,55,.85),rgba(255,255,255,.08));box-shadow:0 30px 90px rgba(0,0,0,.35);"></div>
      </div>
    </section>`;
  }

  if (item.id === "free-square-shape" || normalized.includes("quadrado")) {
    return `<div data-imobiflow-name="${safeName}" data-editable="true" style="width:240px;height:240px;position:relative;z-index:2;border-radius:18px;background:linear-gradient(135deg,#d4af37,#8b6a19);box-shadow:0 26px 70px rgba(0,0,0,.28);"></div>`;
  }

  if (item.id === "shape-rectangle-free" || normalized.includes("retangulo")) {
    return `<div data-imobiflow-name="${safeName}" data-editable="true" style="width:380px;height:220px;position:relative;z-index:2;border-radius:28px;background:linear-gradient(135deg,#d4af37,#7a5a12);box-shadow:0 24px 70px rgba(0,0,0,.24);"></div>`;
  }

  if (item.id === "shape-circle-free" || item.id === "free-ellipse-shape" || normalized.includes("circulo") || normalized.includes("elipse")) {
    const isEllipse = item.id === "free-ellipse-shape" || normalized.includes("elipse");
    return `<div data-imobiflow-name="${safeName}" data-editable="true" style="width:${isEllipse ? "340px" : "240px"};height:${isEllipse ? "190px" : "240px"};position:relative;z-index:2;border-radius:999px;background:radial-gradient(circle at 30% 25%,#fff6c7,#d4af37 42%,#7a5a12 100%);box-shadow:0 24px 70px rgba(0,0,0,.24);"></div>`;
  }

  if (item.id === "organic-blob-shape" || normalized.includes("blob") || normalized.includes("organica") || normalized.includes("abstrato")) {
    return `<div data-imobiflow-name="${safeName}" data-editable="true" style="width:330px;height:250px;position:relative;z-index:2;border-radius:42% 58% 62% 38% / 42% 36% 64% 58%;background:radial-gradient(circle at 35% 22%,rgba(255,255,255,.92),rgba(212,175,55,.92) 34%,rgba(98,69,13,.95) 100%);filter:saturate(1.1);box-shadow:0 34px 90px rgba(0,0,0,.3);"></div>`;
  }

  if (item.id === "horizontal-line-free" || item.id === "vertical-line-free" || item.id === "diagonal-line-free" || item.id === "arrow-line-free" || item.id === "line-divider-premium" || normalized.includes("linha") || normalized.includes("divisor") || normalized.includes("seta")) {
    const isVertical = item.id === "vertical-line-free" || normalized.includes("vertical");
    const isDiagonal = item.id === "diagonal-line-free" || normalized.includes("diagonal");
    const isArrow = item.id === "arrow-line-free" || normalized.includes("seta");
    return `<div data-imobiflow-name="${safeName}" data-editable="true" style="width:${isVertical ? "3px" : "420px"};height:${isVertical ? "260px" : "3px"};position:relative;z-index:2;background:linear-gradient(90deg,transparent,#d4af37,transparent);transform:${isDiagonal ? "rotate(-18deg)" : "none"};box-shadow:0 0 28px rgba(212,175,55,.45);">${isArrow ? `<span data-editable="true" style="position:absolute;right:-8px;top:50%;width:18px;height:18px;border-right:3px solid #d4af37;border-top:3px solid #d4af37;transform:translateY(-50%) rotate(45deg);"></span>` : ""}</div>`;
  }

  if (item.id === "free-text" || normalized.includes("texto_livre") || normalized.includes("paragrafo")) {
    return `<p data-imobiflow-name="${safeName}" data-editable="true" style="max-width:620px;position:relative;z-index:2;margin:0;color:#ffffff;font-size:20px;line-height:1.7;">Texto livre editável. Selecione, arraste, mude tamanho, cor, fundo, animação, camada e link.</p>`;
  }

  if (item.id === "free-subtitle" || normalized.includes("subtitulo")) {
    return `<p data-imobiflow-name="${safeName}" data-editable="true" style="max-width:740px;position:relative;z-index:2;margin:0;color:rgba(255,255,255,.72);font-size:24px;line-height:1.45;">Subtítulo editável para complementar a chamada principal.</p>`;
  }

  if (normalized.includes("texto_jumbo") || normalized.includes("jumbo")) {
    return `<div id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" style="position:relative;z-index:3;max-width:1040px;padding:34px;border-radius:34px;background:linear-gradient(135deg,rgba(255,255,255,.10),rgba(212,175,55,.10));border:1px solid rgba(212,175,55,.26);box-shadow:0 34px 100px rgba(0,0,0,.32);overflow:hidden;color:#fff;">
      <div data-editable="true" style="position:absolute;inset:auto -12% -38% auto;width:360px;height:360px;border-radius:999px;background:rgba(212,175,55,.24);filter:blur(34px);"></div>
      <span data-editable="true" style="position:relative;color:#d4af37;font-weight:950;letter-spacing:.18em;text-transform:uppercase;">Texto jumbo editorial</span>
      <h2 data-editable="true" style="position:relative;margin:16px 0 12px;font-size:clamp(58px,9vw,132px);line-height:.82;font-weight:950;letter-spacing:-.055em;text-transform:uppercase;">Luxo que vende antes da visita.</h2>
      <p data-editable="true" style="position:relative;max-width:720px;margin:0;color:rgba(255,255,255,.72);font-size:19px;line-height:1.7;">Um bloco de impacto para chamadas comerciais, diferenciais e seções editoriais de alto padrão.</p>
    </div>`;
  }

  if (item.id === "title-editorial" || normalized.includes("titulo")) {
    return `<div data-imobiflow-name="${safeName}" data-editable="true" style="max-width:860px;position:relative;z-index:2;color:#fff;"><span data-editable="true" style="color:#d4af37;font-weight:900;letter-spacing:.16em;text-transform:uppercase;">Texto premium</span><h2 data-editable="true" style="font-size:clamp(42px,6vw,86px);line-height:.96;margin:14px 0;">Uma presença digital para imóveis que precisam ser desejados.</h2><p data-editable="true" style="font-size:18px;line-height:1.7;color:rgba(255,255,255,.72);">Edite fonte, tamanho, cor, alinhamento, animação e espaçamento no painel direito.</p></div>`;
  }

  if (item.id === "free-image" || normalized.includes("imagem_livre") || normalized.includes("imagem_arredondada")) {
    return `<img data-imobiflow-name="${safeName}" data-editable="true" src="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80" alt="Imagem editável" style="width:420px;height:280px;position:relative;z-index:2;object-fit:cover;border-radius:30px;box-shadow:0 30px 90px rgba(0,0,0,.32);display:block;">`;
  }

  if (item.id === "free-video" || normalized.includes("video_livre") || normalized.includes("video_incorporado")) {
    return `<video data-imobiflow-name="${safeName}" data-editable="true" src="https://cdn.coverr.co/videos/coverr-luxury-apartment-8689/1080p.mp4" controls muted playsinline style="width:520px;height:300px;position:relative;z-index:2;object-fit:cover;border-radius:30px;background:#111;box-shadow:0 30px 90px rgba(0,0,0,.35);"></video>`;
  }

  if (item.id === "background-image-section" || normalized.includes("fundo_com_imagem")) {
    return `<section id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" style="position:relative;min-height:640px;padding:100px 6vw;background:linear-gradient(90deg,rgba(0,0,0,.82),rgba(0,0,0,.28)),url('https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=85') center/cover no-repeat;color:#fff;overflow:hidden;">
      <div data-editable="true" style="max-width:920px;position:relative;z-index:1;"><span data-editable="true" style="color:#d4af37;font-weight:900;letter-spacing:.16em;text-transform:uppercase;">Fundo com imagem</span><h2 data-editable="true" style="font-size:clamp(44px,7vw,96px);line-height:.95;margin:16px 0;">Imagem forte com overlay editável.</h2><p data-editable="true" style="font-size:19px;color:rgba(255,255,255,.78);line-height:1.7;">Troque imagem, gradiente, altura, textos, botões e camadas no painel direito.</p></div>
    </section>`;
  }

  if (item.id === "simple-3d-element" || item.id === "floating-depth-element" || normalized.includes("elemento_3d") || normalized.includes("profundidade_com_sombra")) {
    return `<div data-imobiflow-name="${safeName}" data-editable="true" style="width:340px;min-height:220px;position:relative;z-index:5;padding:28px;border-radius:30px;background:linear-gradient(135deg,rgba(255,255,255,.2),rgba(212,175,55,.18));color:#fff;backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.22);box-shadow:0 48px 110px rgba(0,0,0,.38),0 18px 40px rgba(212,175,55,.18);transform:perspective(900px) rotateX(8deg) rotateY(-10deg);transform-style:preserve-3d;">
      <span data-editable="true" style="color:#d4af37;font-weight:900;letter-spacing:.14em;text-transform:uppercase;">3D editável</span>
      <h3 data-editable="true" style="margin:12px 0 8px;font-size:30px;line-height:1;">Profundidade visual</h3>
      <p data-editable="true" style="margin:0;color:rgba(255,255,255,.72);line-height:1.6;">Mude rotação, escala, sombra, blur, z-index e animação.</p>
    </div>`;
  }

  if (item.category === "Fundos") {
    if (normalized.includes("video")) {
      return `<section id="${blockId}" data-imobiflow-name="${safeName}" style="${sectionStyle}min-height:620px;display:flex;align-items:center;">
        <video data-imobiflow-background="video" autoplay muted loop playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.38;background:#080806;"></video>
        <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(8,8,6,.92),rgba(8,8,6,.42),rgba(8,8,6,.88));"></div>
        <div style="${innerStyle}">
          ${eyebrow}
          <h2 style="max-width:820px;margin:22px 0 16px;font-size:clamp(42px,7vw,92px);line-height:.95;font-weight:950;">Fundo com video premium</h2>
          <p style="max-width:680px;color:rgba(255,255,255,.76);font-size:18px;line-height:1.75;">Selecione esta seção ou o vídeo para trocar arquivo, cor, opacidade, altura e posicionamento no painel direito.</p>
        </div>
      </section>`;
    }

    return `<section id="${blockId}" data-imobiflow-name="${safeName}" style="${sectionStyle}min-height:520px;background:radial-gradient(circle at 18% 18%,rgba(244,208,111,.42),transparent 28%),radial-gradient(circle at 82% 24%,rgba(96,76,255,.28),transparent 30%),linear-gradient(135deg,#080806,#17110a 58%,#050505);background-size:180% 180%;animation:imobiflow-aurora-field 7s ease-in-out infinite;">
      <div style="${innerStyle}">
        ${eyebrow}
        <h2 style="max-width:760px;margin:22px 0 16px;font-size:clamp(38px,6vw,78px);line-height:.98;font-weight:950;">${escapeHtml(item.name)}</h2>
        <p style="max-width:640px;color:rgba(255,255,255,.74);font-size:18px;line-height:1.75;">Fundo editável para criar profundidade, glass, luzes, movimento e composição premium no site.</p>
        <div style="margin-top:28px;width:min(100%,520px);height:170px;border-radius:30px;background:rgba(255,255,255,.12);backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.22);box-shadow:0 34px 100px rgba(0,0,0,.36),inset 0 1px 0 rgba(255,255,255,.24);"></div>
      </div>
    </section>`;
  }

  if (item.category === "Basico") {
    if (normalized.includes("titulo")) {
      return `<h2 id="${blockId}" data-imobiflow-name="${safeName}" style="margin:24px 0 12px;color:inherit;font-size:clamp(30px,4vw,54px);line-height:1.04;font-weight:950;">Titulo editavel do site</h2>`;
    }
    if (normalized.includes("texto") || normalized.includes("subtitulo") || normalized.includes("paragrafo")) {
      return `<p id="${blockId}" data-imobiflow-name="${safeName}" style="max-width:680px;margin:14px 0;color:rgba(255,255,255,.72);font-size:18px;line-height:1.75;">Texto editavel para explicar a proposta, o imovel, o servico ou a chamada comercial.</p>`;
    }
    if (normalized.includes("botao")) {
      return `<a id="${blockId}" data-imobiflow-name="${safeName}" href="#contato" style="display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:#d4af37;color:#080806;padding:15px 24px;font-weight:950;text-decoration:none;box-shadow:0 18px 44px rgba(212,175,55,.28);">Botao editavel</a>`;
    }
    if (normalized.includes("imagem") || normalized.includes("logo")) {
      return `<figure id="${blockId}" data-imobiflow-name="${safeName}" style="display:flex;align-items:center;justify-content:center;min-height:240px;border:1px dashed rgba(212,175,55,.5);border-radius:26px;background:linear-gradient(135deg,rgba(212,175,55,.18),rgba(255,255,255,.05));color:#f3d77b;font-weight:950;">Imagem / logo editavel</figure>`;
    }
    if (normalized.includes("video")) {
      return `<div id="${blockId}" data-imobiflow-name="${safeName}" style="display:flex;align-items:center;justify-content:center;min-height:280px;border-radius:26px;background:#080806;color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);font-weight:950;">Video editavel</div>`;
    }
    if (normalized.includes("linha") || normalized.includes("divisoria")) {
      return `<hr id="${blockId}" data-imobiflow-name="${safeName}" style="height:1px;border:0;background:linear-gradient(90deg,transparent,#d4af37,transparent);margin:32px 0;">`;
    }
    if (normalized.includes("retangulo")) {
      return `<div id="${blockId}" data-imobiflow-name="${safeName}" style="width:min(100%,420px);height:180px;border-radius:28px;background:linear-gradient(135deg,rgba(212,175,55,.36),rgba(255,255,255,.08));box-shadow:0 28px 80px rgba(0,0,0,.34),inset 0 0 0 1px rgba(255,255,255,.18);"></div>`;
    }
    if (normalized.includes("circulo")) {
      return `<div id="${blockId}" data-imobiflow-name="${safeName}" style="width:190px;height:190px;border-radius:999px;background:radial-gradient(circle at 32% 25%,#fff5c6,#d4af37 44%,#6b4a11);box-shadow:0 28px 90px rgba(212,175,55,.32);"></div>`;
    }
    if (normalized.includes("organica") || normalized.includes("moldura") || normalized.includes("curva") || normalized.includes("seta")) {
      return `<div id="${blockId}" data-imobiflow-name="${safeName}" style="width:min(100%,360px);height:170px;border-radius:42% 58% 64% 36% / 48% 38% 62% 52%;background:rgba(255,255,255,.13);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.24);box-shadow:0 24px 80px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.22);"></div>`;
    }
    if (normalized.includes("badge") || normalized.includes("numero")) {
      return `<div id="${blockId}" data-imobiflow-name="${safeName}" style="display:inline-flex;align-items:center;gap:10px;border-radius:999px;background:rgba(212,175,55,.14);color:#f3d77b;padding:10px 14px;font-size:13px;font-weight:950;">${normalized.includes("numero") ? "29 imoveis" : "Badge editavel"}</div>`;
    }
  }

  if (item.category === "Produto" && !normalized.includes("semelhantes") && !normalized.includes("caracteristicas")) {
    if (normalized.includes("preco")) {
      const price = firstProperty?.sale_price_cents ? formatMoneyCents(firstProperty.sale_price_cents) : firstProperty?.rent_price_cents ? `${formatMoneyCents(firstProperty.rent_price_cents)}/mes` : "R$ 0,00";
      return `<div id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" style="width:min(420px,100%);position:relative;z-index:3;border-radius:30px;background:linear-gradient(135deg,#ffffff,#f5efe1);color:#111;padding:26px;box-shadow:0 30px 90px rgba(0,0,0,.22);border:1px solid rgba(212,175,55,.34);">
        <span data-editable="true" style="display:inline-flex;border-radius:999px;background:rgba(212,175,55,.14);color:#9b6e16;padding:8px 12px;font-size:11px;font-weight:950;letter-spacing:.14em;text-transform:uppercase;">Valor do imóvel</span>
        <strong data-editable="true" style="display:block;margin-top:16px;color:#111;font-size:clamp(34px,5vw,58px);line-height:.92;font-weight:950;letter-spacing:-.035em;">${escapeHtml(price)}</strong>
        <p data-editable="true" style="margin:12px 0 0;color:#666;line-height:1.55;">Campo conectado ao imóvel publicado, editável para venda, locação ou valor sob consulta.</p>
        <a data-editable="true" href="#contato" style="display:inline-flex;margin-top:18px;border-radius:999px;background:#d4af37;color:#080806;text-decoration:none;font-weight:950;padding:13px 18px;">Tenho interesse</a>
      </div>`;
    }
    if (normalized.includes("titulo")) {
      return `<h2 id="${blockId}" data-imobiflow-name="${safeName}" style="margin:0;color:inherit;font-size:clamp(30px,4vw,58px);line-height:1.04;font-weight:950;">${escapeHtml(firstProperty?.title ?? "Titulo do imovel")}</h2>`;
    }
    if (normalized.includes("descricao")) {
      return `<p id="${blockId}" data-imobiflow-name="${safeName}" style="max-width:760px;color:rgba(255,255,255,.72);font-size:17px;line-height:1.75;">${escapeHtml(firstProperty?.description ?? "Descricao comercial do imovel conectada aos dados cadastrados no ImobiFlow.")}</p>`;
    }
    if (normalized.includes("codigo") || normalized.includes("sku")) {
      return `<span id="${blockId}" data-imobiflow-name="${safeName}" style="display:inline-flex;border-radius:999px;background:rgba(255,255,255,.1);padding:8px 12px;color:rgba(255,255,255,.72);font-size:12px;font-weight:900;">Codigo ${escapeHtml(firstProperty?.code ?? "IMB-000")}</span>`;
    }
    if (normalized.includes("botao")) {
      return `<a id="${blockId}" data-imobiflow-name="${safeName}" href="#contato" style="display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:#d4af37;color:#080806;padding:15px 24px;font-weight:950;text-decoration:none;">Tenho interesse</a>`;
    }
  }

  if (item.category === "Layout") {
    if (normalized.includes("duas-colunas") || normalized.includes("tres-colunas") || normalized.includes("grid")) {
      const cols = normalized.includes("tres") ? 3 : 2;
      return `<section id="${blockId}" data-imobiflow-name="${safeName}" style="${sectionStyle}background:#0d0d0b;">
        <div style="${innerStyle};display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:18px;">
          ${Array.from({ length: cols }, (_, index) => `<div style="min-height:220px;border:1px dashed rgba(212,175,55,.34);border-radius:24px;background:rgba(255,255,255,.06);padding:24px;">Coluna ${index + 1}</div>`).join("")}
        </div>
      </section>`;
    }
    if (normalized.includes("espacador")) {
      return `<div id="${blockId}" data-imobiflow-name="${safeName}" style="height:80px;"></div>`;
    }
  }

  const propertyCardHtml = (property: Property, index: number) => {
    const cover = propertyCoverUrl(property);
    const price = property.sale_price_cents
      ? formatMoneyCents(property.sale_price_cents)
      : property.rent_price_cents
        ? `${formatMoneyCents(property.rent_price_cents)}/mes`
        : "Consulte";
    const location = [property.neighborhood, property.city, property.state].filter(Boolean).join(", ") || "Localizacao a definir";
    const detailUrl = websiteId ? getBuilderPreviewPropertyDetailUrl(websiteId, property) : "#";
    const imageBlock = cover
      ? `<img data-editable="true" src="${escapeHtml(cover)}" alt="${escapeHtml(property.title)}" style="width:100%;height:210px;object-fit:cover;display:block;">`
      : `<div data-editable="true" style="height:210px;background:linear-gradient(135deg,#1b1407,#d4af37);display:flex;align-items:center;justify-content:center;color:#080806;font-weight:900;">Imovel ${index + 1}</div>`;
    return `<a data-editable="true" href="${escapeHtml(detailUrl)}" target="_top" data-imobiflow-property-card="${escapeHtml(property.id)}" data-imobiflow-property-url="${escapeHtml(detailUrl)}" data-imobiflow-name="Card do imovel ${escapeHtml(property.code ?? property.title)}" style="display:block;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:24px;background:rgba(255,255,255,.06);box-shadow:0 24px 70px rgba(0,0,0,.28);backdrop-filter:blur(14px);color:inherit;text-decoration:none;cursor:pointer;">
      ${imageBlock}
      <div data-editable="true" style="padding:20px;">
        <div data-editable="true" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">
          <span data-editable="true" style="border-radius:999px;background:rgba(212,175,55,.16);color:#f3d77b;padding:6px 10px;font-size:11px;font-weight:900;text-transform:uppercase;">${escapeHtml(propertyOperationLabel(property.operation))}</span>
          <span data-editable="true" style="color:rgba(255,255,255,.55);font-size:12px;font-weight:800;">${escapeHtml(property.code ?? "Sem codigo")}</span>
        </div>
        <h3 data-editable="true" style="margin:0 0 8px;font-size:20px;line-height:1.15;font-weight:900;">${escapeHtml(property.title)}</h3>
        <p data-editable="true" style="margin:0 0 14px;color:rgba(255,255,255,.68);font-size:14px;line-height:1.5;">${escapeHtml(location)}</p>
        <strong data-editable="true" style="display:block;margin-bottom:14px;color:#f3d77b;font-size:22px;">${escapeHtml(price)}</strong>
        <div data-editable="true" style="display:flex;flex-wrap:wrap;gap:8px;color:rgba(255,255,255,.7);font-size:12px;font-weight:800;">
          <span data-editable="true">${property.bedrooms ?? 0} dorm.</span><span data-editable="true">${property.bathrooms ?? 0} banh.</span><span data-editable="true">${property.parking_spaces ?? 0} vagas</span><span data-editable="true">${property.private_area ?? property.total_area ?? 0} m2</span>
        </div>
      </div>
    </a>`;
  };

  if (item.id === "empty-section-fluid" || normalized.includes("secao vazia")) {
    return `<section data-imobiflow-block="empty-section" data-editable="true" style="min-height:360px;padding:72px 6vw;border:2px dashed rgba(212,175,55,.45);background:rgba(255,255,255,.02);position:relative;">
      <div data-editable="true" style="max-width:1180px;margin:0 auto;min-height:220px;display:flex;align-items:center;justify-content:center;border-radius:28px;background:rgba(255,255,255,.04);backdrop-filter:blur(18px);color:#d4af37;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">Seção vazia editável</div>
    </section>`;
  }

  if (item.id === "ios-glass-panel" || normalized.includes("painel vidro") || normalized.includes("glass")) {
    return `<div data-imobiflow-block="glass-panel" data-editable="true" style="width:min(520px,90%);min-height:220px;padding:34px;border-radius:28px;background:linear-gradient(135deg,rgba(255,255,255,.22),rgba(255,255,255,.06));backdrop-filter:blur(24px) saturate(150%);border:1px solid rgba(255,255,255,.36);box-shadow:0 30px 90px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.35);color:#fff;position:relative;">
      <span data-editable="true" style="color:#d4af37;font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;">Efeito vidro</span>
      <h3 data-editable="true" style="font-size:34px;line-height:1;margin:14px 0 10px;">Painel premium editável</h3>
      <p data-editable="true" style="margin:0;color:rgba(255,255,255,.78);line-height:1.6;">Use para cards, chamadas, destaques e sobreposição em imagens ou vídeos.</p>
    </div>`;
  }

  if (item.id === "shape-rectangle-free") {
    return `<div data-imobiflow-block="shape-rectangle" data-editable="true" style="width:360px;height:220px;border-radius:28px;background:linear-gradient(135deg,#d4af37,#7a5a12);box-shadow:0 24px 70px rgba(0,0,0,.24);"></div>`;
  }

  if (item.id === "shape-circle-free") {
    return `<div data-imobiflow-block="shape-circle" data-editable="true" style="width:240px;height:240px;border-radius:999px;background:radial-gradient(circle at 30% 25%,#fff6c7,#d4af37 42%,#7a5a12 100%);box-shadow:0 24px 70px rgba(0,0,0,.24);"></div>`;
  }

  if (item.id === "line-divider-premium") {
    return `<div data-imobiflow-block="divider-line" data-editable="true" style="height:2px;width:min(720px,90%);background:linear-gradient(90deg,transparent,#d4af37,transparent);position:relative;"><span data-editable="true" style="position:absolute;left:50%;top:50%;width:14px;height:14px;border-radius:999px;background:#d4af37;transform:translate(-50%,-50%);box-shadow:0 0 30px rgba(212,175,55,.9);"></span></div>`;
  }

  if (item.id === "premium-button-glow" || item.id === "magnetic-button") {
    return `<a data-imobiflow-block="${item.id}" data-editable="true" href="#contato" style="display:inline-flex;align-items:center;gap:10px;width:max-content;border-radius:999px;background:linear-gradient(135deg,#f4d56a,#b99020);color:#080806;text-decoration:none;font-weight:900;padding:16px 26px;box-shadow:0 18px 50px rgba(212,175,55,.35);transition:transform .25s ease,box-shadow .25s ease;">${item.id === "magnetic-button" ? "Botão magnético" : "Falar agora"} <span data-editable="true">→</span></a>`;
  }

  if (item.id === "title-editorial" || item.id === "text-reveal-block") {
    return `<div data-imobiflow-block="${item.id}" data-editable="true" style="max-width:860px;color:#fff;"><span data-editable="true" style="color:#d4af37;font-weight:900;letter-spacing:.16em;text-transform:uppercase;">Texto premium</span><h2 data-editable="true" style="font-size:clamp(42px,6vw,86px);line-height:.96;margin:14px 0;">Uma presença digital para imóveis que precisam ser desejados.</h2><p data-editable="true" style="font-size:18px;line-height:1.7;color:rgba(255,255,255,.72);">Edite fonte, tamanho, cor, alinhamento, animação e espaçamento no painel direito.</p></div>`;
  }

  if (item.id === "premium-property-card" || item.id === "floating-card-3d") {
    const sample = (properties[0] ?? {}) as unknown as Record<string, string | number | null | undefined>;
    return `<article data-imobiflow-block="${item.id}" data-editable="true" style="width:min(390px,92%);overflow:hidden;border-radius:30px;background:#fff;color:#111;box-shadow:0 34px 90px rgba(0,0,0,.28);transform:${item.id === "floating-card-3d" ? "perspective(900px) rotateX(3deg) rotateY(-7deg)" : "none"};transform-style:preserve-3d;">
      <img data-editable="true" src="${escapeHtml(String(sample.imageUrl || sample.mainImage || "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80"))}" style="width:100%;height:260px;object-fit:cover;">
      <div data-editable="true" style="padding:24px;display:grid;gap:10px;">
        <span data-editable="true" style="color:#b99020;font-weight:900;letter-spacing:.14em;text-transform:uppercase;">${escapeHtml(String(sample.type || "Apartamento"))}</span>
        <h3 data-editable="true" style="font-size:26px;line-height:1.08;margin:0;">${escapeHtml(String(sample.title || "Apartamento premium"))}</h3>
        <p data-editable="true" style="margin:0;color:#666;">${escapeHtml(String(sample.location || "Centro, São Paulo"))}</p>
        <strong data-editable="true" style="font-size:24px;">${escapeHtml(String(sample.price || sample.salePrice || "R$ 850.000,00"))}</strong>
      </div>
    </article>`;
  }

  if (item.id === "animated-icon-badge") {
    return `<div data-imobiflow-block="animated-icon-badge" data-editable="true" style="display:inline-flex;align-items:center;gap:12px;border-radius:999px;padding:12px 18px;background:rgba(212,175,55,.14);border:1px solid rgba(212,175,55,.35);color:#d4af37;box-shadow:0 0 40px rgba(212,175,55,.18);"><span data-editable="true" style="width:34px;height:34px;border-radius:999px;display:grid;place-items:center;background:#d4af37;color:#111;font-weight:900;">✓</span><strong data-editable="true">Diferencial premium</strong></div>`;
  }

  if (item.id === "luxury-menu-header") {
    return `<header data-imobiflow-block="luxury-menu" data-editable="true" style="position:relative;z-index:5;padding:22px 6vw;background:#080806;color:#fff;border-bottom:1px solid rgba(212,175,55,.18);"><div data-editable="true" style="max-width:1240px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:22px;"><strong data-editable="true" style="color:#d4af37;font-size:24px;">Magnífico Imóveis</strong><nav data-editable="true" style="display:flex;gap:22px;align-items:center;"><a data-editable="true" href="#topo" style="color:#fff;text-decoration:none;">Início</a><a data-editable="true" href="#imoveis" style="color:#fff;text-decoration:none;">Imóveis</a><a data-editable="true" href="#contato" style="color:#fff;text-decoration:none;">Contato</a></nav><a data-editable="true" href="#contato" style="border-radius:999px;background:#d4af37;color:#080806;text-decoration:none;font-weight:900;padding:12px 18px;">WhatsApp</a></div></header>`;
  }

  if (item.id === "mesh-gradient-background") {
    return `<div data-imobiflow-block="mesh-gradient-background" data-editable="true" style="width:100%;min-height:420px;border-radius:34px;background:radial-gradient(circle at 20% 20%,rgba(212,175,55,.55),transparent 32%),radial-gradient(circle at 80% 10%,rgba(255,255,255,.28),transparent 30%),radial-gradient(circle at 50% 90%,rgba(120,76,18,.6),transparent 35%),#080806;filter:saturate(120%);"></div>`;
  }

  if (item.id === "parallax-depth-section") {
    return `<section data-imobiflow-block="parallax-depth" data-editable="true" style="position:relative;min-height:620px;overflow:hidden;background:#070707;color:#fff;padding:90px 6vw;"><div data-editable="true" style="position:absolute;inset:12% 8% auto auto;width:300px;height:300px;border-radius:999px;background:rgba(212,175,55,.22);filter:blur(20px);transform:translateZ(0);"></div><div data-editable="true" style="position:absolute;left:6%;bottom:8%;width:420px;height:220px;border-radius:34px;background:rgba(255,255,255,.08);backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.14);"></div><div data-editable="true" style="position:relative;z-index:2;max-width:760px;"><span data-editable="true" style="color:#d4af37;font-weight:900;letter-spacing:.16em;text-transform:uppercase;">Profundidade</span><h2 data-editable="true" style="font-size:clamp(42px,6vw,86px);line-height:.96;margin:14px 0;">Camadas com sensação 3D para páginas premium.</h2></div></section>`;
  }

  if (item.id === "video-background-section" || normalized.includes("video de fundo")) {
    return `<section data-imobiflow-block="video-background" data-editable="true" style="position:relative;min-height:640px;overflow:hidden;background:#050505;color:#fff;">
      <video data-imobiflow-background="true" autoplay muted loop playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;filter:saturate(120%) brightness(.62);" src="https://cdn.coverr.co/videos/coverr-luxury-apartment-8689/1080p.mp4"></video>
      <div data-editable="true" style="position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,rgba(0,0,0,.82),rgba(0,0,0,.25));"></div>
      <div data-editable="true" style="position:relative;z-index:2;max-width:1180px;margin:0 auto;padding:110px 6vw;">
        <span data-editable="true" style="color:#d4af37;font-weight:900;letter-spacing:.18em;text-transform:uppercase;">Vídeo cinematográfico</span>
        <h2 data-editable="true" style="font-size:clamp(42px,6vw,86px);line-height:.98;margin:18px 0;max-width:820px;">Mostre imóveis com presença, movimento e sofisticação.</h2>
        <p data-editable="true" style="max-width:620px;font-size:19px;line-height:1.7;color:rgba(255,255,255,.78);">Troque o vídeo no painel direito e edite cada texto, botão e camada livremente.</p>
      </div>
    </section>`;
  }

  if (item.id === "hero-real-estate-complete") {
    const heroProperty = (properties[0] ?? {}) as unknown as Record<string, string | number | null | undefined>;
    const heroImage = String(heroProperty.imageUrl || heroProperty.mainImage || heroProperty.photo || "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=85");
    return `<section id="topo" data-imobiflow-block="hero" data-editable="true" style="position:relative;min-height:92vh;overflow:hidden;background:#070707;color:#fff;">
      <div data-editable="true" style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.86),rgba(0,0,0,.38),rgba(0,0,0,.72)),url('${escapeHtml(heroImage)}') center/cover no-repeat;"></div>
      <div data-editable="true" style="position:relative;z-index:1;max-width:1240px;margin:0 auto;padding:120px 6vw 80px;display:grid;gap:34px;">
        <span data-editable="true" style="width:max-content;border:1px solid rgba(212,175,55,.4);border-radius:999px;padding:10px 16px;background:rgba(255,255,255,.08);backdrop-filter:blur(18px);color:#d4af37;font-weight:800;letter-spacing:.18em;text-transform:uppercase;">Imobiliária familiar de alto padrão</span>
        <h1 data-editable="true" style="max-width:880px;font-size:clamp(48px,7vw,104px);line-height:.94;margin:0;font-weight:900;">Imóveis selecionados com atendimento familiar e alto padrão</h1>
        <p data-editable="true" style="max-width:720px;font-size:20px;line-height:1.65;margin:0;color:rgba(255,255,255,.82);">Uma vitrine imobiliária premium preparada para venda, locação, captação de proprietários e geração de leads pelo ImobiFlow.</p>
        <form data-editable="true" style="display:flex;gap:12px;max-width:860px;padding:12px;border-radius:999px;background:#fff;box-shadow:0 30px 80px rgba(0,0,0,.35);">
          <input data-editable="true" placeholder="Buscar por bairro, código, cidade ou tipo" style="flex:1;border:0;outline:0;padding:16px 22px;font-size:15px;color:#111;background:transparent;">
          <select data-editable="true" style="border:0;outline:0;padding:0 18px;color:#111;background:transparent;"><option>Todas</option><option>Venda</option><option>Locação</option></select>
          <button data-editable="true" type="button" style="border:0;border-radius:999px;background:#d4af37;color:#080806;font-weight:900;padding:16px 28px;">Pesquisar</button>
        </form>
      </div>
    </section>`;
  }

  if (item.id === "property-showcase-grid-real" || item.id === "property-gallery-paginated" || item.id === "property-carousel-premium") {
    const isCarousel = item.id === "property-carousel-premium";
    const isGallery = item.id === "property-gallery-paginated";
    const visibleProperties = properties.slice(0, isGallery ? 12 : 6);
    const cards = visibleProperties.length
      ? visibleProperties
          .map((property, index) => {
            const card = propertyCardHtml(property, index);
            return isCarousel
              ? `<div data-editable="true" style="min-width:340px;scroll-snap-align:start;">${card}</div>`
              : card;
          })
          .join("")
      : `<article data-editable="true" style="border-radius:26px;background:rgba(255,255,255,.08);color:#fff;padding:28px;box-shadow:0 28px 80px rgba(0,0,0,.18);border:1px solid rgba(212,175,55,.22);"><h3 data-editable="true" style="margin:0 0 8px;">Vitrine conectada aos imóveis</h3><p data-editable="true" style="margin:0;color:rgba(255,255,255,.68);">Quando houver imóveis publicados, os cards reais aparecem automaticamente aqui.</p></article>`;
    return `<section id="imoveis" data-imobiflow-block="${isCarousel ? "property-carousel" : isGallery ? "property-gallery" : "property-showcase"}" data-editable="true" data-limit="${isGallery ? "12" : "6"}" style="padding:90px 6vw;background:#080806;color:#fff;">
      <div data-editable="true" style="max-width:1240px;margin:0 auto;display:grid;gap:34px;">
        <div data-editable="true" style="display:flex;align-items:end;justify-content:space-between;gap:24px;flex-wrap:wrap;">
          <div data-editable="true"><span data-editable="true" style="color:#f3d77b;font-weight:900;letter-spacing:.16em;text-transform:uppercase;">${isCarousel ? "Carrossel" : isGallery ? "Galeria" : "Vitrine"}</span><h2 data-editable="true" style="font-size:clamp(34px,5vw,68px);line-height:1;margin:12px 0 0;">Imóveis publicados</h2></div>
          ${isGallery ? `<div data-editable="true" style="display:flex;gap:10px;flex-wrap:wrap;"><button data-editable="true" type="button" style="border:1px solid rgba(212,175,55,.28);border-radius:999px;padding:12px 18px;background:#d4af37;color:#080806;font-weight:900;">Todos</button><button data-editable="true" type="button" style="border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:12px 18px;background:rgba(255,255,255,.08);color:#fff;">Venda</button><button data-editable="true" type="button" style="border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:12px 18px;background:rgba(255,255,255,.08);color:#fff;">Locação</button></div>` : ""}
        </div>
        <div data-editable="true" data-imobiflow-property-grid="true" style="${isCarousel ? "display:flex;overflow-x:auto;gap:22px;scroll-snap-type:x mandatory;padding-bottom:14px;" : "display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:22px;"}">${cards}</div>
        ${isGallery ? `<div data-editable="true" style="display:flex;justify-content:center;gap:10px;"><button data-editable="true" type="button" style="border:0;border-radius:999px;background:rgba(255,255,255,.1);color:#fff;padding:14px 20px;">Anterior</button><button data-editable="true" type="button" style="border:0;border-radius:999px;background:#d4af37;color:#111;padding:14px 20px;font-weight:900;">Próxima página</button></div>` : ""}
      </div>
    </section>`;
  }

  if (item.id === "contact-form-complete" || item.id === "owner-capture-real") {
    return `<section id="contato" data-imobiflow-block="contact-form" data-editable="true" style="padding:90px 6vw;background:#090909;color:#fff;">
      <div data-editable="true" style="max-width:1120px;margin:0 auto;display:grid;grid-template-columns:1fr minmax(320px,520px);gap:42px;align-items:start;">
        <div data-editable="true"><span data-editable="true" style="color:#d4af37;font-weight:900;letter-spacing:.16em;text-transform:uppercase;">Contato</span><h2 data-editable="true" style="font-size:clamp(36px,5vw,68px);line-height:1;margin:14px 0;">Fale com a imobiliária</h2><p data-editable="true" style="color:rgba(255,255,255,.72);font-size:18px;line-height:1.7;">Receba atendimento para comprar, alugar ou anunciar um imóvel.</p></div>
        <form data-editable="true" style="display:grid;gap:14px;padding:26px;border-radius:28px;background:rgba(255,255,255,.08);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.12);">
          <input data-editable="true" placeholder="Nome" style="border:1px solid rgba(255,255,255,.16);border-radius:16px;background:#fff;color:#111;padding:15px 16px;">
          <input data-editable="true" placeholder="Telefone" style="border:1px solid rgba(255,255,255,.16);border-radius:16px;background:#fff;color:#111;padding:15px 16px;">
          <input data-editable="true" placeholder="E-mail" style="border:1px solid rgba(255,255,255,.16);border-radius:16px;background:#fff;color:#111;padding:15px 16px;">
          <select data-editable="true" style="border:1px solid rgba(255,255,255,.16);border-radius:16px;background:#fff;color:#111;padding:15px 16px;"><option>Comprar imóvel</option><option>Alugar imóvel</option><option>Anunciar imóvel</option><option>Falar com corretor</option></select>
          <textarea data-editable="true" placeholder="Mensagem" rows="4" style="border:1px solid rgba(255,255,255,.16);border-radius:16px;background:#fff;color:#111;padding:15px 16px;"></textarea>
          <button data-editable="true" type="button" style="border:0;border-radius:999px;background:#d4af37;color:#090909;font-weight:900;padding:16px 22px;">Enviar interesse</button>
        </form>
      </div>
    </section>`;
  }

  if (item.id === "email-signup-real") {
    return `<section data-imobiflow-block="email-signup" data-editable="true" style="padding:64px 6vw;background:#fff;color:#111;"><div data-editable="true" style="max-width:980px;margin:0 auto;border-radius:30px;background:#111;color:#fff;padding:42px;display:flex;gap:20px;align-items:center;justify-content:space-between;flex-wrap:wrap;"><div data-editable="true"><h2 data-editable="true" style="margin:0 0 8px;font-size:36px;">Receba oportunidades no e-mail</h2><p data-editable="true" style="margin:0;color:rgba(255,255,255,.72);">Novos imóveis, oportunidades e conteúdos da imobiliária.</p></div><form data-editable="true" style="display:flex;gap:10px;min-width:min(430px,100%);"><input data-editable="true" placeholder="Seu e-mail" style="flex:1;border:0;border-radius:999px;padding:15px 18px;color:#111;"><button data-editable="true" type="button" style="border:0;border-radius:999px;background:#d4af37;color:#111;font-weight:900;padding:15px 22px;">Cadastrar</button></form></div></section>`;
  }

  if (item.id === "premium-footer-complete") {
    return `<footer data-imobiflow-block="footer" data-editable="true" style="padding:70px 6vw 34px;background:#050505;color:#fff;"><div data-editable="true" style="max-width:1240px;margin:0 auto;display:grid;gap:34px;"><div data-editable="true" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:28px;"><div data-editable="true"><strong data-editable="true" style="font-size:26px;color:#d4af37;">Magnífico Imóveis</strong><p data-editable="true" style="color:rgba(255,255,255,.7);line-height:1.7;">Atendimento familiar, imóveis selecionados e segurança em cada etapa.</p></div><nav data-editable="true"><h4 data-editable="true">Menu</h4><a data-editable="true" href="#topo" style="display:block;color:#fff;margin:8px 0;">Início</a><a data-editable="true" href="#imoveis" style="display:block;color:#fff;margin:8px 0;">Imóveis</a><a data-editable="true" href="#contato" style="display:block;color:#fff;margin:8px 0;">Contato</a></nav><div data-editable="true"><h4 data-editable="true">Contato</h4><p data-editable="true">WhatsApp<br>E-mail<br>Endereço</p></div><div data-editable="true"><h4 data-editable="true">Redes</h4><p data-editable="true">Instagram · Facebook · LinkedIn</p></div></div><div data-editable="true" style="border-top:1px solid rgba(255,255,255,.12);padding-top:24px;color:rgba(255,255,255,.58);display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;"><span data-editable="true">© 2026 Magnífico Imóveis</span><span data-editable="true">Política de Privacidade · Termos de Uso</span></div></div></footer>`;
  }

  if (normalized.includes("hero")) {
    const heroImage =
      firstProperty ? propertyCoverUrl(firstProperty) || "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=85" : "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=85";
    return `<section id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" style="${sectionStyle}min-height:720px;display:flex;align-items:center;background:#080806;">
      <div data-editable="true" data-imobiflow-background-image="true" style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(8,8,6,.90),rgba(8,8,6,.42)),radial-gradient(circle at 80% 16%,rgba(212,175,55,.34),transparent 32%),url('${escapeHtml(heroImage)}');background-size:cover;background-position:center;"></div>
      <div data-editable="true" style="${innerStyle}">
        ${eyebrow}
        <h1 data-editable="true" style="max-width:860px;margin:24px 0 18px;font-size:clamp(48px,7vw,98px);line-height:.94;font-weight:950;letter-spacing:-.04em;">Imóveis selecionados com atendimento consultivo e alto padrão.</h1>
        <p data-editable="true" style="max-width:700px;margin:0 0 30px;color:rgba(255,255,255,.80);font-size:20px;line-height:1.7;">Hero premium completo: imagem de fundo editável, busca de imóveis, chamada comercial, botões e conversão para compra, locação e captação.</p>
        <div data-editable="true" style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:34px;">
          <a data-editable="true" href="#imoveis" style="display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:#d4af37;color:#080806;padding:16px 24px;font-weight:900;text-decoration:none;">Ver imóveis</a>
          <a data-editable="true" href="#contato" style="display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.25);border-radius:999px;background:rgba(255,255,255,.1);color:#fff;padding:16px 24px;font-weight:900;text-decoration:none;backdrop-filter:blur(12px);">Falar com corretor</a>
        </div>
        <form data-editable="true" style="display:grid;grid-template-columns:minmax(0,1fr) 180px 150px;gap:10px;max-width:920px;border-radius:28px;background:rgba(255,255,255,.96);padding:10px;box-shadow:0 28px 90px rgba(0,0,0,.28);">
          <input data-editable="true" placeholder="Buscar por bairro, código, cidade ou tipo" style="min-height:56px;border:0;border-radius:20px;padding:0 18px;font-size:15px;outline:none;color:#111;background:#fff;">
          <select data-editable="true" style="min-height:56px;border:0;border-radius:20px;padding:0 14px;background:#f6f4ef;color:#111;font-weight:800;"><option>Todas</option><option>Venda</option><option>Locação</option></select>
          <button data-editable="true" type="button" style="border:0;border-radius:20px;background:#080806;color:#fff;font-weight:900;">Pesquisar</button>
        </form>
      </div>
    </section>`;
  }

  if (normalized.includes("vitrine") || normalized.includes("galeria") || normalized.includes("carrossel") || normalized.includes("colecao") || normalized.includes("grade") || normalized.includes("semelhantes") || normalized.includes("recomendados")) {
    const title = normalized.includes("galeria") ? "Galeria de imoveis" : normalized.includes("carrossel") ? "Carrossel de imoveis" : normalized.includes("colecao") ? "Colecao de imoveis" : "Vitrine de imoveis";
    return `<section id="${blockId}" data-imobiflow-name="${safeName}" style="${sectionStyle}background:linear-gradient(180deg,#080806,#111827);">
      <div style="${innerStyle}">
        <div style="display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:28px;">
          <div>${eyebrow}<h2 style="margin:18px 0 0;font-size:clamp(32px,4vw,58px);line-height:1;font-weight:950;">${title}</h2><p style="max-width:620px;color:rgba(255,255,255,.66);line-height:1.7;">Cards conectados aos imoveis reais publicados. Edite limite, filtros, ordem, estilo dos cards e botoes no painel lateral.</p></div>
          <a href="/site/magnificopaginainicial/imoveis" style="color:#f3d77b;font-weight:900;text-decoration:none;">Ver todos</a>
        </div>
        <div data-imobiflow-property-grid="true" data-limit="6" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;">
          ${cards.slice(0, normalized.includes("galeria") ? 8 : 6).map(propertyCardHtml).join("") || `<div style="grid-column:1/-1;border:1px dashed rgba(212,175,55,.35);border-radius:24px;padding:48px;text-align:center;color:rgba(255,255,255,.72);">Nenhum imovel publicado ainda. Quando publicar imoveis, os cards aparecem aqui automaticamente.</div>`}
        </div>
      </div>
    </section>`;
  }

  if (normalized.includes("formulario") || normalized.includes("form") || normalized.includes("contato") || normalized.includes("captacao")) {
    return `<section id="${blockId}" data-imobiflow-name="${safeName}" style="${sectionStyle}background:linear-gradient(135deg,#0b0b09,#1a1408);">
      <div style="${innerStyle};display:grid;grid-template-columns:1fr minmax(320px,460px);gap:34px;align-items:center;">
        <div>${eyebrow}<h2 style="margin:18px 0;font-size:clamp(34px,4vw,62px);line-height:1;font-weight:950;">Fale com a imobiliaria</h2><p style="color:rgba(255,255,255,.72);font-size:18px;line-height:1.7;">Formulario completo para virar lead no CRM: nome, telefone, e-mail, assunto e mensagem.</p></div>
        <form data-imobiflow-form="contact" style="display:grid;gap:12px;border:1px solid rgba(255,255,255,.12);border-radius:28px;background:rgba(255,255,255,.08);padding:24px;backdrop-filter:blur(18px);">
          <input placeholder="Nome" style="height:50px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(255,255,255,.1);color:#fff;padding:0 14px;">
          <input placeholder="Telefone / WhatsApp" style="height:50px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(255,255,255,.1);color:#fff;padding:0 14px;">
          <input placeholder="E-mail" style="height:50px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(255,255,255,.1);color:#fff;padding:0 14px;">
          <select style="height:50px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:#111;color:#fff;padding:0 14px;"><option>Comprar imovel</option><option>Alugar imovel</option><option>Anunciar meu imovel</option><option>Falar com corretor</option></select>
          <textarea placeholder="Mensagem" rows="4" style="border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(255,255,255,.1);color:#fff;padding:14px;"></textarea>
          <button type="button" style="height:54px;border:0;border-radius:18px;background:#d4af37;color:#080806;font-weight:950;">Enviar contato</button>
        </form>
      </div>
    </section>`;
  }

  if (normalized.includes("inscricao") || normalized.includes("email")) {
    return `<section id="${blockId}" data-imobiflow-name="${safeName}" style="${sectionStyle}padding:56px 28px;background:#f7f3e8;color:#080806;">
      <div style="${innerStyle};display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;">
        <div><h2 style="margin:0 0 8px;font-size:34px;font-weight:950;">Receba oportunidades por e-mail</h2><p style="margin:0;color:#5d5648;">Cadastro simples para novidades, lancamentos e oportunidades.</p></div>
        <form style="display:flex;gap:10px;min-width:min(100%,460px);"><input placeholder="seu@email.com" style="flex:1;height:54px;border:1px solid #ddd2af;border-radius:999px;padding:0 18px;"><button type="button" style="height:54px;border:0;border-radius:999px;background:#080806;color:#fff;padding:0 22px;font-weight:900;">Inscrever</button></form>
      </div>
    </section>`;
  }

  if (normalized.includes("menu") || normalized.includes("navegacao")) {
    return `<header id="${blockId}" data-imobiflow-name="${safeName}" style="position:sticky;top:0;z-index:50;background:rgba(8,8,6,.84);backdrop-filter:blur(18px);border-bottom:1px solid rgba(212,175,55,.22);color:#fff;">
      <div style="${innerStyle};display:flex;align-items:center;justify-content:space-between;gap:20px;padding:18px 28px;">
        <strong style="color:#f3d77b;font-size:20px;">${escapeHtml(websiteName)}</strong>
        <nav style="display:flex;gap:18px;flex-wrap:wrap;"><a href="#topo" style="color:#fff;text-decoration:none;font-weight:800;">Inicio</a><a href="#imoveis" style="color:#fff;text-decoration:none;font-weight:800;">Imoveis</a><a href="#sobre" style="color:#fff;text-decoration:none;font-weight:800;">Sobre</a><a href="#contato" style="color:#fff;text-decoration:none;font-weight:800;">Contato</a></nav>
        <a href="#contato" style="border-radius:999px;background:#d4af37;color:#080806;padding:12px 18px;text-decoration:none;font-weight:900;">WhatsApp</a>
      </div>
    </header>`;
  }

  if (normalized.includes("video")) {
    return `<section id="${blockId}" data-imobiflow-name="${safeName}" style="${sectionStyle}min-height:540px;display:flex;align-items:center;background:#080806;">
      <video data-imobiflow-background-video="true" autoplay muted loop playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.42;background:#111;"></video>
      <div style="${innerStyle};text-align:center;"><h2 style="font-size:clamp(36px,5vw,72px);font-weight:950;">Video de fundo premium</h2><p style="max-width:660px;margin:16px auto 0;color:rgba(255,255,255,.72);line-height:1.7;">Selecione esta secao e envie um MP4 para usar como fundo do site.</p></div>
    </section>`;
  }

  if (normalized.includes("rodape") || normalized.includes("direitos") || normalized.includes("politicas") || normalized.includes("redes")) {
    return `<footer id="${blockId}" data-imobiflow-name="${safeName}" style="padding:54px 28px;background:#050505;color:#fff;border-top:1px solid rgba(212,175,55,.22);">
      <div style="${innerStyle};display:grid;grid-template-columns:1.2fr repeat(3,1fr);gap:26px;">
        <div><strong style="font-size:24px;color:#f3d77b;">${escapeHtml(websiteName)}</strong><p style="color:rgba(255,255,255,.62);line-height:1.7;">Imobiliaria familiar com atendimento consultivo.</p></div>
        <nav><strong>Imoveis</strong><a style="display:block;margin-top:12px;color:rgba(255,255,255,.7);text-decoration:none;" href="#imoveis">Comprar</a><a style="display:block;margin-top:8px;color:rgba(255,255,255,.7);text-decoration:none;" href="#imoveis">Alugar</a></nav>
        <nav><strong>Empresa</strong><a style="display:block;margin-top:12px;color:rgba(255,255,255,.7);text-decoration:none;" href="#sobre">Sobre</a><a style="display:block;margin-top:8px;color:rgba(255,255,255,.7);text-decoration:none;" href="#contato">Contato</a></nav>
        <nav><strong>Legal</strong><a style="display:block;margin-top:12px;color:rgba(255,255,255,.7);text-decoration:none;" href="/politica-de-privacidade">Privacidade</a><a style="display:block;margin-top:8px;color:rgba(255,255,255,.7);text-decoration:none;" href="/termos">Termos</a></nav>
      </div>
    </footer>`;
  }

  if (normalized.includes("linha") || normalized.includes("marca") || normalized.includes("forma") || normalized.includes("decorativo")) {
    return `<div id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" style="width:220px;height:110px;border-radius:999px;background:linear-gradient(135deg,#d4af37,#6f4f12);box-shadow:0 24px 70px rgba(212,175,55,.28);"></div>`;
  }

  if (["Efeitos", "Animacoes", "Animacoes 3D", "3D", "Elementos 3D"].includes(item.category)) {
    const isFlip = normalized.includes("flip");
    const isPulse = normalized.includes("pulse") || normalized.includes("neon") || normalized.includes("glow");
    const isSlide = normalized.includes("slide");
    const animation = isFlip
      ? "imobiflow-tilt-float 2.2s ease-in-out infinite alternate"
      : isPulse
        ? "imobiflow-pulse-gold 1.7s ease-in-out infinite"
        : isSlide
          ? "imobiflow-slide-in .9s ease both"
          : "imobiflow-float-slow 3.2s ease-in-out infinite";
    return `<div id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" style="width:min(460px,92%);min-height:240px;position:relative;z-index:4;padding:30px;border-radius:32px;background:linear-gradient(135deg,rgba(255,255,255,.18),rgba(212,175,55,.14));color:#fff;backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.24);box-shadow:0 42px 110px rgba(0,0,0,.38),0 0 58px rgba(212,175,55,.18);transform:perspective(900px) rotateX(7deg) rotateY(-9deg);transform-style:preserve-3d;animation:${animation};">
      <span data-editable="true" style="color:#d4af37;font-size:12px;font-weight:950;letter-spacing:.18em;text-transform:uppercase;">${escapeHtml(item.category)}</span>
      <h3 data-editable="true" style="margin:14px 0 10px;font-size:34px;line-height:1;">${safeName}</h3>
      <p data-editable="true" style="margin:0;color:rgba(255,255,255,.76);line-height:1.65;">Efeito visual real aplicado ao elemento, com movimento, profundidade, sombra e edição livre no painel direito.</p>
    </div>`;
  }

  if (item.category === "Botoes") {
    return `<a id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" href="#contato" style="display:inline-flex;align-items:center;gap:12px;width:max-content;border-radius:999px;background:linear-gradient(135deg,#ffe28a,#d4af37 55%,#9b6e16);color:#080806;text-decoration:none;font-weight:950;padding:16px 26px;box-shadow:0 18px 50px rgba(212,175,55,.38);">${safeName}<span data-editable="true">→</span></a>`;
  }

  if (item.category === "Cards") {
    return `<article id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" style="width:min(390px,92%);overflow:hidden;border-radius:30px;background:#fff;color:#111;box-shadow:0 34px 90px rgba(0,0,0,.28);">
      <img data-editable="true" src="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80" alt="${safeName}" style="width:100%;height:230px;object-fit:cover;">
      <div data-editable="true" style="padding:24px;display:grid;gap:10px;">
        <span data-editable="true" style="color:#b99020;font-weight:900;letter-spacing:.14em;text-transform:uppercase;">Card premium</span>
        <h3 data-editable="true" style="font-size:26px;line-height:1.08;margin:0;">${safeName}</h3>
        <p data-editable="true" style="margin:0;color:#666;line-height:1.55;">Card editável com imagem, texto, sombra, botão e profundidade visual.</p>
      </div>
    </article>`;
  }

  if (item.category === "Icones") {
    return `<div id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" style="display:inline-flex;align-items:center;gap:12px;border-radius:999px;padding:13px 18px;background:rgba(212,175,55,.14);border:1px solid rgba(212,175,55,.35);color:#d4af37;box-shadow:0 0 40px rgba(212,175,55,.18);"><span data-editable="true" style="width:36px;height:36px;border-radius:999px;display:grid;place-items:center;background:#d4af37;color:#111;font-weight:950;">★</span><strong data-editable="true">${safeName}</strong></div>`;
  }

  if (item.category === "Textos") {
    return `<div id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" style="max-width:820px;color:#fff;"><span data-editable="true" style="color:#d4af37;font-weight:950;letter-spacing:.16em;text-transform:uppercase;">Texto editável</span><h2 data-editable="true" style="font-size:clamp(38px,6vw,76px);line-height:.96;margin:14px 0;">${safeName}</h2><p data-editable="true" style="font-size:18px;line-height:1.7;color:rgba(255,255,255,.72);">Texto visual com hierarquia, tamanho, fonte, cor e animações editáveis.</p></div>`;
  }

  if (item.category === "Imagens") {
    return `<img id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" src="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80" alt="${safeName}" style="width:460px;height:300px;object-fit:cover;border-radius:30px;box-shadow:0 30px 90px rgba(0,0,0,.32);display:block;">`;
  }

  if (item.category === "Videos") {
    return `<video id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" src="https://cdn.coverr.co/videos/coverr-luxury-apartment-8689/1080p.mp4" controls muted playsinline style="width:560px;height:320px;object-fit:cover;border-radius:30px;background:#111;box-shadow:0 30px 90px rgba(0,0,0,.35);"></video>`;
  }

  if (item.category === "Divisores" || item.category === "Linhas") {
    return `<div id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" style="height:3px;width:min(720px,90%);background:linear-gradient(90deg,transparent,#d4af37,transparent);position:relative;box-shadow:0 0 30px rgba(212,175,55,.42);"><span data-editable="true" style="position:absolute;left:50%;top:50%;width:14px;height:14px;border-radius:999px;background:#d4af37;transform:translate(-50%,-50%);box-shadow:0 0 30px rgba(212,175,55,.9);"></span></div>`;
  }

  return `<section id="${blockId}" data-imobiflow-name="${safeName}" data-editable="true" style="${sectionStyle}background:radial-gradient(circle at 18% 18%,rgba(212,175,55,.26),transparent 30%),linear-gradient(135deg,#080806,#17110a);">
    <div data-editable="true" style="${innerStyle};min-height:320px;border:1px solid rgba(212,175,55,.24);border-radius:32px;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(220px,.85fr);gap:28px;align-items:center;padding:34px;background:rgba(255,255,255,.05);backdrop-filter:blur(18px);box-shadow:0 34px 100px rgba(0,0,0,.28);">
      <div data-editable="true">${eyebrow}<h2 data-editable="true" style="margin:18px 0 8px;font-size:clamp(34px,5vw,62px);line-height:1;font-weight:950;">${safeName}</h2><p data-editable="true" style="margin:0;color:rgba(255,255,255,.68);line-height:1.7;">Bloco premium real para ${escapeHtml(libraryCategoryLabel(item.category).toLowerCase())}, com estrutura visual, conteúdo editável, camadas e estilo ajustável no painel direito.</p></div>
      <div data-editable="true" style="min-height:210px;border-radius:28px;background:linear-gradient(135deg,rgba(212,175,55,.42),rgba(255,255,255,.08));box-shadow:0 28px 80px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.22);"></div>
    </div>
  </section>`;
}

function componentPreset(componentType: string) {
  const presets: Record<string, { name: string; componentType: string; propsJson: Record<string, unknown> }> = {
    heading: {
      name: "Novo título",
      componentType: "heading",
      propsJson: { text: "Título da seção" },
    },
    image: {
      name: "Nova imagem",
      componentType: "image",
      propsJson: { alt: "Imagem do site" },
    },
    video: {
      name: "Novo vídeo",
      componentType: "video",
      propsJson: { title: "Vídeo do site" },
    },
    button: {
      name: "Novo botão",
      componentType: "button",
      propsJson: { label: "Clique aqui", href: "#" },
    },
    text: {
      name: "Novo texto",
      componentType: "text",
      propsJson: { text: "Edite este texto no painel da direita." },
    },
  };

  return presets[componentType] ?? presets.text;
}

function componentTypeLabel(componentType: string) {
  const labels: Record<string, string> = {
    button: "Botão",
    heading: "Título",
    image: "Imagem",
    text: "Texto",
    video: "Vídeo",
  };
  return labels[componentType] ?? componentType;
}

function emptyThemeForm(): ThemeForm {
  return {
    background: "",
    foreground: "",
    primary: "",
    secondary: "",
    muted: "",
    headingFont: "",
    bodyFont: "",
    cardRadius: "",
    buttonRadius: "",
  };
}

function themeFormFromWebsite(website: WebsiteBuilderWebsite): ThemeForm {
  const theme = website.themeJson ?? {};
  const colors = isRecord(theme.colors) ? theme.colors : {};
  const fonts = isRecord(theme.fonts) ? theme.fonts : {};
  const radius = isRecord(theme.radius) ? theme.radius : {};

  return {
    background: readRecordString(colors, "background"),
    foreground: readRecordString(colors, "foreground"),
    primary: readRecordString(colors, "primary"),
    secondary: readRecordString(colors, "secondary"),
    muted: readRecordString(colors, "muted"),
    headingFont: readRecordString(fonts, "heading"),
    bodyFont: readRecordString(fonts, "body"),
    cardRadius: readRecordNumberString(radius, "cards"),
    buttonRadius: readRecordNumberString(radius, "buttons"),
  };
}

function mergeWebsiteTheme(themeJson: Record<string, unknown>, form: ThemeForm) {
  const colors = isRecord(themeJson.colors) ? themeJson.colors : {};
  const fonts = isRecord(themeJson.fonts) ? themeJson.fonts : {};
  const radius = isRecord(themeJson.radius) ? themeJson.radius : {};

  return {
    ...themeJson,
    colors: {
      ...colors,
      background: form.background.trim() || undefined,
      foreground: form.foreground.trim() || undefined,
      primary: form.primary.trim() || undefined,
      secondary: form.secondary.trim() || undefined,
      muted: form.muted.trim() || undefined,
    },
    fonts: {
      ...fonts,
      heading: form.headingFont.trim() || undefined,
      body: form.bodyFont.trim() || undefined,
    },
    radius: {
      ...radius,
      cards: numericOrUndefined(form.cardRadius),
      buttons: numericOrUndefined(form.buttonRadius),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readComponentText(component: WebsiteBuilderComponent) {
  const props = component.propsJson ?? {};
  const candidates = [props.text, props.title, props.label, props.value, props.heading];
  const match = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof match === "string" ? match : "";
}

function readComponentAssetUrl(component: WebsiteBuilderComponent) {
  const props = component.propsJson ?? {};
  const candidates = [props.assetUrl, props.imageUrl, props.videoUrl, props.src, props.url];
  const match = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof match === "string" ? match : "";
}

function mergeComponentAssetProps(current: Record<string, unknown>, asset: WebsiteBuilderAsset) {
  const base = {
    ...current,
    assetId: asset.id,
    assetUrl: asset.publicUrl,
    src: asset.publicUrl,
    alt: readRecordString(current, "alt") || asset.fileName,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
  };

  if (asset.assetType === "video") {
    return {
      ...base,
      videoUrl: asset.publicUrl,
    };
  }

  if (asset.assetType === "image" || asset.assetType === "icon") {
    return {
      ...base,
      imageUrl: asset.publicUrl,
    };
  }

  return base;
}

function componentTextKey(component: WebsiteBuilderComponent) {
  if (component.componentType === "button") return "label";
  if (component.componentType === "heading") return "text";
  return "text";
}

function readRecordString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function readRecordNumberString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value === "number") return String(value);
  return typeof value === "string" ? value : "";
}

function mergeStyleJson(current: Record<string, unknown>, form: EditorPropertyForm) {
  return {
    ...current,
    backgroundColor: form.backgroundColor.trim() || undefined,
    color: form.textColor.trim() || undefined,
    borderRadius: numericOrUndefined(form.borderRadius),
    paddingY: numericOrUndefined(form.paddingY),
  };
}

function buildCanvasStyle(
  styleJson: Record<string, unknown>,
  defaults: { paddingY: number; borderRadius: number },
): CSSProperties {
  const backgroundColor = readRecordString(styleJson, "backgroundColor") || readRecordString(styleJson, "background");
  const color = readRecordString(styleJson, "color");
  const borderRadius = numericOrUndefined(readRecordNumberString(styleJson, "borderRadius")) ?? defaults.borderRadius;
  const paddingY = numericOrUndefined(readRecordNumberString(styleJson, "paddingY")) ?? defaults.paddingY;

  return {
    backgroundColor: backgroundColor || undefined,
    color: color || undefined,
    borderRadius,
    paddingTop: paddingY,
    paddingBottom: paddingY,
  };
}

function withBackgroundImage(style: CSSProperties, url: string): CSSProperties {
  return {
    ...style,
    backgroundImage: `linear-gradient(rgba(0,0,0,.58), rgba(0,0,0,.62)), url("${url}")`,
    backgroundPosition: "center",
    backgroundSize: "cover",
  };
}

function numericOrUndefined(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function moveById<T extends { id: string }>(items: T[], draggedId: string, targetId: string) {
  const fromIndex = items.findIndex((item) => item.id === draggedId);
  const toIndex = items.findIndex((item) => item.id === targetId);
  if (fromIndex < 0 || toIndex < 0) return null;

  const next = [...items];
  const [dragged] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, dragged);
  return next;
}

function moveByIdToIndex<T extends { id: string }>(items: T[], draggedId: string, targetIndex: number) {
  const fromIndex = items.findIndex((item) => item.id === draggedId);
  if (fromIndex < 0) return null;
  if (targetIndex === fromIndex || targetIndex === fromIndex + 1) return null;

  const next = [...items];
  const [dragged] = next.splice(fromIndex, 1);
  const adjustedIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const safeIndex = Math.max(0, Math.min(adjustedIndex, next.length));
  next.splice(safeIndex, 0, dragged);
  return next;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function normalizeSlug(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "pagina"
  );
}
