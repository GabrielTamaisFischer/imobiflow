import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BedDouble,
  Download,
  Eye,
  FileText,
  Globe,
  GripVertical,
  Home,
  ImagePlus,
  Loader2,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { type FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { OwnerFields } from "@/components/real-estate/owner-fields";
import { ownerInputFromForm } from "@/product/owner-form";
import { getModuleByKey } from "@/product/app-modules";
import {
  archiveProperty,
  createOwner,
  createProperty,
  deletePropertyMedia,
  getProperty,
  listOwners,
  listProperties,
  reorderPropertyMedia,
  setPropertyMediaCover,
  updateProperty,
  uploadPropertyMedia,
  toPropertySummary,
  type Property,
  type PropertyInput,
  type PropertyMedia,
  type PropertyOwner,
  type PropertyPagination,
  type PropertySummary,
} from "@/product/real-estate";
import {
  grantPropertyAccess,
  listPropertyAccess,
  listPropertyEligibleUsers,
  replacePropertyAccess,
  revokePropertyAccess,
} from "@/product/real-estate";
import { listUsers, type AccessResponse, type AppUserSummary } from "@/product/auth";
import { getPropertyDetailUrl } from "@/product/public-site-helpers";
import {
  getPropertyWhatsAppLink,
  getSiteSettings,
  markPropertyWhatsAppLinkOpened,
  publishSiteProperty,
  unpublishSiteProperty,
} from "@/product/sites";
import { useSessionGuard } from "@/product/use-session-guard";
import { canManage, canManageResourceSharing, getSafeApiErrorMessage, isAdministrative } from "@/product/app-access";
import { getOwnershipBadge } from "@/product/sharing";
import { ResourceOwnershipBadge, ResourceShareDialog } from "@/components/app/resource-share-dialog";

type CurrentAppUser = NonNullable<AccessResponse["access"]["appUser"]>;

// full-page-imoveis (2026-09-11): pure helper (exported for unit tests) that
// parses /app/imoveis search params. `notice` foi adicionado para permitir
// que as novas rotas full-page /app/imoveis/novo e /app/imoveis/:id/editar
// entreguem uma mensagem de sucesso/erro pós-navegação (ver PropertiesPage,
// useEffect que consome pageNotice) sem depender de router/location state
// (que não sobrevive a um refresh) — a própria URL carrega o aviso.
export function parsePropertiesSearch(search: Record<string, unknown>): { focusPropertyId?: string; notice?: string } {
  return {
    ...(typeof search.focusPropertyId === "string" ? { focusPropertyId: search.focusPropertyId } : {}),
    ...(typeof search.notice === "string" ? { notice: search.notice } : {}),
  };
}

export type SubmitIntent = "draft" | "save" | "publish";

// P2 (2026-09-11): pure helper (exported for unit tests) that mirrors the
// intent-detection used in PropertyWizard's handleSubmit — the primary
// source is `SubmitEvent.submitter.value` (correct per the forms spec, no
// heuristics), but a null/unrecognized submitter falls back to
// `pendingIntent` (a ref set by each submit button's onMouseDown) instead
// of silently defaulting straight to "save", which used to make a
// "Salvar e publicar" click look like it did nothing whenever submitter
// came back null.
export function resolveSubmitIntent(
  submitterValue: string | null | undefined,
  pendingIntent: SubmitIntent | null,
): SubmitIntent {
  if (submitterValue === "draft" || submitterValue === "save" || submitterValue === "publish") {
    return submitterValue;
  }
  return pendingIntent ?? "save";
}

export const Route = createFileRoute("/app/imoveis")({
  component: PropertiesPage,
  // AJUSTE-FUNCIONAL-03 (2026-09-11): permite abrir o dossiê (somente
  // leitura) de um imóvel específico via link, sem inventar uma nova rota
  // por id — reaproveita o mesmo diálogo "report" que o botão Visualizar já
  // abre. Usado pela Ficha do proprietário (Abrir imóvel) para apontar para
  // o imóvel exato em vez do módulo genérico.
  validateSearch: parsePropertiesSearch,
});

const propertyTypeOptions = [
  ["apartment", "Apartamento"],
  ["industrial_area", "Área Industrial"],
  ["garage_box", "BOX/Garagem"],
  ["house", "Casa"],
  ["commercial_house", "Casa Comercial"],
  ["condo_house", "Casa de condomínio"],
  ["village_house", "Casa de vila"],
  ["farm_house", "Chácara"],
  ["penthouse", "Cobertura"],
  ["office", "Conjunto comercial / Sala"],
  ["farm", "Fazenda"],
  ["flat", "Flat"],
  ["warehouse", "Galpão/Depósito/Armazém"],
  ["haras", "Haras"],
  ["hotel", "Hotel"],
  ["industry", "Indústria"],
  ["kitnet", "Kitnet"],
  ["loft", "Loft"],
  ["mall_store", "Loja shopping/CT comercial"],
  ["store", "Loja/Salão"],
  ["land_condo", "Loteamento/Condomínio"],
  ["motel", "Motel"],
  ["inn", "Pousada/Chalé"],
  ["building", "Prédio inteiro"],
  ["ranch", "Sítio"],
  ["townhouse", "Sobrado"],
  ["studio", "Studio"],
  ["land", "Terreno"],
  ["other", "Outro"],
] as const;

const operationOptions = [
  ["sale", "Venda"],
  ["rent", "Locação"],
  ["season", "Temporada"],
  ["both", "Venda e locação"],
] as const;

const statusLabels: Record<Property["status"], string> = {
  draft: "Rascunho",
  available: "Disponível",
  reserved: "Reservado",
  sold: "Vendido",
  rented: "Alugado",
  inactive: "Inativo",
  archived: "Arquivado",
};
const propertyStatusOptions = [
  ["not_archived", "Todos ativos"],
  ...Object.entries(statusLabels),
] as const;

const topographyOptions = ["Aclive", "Declive", "Plano"];
const fieldClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

const propertyFormSteps = [
  "Proprietário",
  "Localização",
  "Captação",
  "Dados primários",
  "Metragens",
  "Valores",
  "Detalhes adicionais",
  "Vídeo",
  "Descrição",
  "Imagens",
  "Liberações",
  "Revisão final",
];

const featureGroups = {
  infraestrutura: [
    "220V", "330V", "Aceita pets", "Acessibilidade Universal", "Acesso para deficientes", "Água", "Alarme",
    "Almoxarifados", "Aquecimento de água a gás", "Aquecimento de água com energia solar", "Aquecimento Central",
    "Aquecimento Elétrico", "Ar condicionado", "Ar condicionado central", "Área murada", "Armário banheiro",
    "Armário corredor", "Armário dormitório de empregada", "Armário sala", "Armários embutidos", "Armários na cozinha",
    "Armários nos quartos", "Armários planejados", "Banheiro Social", "Bifásico", "Box de Vidro", "Cabine Primária",
    "Câmera de segurança", "Central Telefônica", "Centro de convenções", "Churrasqueira na varanda", "Chuveiro a gás",
    "Circuito de segurança", "Closet", "Cobertura", "Coifa", "Condomínio", "Condomínio fechado", "Cozinha Americana",
    "Cozinha Planejada", "Depósito", "Detectores de incêndio", "Divisória", "Doca", "Dormitório com Armário",
    "Dormitório de empregada", "Duplex", "Elevador", "Energia", "Energia solar", "Entrada de serviço independente",
    "Entrada de energia elétrica", "Entrada de linha telefônica", "Entrada lateral", "Escada rolante", "Escritório",
    "Esgoto", "Estação gás", "Fibra ótica", "Forro com sprinklers", "Forro rebaixado", "Gerador", "Hidromassagem",
    "Imóvel no litoral", "Imóvel sem condomínio", "Interfone", "Jardim", "Jardim de inverno", "Lareira", "Lava rápido",
    "Lavabo", "Lavanderia", "Mezanino", "Mirante", "Mobiliado", "Pavimentação", "Pé direito duplo", "Pé na areia",
    "Permitido animais", "Pias em Mármore", "Piso de alta resistência", "Piso elevado", "Placa solar", "Ponte Rolante",
    "Porta entrada de caminhão", "Portão eletrônico", "Refeitório", "Reformado", "Sacada", "Sala de Jantar", "Sala de TV",
    "Segurança 24 horas", "Shaft de telecomunicações", "Solarium", "Tensão KVA", "Terraço", "Trifásico", "TV a cabo",
    "Vaga coberta", "Varanda", "Varanda Envidraçada", "Varanda Gourmet", "Vestiários", "Vista para o mar",
  ],
  lazer: [
    "Academia", "Adega", "Área gourmet", "Área Verde", "Auditório", "Bicicletário", "Bosque", "Brinquedoteca",
    "Campo de futebol", "Campo de golfe", "Churrasqueira", "Churrasqueira Condominial", "Ciclovia", "Cinema",
    "Elevador", "Elevador de Serviço", "Espaço gourmet", "Espaço mulher", "Espaço pet", "Espaço teen", "Estacionamento",
    "Forno a lenha", "Forno de pizza/pão", "Home office", "Jardim", "Lago para pescar", "Mini mercado no condomínio",
    "Pet Place", "Piscina", "Piscina adulto", "Piscina aquecida", "Piscina climatizada", "Piscina Coberta",
    "Piscina infantil", "Pista bicicross", "Pista de skate", "Playground", "Portaria 24 horas", "Praças",
    "Quadra de squash", "Quadra de tênis", "Quadra gramada", "Quadra poliesportiva", "Quintal", "Sala fitness",
    "Sala ginástica", "Salão de beleza", "Salão de festas", "Salão de jogos", "Salão de vídeo/cinema", "Sauna",
    "Sauna Seca", "Sauna úmida", "Solarium", "Spa", "Vestiário",
  ],
  piso: [
    "Aquecido", "Ardósia", "Bloquete", "Carpete", "Carpete de acrílico", "Carpete de madeira", "Carpete de nylon",
    "Cerâmica", "Cimento queimado", "Contrapiso", "Emborrachado", "Granito", "Granito apicoado", "Laminado",
    "Mármore", "Pedra Goiás", "Piso antivibratório", "Piso em madeira", "Piso Frio", "Porcelanato", "Tábua",
    "Taco de madeira", "Vinílico",
  ],
  servicos: [
    "Área de serviço", "Caseiro", "Copa", "Cozinha", "Despensa", "Dormitório de empregada", "Edícula", "Guarita",
    "Recepção", "Refeitório", "WC empregada", "Zelador",
  ],
  estrutura: [
    "Acesso asfaltado", "Açude", "Área murada", "Baia de cavalos", "Barracão", "Casa de colono", "Casa sede",
    "Cerca", "Curral", "Descascador de café", "Estábulo", "Estrada interna", "Garagem para maquinário", "Granja",
    "Heliponto", "Lago", "Lavrador", "Mangueiro", "Maquinário", "Nascente", "Paiol", "Pasto", "Pista de pouso",
    "Pivô de irrigação", "Poço", "Poço artesiano", "Pomar", "Portão eletrônico", "Reserva legal", "Reservatório de Água",
    "Retiros", "Rio", "Secador de café", "Tanque de peixe", "Terreiros", "Tulha", "Turismo rural",
  ],
  culturas: [
    "Cana de açúcar", "Caprinocultura", "Citrus", "Equinocultura", "Fruticultura", "Grãos", "Ovinocultura",
    "Pastagem", "Pecuária", "Piscicultura", "Reflorestamento",
  ],
};

const descriptionTemplates = [
  "Excelente {tipo} em {bairro}, {cidade}, ideal para quem busca conforto, localização estratégica e uma operação segura. O imóvel conta com {dormitorios}, {banheiros}, {vagas} e aproximadamente {area}.",
  "{titulo} reúne praticidade e valorização em uma das regiões mais procuradas de {cidade}. Com ambientes bem distribuídos, é uma ótima opção para {transacao}.",
  "Imóvel com perfil completo para quem valoriza funcionalidade, boa localização e estrutura pronta para uso. Localizado em {bairro}, oferece {dormitorios}, {banheiros} e {vagas}.",
  "Uma oportunidade interessante em {cidade}: {tipo} com características que atendem tanto uso próprio quanto investimento. Destaque para a localização em {bairro}.",
  "Projetado para entregar praticidade no dia a dia, este imóvel apresenta boa composição de ambientes e excelente potencial de negociação.",
  "Imóvel cadastrado com informações completas para atendimento rápido, divulgação em portais e acompanhamento comercial dentro do ImobiFlow.",
  "Com localização em {bairro}, este {tipo} oferece uma base sólida para moradia, operação comercial ou investimento, conforme a finalidade escolhida.",
  "Uma opção bem posicionada no mercado, com dados estruturados para venda, locação e publicação nos principais canais digitais.",
  "Este imóvel se destaca pela combinação entre localização, características internas e potencial de apresentação profissional em anúncios.",
  "Ideal para clientes que buscam uma decisão objetiva, este {tipo} apresenta informações claras de metragem, valores e diferenciais.",
  "Imóvel pronto para compor campanhas, atendimento via WhatsApp, CRM e portais, com descrição padronizada e foco em conversão.",
  "Localizado em {cidade}, o imóvel possui atributos importantes para negociação e permite uma abordagem comercial mais consultiva.",
  "Uma alternativa sólida para quem procura {transacao}, com dados organizados para análise de valor, visita e proposta.",
  "Cadastro preparado para apresentar o imóvel com clareza, reforçando localização, características, valores e diferenciais relevantes.",
  "Este {tipo} combina dados essenciais, estrutura de divulgação e potencial de acompanhamento pelo funil comercial da imobiliária.",
  "Boa oportunidade para clientes que buscam um imóvel com informações transparentes e atendimento profissional do início ao fechamento.",
  "Com perfil versátil, este imóvel pode ser trabalhado em diferentes estratégias comerciais, respeitando sua finalidade e características.",
  "Imóvel com apresentação estruturada para reduzir dúvidas do cliente e acelerar o envio de informações pelo corretor responsável.",
  "Uma opção que permite divulgação objetiva, atendimento qualificado e acompanhamento completo dentro da operação imobiliária.",
  "{titulo} foi cadastrado com foco em qualidade operacional, permitindo publicação, visitas, propostas e gestão integrada no ImobiFlow.",
];

function PropertiesPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("properties");
  const navigate = useNavigate();
  const canCreateOwner = canManage(session?.access.appUser, "owners.manage");
  // AJUSTE-FUNCIONAL-03 (2026-09-11): "Abrir imóvel" a partir da Ficha do
  // proprietário precisa apontar para o imóvel exato, não para a lista
  // genérica — independente de paginação/filtros aplicados na tela, então
  // carregamos o imóvel direto por id (mesma getProperty usada pelo card) e
  // reaproveitamos o mesmo PropertyReportModal (dossiê somente leitura) que
  // o botão "Visualizar" de cada card já abre.
  const { focusPropertyId, notice: noticeFromUrl } = Route.useSearch();
  const [focusedProperty, setFocusedProperty] = useState<Property | null>(null);
  const [focusError, setFocusError] = useState<string | null>(null);
  useEffect(() => {
    if (!focusPropertyId) {
      setFocusedProperty(null);
      setFocusError(null);
      return;
    }
    let canceled = false;
    getProperty(focusPropertyId)
      .then((response) => {
        if (!canceled) setFocusedProperty(response.property);
      })
      .catch((error) => {
        if (!canceled) {
          setFocusError(error instanceof Error ? error.message : "Não foi possível carregar o imóvel.");
        }
      });
    return () => {
      canceled = true;
    };
  }, [focusPropertyId]);
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [owners, setOwners] = useState<PropertyOwner[]>([]);
  const [isPropertiesLoading, setIsPropertiesLoading] = useState(true);
  const [propertySearch, setPropertySearch] = useState("");
  const deferredPropertySearch = useDeferredValue(propertySearch);
  const [propertyPage, setPropertyPage] = useState(1);
  const [propertyStatus, setPropertyStatus] = useState<Property["status"] | "not_archived">("not_archived");
  const [propertyOperation, setPropertyOperation] = useState<Property["operation"] | "">("");
  const [propertyType, setPropertyType] = useState<Property["property_type"] | "">("");
  const [pagination, setPagination] = useState<PropertyPagination>({
    page: 1,
    page_size: 25,
    total: 0,
    total_pages: 0,
    has_next: false,
    has_previous: false,
  });
  const [reloadVersion, setReloadVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [siteSlug, setSiteSlug] = useState<string | null>(null);
  const [appUsers, setAppUsers] = useState<AppUserSummary[]>([]);

  // full-page-imoveis (2026-09-11): /app/imoveis/novo e /app/imoveis/:id/
  // editar navegam de volta para cá com ?notice=... após salvar/publicar —
  // é assim que o feedback de sucesso/erro chega até o usuário depois do
  // full-page reload (nunca via router/location state, que some num
  // refresh). Consome o aviso e IMEDIATAMENTE limpa o parâmetro da URL
  // (replace, mantendo focusPropertyId se houver) para que um F5 não repita
  // o mesmo aviso indefinidamente.
  useEffect(() => {
    if (!noticeFromUrl) return;
    setPageNotice(noticeFromUrl);
    void navigate({
      to: "/app/imoveis",
      search: focusPropertyId ? { focusPropertyId } : {},
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeFromUrl]);

  useEffect(() => {
    // B4 (Fase B): lista de usuários da empresa para o seletor de "corretor
    // responsável". Requer users.manage — quem não tiver a permissão
    // simplesmente não vê o seletor (o imóvel continua com o responsável
    // padrão definido na criação); não bloqueia a página.
    if (isLoading || !session) return;
    let canceled = false;
    void listUsers()
      .then((response) => {
        if (!canceled) setAppUsers(response.users.filter((user) => user.status === "active"));
      })
      .catch(() => {
        if (!canceled) setAppUsers([]);
      });
    return () => {
      canceled = true;
    };
  }, [isLoading, session]);

  useEffect(() => {
    // B1 (Fase B): carrega o slug do site público apenas para montar o link
    // "Ver página pública" e decidir se a ação de publicar deve ficar
    // disponível. Não decide publicabilidade — isso continua sendo
    // responsabilidade exclusiva do backend (syncMysqlPropertyPublication).
    if (isLoading || !session) return;
    let canceled = false;
    void getSiteSettings()
      .then((response) => {
        if (!canceled) setSiteSlug(response.site?.slug ?? null);
      })
      .catch(() => {
        if (!canceled) setSiteSlug(null);
      });
    return () => {
      canceled = true;
    };
  }, [isLoading, session]);

  useEffect(() => {
    if (isLoading || !session) return;
    let canceled = false;
    void listOwners()
      .then((response) => {
        if (!canceled) setOwners(response.owners);
      })
      .catch((ownersError) => {
        if (!canceled) {
          setError(getSafeApiErrorMessage(ownersError, "Não foi possível carregar proprietários."));
        }
      });
    return () => {
      canceled = true;
    };
  }, [isLoading, session]);

  useEffect(() => {
    if (isLoading || !session) return;
    let canceled = false;
    setIsPropertiesLoading(true);
    setError(null);
    void listProperties({
      page: propertyPage,
      pageSize: 25,
      status: propertyStatus,
      operation: propertyOperation || undefined,
      propertyType: propertyType || undefined,
      search: deferredPropertySearch || undefined,
    })
      .then((response) => {
        if (canceled) return;
        setProperties(response.items);
        setPagination(response.pagination);
      })
      .catch((propertiesError) => {
        if (!canceled) {
          setError(getSafeApiErrorMessage(propertiesError, "Não foi possível carregar imóveis."));
        }
      })
      .finally(() => {
        if (!canceled) setIsPropertiesLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [deferredPropertySearch, isLoading, propertyOperation, propertyPage, propertyStatus, propertyType, reloadVersion, session]);

  function reloadProperties() {
    setReloadVersion((current) => current + 1);
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  }

  return (
    <ModulePage session={session} module={module}>
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Cadastro de imóveis</p>
          <p className="text-sm text-muted-foreground">
            Cadastre proprietário, localização, captação, dados técnicos, valores, mídia e liberações de publicação.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void navigate({ to: "/app/imoveis/novo" })}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Novo imóvel
        </button>
      </div>

      {session?.access.subscription?.plan_slug === "preview" ? (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Modo visualização ativo: imóveis criados aqui ficam apenas neste navegador.
        </div>
      ) : null}

      {pageNotice ? (
        <div className="mb-4 rounded-lg border border-border bg-card p-4 text-sm">
          {pageNotice}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {pagination.total > 0 || propertySearch || propertyOperation || propertyType || propertyStatus !== "not_archived" ? (
        <div className="mb-4 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="block text-sm font-medium md:col-span-2 xl:col-span-1">
            Pesquisar imóvel
            <input
              value={propertySearch}
              onChange={(event) => {
                setPropertySearch(event.target.value);
                setPropertyPage(1);
              }}
              className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Código, título, bairro ou cidade"
            />
          </label>
          <FilterSelect
            label="Finalidade"
            value={propertyOperation}
            onChange={(value) => {
              setPropertyOperation(value as typeof propertyOperation);
              setPropertyPage(1);
            }}
            options={operationOptions}
          />
          <FilterSelect
            label="Tipo"
            value={propertyType}
            onChange={(value) => {
              setPropertyType(value as typeof propertyType);
              setPropertyPage(1);
            }}
            options={propertyTypeOptions}
          />
          <FilterSelect
            label="Status"
            value={propertyStatus}
            onChange={(value) => {
              setPropertyStatus(value as typeof propertyStatus);
              setPropertyPage(1);
            }}
            options={propertyStatusOptions}
          />
        </div>
      ) : null}

      {isPropertiesLoading ? (
        <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando imóveis...
        </section>
      ) : pagination.total === 0 && !propertySearch && !propertyOperation && !propertyType && propertyStatus === "not_archived" ? (
        <EmptyState
          icon={Home}
          title="Nenhum imóvel cadastrado"
          description="Cadastre imóveis reais para alimentar CRM, vistorias, contratos, publicação e financeiro."
          actionLabel="Cadastrar imóvel"
          onAction={() => void navigate({ to: "/app/imoveis/novo" })}
        />
      ) : properties.length === 0 ? (
        <EmptyState
          icon={Home}
          title="Nenhum imóvel encontrado"
          description="Ajuste a pesquisa para localizar imóveis por código, título, proprietário, bairro ou cidade."
        />
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {properties.map((property) => (
            <PropertyCard
              key={property.id}
              property={property}
              owners={owners}
              siteSlug={siteSlug}
              appUsers={appUsers}
              currentUser={session?.access.appUser}
              onPropertyUpdated={(updatedProperty) => {
                setProperties((current) =>
                  current.map((item) => (item.id === updatedProperty.id ? toPropertySummary(updatedProperty) : item)),
                );
              }}
              onPropertyRemoved={(propertyId) => {
                setProperties((current) => current.filter((item) => item.id !== propertyId));
                reloadProperties();
              }}
            />
          ))}
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between md:col-span-2 xl:col-span-3">
            <p className="text-sm text-muted-foreground">
              {pagination.total} imóvel{pagination.total === 1 ? "" : "is"} · página {pagination.page} de {Math.max(pagination.total_pages, 1)} · até {pagination.page_size} por página
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!pagination.has_previous || isPropertiesLoading}
                onClick={() => setPropertyPage((current) => Math.max(1, current - 1))}
                className="h-9 rounded-md border border-border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={!pagination.has_next || isPropertiesLoading}
                onClick={() => setPropertyPage((current) => current + 1)}
                className="h-9 rounded-md border border-border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        </section>
      )}
      {focusError ? (
        <div className="fixed inset-x-4 bottom-4 z-50 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive shadow-lg">
          {focusError}
        </div>
      ) : null}
      {focusedProperty ? (
        <PropertyReportModal property={focusedProperty} onClose={() => void navigate({ to: "/app/imoveis" })} />
      ) : null}
    </ModulePage>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className={`${fieldClass} mt-2`}>
        <option value="">Todos</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

// full-page-imoveis (2026-09-11): exportado para ser reaproveitado, sem
// duplicação, pelas rotas full-page /app/imoveis/novo e
// /app/imoveis/:id/editar (ver app.imoveis.novo.tsx e
// app.imoveis.$propertyId.editar.tsx) — continua sendo o ÚNICO componente
// de wizard de imóvel do produto, só variando via `mode`.
export function PropertyWizard({
  mode,
  property,
  owners,
  appUsers,
  currentUserId,
  canCreateOwner,
  onCancel,
  onCreated,
  onUpdated,
  siteSlug,
  onPublicationChanged,
}: {
  mode: "create" | "edit";
  property?: Property;
  owners: PropertyOwner[];
  appUsers: AppUserSummary[];
  currentUserId?: string;
  canCreateOwner: boolean;
  onCancel: () => void;
  onCreated?: (property: Property, owner?: PropertyOwner, notice?: string) => void;
  onUpdated?: (property: Property) => void;
  siteSlug?: string | null;
  onPublicationChanged?: (property: Property) => void;
}) {
  const isEdit = mode === "edit";
  const formRef = useRef<HTMLFormElement>(null);
  // P2 (2026-09-11): `SubmitEvent.submitter` é o caminho padrão e correto
  // para saber qual botão disparou o submit (comentário original abaixo, em
  // handleSubmit), mas não é garantido em 100% dos ambientes/navegadores
  // (ex.: alguns fluxos de auto-submit/teste não populam `submitter`). Sem
  // fallback, esse caso caía silenciosamente em "save" — se fosse o clique
  // em "Salvar e publicar", a publicação simplesmente não acontecia e nada
  // no fluxo indicava o motivo (o botão "não fazia nada" na percepção do
  // usuário). Este ref é preenchido no onClick/onMouseDown de cada botão de
  // submit e serve só como rede de segurança quando submitter vier nulo —
  // nunca substitui submitter quando ele existe.
  const pendingIntentRef = useRef<"draft" | "save" | "publish" | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState(property?.owner_id ?? "");
  // Item 6 do escopo: o corretor responsável precisa ser SELECIONÁVEL já no
  // cadastro (antes só existia essa opção na edição — ver EditSection
  // "1. Proprietário, código e status"). Mantém currentUserId como padrão
  // (comportamento anterior) mas permite trocar antes de salvar.
  const [selectedResponsibleUserId, setSelectedResponsibleUserId] = useState(property?.responsible_user_id ?? currentUserId ?? "");
  const [ownerSearch, setOwnerSearch] = useState("");
  const [propertyCepStatus, setPropertyCepStatus] = useState<"idle" | "loading" | "found" | "error">("idle");
  const [description, setDescription] = useState(property?.description ?? "");
  const [templateIndex, setTemplateIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [formOperation, setFormOperation] = useState<Property["operation"]>(property?.operation ?? "sale");
  const [pricePreview, setPricePreview] = useState<CommercialPriceCalculation>(() => calculateCommercialPrices(new FormData()));
  const [formReadiness, setFormReadiness] = useState<ReadinessItem[]>(() =>
    buildFormPublicationChecklist(new FormData(), "", ""),
  );
  const [mainPhoto, setMainPhoto] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [tourFiles, setTourFiles] = useState<File[]>([]);
  const [editableMedia, setEditableMedia] = useState<NonNullable<Property["property_media"]>>(property?.property_media ?? []);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publicationError, setPublicationError] = useState<string | null>(null);
  const [publicationNotice, setPublicationNotice] = useState<string | null>(null);
  const currentStep = propertyFormSteps[stepIndex] ?? propertyFormSteps[0];
  const progress = Math.round((formReadiness.filter((item) => item.ready).length / formReadiness.length) * 100);

  useEffect(() => {
    if (!isEdit || !property || !formRef.current) return;
    populatePropertyWizardForm(formRef.current, property);
    setFormOperation(property.operation);
    setFormReadiness(buildFormPublicationChecklist(new FormData(formRef.current), property.description ?? "", property.owner_id ?? "", Boolean(property.property_media?.some((media) => media.is_cover))));
  }, [isEdit, property]);

  const selectedOwner = useMemo(
    () => owners.find((owner) => owner.id === selectedOwnerId),
    [owners, selectedOwnerId],
  );
  const visibleOwners = useMemo(() => {
    const query = ownerSearch.trim().toLocaleLowerCase("pt-BR").replace(/\D/g, "");
    const textQuery = ownerSearch.trim().toLocaleLowerCase("pt-BR");
    if (!textQuery) return owners;
    return owners.filter((owner) => {
      const searchable = [owner.name, owner.document, owner.email, owner.phone, owner.whatsapp]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR");
      return searchable.includes(textQuery) || (query && searchable.replace(/\D/g, "").includes(query));
    });
  }, [ownerSearch, owners]);

  async function fillAddressByCep(input: HTMLInputElement, prefix: "owner" | "property") {
    const cep = input.value.replace(/\D/g, "");
    if (cep.length !== 8) {
      if (prefix === "property") setPropertyCepStatus(cep.length ? "error" : "idle");
      return;
    }

    try {
      if (prefix === "property") setPropertyCepStatus("loading");
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 6000);
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal });
      window.clearTimeout(timeout);
      if (!response.ok) throw new Error("CEP indisponível");
      const data = (await response.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (data.erro) throw new Error("CEP não encontrado");

      const form = input.form;
      if (!form) return;
      setInputValue(form, `${prefix}_street`, data.logradouro ?? "", true);
      setInputValue(form, `${prefix}_neighborhood`, data.bairro ?? "", true);
      setInputValue(form, `${prefix}_city`, data.localidade ?? "", true);
      setInputValue(form, `${prefix}_state`, data.uf ?? "", true);
      setInputValue(form, `${prefix}_country`, "Brasil", true);
      if (prefix === "property") {
        setPropertyCepStatus("found");
        (form.elements.namedItem("property_number") as HTMLInputElement | null)?.focus();
      }
      refreshReadiness(form);
    } catch {
      if (prefix === "property") setPropertyCepStatus("error");
    }
  }

  async function handleCepBlur(event: React.FocusEvent<HTMLInputElement>, prefix: "owner" | "property") {
    await fillAddressByCep(event.currentTarget, prefix);
  }

  async function handleCepInput(event: React.FormEvent<HTMLInputElement>, prefix: "owner" | "property") {
    const cep = event.currentTarget.value.replace(/\D/g, "");
    if (cep.length !== 8) return;
    await fillAddressByCep(event.currentTarget, prefix);
  }

  function handleGenerateDescription(form: HTMLFormElement) {
    const data = new FormData(form);
    const template = descriptionTemplates[templateIndex % descriptionTemplates.length];
    const generated = template
      .replaceAll("{titulo}", text(data, "title") || "Este imóvel")
      .replaceAll("{tipo}", labelFor(propertyTypeOptions, text(data, "property_type")) || "imóvel")
      .replaceAll("{bairro}", text(data, "property_neighborhood") || "bairro informado")
      .replaceAll("{cidade}", text(data, "property_city") || "cidade informada")
      .replaceAll("{transacao}", labelFor(operationOptions, text(data, "operation"))?.toLowerCase() || "negociação")
      .replaceAll("{dormitorios}", text(data, "bedrooms") ? `${text(data, "bedrooms")} dormitório(s)` : "dormitórios a informar")
      .replaceAll("{banheiros}", text(data, "bathrooms") ? `${text(data, "bathrooms")} banheiro(s)` : "banheiros a informar")
      .replaceAll("{vagas}", text(data, "parking_spaces") ? `${text(data, "parking_spaces")} vaga(s)` : "vagas a informar")
      .replaceAll("{area}", text(data, "private_area") ? `${text(data, "private_area")} m² de área útil` : "metragem a informar");

    setDescription(generated);
    setFormReadiness(buildFormPublicationChecklist(data, generated, selectedOwnerId, Boolean(mainPhoto)));
    setTemplateIndex((current) => current + 1);
  }

  function refreshReadiness(form: HTMLFormElement, nextDescription = description) {
    setFormReadiness(buildFormPublicationChecklist(new FormData(form), nextDescription, selectedOwnerId, Boolean(mainPhoto)));
  }

  function refreshReadinessWithMainPhoto(form: HTMLFormElement | null, file: File | null) {
    if (!form) return;
    setFormReadiness(buildFormPublicationChecklist(new FormData(form), description, selectedOwnerId, Boolean(file)));
  }

  async function handlePublishToggle(nextEnabled: boolean) {
    if (!isEdit || !property) return;
    setIsPublishing(true);
    setPublicationError(null);
    setPublicationNotice(null);
    try {
      const response = nextEnabled ? await publishSiteProperty(property.id) : await unpublishSiteProperty(property.id);
      const updated: Property = {
        ...property,
        status: response.property.status,
        published_at: response.property.published_at,
        publication_settings_json: { ...property.publication_settings_json, site_enabled: nextEnabled },
      };
      onPublicationChanged?.(updated);
      setPublicationNotice(nextEnabled ? "Imóvel publicado no site." : "Imóvel despublicado do site.");
    } catch (publishError) {
      setPublicationError(publishError instanceof Error ? publishError.message : "Não foi possível atualizar a publicação deste imóvel.");
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Item 12 do escopo: 3 ações explícitas no cadastro — SALVAR RASCUNHO
    // (força status=draft, nunca tenta publicar), SALVAR (mantém o status
    // escolhido no formulário, comportamento anterior, nunca publica
    // sozinho) e SALVAR E PUBLICAR (salva e, na sequência, chama a MESMA
    // rota de publicação real usada na edição — POST /site/properties/:id/
    // publish — nunca um status fictício). Detectado via SubmitEvent.
    // submitter (padrão da spec de forms), não por heurística de clique.
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = resolveSubmitIntent(submitter?.value, pendingIntentRef.current);
    pendingIntentRef.current = null;
    setIsSaving(true);
    setError(null);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    try {
      let ownerId = selectedOwnerId;
      let createdOwner: PropertyOwner | undefined;

      if (canCreateOwner && !ownerId && text(form, "owner_name")) {
        const ownerInput = ownerInputFromForm(form, "owner_");
        const ownerResponse = await createOwner(ownerInput);
        ownerId = ownerResponse.owner.id;
        createdOwner = ownerResponse.owner;
      }

      const priceCalculation = calculateCommercialPrices(form);
      const propertyInput: PropertyInput = {
        owner_id: ownerId,
        responsible_user_id: selectedResponsibleUserId || currentUserId,
        code: text(form, "code"),
        title: text(form, "title"),
        description,
        property_type: normalizePropertyType(text(form, "property_type")),
        operation: normalizeOperation(text(form, "operation")),
        status: !isEdit && intent === "draft" ? "draft" : (text(form, "status") as PropertyInput["status"]),
        street: text(form, "property_street"),
        number: text(form, "property_number"),
        complement: text(form, "property_complement"),
        neighborhood: text(form, "property_neighborhood"),
        city: text(form, "property_city"),
        state: text(form, "property_state"),
        country: text(form, "property_country") || "Brasil",
        zip_code: text(form, "property_zip_code"),
        latitude: parseDecimal(form.get("latitude")),
        longitude: parseDecimal(form.get("longitude")),
        condominium_name: text(form, "condominium_name"),
        nearby_highways: splitLines(text(form, "nearby_highways")),
        bedrooms: parseInteger(form.get("bedrooms")),
        bathrooms: parseInteger(form.get("bathrooms")),
        suites: parseInteger(form.get("suites")),
        parking_spaces: parseInteger(form.get("parking_spaces")),
        private_area: parseDecimal(form.get("private_area")),
        total_area: parseDecimal(form.get("total_area")),
        sale_price_cents: priceCalculation.sale_price_cents,
        rent_price_cents: priceCalculation.rent_price_cents,
        condominium_fee_cents: parseMoneyToCents(text(form, "condominium_fee")),
        iptu_cents: parseMoneyToCents(text(form, "iptu")),
        capture_json: buildCaptureJson(form),
        primary_details_json: buildPrimaryDetailsJson(form),
        measurements_json: buildMeasurementsJson(form),
        commercial_terms_json: buildCommercialTermsJson(form, priceCalculation),
        amenity_groups_json: buildAmenityGroupsJson(form),
        features_json:
          isEdit && property
            ? property.features_json
            : Object.fromEntries(getChecked(form, "features").map((item) => [item, true])),
        videos_json: splitLines(text(form, "videos")).map((url) => ({ type: "link", url })),
        publication_settings_json: buildPublicationSettingsJson(form),
        description_template_key: `template_${templateIndex}`,
      };

      if (isEdit && property) {
        const response = await updateProperty(property.id, propertyInput);
        onUpdated?.({ ...response.property, property_media: editableMedia });
        return;
      }

      const response = await createProperty(propertyInput);
      const uploadedMedia = await uploadSelectedPropertyMedia(response.property.id, {
        mainPhoto,
        galleryFiles,
        videoFiles,
        tourFiles,
      });
      let refreshed = uploadedMedia.length ? await getProperty(response.property.id) : response;
      let notice: string | undefined;

      if (intent === "publish") {
        try {
          const published = await publishSiteProperty(response.property.id);
          refreshed = { property: { ...refreshed.property, ...published.property } };
          notice = "Imóvel salvo e publicado no site.";
        } catch (publishError) {
          // O imóvel FOI salvo — não perder o trabalho do usuário. Mas a
          // publicação falhou (ex.: checklist incompleto) e isso precisa
          // ficar claro, nunca escondido atrás de um "salvo com sucesso"
          // genérico (mesmo princípio do BUG-SITE-001: nunca fingir estado
          // que não existe).
          notice =
            publishError instanceof Error
              ? `Imóvel salvo, mas não foi possível publicar: ${publishError.message}`
              : "Imóvel salvo, mas não foi possível publicar no site.";
        }
      } else if (intent === "draft") {
        notice = "Imóvel salvo como rascunho. Ele não aparece no site até ser publicado.";
      }

      onCreated?.({ ...refreshed.property, property_media: uploadedMedia.length ? uploadedMedia : refreshed.property.property_media }, createdOwner, notice);
      formElement.reset();
      setDescription("");
      setMainPhoto(null);
      setGalleryFiles([]);
      setVideoFiles([]);
      setTourFiles([]);
    } catch (propertyError) {
      setError(propertyError instanceof Error ? propertyError.message : "Não foi possível salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onChange={(event) => {
        const form = new FormData(event.currentTarget);
        refreshReadiness(event.currentTarget);
        setFormOperation(normalizeOperation(text(form, "operation")));
        setPricePreview(calculateCommercialPrices(form));
      }}
      // full-page-imoveis (2026-09-11): antes só o modo "create" era
      // desenhado como um bloco de página normal; "edit" carregava estilo
      // de modal (max-h/overflow/shadow) porque era montado como diálogo
      // sobreposto ao card. Agora as duas rotas que montam este wizard
      // (/app/imoveis/novo e /app/imoveis/:id/editar) são páginas cheias —
      // o mesmo estilo de bloco serve para os dois modos.
      className="mb-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{isEdit ? "Editar anúncio" : "Cadastro completo de imóvel"}</h2>
          <p className="text-sm text-muted-foreground">
            O imóvel nasce vazio e só recebe dados reais informados pela imobiliária.
          </p>
        </div>
        <button type="button" onClick={onCancel} className="h-9 rounded-md border border-border px-3 text-sm font-medium">
          Cancelar
        </button>
      </div>

      <div className="mb-4 rounded-lg border border-border bg-background p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Etapa {stepIndex + 1} de {propertyFormSteps.length}</p>
            <p className="text-sm font-semibold">{currentStep}</p>
          </div>
          <p className="text-sm text-muted-foreground">{progress}% completo</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {propertyFormSteps.map((step, index) => (
            <button
              key={step}
              type="button"
              onClick={() => setStepIndex(index)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                index === stepIndex
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {index + 1}. {step}
            </button>
          ))}
        </div>
      </div>

      <FormSection step={0} activeStep={stepIndex} title="1. Proprietário" description="Cadastre um novo proprietário ou vincule um proprietário já existente.">
        <Field label="Buscar proprietário" name="owner_search" placeholder="Nome, CPF/CNPJ, e-mail ou telefone" onInput={(event) => setOwnerSearch(event.currentTarget.value)} />
        <label className="space-y-1 text-sm">
          <span className="font-medium">Proprietário existente</span>
          <select
            value={selectedOwnerId}
            onChange={(event) => {
              setSelectedOwnerId(event.target.value);
              if (event.currentTarget.form) {
                setFormReadiness(buildFormPublicationChecklist(new FormData(event.currentTarget.form), description, event.target.value, Boolean(mainPhoto)));
              }
            }}
            className={fieldClass}
          >
            <option value="">{canCreateOwner ? "Adicionar proprietário neste cadastro" : "Selecione um proprietário existente"}</option>
            {visibleOwners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
        </label>
        {!selectedOwner && canCreateOwner ? (
          <OwnerFields prefix="owner_" nameRequired={false} />
        ) : !selectedOwner ? (
          <div className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground md:col-span-2 xl:col-span-4">
            Seu perfil pode vincular um proprietário existente, mas não cadastrar um novo proprietário.
          </div>
        ) : (
          <div className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground md:col-span-2 xl:col-span-4">
            Proprietário vinculado: <strong className="text-foreground">{selectedOwner.name}</strong>. O código do imóvel ficará ligado a este cadastro.
          </div>
        )}
        {appUsers.length ? (
          <label className="space-y-1 text-sm">
            <span className="font-medium">Corretor responsável</span>
            <select
              name="responsible_user_id"
              value={selectedResponsibleUserId}
              onChange={(event) => setSelectedResponsibleUserId(event.target.value)}
              className={fieldClass}
            >
              <option value="">Sem responsável definido</option>
              {appUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </FormSection>

      <FormSection step={1} activeStep={stepIndex} title="2. Localização do imóvel" description="Endereço, coordenadas, condomínio e referências de acesso.">
        <Field label="Código imóvel" name="code" placeholder="Automático se deixar vazio" />
        <Field label="Título" name="title" placeholder="Pode ser preenchido depois no rascunho" />
        <Field
          label="CEP"
          name="property_zip_code"
          format="cep"
          inputMode="numeric"
          onInput={(event) => void handleCepInput(event, "property")}
          onBlur={(event) => void handleCepBlur(event, "property")}
        />
        <p className={`self-end pb-2 text-xs ${propertyCepStatus === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {propertyCepStatus === "loading" ? "Consultando CEP…" : propertyCepStatus === "found" ? "Endereço encontrado; informe o número." : propertyCepStatus === "error" ? "CEP não encontrado. Preencha manualmente." : "Preenchimento automático opcional."}
        </p>
        <Field label="Endereço" name="property_street" />
        <Field label="Número" name="property_number" />
        <Field label="Complemento" name="property_complement" />
        <Field label="Bairro" name="property_neighborhood" />
        <Field label="Município" name="property_city" />
        <Field label="UF" name="property_state" maxLength={2} />
        <Field label="País" name="property_country" defaultValue="Brasil" />
        <Field label="Latitude" name="latitude" inputMode="decimal" />
        <Field label="Longitude" name="longitude" inputMode="decimal" />
        <Field label="Nome do condomínio" name="condominium_name" placeholder="Digite ou selecione futuramente" />
        <TextArea label="Rodovias próximas" name="nearby_highways" placeholder="Uma por linha" />
      </FormSection>

      <FormSection step={2} activeStep={stepIndex} title="3. Captação" description="Informações operacionais para placa, chaves, exclusividade e parceria.">
        <Field label="Captador" name="captor_name" />
        <Field label="Local das chaves" name="key_location" />
        <Field label="Nome do zelador ou porteiro" name="doorman_name" />
        <Field label="Telefone do zelador ou porteiro" name="doorman_phone" format="phone" inputMode="tel" />
        <SelectField label="Placa no local?" name="has_sign" options={[["no", "Não"], ["yes", "Sim"]]} />
        <Field label="Data colocação" name="sign_installed_at" type="date" />
        <Field label="Data retirada" name="sign_removed_at" type="date" />
        <SelectField label="Imóvel é exclusividade?" name="exclusive" options={[["no", "Não"], ["yes", "Sim"]]} />
        <Field label="Exclusividade até" name="exclusive_until" type="date" />
        <Checkbox name="capture_flags" value="documentacao" label="Documentação" />
        <Checkbox name="capture_flags" value="condicoes_comerciais" label="Condições comerciais" />
        <Checkbox name="capture_flags" value="vistoria" label="Vistoria" />
        <Checkbox name="capture_flags" value="parceria" label="Parceria" />
      </FormSection>

      <FormSection step={3} activeStep={stepIndex} title="4. Dados primários" description="Tipo, transação, quartos, vagas, docas e características industriais.">
        <SelectField label="Tipo de imóvel*" name="property_type" options={propertyTypeOptions.map(([value, label]) => [value, label])} />
        <SelectField label="Transação*" name="operation" options={operationOptions.map(([value, label]) => [value, label])} />
        <SelectField label="Status" name="status" options={[["draft", "Rascunho"], ["available", "Disponível"], ["reserved", "Reservado"], ["inactive", "Inativo"]]} />
        <Field label="Fração multi propriedade" name="multi_property_fraction" />
        <SelectField label="Aceita permuta?" name="accepts_exchange" options={[["no", "Não"], ["yes", "Sim"]]} />
        <SelectField label="Aceita financiamento?" name="accepts_financing" options={[["no", "Não"], ["yes", "Sim"]]} />
        <Field label="Quantidade de dormitórios" name="bedrooms" inputMode="numeric" />
        <Field label="Quantidade de suítes" name="suites" inputMode="numeric" />
        <Field label="Quantidade de salas" name="living_rooms" inputMode="numeric" />
        <Field label="Quantidade de banheiros" name="bathrooms" inputMode="numeric" />
        <Field label="Quantidade total de vagas" name="parking_spaces" inputMode="numeric" />
        <Field label="Vagas descobertas" name="uncovered_parking_spaces" inputMode="numeric" />
        <Field label="Vagas frontais para clientes" name="front_customer_parking" inputMode="numeric" />
        <Field label="Vagas adicionais" name="additional_parking" inputMode="numeric" />
        <Field label="Total de docas" name="total_docks" inputMode="numeric" />
        <Field label="Docas cobertas" name="covered_docks" inputMode="numeric" />
        <Field label="Docas elevadas" name="elevated_docks" inputMode="numeric" />
        <Field label="Docas em nível" name="level_docks" inputMode="numeric" />
        <Field label="Quantidade de rampas" name="ramps" inputMode="numeric" />
        <Field label="Resistência do piso ton/m²" name="floor_resistance" inputMode="decimal" format="decimal" />
        <SelectField label="Topografia" name="topography" options={topographyOptions.map((item) => [item, item])} />
      </FormSection>

      <FormSection step={4} activeStep={stepIndex} title="5. Metragens" description="Áreas urbanas, rurais, industriais e medidas complementares.">
        {[
          ["ceiling_height", "Pé direito"],
          ["total_area", "Área total"],
          ["land_area_m2", "Área de terreno m²"],
          ["land_area_alqueire", "Área de terreno alqueire"],
          ["land_area_hectare", "Área de terreno hectare"],
          ["land_area_acre", "Área de terreno acre"],
          ["built_area", "Área construída"],
          ["industrial_area", "Área fabril"],
          ["office_area", "Área de escritório"],
          ["support_area", "Área de apoio"],
          ["private_area", "Área útil"],
          ["maneuver_area", "Área de manobra"],
          ["external_area", "Área externa"],
          ["yard_area", "Área de pátio"],
          ["gross_area", "Área bruta"],
          ["exclusive_area", "Área privativa"],
          ["common_area", "Áreas comuns"],
          ["land_dimensions", "Dimensões do terreno"],
          ["mezzanine_area", "Área de mezanino"],
          ["glebe_area", "Gleba"],
          ["plateau_area", "Área de platô"],
        ].map(([name, label]) => (
          <Field key={name} label={label} name={name} inputMode="decimal" format="decimal" />
        ))}
      </FormSection>

      <FormSection step={5} activeStep={stepIndex} title="6. Valores" description="Valores, taxas e regra comercial de comissão/acréscimo/desconto.">
        {formOperation === "sale" || formOperation === "both" ? <Field label="Valor original de venda" name="sale_price" inputMode="decimal" format="money" /> : null}
        {formOperation === "rent" || formOperation === "both" ? <Field label="Valor original de locação/mês" name="rent_price" inputMode="decimal" format="money" /> : null}
        {formOperation === "season" ? <Field label="Valor de temporada" name="season_price" inputMode="decimal" format="money" /> : null}
        <Field label="Valor do condomínio" name="condominium_fee" inputMode="decimal" format="money" />
        <Field label="Valor do IPTU" name="iptu" inputMode="decimal" format="money" />
        <SelectField label="IPTU" name="iptu_period" options={[["monthly", "Mensal"], ["yearly", "Anual"]]} />
        <Field label="Condomínio pagamento" name="condominium_payment_notes" />
        <TextArea label="Dados adicionais/Locação" name="rent_notes" />
        <TextArea label="Dados adicionais/Temporada" name="season_notes" />
        <SelectField label="Regra comercial" name="commercial_rule_type" options={[["none", "Nenhuma"], ["percent", "Percentual"], ["fixed", "Valor fixo"]]} />
        <SelectField label="Aplicação da regra" name="commercial_rule_mode" options={[["add", "Adicionar ao valor"], ["subtract", "Tirar do valor"]]} />
        <Field label="% ou valor fixo" name="commercial_rule_value" inputMode="decimal" format="decimal" />
        <div className="rounded-md border border-primary/25 bg-primary/5 p-3 text-sm md:col-span-2 xl:col-span-4">
          <p className="font-semibold">Cálculo comercial em tempo real</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(formOperation === "sale" || formOperation === "both") ? <p>Venda: {formatCurrency(pricePreview.original_sale_price_cents ?? null) || "não informada"} → <strong>{formatCurrency(pricePreview.sale_price_cents ?? null) || "não informada"}</strong></p> : null}
            {(formOperation === "rent" || formOperation === "both") ? <p>Locação: {formatCurrency(pricePreview.original_rent_price_cents ?? null) || "não informada"} → <strong>{formatCurrency(pricePreview.rent_price_cents ?? null) || "não informada"}</strong></p> : null}
            {formOperation === "season" ? <p>Temporada: <strong>{formatCurrency(pricePreview.season_price_cents ?? null) || "não informada"}</strong></p> : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">O valor original e o ajuste ficam preservados; cards e site exibem o valor final calculado.</p>
        </div>
      </FormSection>

      <FormSection step={6} activeStep={stepIndex} title="7. Detalhes adicionais" description="Infraestrutura, lazer, piso, serviços, estrutura rural e culturas.">
        {Object.entries(featureGroups).map(([group, items]) => (
          <FeatureGroup
            key={group}
            group={group}
            items={items}
            initialItems={isEdit && property ? (property.amenity_groups_json?.[group] as string[] | undefined) : undefined}
          />
        ))}
      </FormSection>

      <FormSection step={7} activeStep={stepIndex} title="8. Vídeo" description="Adicione vídeos MP4 ou links externos do imóvel.">
        <FilePicker
          label="Adicionar vídeo MP4"
          description="Envie vídeos reais do imóvel (limite prático de ~10MB por arquivo). Para vídeos maiores, use o campo de link externo abaixo."
          accept="video/mp4"
          multiple
          files={videoFiles}
          onFilesChange={setVideoFiles}
        />
        <TextArea label="Links de vídeo" name="videos" placeholder="YouTube, Vimeo ou tour externo, um link por linha" />
        <p className="text-xs text-muted-foreground md:col-span-2 xl:col-span-4">
          Upload direto de MP4 é indicado para vídeos curtos/leves. Para vídeos maiores ou de melhor qualidade, prefira hospedar em YouTube/Vimeo e colar o link acima — o site do imóvel exibe ambos normalmente.
        </p>
      </FormSection>

      <FormSection step={8} activeStep={stepIndex} title="9. Descrição" description="Gere textos por modelos locais, sem custo de IA real nesta fase.">
        <div className="md:col-span-2 xl:col-span-4">
          <button
            type="button"
            onClick={(event) => handleGenerateDescription(event.currentTarget.form!)}
            className="mb-3 inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent"
          >
            <Sparkles className="h-4 w-4" />
            Gerar descrição por modelo
          </button>
            <textarea
              name="description"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                if (event.currentTarget.form) refreshReadiness(event.currentTarget.form, event.target.value);
              }}
            rows={7}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="A descrição gerada ou digitada aparecerá aqui."
          />
        </div>
      </FormSection>

      <FormSection step={9} activeStep={stepIndex} title="10. Imagens" description="Adicione foto principal, galeria e imagem panorâmica para tour 360.">
        {isEdit && property ? (
          <div className="md:col-span-2 xl:col-span-4">
            <p className="mb-2 text-sm text-muted-foreground">O mesmo passo de mídia é usado no cadastro e na edição. Mídias não alteradas são preservadas.</p>
            <PropertyMediaManager property={{ ...property, property_media: editableMedia }} onMediaChanged={setEditableMedia} />
            <PropertyMediaUpload
              property={{ ...property, property_media: editableMedia }}
              onUploaded={(media) => setEditableMedia((current) => [media, ...current])}
              isFirstMedia={!editableMedia.length}
            />
          </div>
        ) : null}
        {!isEdit ? <>
        <FilePicker
          label="Foto principal*"
          description="Capa do anúncio, card do imóvel, site e portais."
          accept="image/jpeg,image/png,image/webp"
          files={mainPhoto ? [mainPhoto] : []}
          onFilesChange={(files, form) => {
            const file = files[0] ?? null;
            setMainPhoto(file);
            refreshReadinessWithMainPhoto(form, file);
          }}
        />
        <FilePicker
          label="Fotos do imóvel"
          description="Galeria completa do imóvel. Aceita múltiplas imagens."
          accept="image/jpeg,image/png,image/webp"
          multiple
          files={galleryFiles}
          onFilesChange={setGalleryFiles}
        />
        <FilePicker
          label="Vídeo ou foto 360º"
          description="Envie uma imagem panorâmica ou vídeo 360 para preparar a experiência de tour."
          accept="image/jpeg,image/png,image/webp,video/mp4"
          multiple
          files={tourFiles}
          onFilesChange={setTourFiles}
        />
        <div className="rounded-md border border-dashed border-border bg-background p-3 text-sm text-muted-foreground md:col-span-2 xl:col-span-4">
          Os arquivos ficam selecionados durante o cadastro e são enviados automaticamente depois que o imóvel é salvo com um ID real.
        </div>
        </> : null}
      </FormSection>

      <FormSection step={10} activeStep={stepIndex} title="11. Liberações" description="Controle onde o imóvel poderá aparecer depois de aprovado.">
        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 md:col-span-2 xl:col-span-4">
          <strong>Portais e redes ainda não estão configurados para publicação automática.</strong>
          <p className="mt-1">ZAP, OLX, Viva Real, Facebook e Instagram serão liberados somente após credenciais, validação e readiness do anúncio. Nenhum canal será marcado como publicado por esta tela.</p>
          <a href="/app/integracoes" className="mt-2 inline-flex font-semibold underline">Ver integrações e requisitos</a>
        </div>
        <SelectField label="Será destaque no site?" name="site_featured" options={[["no", "Não"], ["yes", "Sim"]]} />
        <SelectField label="Imóvel liberado no site?" name="site_enabled" options={[["no", "Não"], ["yes", "Sim"]]} />
        <input type="hidden" name="site_banner" value="no" />
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground md:col-span-2">
          Banner indisponível neste template. A imagem principal do imóvel nunca substituirá o hero institucional.
        </div>
        {isEdit && property ? (
          <div className="md:col-span-2 xl:col-span-4">
            <PropertyPublicationSummary property={property} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={isPublishing || Boolean(property.published_at)} onClick={() => void handlePublishToggle(true)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-60">
                {isPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />} Publicar no site
              </button>
              <button type="button" disabled={isPublishing || !property.published_at} onClick={() => void handlePublishToggle(false)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold disabled:opacity-60">
                Despublicar
              </button>
              {property.published_at && siteSlug ? <a href={getPropertyDetailUrl(siteSlug, property)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold underline">Ver página pública</a> : null}
            </div>
            {publicationError ? <p className="mt-2 text-xs text-destructive">{publicationError}</p> : null}
            {publicationNotice ? <p className="mt-2 text-xs text-emerald-700">{publicationNotice}</p> : null}
          </div>
        ) : null}
      </FormSection>

      <FormSection step={11} activeStep={stepIndex} title="12. Revisão final" description="Confira os pontos mínimos antes de salvar como rascunho ou preparar publicação.">
        <PublicationChecklist items={formReadiness} onGoToStep={setStepIndex} />
      </FormSection>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            className="h-10 rounded-md border border-border px-4 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Voltar
          </button>
          <button
            type="button"
            disabled={stepIndex === propertyFormSteps.length - 1}
            onClick={(event) => {
              if (event.currentTarget.form) refreshReadiness(event.currentTarget.form);
              setStepIndex((current) => Math.min(propertyFormSteps.length - 1, current + 1));
            }}
            className="h-10 rounded-md border border-border px-4 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Próxima etapa
          </button>
        </div>
        {/* Item 12 do escopo: 3 ações explícitas, cada uma um botão submit
            com name="intent" — o navegador inclui o value do botão clicado
            no SubmitEvent.submitter (lido em handleSubmit), sem heurística. */}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name={!isEdit ? "intent" : undefined}
            value={!isEdit ? "draft" : undefined}
            onMouseDown={() => { pendingIntentRef.current = "draft"; }}
            disabled={isSaving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isEdit ? "Salvar alterações" : "Salvar rascunho"}
          </button>
          {!isEdit ? <button
            type="submit"
            name="intent"
            value="save"
            onMouseDown={() => { pendingIntentRef.current = "save"; }}
            disabled={isSaving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Salvar
          </button> : null}
          {!isEdit ? <button
            type="submit"
            name="intent"
            value="publish"
            onMouseDown={() => { pendingIntentRef.current = "publish"; }}
            disabled={isSaving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            Salvar e publicar
          </button>
          : null}
        </div>
      </div>
    </form>
  );
}

type ReadinessItem = {
  label: string;
  ready: boolean;
  detail: string;
  step?: number;
};

function FormSection({
  title,
  description,
  children,
  step,
  activeStep,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  step: number;
  activeStep: number;
}) {
  const isActive = step === activeStep;
  return (
    <section className={`mb-4 rounded-lg border border-border bg-card p-4 ${isActive ? "block" : "hidden"}`} aria-hidden={!isActive}>
      <div className="mb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4" />
          {title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function PublicationChecklist({ items, onGoToStep }: { items: ReadinessItem[]; onGoToStep?: (step: number) => void }) {
  const readyCount = items.filter((item) => item.ready).length;

  return (
    <div className="space-y-3 md:col-span-2 xl:col-span-4">
      <div className="rounded-md border border-border bg-background p-3">
        <p className="text-sm font-semibold">Checklist de publicação</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {readyCount} de {items.length} itens prontos. O imóvel pode ser salvo como rascunho, mas publicação exige todos os itens mínimos.
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-md border border-border bg-background p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                  item.ready ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"
                }`}
              >
                {item.ready ? "OK" : "Pendente"}
              </span>
            </div>
            {!item.ready && item.step !== undefined && onGoToStep ? (
              <button type="button" onClick={() => onGoToStep(item.step!)} className="mt-2 text-xs font-semibold text-primary underline">
                Corrigir nesta etapa
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  inputMode,
  maxLength,
  defaultValue,
  onBlur,
  onInput,
  format,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  defaultValue?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onInput?: React.FormEventHandler<HTMLInputElement>;
  format?: "phone" | "cep" | "money" | "decimal";
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        defaultValue={defaultValue}
        onBlur={onBlur}
        onInput={(event) => {
          if (format === "phone") event.currentTarget.value = formatPhone(event.currentTarget.value);
          if (format === "cep") event.currentTarget.value = formatCep(event.currentTarget.value);
          if (format === "money") event.currentTarget.value = formatMoneyTyping(event.currentTarget.value);
          if (format === "decimal") event.currentTarget.value = formatDecimalTyping(event.currentTarget.value);
          onInput?.(event);
        }}
        className={fieldClass}
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: Array<readonly [string, string]>;
  defaultValue?: string;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <select name={name} defaultValue={defaultValue} className={fieldClass}>
        {options.map(([value, optionLabel]) => (
          <option key={value} value={value}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextArea({ label, name, placeholder, defaultValue }: { label: string; name: string; placeholder?: string; defaultValue?: string }) {
  return (
    <label className="space-y-1 text-sm md:col-span-2 xl:col-span-4">
      <span className="font-medium">{label}</span>
      <textarea name={name} rows={4} placeholder={placeholder} defaultValue={defaultValue} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
    </label>
  );
}

function Checkbox({ name, value, label, defaultChecked }: { name: string; value: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="h-4 w-4" />
      {label}
    </label>
  );
}

function FilePicker({
  label,
  description,
  accept,
  multiple,
  files,
  onFilesChange,
}: {
  label: string;
  description: string;
  accept: string;
  multiple?: boolean;
  files: File[];
  onFilesChange: (files: File[], form: HTMLFormElement | null) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3 md:col-span-2">
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <label className="mt-3 inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-xs font-medium transition hover:bg-accent">
        <ImagePlus className="h-3.5 w-3.5" />
        Escolher arquivo{multiple ? "s" : ""}
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={(event) => onFilesChange(Array.from(event.target.files ?? []), event.currentTarget.form)}
        />
      </label>
      <div className="mt-3 space-y-1">
        {files.length ? (
          files.map((file) => (
            <p key={`${file.name}-${file.size}`} className="truncate rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground">
              {file.name}
            </p>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">Nenhum arquivo selecionado.</p>
        )}
      </div>
    </div>
  );
}

function FeatureGroup({ group, items, initialItems = [] }: { group: string; items: string[]; initialItems?: string[] }) {
  const [customItems, setCustomItems] = useState<string[]>(() => initialItems.filter((item) => !items.includes(item)));
  const [draft, setDraft] = useState("");
  const [allSelected, setAllSelected] = useState(false);
  const allItems = [...items, ...customItems];

  function addCustomItem() {
    const value = draft.trim();
    if (!value) return;
    setCustomItems((current) => (current.some((item) => item.toLowerCase() === value.toLowerCase()) ? current : [...current, value]));
    setDraft("");
  }

  return (
    <div className="rounded-md border border-border bg-background p-3 md:col-span-2 xl:col-span-4">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold capitalize">{group}</p>
        <button
          type="button"
          onClick={() => setAllSelected((current) => !current)}
          className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium transition hover:bg-accent"
        >
          {allSelected ? "Limpar seleção" : "Selecionar tudo"}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {allItems.map((item) => (
          <Checkbox
            key={`${item}-${allSelected ? "selected" : "manual"}`}
            name={`amenity_${group}`}
            value={item}
            label={item}
            defaultChecked={allSelected || initialItems.includes(item)}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          name={`amenity_${group}_custom_draft`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className={fieldClass}
          placeholder={`Adicionar ${group}`}
        />
        <button
          type="button"
          onClick={addCustomItem}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium transition hover:bg-accent"
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
      </div>
    </div>
  );
}

function PropertyCard({
  property,
  owners,
  siteSlug,
  appUsers,
  currentUser,
  onPropertyUpdated,
  onPropertyRemoved,
}: {
  property: PropertySummary;
  owners: PropertyOwner[];
  siteSlug: string | null;
  appUsers: AppUserSummary[];
  currentUser: CurrentAppUser | undefined;
  onPropertyUpdated: (property: Property) => void;
  onPropertyRemoved: (propertyId: string) => void;
}) {
  const location = [property.neighborhood, property.city, property.state].filter(Boolean).join(", ");
  const salePrice = formatCurrency(property.sale_price_cents);
  const rentPrice = formatCurrency(property.rent_price_cents);
  const coverMedia = getPropertyCoverMedia(property);
  const navigate = useNavigate();
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [detailProperty, setDetailProperty] = useState<Property | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const canCreateOwner = canManage(currentUser, "owners.manage");
  const ownerId = property.responsible_user?.id ?? null;
  const canManageSharing = canManageResourceSharing(currentUser, "properties.manage", ownerId);
  const ownershipBadge = getOwnershipBadge({
    currentUserId: currentUser?.id,
    ownerId,
    isAdministrative: isAdministrative(currentUser),
  });

  // full-page-imoveis (2026-09-11): só existe mais o modo "report" aqui —
  // "editar" agora navega para /app/imoveis/:id/editar (rota full-page
  // dedicada, ver app.imoveis.$propertyId.editar.tsx), que busca o imóvel
  // por id sozinha. Não faz mais sentido pré-carregar o imóvel aqui só para
  // jogar fora e buscar de novo na rota de destino.
  async function openProperty(mode: "report") {
    setIsActionLoading(true);
    setActionError(null);
    try {
      const response = await getProperty(property.id);
      setDetailProperty(response.property);
      if (mode === "report") setIsReportOpen(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível carregar o imóvel.");
    } finally {
      setIsActionLoading(false);
    }
  }

  async function handleStatus(status: Property["status"]) {
    setIsActionLoading(true);
    setActionError(null);
    try {
      const response = await updateProperty(property.id, { status });
      onPropertyUpdated(response.property);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível alterar o anúncio.");
    } finally {
      setIsActionLoading(false);
    }
  }

  async function handleArchive() {
    if (!window.confirm("Excluir este anúncio da lista? Ele será arquivado e deixará de aparecer como ativo.")) return;
    setIsActionLoading(true);
    setActionError(null);
    try {
      await archiveProperty(property.id);
      onPropertyRemoved(property.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível excluir o anúncio.");
    } finally {
      setIsActionLoading(false);
    }
  }

  // Diretriz Mestre do MVP, Seção 7: o backend só CALCULA o link — nunca
  // envia nada. O envio só acontece se o WhatsApp abrir no navegador do
  // usuário E o usuário confirmar dentro do próprio WhatsApp. Por isso o
  // texto do botão diz "enviar" mas o código nunca afirma que enviou —
  // só abre o link e registra a abertura para auditoria.
  async function handleWhatsAppShare() {
    setIsActionLoading(true);
    setActionError(null);
    try {
      const result = await getPropertyWhatsAppLink(property.id);
      if (!result.eligible) {
        setActionError(whatsAppIneligibleReasonLabel(result.reason));
        return;
      }
      window.open(result.waUrl, "_blank", "noopener,noreferrer");
      void markPropertyWhatsAppLinkOpened(property.id).catch(() => undefined);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Não foi possível preparar o link do WhatsApp.",
      );
    } finally {
      setIsActionLoading(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      {coverMedia ? (
        <img
          src={coverMedia.url}
          alt={coverMedia.caption ?? property.title}
          className="h-44 w-full object-cover"
        />
      ) : (
        <div className="flex h-44 w-full items-center justify-center bg-muted text-xs text-muted-foreground">
          Foto principal não cadastrada
        </div>
      )}
      <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">{property.code || property.property_type}</p>
          <h2 className="mt-1 line-clamp-2 text-sm font-semibold">{property.title}</h2>
          {ownershipBadge ? <div className="mt-1"><ResourceOwnershipBadge badge={ownershipBadge} /></div> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            {statusLabels[property.status]}
          </span>
          {property.published_at ? (
            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700">
              Publicado no site
            </span>
          ) : null}
        </div>
      </div>
      {location ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span className="truncate">{location}</span>
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs text-muted-foreground">
        <MiniStat value={property.bedrooms} label="quartos" />
        <MiniStat value={property.bathrooms} label="banhos" />
        <MiniStat value={property.parking_spaces} label="vagas" />
        <MiniStat value={property.private_area ? `${property.private_area}m²` : null} label="área" />
      </div>
      <div className="mt-4 space-y-1 text-sm">
        {salePrice ? <p className="font-semibold">Venda: {salePrice}</p> : null}
        {rentPrice ? <p className="font-semibold">Locação: {rentPrice}/mês</p> : null}
        {property.property_owners?.name ? (
          <p className="text-xs text-muted-foreground">Proprietário: {property.property_owners.name}</p>
        ) : null}
        {property.responsible_user?.name ? (
          <p className="text-xs text-muted-foreground">Corretor responsável: {property.responsible_user.name}</p>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <ActionButton icon={Eye} label="Visualizar" onClick={() => void openProperty("report")} disabled={isActionLoading} />
        <ActionButton
          icon={Pencil}
          label="Editar"
          onClick={() => void navigate({ to: "/app/imoveis/$propertyId/editar", params: { propertyId: property.id } })}
          disabled={isActionLoading}
        />
        <ActionButton
          icon={FileText}
          label={property.status === "available" ? "Desativar" : "Ativar"}
          onClick={() => void handleStatus(property.status === "available" ? "inactive" : "available")}
          disabled={isActionLoading}
        />
        <ActionButton icon={Trash2} label="Excluir" onClick={() => void handleArchive()} disabled={isActionLoading} danger />
        <ActionButton
          icon={Users}
          label={canManageSharing ? "Compartilhar imóvel" : "Pessoas com acesso"}
          onClick={() => setIsShareOpen(true)}
        />
        {property.published_at && siteSlug ? (
          <ActionButton
            icon={Globe}
            label="Ver página pública"
            onClick={() => window.open(getPropertyDetailUrl(siteSlug, property), "_blank", "noopener,noreferrer")}
          />
        ) : null}
        {property.published_at ? (
          <ActionButton
            icon={MessageCircle}
            label="Enviar ao proprietário pelo WhatsApp"
            onClick={() => void handleWhatsAppShare()}
            disabled={isActionLoading}
          />
        ) : null}
      </div>
      {actionError ? <p className="mt-2 text-xs text-destructive">{actionError}</p> : null}
      </div>
      {isReportOpen && detailProperty ? (
        <PropertyReportModal
          property={detailProperty}
          onClose={() => setIsReportOpen(false)}
        />
      ) : null}
      {isShareOpen ? (
        <ResourceShareDialog
          resourceLabel="imóvel"
          resourceTitle={property.title}
          ownerName={property.responsible_user?.name ?? null}
          canManage={canManageSharing}
          currentUserId={currentUser?.id}
          onClose={() => setIsShareOpen(false)}
          listEligibleUsers={listPropertyEligibleUsers}
          listAccess={() => listPropertyAccess(property.id)}
          grant={(userId, permissions) => grantPropertyAccess(property.id, userId, permissions)}
          replace={(userId, permissions) => replacePropertyAccess(property.id, userId, permissions)}
          revoke={(accessId) => revokePropertyAccess(property.id, accessId)}
        />
      ) : null}
    </article>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: typeof Eye;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
        danger ? "border-destructive/30 text-destructive hover:bg-destructive/10" : "border-border hover:bg-accent"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function getPropertyCoverMedia(property: Pick<PropertySummary, "property_media">) {
  const media = property.property_media ?? [];
  return (
    media.find((item) => item.is_cover && item.media_type !== "video") ??
    media.find((item) => item.media_type === "photo") ??
    media.find((item) => item.media_type === "tour") ??
    null
  );
}

function PropertyReportModal({
  property,
  onClose,
}: {
  property: Property;
  onClose: () => void;
}) {
  const report = buildPropertyReport(property);

  function downloadReport() {
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${property.code || property.id}-relatorio-imovel.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function shareReport() {
    if (navigator.share) {
      await navigator.share({ title: property.title, text: report });
      return;
    }
    await navigator.clipboard.writeText(report);
    window.alert("Relatório copiado para a área de transferência.");
  }

  function generatePdf() {
    const popup = window.open("", "_blank", "width=960,height=720");
    if (!popup) {
      window.alert("Permita pop-ups para gerar o PDF do imóvel.");
      return;
    }

    popup.document.write(buildPropertyPdfHtml(property));
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 500);
  }

  // AJUSTE-FUNCIONAL-03 (2026-09-11): o dossiê renderizava um único bloco de
  // texto plano (`report`, de buildPropertyReport) dentro de um <pre> —
  // exatamente o "parece que colei num bloco de notas" reportado pelo
  // usuário. `report`/buildPropertyReport continuam existindo só para os
  // botões Baixar/Compartilhar/PDF (onde texto plano faz sentido); a tela em
  // si agora é montada campo a campo, 13 seções organizadas, somente
  // leitura (nenhum input/select/upload/delete/reorder aqui — toda edição
  // acontece exclusivamente pelo wizard via "Editar anúncio").
  const capture = (property.capture_json ?? {}) as Record<string, unknown>;
  const primary = (property.primary_details_json ?? {}) as Record<string, unknown>;
  const measurements = (property.measurements_json ?? {}) as Record<string, unknown>;
  const commercial = (property.commercial_terms_json ?? {}) as Record<string, unknown>;
  const commercialRule = commercial.rule as Record<string, unknown> | undefined;
  const publication = (property.publication_settings_json ?? {}) as Record<string, unknown>;
  const location = [property.street, property.number, property.complement, property.neighborhood, property.city, property.state]
    .filter(Boolean)
    .join(", ");
  const amenityEntries = Object.entries(property.amenity_groups_json ?? {}).filter(
    ([, values]) => Array.isArray(values) && values.length,
  ) as Array<[string, string[]]>;
  const complementaryEntries = [
    ...Object.entries(capture),
    ...Object.entries(primary),
    ...Object.entries(measurements),
  ].filter(([, value]) => value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0));
  // Mídias: só o que já é seguro para o usuário final ver na página pública
  // (url http(s) real, media_type, caption) — nunca storage_path/publicId/
  // provider/UUID técnico, que nunca chegam a este componente porque a API
  // de imóveis já não os devolve.
  const photos = (property.property_media ?? []).filter((media) => media.media_type === "photo");
  const tours = (property.property_media ?? []).filter((media) => media.media_type === "tour");
  const videosMedia = (property.property_media ?? []).filter((media) => media.media_type === "video");
  const youtubeLinks = (property.videos_json ?? []).map((item) => String(item.url ?? "")).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-lg border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Visualização completa do imóvel (somente leitura)</p>
            <h2 className="text-lg font-semibold">{property.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1 text-sm">
            Fechar
          </button>
        </div>

        <div className="space-y-4">
          <DossierSection title="1. Identificação">
            <DossierField label="Código" value={property.code} />
            <DossierField label="Título" value={property.title} />
            <DossierField label="Tipo" value={propertyTypeOptions.find(([value]) => value === property.property_type)?.[1] ?? property.property_type} />
            <DossierField label="Finalidade" value={operationOptions.find(([value]) => value === property.operation)?.[1] ?? property.operation} />
          </DossierSection>

          <DossierSection title="2. Situação e publicação">
            <DossierField label="Status" value={statusLabels[property.status]} />
            <DossierField label="Publicado" value={property.published_at ? `Sim, desde ${new Date(property.published_at).toLocaleDateString("pt-BR")}` : "Não"} />
            <DossierField label="Destaque no site" value={publication.site_featured ? "Sim" : "Não"} />
          </DossierSection>

          <DossierSection title="3. Dados comerciais">
            <DossierField label="Regra comercial" value={formatCommercialRule(commercialRule)} />
            <DossierField label="Aceita permuta" value={primary.accepts_exchange === "yes" ? "Sim" : "Não"} />
            <DossierField label="Aceita financiamento" value={primary.accepts_financing === "yes" ? "Sim" : "Não"} />
          </DossierSection>

          <DossierSection title="4. Endereço completo">
            <DossierField label="Endereço" value={location} span />
            <DossierField label="CEP" value={property.zip_code} />
            <DossierField label="Condomínio" value={property.condominium_name} />
            <DossierField label="Vias próximas" value={property.nearby_highways?.length ? property.nearby_highways.join(", ") : null} span />
          </DossierSection>

          <DossierSection title="5. Valores">
            <DossierField label="Venda" value={formatCurrency(property.sale_price_cents)} />
            <DossierField label="Locação" value={formatCurrency(property.rent_price_cents)} />
            <DossierField label="Condomínio" value={formatCurrency(property.condominium_fee_cents)} />
            <DossierField label="IPTU" value={formatCurrency(property.iptu_cents)} />
            <DossierField label="Temporada" value={formatCurrency(Number(commercial.season_price_cents ?? 0) || null)} />
          </DossierSection>

          <DossierSection title="6. Características">
            <DossierField label="Dormitórios" value={property.bedrooms} />
            <DossierField label="Suítes" value={property.suites} />
            <DossierField label="Banheiros" value={property.bathrooms} />
            <DossierField label="Vagas" value={property.parking_spaces} />
            <DossierField label="Área útil" value={property.private_area ? `${property.private_area} m²` : null} />
            <DossierField label="Área total" value={property.total_area ? `${property.total_area} m²` : null} />
          </DossierSection>

          <DossierSection title="7. Amenidades">
            {amenityEntries.length ? (
              <div className="md:col-span-2 xl:col-span-3 space-y-2">
                {amenityEntries.map(([group, values]) => (
                  <p key={group} className="text-sm"><span className="font-medium">{humanizeKey(group)}:</span> {values.join(", ")}</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground md:col-span-2 xl:col-span-3">Nenhuma amenidade marcada.</p>
            )}
          </DossierSection>

          <DossierSection title="8. Descrição">
            <p className="whitespace-pre-wrap text-sm leading-relaxed md:col-span-2 xl:col-span-3">{property.description || "Sem descrição cadastrada."}</p>
          </DossierSection>

          <DossierSection title="9. Proprietário">
            <DossierField label="Nome" value={property.property_owners?.name} />
            <DossierField label="Telefone" value={property.property_owners?.phone} />
            <DossierField label="E-mail" value={property.property_owners?.email} />
          </DossierSection>

          <DossierSection title="10. Corretor/responsável">
            <DossierField label="Responsável" value={property.responsible_user?.name ?? property.responsible_user_name} />
          </DossierSection>

          <DossierSection title="11. Informações complementares">
            {complementaryEntries.length ? (
              complementaryEntries.map(([key, value]) => (
                <DossierField key={key} label={humanizeKey(key)} value={Array.isArray(value) ? value.join(", ") : String(value)} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground md:col-span-2 xl:col-span-3">Nenhuma informação complementar preenchida.</p>
            )}
          </DossierSection>

          <DossierSection title="12. Liberações">
            <DossierField label="Liberado no site" value={publication.site_enabled ? "Sim" : "Não"} />
            <p className="text-xs text-muted-foreground md:col-span-2 xl:col-span-3">
              ZAP, OLX, Viva Real, Facebook e Instagram ainda não têm publicação automática configurada nesta empresa.
            </p>
          </DossierSection>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">13. Mídias</h3>
            {photos.length || tours.length || videosMedia.length || youtubeLinks.length ? (
              <div className="space-y-4">
                {photos.length ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Fotos ({photos.length})</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {photos.map((media) => (
                        <img key={media.id} src={media.url} alt={media.caption || property.title} className="h-44 w-full rounded-md object-cover" />
                      ))}
                    </div>
                  </div>
                ) : null}
                {tours.length ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Tour 360 / panorama ({tours.length})</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {tours.map((media) => (
                        <img key={media.id} src={media.url} alt={media.caption || "Tour 360"} className="h-44 w-full rounded-md object-cover" />
                      ))}
                    </div>
                  </div>
                ) : null}
                {videosMedia.length ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Vídeos ({videosMedia.length})</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {videosMedia.map((media) => (
                        <video key={media.id} src={media.url} controls className="h-44 w-full rounded-md bg-black object-cover" />
                      ))}
                    </div>
                  </div>
                ) : null}
                {youtubeLinks.length ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Links externos (YouTube/Vimeo/tour)</p>
                    <div className="space-y-2">
                      {youtubeLinks.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-primary underline">{url}</a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-muted p-4 text-sm text-muted-foreground">
                Nenhuma imagem ou vídeo vinculado a este imóvel ainda.
              </div>
            )}
          </section>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={generatePdf} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-accent">
            <FileText className="h-4 w-4" />
            Gerar PDF
          </button>
          <button type="button" onClick={downloadReport} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-accent">
            <Download className="h-4 w-4" />
            Baixar relatório
          </button>
          <button type="button" onClick={() => void shareReport()} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Share2 className="h-4 w-4" />
            Compartilhar
          </button>
        </div>
      </div>
    </div>
  );
}

function DossierSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function DossierField({ label, value, span }: { label: string; value: string | number | null | undefined; span?: boolean }) {
  return (
    <div className={span ? "sm:col-span-2 xl:col-span-3" : undefined}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value === null || value === undefined || value === "" ? "Não informado" : value}</p>
    </div>
  );
}

function populatePropertyWizardForm(form: HTMLFormElement, property: Property) {
  const capture = property.capture_json ?? {};
  const primary = property.primary_details_json ?? {};
  const measurements = property.measurements_json ?? {};
  const commercial = property.commercial_terms_json ?? {};
  const rule = (commercial.rule ?? {}) as Record<string, unknown>;
  const publication = property.publication_settings_json ?? {};
  const values: Record<string, string> = {
    code: property.code ?? "",
    title: property.title,
    property_zip_code: property.zip_code ?? "",
    property_street: property.street ?? "",
    property_number: property.number ?? "",
    property_complement: property.complement ?? "",
    property_neighborhood: property.neighborhood ?? "",
    property_city: property.city ?? "",
    property_state: property.state ?? "",
    property_country: property.country ?? "Brasil",
    latitude: property.latitude == null ? "" : String(property.latitude).replace(".", ","),
    longitude: property.longitude == null ? "" : String(property.longitude).replace(".", ","),
    condominium_name: property.condominium_name ?? "",
    nearby_highways: property.nearby_highways.join("\n"),
    captor_name: String(capture.captor_name ?? ""),
    key_location: String(capture.key_location ?? ""),
    doorman_name: String(capture.doorman_name ?? ""),
    doorman_phone: String(capture.doorman_phone ?? ""),
    sign_installed_at: String(capture.sign_installed_at ?? ""),
    sign_removed_at: String(capture.sign_removed_at ?? ""),
    exclusive_until: String(capture.exclusive_until ?? ""),
    multi_property_fraction: String(primary.multi_property_fraction ?? ""),
    bedrooms: property.bedrooms == null ? "" : String(property.bedrooms),
    suites: property.suites == null ? "" : String(property.suites),
    living_rooms: String(primary.living_rooms ?? ""),
    bathrooms: property.bathrooms == null ? "" : String(property.bathrooms),
    parking_spaces: property.parking_spaces == null ? "" : String(property.parking_spaces),
    uncovered_parking_spaces: String(primary.uncovered_parking_spaces ?? ""),
    front_customer_parking: String(primary.front_customer_parking ?? ""),
    additional_parking: String(primary.additional_parking ?? ""),
    total_docks: String(primary.total_docks ?? ""),
    covered_docks: String(primary.covered_docks ?? ""),
    elevated_docks: String(primary.elevated_docks ?? ""),
    level_docks: String(primary.level_docks ?? ""),
    ramps: String(primary.ramps ?? ""),
    floor_resistance: String(primary.floor_resistance ?? ""),
    topography: String(primary.topography ?? ""),
    ceiling_height: String(measurements.ceiling_height ?? ""),
    total_area: property.total_area == null ? "" : String(property.total_area).replace(".", ","),
    private_area: property.private_area == null ? "" : String(property.private_area).replace(".", ","),
    sale_price: formatMoneyInput(Number(rule.original_sale_price_cents ?? property.sale_price_cents ?? 0) || null),
    rent_price: formatMoneyInput(Number(rule.original_rent_price_cents ?? property.rent_price_cents ?? 0) || null),
    season_price: formatMoneyInput(Number(commercial.season_price_cents ?? 0) || null),
    condominium_fee: formatMoneyInput(property.condominium_fee_cents),
    iptu: formatMoneyInput(property.iptu_cents),
    condominium_payment_notes: String(commercial.condominium_payment_notes ?? ""),
    rent_notes: String(commercial.rent_notes ?? ""),
    season_notes: String(commercial.season_notes ?? ""),
    commercial_rule_value: String(rule.value ?? ""),
    videos: property.videos_json.map((item) => String(item.url ?? "")).filter(Boolean).join("\n"),
    site_enabled: publication.site_enabled ? "yes" : "no",
    site_featured: publication.site_featured ? "yes" : "no",
    status: property.status,
    property_type: property.property_type,
    operation: property.operation,
    has_sign: capture.has_sign ? "yes" : "no",
    exclusive: capture.exclusive ? "yes" : "no",
    accepts_exchange: String(primary.accepts_exchange ?? "no"),
    accepts_financing: String(primary.accepts_financing ?? "no"),
    iptu_period: String(commercial.iptu_period ?? "monthly"),
    commercial_rule_type: String(rule.type ?? "none"),
    commercial_rule_mode: String(rule.mode ?? "add"),
  };
  for (const [name, value] of Object.entries(values)) {
    const element = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (element && element.type !== "checkbox") element.value = value;
  }
  for (const checkbox of Array.from(form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))) checkbox.checked = false;
  const setChecked = (name: string, selected: string[]) => {
    const selectedSet = new Set(selected);
    for (const checkbox of Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`))) checkbox.checked = selectedSet.has(checkbox.value);
  };
  setChecked("capture_flags", Array.isArray(capture.flags) ? capture.flags.map(String) : []);
  for (const [group, selected] of Object.entries(property.amenity_groups_json ?? {})) setChecked(`amenity_${group}`, Array.isArray(selected) ? selected.map(String) : []);
}

// B1 (Fase B): estado visual da publicação — quatro estados exigidos pelo
// checkpoint (rascunho / pronto para publicar / publicado / indisponível-não
// publicável). Apenas exibe o que o backend já decidiu (published_at,
// status, checklist local só orienta o usuário) — não é uma segunda fonte
// de verdade sobre publicabilidade.
function getPropertyPublicationState(property: Property, allReady: boolean) {
  if (property.published_at) {
    return { key: "published" as const, label: "Publicado no site e pronto para acesso público.", className: "bg-emerald-500/10 text-emerald-700" };
  }
  if (!["available", "reserved"].includes(property.status)) {
    return {
      key: "unavailable" as const,
      label: `Indisponível para publicação: status atual é "${statusLabels[property.status]}". Só imóveis disponíveis ou reservados podem ser publicados.`,
      className: "bg-destructive/10 text-destructive",
    };
  }
  if (allReady) {
    return { key: "ready" as const, label: "Pronto para publicar: todos os itens mínimos foram preenchidos.", className: "bg-amber-500/10 text-amber-800" };
  }
  return { key: "draft" as const, label: "Rascunho: ainda há pendências antes de publicar.", className: "bg-muted text-muted-foreground" };
}

// Diretriz Mestre do MVP, Seção 7: motivos pelos quais o backend decidiu que
// o deeplink de WhatsApp NÃO pode ser oferecido agora (ver
// resolveWhatsAppOwnerNotification em property-events.ts, backend).
function whatsAppIneligibleReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    PROPERTY_NOT_FOUND: "Imóvel não encontrado.",
    COMPANY_NOT_FOUND: "Empresa não encontrada.",
    SITE_NOT_PUBLISHED: "O site da imobiliária ainda não está publicado.",
    PUBLIC_URL_NOT_READY: "A página pública deste imóvel ainda não está disponível para acesso.",
    OWNER_WITHOUT_PHONE: "O proprietário não tem telefone/WhatsApp cadastrado.",
    ERROR: "Não foi possível verificar se o link do WhatsApp pode ser oferecido agora.",
  };
  return labels[reason] ?? "Não foi possível preparar o link do WhatsApp para este imóvel.";
}

function PropertyPublicationSummary({ property }: { property: Property }) {
  const items = buildPropertyPublicationChecklist(property);
  const readyCount = items.filter((item) => item.ready).length;
  const state = getPropertyPublicationState(property, readyCount === items.length);

  return (
    <div className="mt-4 rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Publicação</p>
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          {readyCount}/{items.length}
        </span>
      </div>
      <div className="mt-2 grid gap-1.5 text-xs text-muted-foreground">
        {items.map((item) => (
          <p key={item.label} className={item.ready ? "text-emerald-700" : "text-amber-700"}>
            {item.ready ? "OK" : "Pendente"} - {item.label}
          </p>
        ))}
      </div>
      <p className={`mt-3 rounded-md p-2 text-xs font-medium ${state.className}`}>{state.label}</p>
    </div>
  );
}

function PropertyMediaManager({
  property,
  onMediaChanged,
}: {
  property: Property;
  onMediaChanged: (media: NonNullable<Property["property_media"]>) => void;
}) {
  const media = [...(property.property_media ?? [])].sort((a, b) => a.position - b.position);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!media.length) return null;

  async function removeMedia(mediaId: string) {
    setError(null);
    try {
      // Fase 3D: usa a lista devolvida pelo backend (já com a nova capa
      // auto-promovida, se a mídia excluída era a capa) em vez de só
      // filtrar em memória — o filtro local antigo não sabia recalcular
      // is_cover, deixando o imóvel aparentando "sem capa" na tela até um
      // reload manual mesmo quando o backend já tinha promovido outra foto.
      const result = await deletePropertyMedia(property.id, mediaId);
      onMediaChanged(result.media ?? media.filter((item) => item.id !== mediaId).map((item, index) => ({ ...item, position: index })));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir a mídia.");
    }
  }

  async function reorderMedia(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const current = [...media];
    const from = current.findIndex((item) => item.id === draggedId);
    const to = current.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;

    const [moved] = current.splice(from, 1);
    current.splice(to, 0, moved);
    const ordered = current.map((item, index) => ({ ...item, position: index }));
    onMediaChanged(ordered);
    setDraggedId(null);

    try {
      const response = await reorderPropertyMedia(property.id, ordered.map((item) => ({ id: item.id, position: item.position })));
      onMediaChanged(response.media);
    } catch (reorderError) {
      setError(reorderError instanceof Error ? reorderError.message : "Não foi possível reordenar a mídia.");
      onMediaChanged(media);
    }
  }

  async function setCover(mediaId: string) {
    setError(null);
    try {
      const response = await setPropertyMediaCover(property.id, mediaId);
      onMediaChanged(response.media);
    } catch (coverError) {
      setError(coverError instanceof Error ? coverError.message : "Não foi possível definir a capa.");
    }
  }

  return (
    <div className="mt-4 rounded-md border border-border bg-background p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">Mídias do imóvel</p>
      <div className="mt-3 grid gap-2">
        {media.map((item) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => setDraggedId(item.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => void reorderMedia(item.id)}
            className="flex items-center gap-3 rounded-md border border-border bg-card p-2"
          >
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
            {item.media_type === "video" ? (
              <video src={item.url} className="h-14 w-16 rounded object-cover" muted />
            ) : (
              <img src={item.url} alt={item.caption ?? "Mídia do imóvel"} className="h-14 w-16 rounded object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{item.media_type === "tour" ? "Tour 360" : item.media_type === "video" ? "Vídeo" : "Foto"}</p>
              <p className="text-xs text-muted-foreground">{item.is_cover ? "Capa atual" : "Arraste para mudar a ordem"}</p>
            </div>
            {item.media_type === "photo" && !item.is_cover ? (
              <button type="button" onClick={() => void setCover(item.id)} className="h-8 rounded-md border border-border px-2 text-xs font-medium hover:bg-accent">
                Definir capa
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void removeMedia(item.id)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10"
              aria-label="Excluir mídia"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function PropertyMediaUpload({
  property,
  onUploaded,
  isFirstMedia,
}: {
  property: Property;
  onUploaded: (media: NonNullable<Property["property_media"]>[number]) => void;
  isFirstMedia: boolean;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<PropertyMedia["media_type"]>("photo");

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const content = await readFileAsDataUrl(file);
      const response = await uploadPropertyMedia(property.id, {
        file_name: file.name,
        mime_type: file.type,
        size_bytes: dataUrlByteLength(content),
        content_base64: content,
        media_type: mediaType,
        is_cover: isFirstMedia && mediaType === "photo",
      });
      onUploaded(response.media);
      event.target.value = "";
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Não foi possível enviar o arquivo.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <label className="mb-2 block text-xs font-medium text-muted-foreground">
        Tipo de mídia
        <select value={mediaType} onChange={(event) => setMediaType(event.target.value as PropertyMedia["media_type"])} className={`${fieldClass} mt-1`}>
          <option value="photo">Foto</option>
          <option value="tour">Panorama / tour 360</option>
          <option value="video">Vídeo MP4</option>
        </select>
      </label>
      <label className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-border text-xs font-medium transition hover:bg-accent">
        {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
        {isUploading ? "Enviando..." : "Enviar foto/vídeo"}
        <input type="file" accept={mediaType === "video" ? "video/mp4" : "image/jpeg,image/png,image/webp"} className="sr-only" disabled={isUploading} onChange={handleFileChange} />
      </label>
      <p className="mt-1 text-xs text-muted-foreground">Vídeos: limite prático de ~10MB por arquivo enviado. Para vídeos maiores, use o campo de link externo na etapa 8 do cadastro.</p>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

async function uploadSelectedPropertyMedia(
  propertyId: string,
  files: {
    mainPhoto: File | null;
    galleryFiles: File[];
    videoFiles: File[];
    tourFiles: File[];
  },
) {
  const uploadJobs: Array<{
    file: File;
    media_type: "photo" | "video" | "tour";
    is_cover?: boolean;
    position: number;
  }> = [];

  if (files.mainPhoto) {
    uploadJobs.push({ file: files.mainPhoto, media_type: "photo", is_cover: true, position: 0 });
  }

  files.galleryFiles.forEach((file, index) => {
    uploadJobs.push({ file, media_type: "photo", position: index + 1 });
  });

  files.videoFiles.forEach((file, index) => {
    uploadJobs.push({ file, media_type: "video", position: index });
  });

  files.tourFiles.forEach((file, index) => {
    uploadJobs.push({ file, media_type: "tour", position: index });
  });

  const uploaded: NonNullable<Property["property_media"]> = [];
  for (const job of uploadJobs) {
    const content = await readFileAsDataUrl(job.file);
    const response = await uploadPropertyMedia(propertyId, {
      file_name: job.file.name,
      mime_type: job.file.type,
      size_bytes: dataUrlByteLength(content),
      content_base64: content,
      media_type: job.media_type,
      position: job.position,
      is_cover: job.is_cover,
    });
    uploaded.push(response.media);
  }

  return uploaded;
}

function MiniStat({ value, label }: { value: string | number | null; label: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <BedDouble className="mx-auto mb-1 h-3.5 w-3.5 text-muted-foreground" />
      <p className="font-semibold text-foreground">{value ?? "-"}</p>
      <p>{label}</p>
    </div>
  );
}

function buildFormPublicationChecklist(form: FormData, description: string, selectedOwnerId: string, hasMainPhoto = false): ReadinessItem[] {
  const operation = text(form, "operation");
  const hasOwner = Boolean(selectedOwnerId || text(form, "owner_name"));
  const hasLocation = Boolean(text(form, "property_zip_code") && text(form, "property_city") && text(form, "property_state"));
  const hasValue =
    (operation === "sale" && Boolean(text(form, "sale_price"))) ||
    (operation === "rent" && Boolean(text(form, "rent_price"))) ||
    (operation === "season" && Boolean(text(form, "season_price"))) ||
    (operation === "both" && (Boolean(text(form, "sale_price")) || Boolean(text(form, "rent_price"))));
  const hasDescription = Boolean((description || text(form, "description")).trim());

  return [
    {
      label: "Proprietário vinculado",
      step: 0,
      ready: hasOwner,
      detail: hasOwner ? "O imóvel será ligado ao cadastro do proprietário." : "Selecione ou cadastre um proprietário.",
    },
    {
      label: "Código do imóvel",
      ready: true,
      detail: text(form, "code") ? "Código manual informado." : "O sistema gerará uma sequência automática por empresa.",
    },
    {
      label: "Tipo e transação",
      step: 3,
      ready: Boolean(text(form, "property_type") && operation),
      detail: "Define filtros, portais, CRM, contratos e descrição.",
    },
    {
      label: "Localização mínima",
      step: 1,
      ready: hasLocation,
      detail: hasLocation ? "CEP, cidade e UF informados." : "Informe CEP, cidade e UF para publicação.",
    },
    {
      label: "Valor conforme transação",
      step: 5,
      ready: hasValue,
      detail: hasValue ? "Valor principal preenchido." : "Informe venda, locação ou temporada conforme a transação.",
    },
    {
      label: "Descrição",
      step: 8,
      ready: hasDescription,
      detail: hasDescription ? "Texto pronto para ficha e portais." : "Gere por modelo local ou escreva a descrição.",
    },
    {
      label: "Foto principal",
      step: 9,
      ready: hasMainPhoto,
      detail: hasMainPhoto ? "Foto principal selecionada para upload." : "Selecione a foto principal na etapa Imagens.",
    },
    {
      label: "Status disponível",
      step: 3,
      ready: text(form, "status") === "available",
      detail: "Para publicar, o imóvel precisa estar disponível.",
    },
  ];
}

function buildPropertyPublicationChecklist(property: Property): ReadinessItem[] {
  const hasValue =
    (property.operation === "sale" && Boolean(property.sale_price_cents)) ||
    (property.operation === "rent" && Boolean(property.rent_price_cents)) ||
    (property.operation === "season" && Boolean(property.commercial_terms_json?.season_price_cents)) ||
    (property.operation === "both" && (Boolean(property.sale_price_cents) || Boolean(property.rent_price_cents)));
  const hasLocation = Boolean(property.zip_code && property.city && property.state);
  const hasCover = Boolean(property.property_media?.some((media) => media.is_cover) ?? property.property_media?.length);

  return [
    { label: "Proprietário", ready: Boolean(property.owner_id), detail: "Proprietário vinculado." },
    { label: "Código", ready: Boolean(property.code), detail: "Código interno definido." },
    { label: "Localização", ready: hasLocation, detail: "Endereço mínimo para publicação." },
    { label: "Valor", ready: hasValue, detail: "Preço de venda ou locação preenchido." },
    { label: "Descrição", ready: Boolean(property.description), detail: "Texto comercial preenchido." },
    { label: "Foto principal", ready: hasCover, detail: "Capa do anúncio enviada." },
    { label: "Disponível", ready: property.status === "available", detail: "Status liberado para divulgação." },
  ];
}

function buildPropertyReport(property: Property) {
  const location = [
    property.street,
    property.number,
    property.complement,
    property.neighborhood,
    property.city,
    property.state,
    property.zip_code,
  ]
    .filter(Boolean)
    .join(", ");
  const amenities = Object.entries(property.amenity_groups_json ?? {})
    .filter(([, values]) => Array.isArray(values) && values.length)
    .map(([group, values]) => `${group}: ${values.join(", ")}`)
    .join("\n");
  const commercialRule = property.commercial_terms_json?.rule as Record<string, unknown> | undefined;
  const capture = formatRecordForReport(property.capture_json);
  const primary = formatRecordForReport(property.primary_details_json);
  const measurements = formatRecordForReport(property.measurements_json);
  const publication = formatRecordForReport(property.publication_settings_json);
  const videos = property.videos_json?.length
    ? property.videos_json.map((item) => String(item.url ?? JSON.stringify(item))).join("\n")
    : "Nenhum link de vídeo cadastrado.";

  return [
    "RELATÓRIO DO IMÓVEL",
    "",
    `Código: ${property.code || "Sem código"}`,
    `Título: ${property.title}`,
    `Status: ${statusLabels[property.status]}`,
    `Tipo: ${property.property_type}`,
    `Transação: ${property.operation}`,
    `Proprietário: ${property.property_owners?.name || "Não vinculado"}`,
    `Contato do proprietário: ${property.property_owners?.email || property.property_owners?.phone || "Não informado"}`,
    "",
    "LOCALIZAÇÃO",
    location || "Não informada",
    "",
    "VALORES",
    `Venda: ${formatCurrency(property.sale_price_cents) || "Não informado"}`,
    `Locação: ${formatCurrency(property.rent_price_cents) || "Não informado"}`,
    `Condomínio: ${formatCurrency(property.condominium_fee_cents) || "Não informado"}`,
    `IPTU: ${formatCurrency(property.iptu_cents) || "Não informado"}`,
    `Temporada: ${formatCurrency(Number(property.commercial_terms_json?.season_price_cents ?? 0) || null) || "Não informado"}`,
    `Regra comercial: ${formatCommercialRule(commercialRule)}`,
    "",
    "CAPTAÇÃO",
    capture || "Não informada.",
    "",
    "CARACTERÍSTICAS",
    `Dormitórios: ${property.bedrooms ?? "Não informado"}`,
    `Suítes: ${property.suites ?? "Não informado"}`,
    `Banheiros: ${property.bathrooms ?? "Não informado"}`,
    `Vagas: ${property.parking_spaces ?? "Não informado"}`,
    `Área útil: ${property.private_area ?? "Não informado"}`,
    `Área total: ${property.total_area ?? "Não informado"}`,
    "",
    "DADOS PRIMÁRIOS",
    primary || "Não informado.",
    "",
    "METRAGENS",
    measurements || "Não informado.",
    "",
    "DETALHES ADICIONAIS",
    amenities || "Nenhum detalhe adicional marcado.",
    "",
    "VÍDEOS E TOUR",
    videos,
    "",
    "PUBLICAÇÃO E INTEGRAÇÕES",
    publication || "Não configurada.",
    "",
    "DESCRIÇÃO",
    property.description || "Sem descrição cadastrada.",
    "",
    "MÍDIAS",
    property.property_media?.length
      ? property.property_media.map((media, index) => `${index + 1}. ${media.media_type}${media.is_cover ? " (capa)" : ""}${media.caption ? ` - ${media.caption}` : ""}`).join("\n")
      : "Nenhum arquivo vinculado.",
  ].join("\n");
}

function formatRecordForReport(record: Record<string, unknown> | null | undefined) {
  if (!record) return "";
  return Object.entries(record)
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0))
    .map(([key, value]) => `${humanizeKey(key)}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join("\n");
}

function formatCommercialRule(rule?: Record<string, unknown>) {
  if (!rule || rule.type === "none") return "Nenhuma regra aplicada.";
  const type = rule.type === "percent" ? `${rule.value}%` : formatCurrency(Math.round(Number(rule.value ?? 0) * 100));
  const mode = rule.mode === "subtract" ? "descontar" : "adicionar";
  const saleAdjustment = formatCurrency(Number(rule.sale_adjustment_cents ?? 0));
  const rentAdjustment = formatCurrency(Number(rule.rent_adjustment_cents ?? 0));
  return `${mode} ${type || "valor informado"} | ajuste venda: ${saleAdjustment || "R$ 0,00"} | ajuste locação: ${rentAdjustment || "R$ 0,00"}`;
}

function humanizeKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseStringArrayRecord(value: string, fallback: Record<string, string[]>) {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, item]) => Array.isArray(item) && item.every((entry) => typeof entry === "string")),
    ) as Record<string, string[]>;
  } catch {
    return fallback;
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPropertyPdfHtml(property: Property) {
  const reportHtml = buildPropertyReport(property)
    .split("\n")
    .map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`)
    .join("");
  const mediaHtml = (property.property_media ?? [])
    .map((media) =>
      media.media_type === "video"
        ? `<div class="media-box">Vídeo${media.caption ? `: ${escapeHtml(media.caption)}` : ""}</div>`
        : `<img src="${escapeHtml(media.url)}" alt="${escapeHtml(media.caption || property.title)}" />`,
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(property.code || property.title)} - Relatório ImobiFlow</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
      h1 { font-size: 24px; margin: 0 0 4px; }
      .muted { color: #6b7280; margin-bottom: 24px; }
      .media { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px; }
      img, .media-box { width: 100%; height: 220px; object-fit: cover; border: 1px solid #e5e7eb; border-radius: 8px; }
      .media-box { display: flex; align-items: center; justify-content: center; padding: 16px; background: #f3f4f6; }
      .report { white-space: pre-wrap; font-size: 13px; line-height: 1.45; }
      .report p { margin: 0 0 3px; }
      @media print { body { margin: 18mm; } button { display: none; } .media { page-break-inside: avoid; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(property.title)}</h1>
    <div class="muted">Código ${escapeHtml(property.code || "sem código")} · Gerado pelo ImobiFlow</div>
    <div class="media">${mediaHtml || '<div class="media-box">Nenhuma mídia cadastrada.</div>'}</div>
    <div class="report">${reportHtml}</div>
  </body>
</html>`;
}

function buildCaptureJson(form: FormData) {
  return {
    captor_name: text(form, "captor_name"),
    key_location: text(form, "key_location"),
    doorman_name: text(form, "doorman_name"),
    doorman_phone: text(form, "doorman_phone"),
    has_sign: text(form, "has_sign") === "yes",
    sign_installed_at: text(form, "sign_installed_at"),
    sign_removed_at: text(form, "sign_removed_at"),
    exclusive: text(form, "exclusive") === "yes",
    exclusive_until: text(form, "exclusive_until"),
    flags: getChecked(form, "capture_flags"),
  };
}

function buildPrimaryDetailsJson(form: FormData) {
  const keys = [
    "property_type",
    "operation",
    "multi_property_fraction",
    "accepts_exchange",
    "accepts_financing",
    "living_rooms",
    "uncovered_parking_spaces",
    "front_customer_parking",
    "additional_parking",
    "total_docks",
    "covered_docks",
    "elevated_docks",
    "level_docks",
    "ramps",
    "floor_resistance",
    "topography",
  ];
  return Object.fromEntries(keys.map((key) => [key, text(form, key)]));
}

function buildMeasurementsJson(form: FormData) {
  const keys = [
    "ceiling_height",
    "land_area_m2",
    "land_area_alqueire",
    "land_area_hectare",
    "land_area_acre",
    "built_area",
    "industrial_area",
    "office_area",
    "support_area",
    "maneuver_area",
    "external_area",
    "yard_area",
    "gross_area",
    "exclusive_area",
    "common_area",
    "land_dimensions",
    "mezzanine_area",
    "glebe_area",
    "plateau_area",
  ];
  return Object.fromEntries(keys.map((key) => [key, text(form, key)]));
}

type CommercialPriceCalculation = {
  original_sale_price_cents?: number;
  original_rent_price_cents?: number;
  sale_price_cents?: number;
  rent_price_cents?: number;
  season_price_cents?: number;
  rule_type: string;
  rule_mode: string;
  rule_value: number;
  sale_adjustment_cents: number;
  rent_adjustment_cents: number;
};

function calculateCommercialPrices(form: FormData): CommercialPriceCalculation {
  const sale = parseMoneyToCents(text(form, "sale_price"));
  const rent = parseMoneyToCents(text(form, "rent_price"));
  const season = parseMoneyToCents(text(form, "season_price"));
  const ruleType = text(form, "commercial_rule_type") || "none";
  const ruleMode = text(form, "commercial_rule_mode") || "add";
  const ruleValue = parseDecimal(form.get("commercial_rule_value")) ?? 0;

  function applyRule(base?: number) {
    if (!base || ruleType === "none" || !ruleValue) return { final: base, adjustment: 0 };
    const adjustment = ruleType === "percent" ? Math.round(base * (ruleValue / 100)) : Math.round(ruleValue * 100);
    const signedAdjustment = ruleMode === "subtract" ? -adjustment : adjustment;
    return { final: Math.max(0, base + signedAdjustment), adjustment: signedAdjustment };
  }

  const saleResult = applyRule(sale);
  const rentResult = applyRule(rent);

  return {
    original_sale_price_cents: sale,
    original_rent_price_cents: rent,
    sale_price_cents: saleResult.final,
    rent_price_cents: rentResult.final,
    season_price_cents: season,
    rule_type: ruleType,
    rule_mode: ruleMode,
    rule_value: ruleValue,
    sale_adjustment_cents: saleResult.adjustment,
    rent_adjustment_cents: rentResult.adjustment,
  };
}

function buildCommercialTermsJson(form: FormData, calculation = calculateCommercialPrices(form)) {
  return {
    season_price_cents: calculation.season_price_cents,
    iptu_period: text(form, "iptu_period"),
    condominium_payment_notes: text(form, "condominium_payment_notes"),
    rent_notes: text(form, "rent_notes"),
    season_notes: text(form, "season_notes"),
    rule: {
      type: calculation.rule_type,
      mode: calculation.rule_mode,
      value: calculation.rule_value,
      original_sale_price_cents: calculation.original_sale_price_cents,
      original_rent_price_cents: calculation.original_rent_price_cents,
      sale_adjustment_cents: calculation.sale_adjustment_cents,
      rent_adjustment_cents: calculation.rent_adjustment_cents,
      final_sale_price_cents: calculation.sale_price_cents,
      final_rent_price_cents: calculation.rent_price_cents,
    },
  };
}

function buildAmenityGroupsJson(form: FormData) {
  return Object.fromEntries(
    Object.keys(featureGroups).map((group) => {
      const values = getChecked(form, `amenity_${group}`);
      const custom = text(form, `amenity_${group}_custom`);
      return [group, custom ? [...values, custom] : values];
    }),
  );
}

function buildPublicationSettingsJson(form: FormData) {
  return {
    channels: getChecked(form, "publication_channels"),
    site_featured: text(form, "site_featured") === "yes",
    site_enabled: text(form, "site_enabled") === "yes",
    site_banner: text(form, "site_banner") === "yes",
  };
}

function setInputValue(form: HTMLFormElement, name: string, value: string, overwrite = false) {
  const field = form.elements.namedItem(name) as HTMLInputElement | null;
  if (field && (overwrite || !field.value)) field.value = value;
}

async function fillCepAddressForForm(input: HTMLInputElement, prefix: "owner" | "property") {
  const cep = input.value.replace(/\D/g, "");
  if (cep.length !== 8) return;

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = (await response.json()) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (data.erro || !input.form) return;
    setInputValue(input.form, `${prefix}_street`, data.logradouro ?? "", true);
    setInputValue(input.form, `${prefix}_neighborhood`, data.bairro ?? "", true);
    setInputValue(input.form, `${prefix}_city`, data.localidade ?? "", true);
    setInputValue(input.form, `${prefix}_state`, data.uf ?? "", true);
    setInputValue(input.form, `${prefix}_country`, "Brasil", true);
  } catch {
    // O CEP ajuda a preencher, mas o usuário ainda pode editar manualmente.
  }
}

function formatCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.replace(/^(\d{5})(\d)/, "$1-$2");
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function formatMoneyTyping(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(digits) / 100);
}

function formatDecimalTyping(value: string) {
  const normalized = value.replace(/[^\d.,]/g, "");
  const separatorIndex = Math.max(normalized.lastIndexOf(","), normalized.lastIndexOf("."));
  const integerRaw = (separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : normalized).replace(/\D/g, "");
  const decimalRaw = separatorIndex >= 0 ? normalized.slice(separatorIndex + 1).replace(/\D/g, "") : undefined;
  const integer = integerRaw.replace(/^0+(?=\d)/, "");
  const formattedInteger = integer || "0";
  const decimal = decimalRaw !== undefined ? `,${decimalRaw.slice(0, 2)}` : "";
  return `${formattedInteger}${decimal}`;
}

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function getChecked(form: FormData, key: string) {
  return form.getAll(key).map(String).filter(Boolean);
}

function splitLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function labelFor(options: ReadonlyArray<readonly [string, string]>, value: string) {
  return options.find(([key]) => key === value)?.[1] ?? value;
}

function normalizePropertyType(value: string): PropertyInput["property_type"] {
  return propertyTypeOptions.some(([key]) => key === value)
    ? value as PropertyInput["property_type"]
    : "other";
}

function normalizeOperation(value: string): PropertyInput["operation"] {
  if (value === "rent" || value === "season") return value;
  if (value === "both") return "both";
  return "sale";
}

function parseInteger(value: FormDataEntryValue | null) {
  if (!value || String(value).trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseDecimal(value: FormDataEntryValue | null) {
  if (!value || String(value).trim() === "") return undefined;
  const raw = String(value ?? "").trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseMoneyToCents(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined;
}

function formatCurrency(value: number | null) {
  if (!value) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

function formatMoneyInput(value: number | null) {
  if (!value) return "";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
}

// F3B (2026-09-03): antes, TODA foto era recomprimida no cliente (canvas,
// máx. 1400px, JPEG 76%) mesmo quando o arquivo original já cabia com folga
// no limite aceito pelo backend — o original de verdade nunca chegava a ser
// enviado, nem para o Cloudinary nem para o corretor que reabrisse o imóvel
// depois. O backend já valida e aceita fotos de até 8MB por arquivo
// (property_image em file-policy.ts) e o corpo JSON aceita até 15MB
// (app.ts) — 8MB em base64 (~10.9MB) cabe com folga. Então, a partir de
// agora, um arquivo que já está dentro desse limite é enviado como está,
// sem recodificar (preserva resolução, formato e qualidade reais). Só
// recomprime — e só o suficiente pra caber — quando o arquivo excede o
// limite aceito pelo backend, evitando um 413 sem motivo (a otimização de
// entrega para o site público já é feita pelo Cloudinary via transformação,
// ver resolvePublicPhotoUrl no backend — não há necessidade de destruir o
// original aqui para isso).
export const PROPERTY_IMAGE_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      if (!file.type.startsWith("image/")) {
        resolve(result);
        return;
      }

      if (file.size <= PROPERTY_IMAGE_MAX_UPLOAD_BYTES) {
        resolve(result);
        return;
      }

      void optimizeImageDataUrl(result).then(resolve).catch(() => resolve(result));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// F3B (2026-09-03): `size_bytes` é o `declaredSizeBytes` que o backend usa
// em file-policy.ts (validateUploadFile) para decidir o 413 — precisa
// refletir o conteúdo realmente enviado (`content_base64`), não o arquivo
// original em disco. Antes, o valor enviado era sempre `file.size` (o
// arquivo original, não recomprimido), então qualquer original acima do
// limite do backend (8MB) já falhava com 413 mesmo depois da recompressão
// no cliente reduzir o corpo de fato enviado para poucos KB/MB — a
// recompressão existia mas não evitava o erro que deveria evitar.
export function dataUrlByteLength(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function optimizeImageDataUrl(dataUrl: string, maxSide = 2200, quality = 0.88) {
  return new Promise<string>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * ratio));
      const height = Math.max(1, Math.round(image.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}
