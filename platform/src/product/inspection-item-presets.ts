import { normalizeRoomKey, resolveRoomCategory, type InspectionRoomCategory } from "./inspection-rooms";

/**
 * SUB-BLOCO 3 — presets determinísticos de itens de vistoria por categoria
 * de ambiente. Simples e previsível de propósito (diretriz: "não precisa ser
 * perfeito nesta primeira versão"); fácil de ampliar depois. Sem IA.
 */
const BASE_ITEMS = ["Paredes", "Piso", "Teto", "Pintura", "Portas", "Janelas", "Tomadas", "Iluminação"];

const ITEM_PRESETS: Record<InspectionRoomCategory, string[]> = {
  sala: BASE_ITEMS,
  cozinha: [...BASE_ITEMS, "Pia", "Torneira", "Bancada", "Armários", "Revestimento"],
  quarto: [...BASE_ITEMS, "Armários"],
  banheiro: [
    "Piso", "Paredes", "Revestimento", "Teto", "Pintura", "Porta", "Janela",
    "Pia", "Torneira", "Vaso sanitário", "Box", "Chuveiro", "Ralo", "Iluminação",
  ],
  area_servico: ["Piso", "Paredes", "Teto", "Pintura", "Tanque", "Torneira", "Ralo", "Tomadas", "Iluminação"],
  garagem: ["Piso", "Paredes", "Teto/cobertura", "Portão", "Iluminação", "Tomadas"],
  quintal: ["Piso", "Paredes/muros", "Portões", "Ralos", "Iluminação", "Cobertura"],
  varanda: ["Piso", "Paredes", "Teto", "Guarda-corpo", "Iluminação", "Porta de acesso"],
  // Diretriz do Sub-bloco 3: escritório usa "os mesmos itens base de
  // quarto/sala" — usamos o conjunto base comum aos dois (sem os itens
  // específicos de quarto, como Armários).
  escritorio: BASE_ITEMS,
  // Qualquer ambiente sem categoria reconhecida (Jardim, Piscina, Closet,
  // Despensa, Copa, Edícula, um nome totalmente customizado etc.) recebe o
  // preset base — melhor um ponto de partida genérico do que nenhum.
  generic: BASE_ITEMS,
};

/** Preset de itens para um ambiente, pelo NOME do ambiente (resolve a categoria internamente). */
export function buildSuggestedInspectionItems(roomName: string): string[] {
  return ITEM_PRESETS[resolveRoomCategory(roomName)];
}

/**
 * Idempotência (diretriz do Sub-bloco 3): nunca sugerir de novo um item que
 * o ambiente já possui (por nome, sem diferenciar acento/caixa). Quem cria
 * os itens de fato deve filtrar o preset por esta função antes de chamar
 * createMysqlItem — repetir a chamada não deve duplicar "Paredes" etc.
 */
export function selectNewPresetItems(existingItemNames: string[], presetNames: string[]): string[] {
  const existingKeys = new Set(existingItemNames.map((name) => normalizeRoomKey(name)));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of presetNames) {
    const key = normalizeRoomKey(name);
    if (existingKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}
