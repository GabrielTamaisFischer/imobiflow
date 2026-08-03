import ExcelJS from "exceljs";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

export type ImportType = "properties" | "owners" | "owners_properties";
export type ImportSourceType = "csv" | "json" | "excel" | "xml" | "zip";

export type ImportPreviewInput = {
  fileName: string;
  contentBase64: string;
  importType: ImportType;
  sourceType?: ImportSourceType;
  delimiter?: string | null;
  mappingOverride?: Record<string, string>;
  includeMediaContent?: boolean;
  maxRows?: number;
};

export type ParsedImportRow = {
  row_number: number;
  raw_data: Record<string, string>;
  mapped_data: {
    owner: Record<string, unknown>;
    property: Record<string, unknown>;
  };
  errors: string[];
  status: "valid" | "invalid";
};

export type ParsedImportMediaFile = {
  file_name: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp";
  size_bytes: number;
  content_base64?: string;
};

type ParsedImportContent = {
  headers: string[];
  rows: Array<Record<string, string>>;
  delimiter: string | null;
  zip_media_files?: ParsedImportMediaFile[];
};

const fieldAliases: Record<string, string[]> = {
  owner_name: ["proprietario", "proprietario nome", "nome proprietario", "owner", "owner name", "contact name", "listing contact name"],
  owner_document: ["cpf", "cnpj", "cpf cnpj", "documento", "documento proprietario", "owner document"],
  owner_email: ["email proprietario", "e-mail proprietario", "owner email", "contact email"],
  owner_phone: ["telefone proprietario", "whatsapp proprietario", "celular proprietario", "owner phone", "contact phone"],
  code: ["codigo", "codigo imovel", "referencia", "ref", "id antigo", "id", "listing id", "listingid", "property id"],
  title: ["titulo", "nome", "imovel", "titulo imovel", "descricao curta", "title", "headline"],
  description: ["descricao", "descrição", "observacoes", "observações", "description", "details description"],
  property_type: ["tipo", "tipo imovel", "tipo do imovel", "property type", "propertytype", "details property type", "details propertytype"],
  operation: ["finalidade", "operacao", "operação", "venda locacao", "transaction type", "transactiontype", "publication type", "publicationtype"],
  status: ["status", "situacao", "situação"],
  street: ["rua", "logradouro", "endereco", "endereço", "address", "location address", "location streetaddress", "streetaddress"],
  number: ["numero", "número", "address number", "location number"],
  complement: ["complemento", "address complement", "location complement"],
  neighborhood: ["bairro", "neighborhood", "location neighborhood"],
  city: ["cidade", "city", "location city"],
  state: ["estado", "uf", "state", "location state"],
  zip_code: ["cep", "postal code", "postalcode", "zip code", "zipcode", "location postalcode"],
  bedrooms: ["quartos", "dormitorios", "dormitórios", "bedrooms", "details bedrooms"],
  bathrooms: ["banheiros", "bathrooms", "details bathrooms"],
  suites: ["suites", "suítes", "details suites"],
  parking_spaces: ["vagas", "garagens", "vagas garagem", "garage", "garages", "parking spaces", "details garages"],
  private_area: ["area util", "área útil", "area privativa", "living area", "livingarea", "usable area", "details livingarea"],
  total_area: ["area total", "área total", "lot area", "total area", "details lotarea"],
  sale_price_cents: ["sale_price", "valor venda", "preco venda", "preço venda", "venda", "list price", "listprice", "details listprice", "sale price"],
  rent_price_cents: ["rent_price", "valor aluguel", "preco aluguel", "preço aluguel", "aluguel", "locacao", "rent price", "rental price", "details rentprice"],
  condominium_fee_cents: ["condominio", "condomínio", "condominium", "condominium fee"],
  iptu_cents: ["iptu", "property tax"],
  media_urls: ["fotos", "foto urls", "urls fotos", "imagens", "image urls", "media urls", "image", "images", "media item"],
};

const propertyTypeMap: Record<string, string> = {
  apartamento: "apartment",
  apto: "apartment",
  casa: "house",
  sobrado: "house",
  comercial: "commercial",
  sala: "commercial",
  galpao: "commercial",
  galpão: "commercial",
  terreno: "land",
  lote: "land",
  rural: "rural",
  chacara: "rural",
  chácara: "rural",
};

const operationMap: Record<string, string> = {
  venda: "sale",
  vender: "sale",
  locacao: "rent",
  locação: "rent",
  aluguel: "rent",
  ambos: "both",
  "venda e locacao": "both",
  "venda e locação": "both",
};

const statusMap: Record<string, string> = {
  rascunho: "draft",
  disponivel: "available",
  disponível: "available",
  reservado: "reserved",
  vendido: "sold",
  alugado: "rented",
  inativo: "inactive",
  arquivado: "archived",
};

export function previewCsvImport(input: ImportPreviewInput) {
  const text = decodeBase64Text(input.contentBase64);
  return buildImportPreview({
    input: { ...input, sourceType: "csv" },
    parsed: parseCsv(text, input.delimiter || detectDelimiter(text)),
  });
}

export function parseFullCsvImport(input: ImportPreviewInput) {
  return previewCsvImport({
    ...input,
    sourceType: "csv",
    maxRows: Number.MAX_SAFE_INTEGER,
  });
}

export async function previewDataImport(input: ImportPreviewInput) {
  const sourceType = input.sourceType ?? detectSourceType(input.fileName);
  const parsed = await parseImportContent(input.contentBase64, sourceType, {
    delimiter: input.delimiter,
    includeMediaContent: Boolean(input.includeMediaContent),
  });
  return buildImportPreview({ input: { ...input, sourceType }, parsed });
}

export async function parseFullDataImport(input: ImportPreviewInput) {
  return previewDataImport({
    ...input,
    includeMediaContent: true,
    maxRows: Number.MAX_SAFE_INTEGER,
  });
}

function buildImportPreview(input: {
  input: ImportPreviewInput & { sourceType: ImportSourceType };
  parsed: ParsedImportContent;
}) {
  const sourceType = input.input.sourceType;
  const parsed = input.parsed;
  const headers = parsed.headers;
  const mapping = applyMappingOverride(suggestMapping(headers), headers, input.input.mappingOverride);
  const rows = parsed.rows.slice(0, input.input.maxRows ?? parsed.rows.length).map((row, index) => {
    const parsedRow = validateImportRow({
      rowNumber: index + 2,
      raw: row,
      mapping,
      importType: input.input.importType,
    });
    attachZipMediaFiles(parsedRow, parsed.zip_media_files ?? []);
    return parsedRow;
  });
  const validRows = rows.filter((row) => row.status === "valid").length;
  const invalidRows = rows.length - validRows;

  return {
    file_name: input.input.fileName,
    import_type: input.input.importType,
    source_type: sourceType,
    delimiter: sourceType === "csv" ? parsed.delimiter : null,
    headers,
    mapping,
    total_rows: parsed.rows.length,
    rows,
    preview_rows: rows.slice(0, 20),
    valid_rows: validRows,
    invalid_rows: invalidRows,
  };
}

function validateImportRow(input: {
  rowNumber: number;
  raw: Record<string, string>;
  mapping: Record<string, string>;
  importType: ImportType;
}): ParsedImportRow {
  const owner = {
    name: readMapped(input.raw, input.mapping.owner_name),
    document: readMapped(input.raw, input.mapping.owner_document),
    email: readMapped(input.raw, input.mapping.owner_email),
    phone: readMapped(input.raw, input.mapping.owner_phone),
  };
  const property = {
    code: readMapped(input.raw, input.mapping.code),
    title: readMapped(input.raw, input.mapping.title),
    description: readMapped(input.raw, input.mapping.description),
    property_type: normalizeEnum(readMapped(input.raw, input.mapping.property_type), propertyTypeMap, "apartment"),
    operation: normalizeEnum(readMapped(input.raw, input.mapping.operation), operationMap, "sale"),
    status: normalizeEnum(readMapped(input.raw, input.mapping.status), statusMap, "draft"),
    street: readMapped(input.raw, input.mapping.street),
    number: readMapped(input.raw, input.mapping.number),
    complement: readMapped(input.raw, input.mapping.complement),
    neighborhood: readMapped(input.raw, input.mapping.neighborhood),
    city: readMapped(input.raw, input.mapping.city),
    state: readMapped(input.raw, input.mapping.state)?.slice(0, 2).toUpperCase() || null,
    zip_code: readMapped(input.raw, input.mapping.zip_code),
    bedrooms: parseInteger(readMapped(input.raw, input.mapping.bedrooms)),
    bathrooms: parseInteger(readMapped(input.raw, input.mapping.bathrooms)),
    suites: parseInteger(readMapped(input.raw, input.mapping.suites)),
    parking_spaces: parseInteger(readMapped(input.raw, input.mapping.parking_spaces)),
    private_area: parseDecimal(readMapped(input.raw, input.mapping.private_area)),
    total_area: parseDecimal(readMapped(input.raw, input.mapping.total_area)),
    sale_price_cents: parseMoneyCents(readMapped(input.raw, input.mapping.sale_price_cents)),
    rent_price_cents: parseMoneyCents(readMapped(input.raw, input.mapping.rent_price_cents)),
    condominium_fee_cents: parseMoneyCents(readMapped(input.raw, input.mapping.condominium_fee_cents)),
    iptu_cents: parseMoneyCents(readMapped(input.raw, input.mapping.iptu_cents)),
    media_urls: parseUrlList(readMapped(input.raw, input.mapping.media_urls)),
  };
  const errors: string[] = [];

  if (input.importType !== "owners" && !property.title && !property.code) {
    errors.push("Informe titulo ou codigo do imovel.");
  }

  if (input.importType !== "properties" && !owner.name) {
    errors.push("Informe o nome do proprietario.");
  }

  if (owner.email && !owner.email.includes("@")) {
    errors.push("E-mail do proprietario invalido.");
  }

  const invalidUrls = (property.media_urls ?? []).filter((url) => !isValidHttpUrl(url));
  if (invalidUrls.length > 0) {
    errors.push("Uma ou mais URLs de foto sao invalidas.");
  }

  return {
    row_number: input.rowNumber,
    raw_data: input.raw,
    mapped_data: {
      owner: cleanEmpty(owner),
      property: cleanEmpty(property),
    },
    errors,
    status: errors.length ? "invalid" : "valid",
  };
}

function attachZipMediaFiles(row: ParsedImportRow, mediaFiles: ParsedImportMediaFile[]) {
  if (mediaFiles.length === 0 || row.status === "invalid") return;

  const property = row.mapped_data.property;
  const code = typeof property.code === "string" ? property.code : "";
  const title = typeof property.title === "string" ? property.title : "";
  const matches = matchZipMediaFiles(mediaFiles, code || title);

  if (matches.length > 0) {
    property.media_files = matches;
  }
}

function matchZipMediaFiles(mediaFiles: ParsedImportMediaFile[], propertyKey: string) {
  const normalizedKey = normalizeMatchKey(propertyKey);
  if (!normalizedKey) return [];

  return mediaFiles.filter((file) => {
    const normalizedName = normalizeMatchKey(file.file_name);
    const pathParts = file.file_name.split(/[\\/]+/).map(normalizeMatchKey);
    return normalizedName.includes(normalizedKey) || pathParts.includes(normalizedKey);
  });
}

function normalizeMatchKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseCsv(csv: string, delimiter: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current.trim());
      current = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some((cell) => cell.trim())) rows.push(row);

  const headers = (rows.shift() ?? []).map((header) => header.trim());
  const records = rows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""])),
  );

  return { headers, rows: records, delimiter };
}

function parseJsonImport(jsonText: string) {
  const parsed = JSON.parse(jsonText) as unknown;
  const items = extractJsonItems(parsed);
  const rows = items.map(jsonItemToRow);
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  return { headers, rows, delimiter: null };
}

async function parseImportContent(
  contentBase64: string,
  sourceType: ImportSourceType,
  options: { delimiter?: string | null; includeMediaContent?: boolean } = {},
) {
  if (sourceType === "zip") {
    return parseZipImport(contentBase64, options);
  }

  return parseSingleImportContent({
    fileName: "",
    content: decodeBase64Buffer(contentBase64),
    sourceType,
    delimiter: options.delimiter,
  });
}

async function parseSingleImportContent(input: {
  fileName: string;
  content: Buffer;
  sourceType: Exclude<ImportSourceType, "zip">;
  delimiter?: string | null;
}): Promise<ParsedImportContent> {
  if (input.sourceType === "excel") return parseExcelImportBuffer(input.content);

  const text = input.content.toString("utf8").replace(/^\uFEFF/, "");
  if (input.sourceType === "xml") return parseXmlImport(text);
  if (input.sourceType === "json") return parseJsonImport(text);

  return parseCsv(text, input.delimiter || detectDelimiter(text));
}

async function parseExcelImportBuffer(content: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(content as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [], delimiter: null };

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cells[columnNumber - 1] = stringifyExcelCell(cell.value);
    });
    matrix.push(cells);
  });

  const nonEmptyRows = matrix.filter((row) => row.some((cell) => String(cell ?? "").trim()));
  const headers = (nonEmptyRows.shift() ?? []).map((header) => String(header ?? "").trim());
  const rows = nonEmptyRows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, String(cells[index] ?? "").trim()])),
  );

  return { headers, rows, delimiter: null };
}

async function parseZipImport(
  contentBase64: string,
  options: { delimiter?: string | null; includeMediaContent?: boolean },
): Promise<ParsedImportContent> {
  const zip = await JSZip.loadAsync(decodeBase64Buffer(contentBase64));
  const files = Object.values(zip.files).filter((file) => !file.dir && !isHiddenZipFile(file.name));
  const dataFile = findZipDataFile(files);

  if (!dataFile) {
    throw Object.assign(new Error("ZIP sem arquivo de dados CSV, JSON, XML ou Excel."), {
      statusCode: 422,
      code: "ZIP_DATA_FILE_NOT_FOUND",
    });
  }

  const dataSourceType = detectSourceType(dataFile.name);
  if (dataSourceType === "zip") {
    throw Object.assign(new Error("ZIP aninhado não é suportado nesta etapa."), {
      statusCode: 422,
      code: "NESTED_ZIP_NOT_SUPPORTED",
    });
  }

  const parsed = await parseSingleImportContent({
    fileName: dataFile.name,
    content: await dataFile.async("nodebuffer"),
    sourceType: dataSourceType,
    delimiter: options.delimiter,
  });
  const zipMediaFiles = await Promise.all(
    files
      .filter((file) => file.name !== dataFile.name)
      .map((file) => zipFileToImportMedia(file, Boolean(options.includeMediaContent))),
  );

  return {
    ...parsed,
    zip_media_files: zipMediaFiles.filter((file): file is ParsedImportMediaFile => Boolean(file)),
  };
}

function findZipDataFile(files: JSZip.JSZipObject[]) {
  const priority = [".csv", ".json", ".xml", ".xlsx", ".xls"];
  return files
    .filter((file) => priority.some((extension) => file.name.toLowerCase().endsWith(extension)))
    .sort((a, b) => priorityIndex(a.name, priority) - priorityIndex(b.name, priority))[0];
}

function priorityIndex(fileName: string, priority: string[]) {
  const lowerFileName = fileName.toLowerCase();
  const index = priority.findIndex((extension) => lowerFileName.endsWith(extension));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

async function zipFileToImportMedia(file: JSZip.JSZipObject, includeContent: boolean) {
  const mimeType = mimeForImageFile(file.name);
  if (!mimeType) return null;

  const content = await file.async("nodebuffer");
  if (content.length > 10 * 1024 * 1024) return null;

  return {
    file_name: file.name,
    mime_type: mimeType,
    size_bytes: content.length,
    ...(includeContent ? { content_base64: content.toString("base64") } : {}),
  };
}

function mimeForImageFile(fileName: string): ParsedImportMediaFile["mime_type"] | null {
  const lowerFileName = fileName.toLowerCase();
  if (lowerFileName.endsWith(".jpg") || lowerFileName.endsWith(".jpeg")) return "image/jpeg";
  if (lowerFileName.endsWith(".png")) return "image/png";
  if (lowerFileName.endsWith(".webp")) return "image/webp";
  return null;
}

function isHiddenZipFile(fileName: string) {
  return fileName.startsWith("__MACOSX/") || fileName.split("/").some((part) => part.startsWith("."));
}

function stringifyExcelCell(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return stringifyExcelCell(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text).join("");
    }
    if ("hyperlink" in value && typeof value.hyperlink === "string") return value.hyperlink;
  }
  return String(value);
}

function parseXmlImport(xmlText: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    textNodeName: "text",
    trimValues: true,
  });
  const parsed = parser.parse(xmlText) as unknown;
  const items = extractXmlItems(parsed);
  const rows = items.map(xmlItemToRow);
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  return { headers, rows, delimiter: null };
}

function extractXmlItems(parsed: unknown): Record<string, unknown>[] {
  const commonPaths = [
    ["imoveis", "imovel"],
    ["Imoveis", "Imovel"],
    ["properties", "property"],
    ["Properties", "Property"],
    ["listings", "listing"],
    ["Listings", "Listing"],
    ["ListingDataFeed", "Listings", "Listing"],
    ["feed", "listings", "listing"],
    ["Carga", "Imoveis", "Imovel"],
  ];

  for (const xmlPath of commonPaths) {
    const value = readPath(parsed, xmlPath);
    const records = normalizeXmlArray(value);
    if (records.length > 0) return records;
  }

  const discovered = findXmlRecordArray(parsed);
  if (discovered.length > 0) return discovered;

  return isRecord(parsed) ? [parsed] : [];
}

function xmlItemToRow(item: Record<string, unknown>) {
  const row: Record<string, string> = {};
  flattenXmlValue(row, item);
  normalizeXmlMediaUrls(row, item);
  return row;
}

function flattenXmlValue(row: Record<string, string>, value: unknown, prefix = "") {
  if (Array.isArray(value)) {
    const scalarItems = value.filter((item) => !isRecord(item) && !Array.isArray(item));
    if (scalarItems.length > 0 && prefix) {
      row[prefix] = scalarItems.map(stringifyXmlValue).filter(Boolean).join("|");
    }

    value.filter(isRecord).forEach((item) => flattenXmlValue(row, item, prefix));
    return;
  }

  if (!isRecord(value)) {
    if (prefix) row[prefix] = stringifyXmlValue(value);
    return;
  }

  for (const [key, fieldValue] of Object.entries(value)) {
    if (key === "text") {
      if (prefix) row[prefix] = stringifyXmlValue(fieldValue);
      continue;
    }

    const normalizedKey = prefix ? `${prefix}_${key}` : key;
    if (isRecord(fieldValue) && "text" in fieldValue && Object.keys(fieldValue).length <= 2) {
      row[normalizedKey] = stringifyXmlValue(fieldValue.text);
      continue;
    }

    flattenXmlValue(row, fieldValue, normalizedKey);
  }
}

function normalizeXmlMediaUrls(row: Record<string, string>, item: Record<string, unknown>) {
  const urls = collectXmlUrls(item);
  if (urls.length > 0 && !row.media_urls) {
    row.media_urls = [...new Set(urls)].join("|");
  }
}

function collectXmlUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectXmlUrls);
  if (!isRecord(value)) {
    if (typeof value === "string" && isValidHttpUrl(value)) return [value];
    return [];
  }

  return Object.entries(value).flatMap(([key, fieldValue]) => {
    const normalizedKey = normalizeLabel(key);
    const childUrls = collectXmlUrls(fieldValue);
    if (
      ["url", "image", "images", "foto", "fotos", "media", "item"].includes(normalizedKey) &&
      typeof fieldValue === "string" &&
      isValidHttpUrl(fieldValue)
    ) {
      return [fieldValue];
    }
    return childUrls;
  });
}

function normalizeXmlArray(value: unknown) {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) ? [value] : [];
}

function readPath(value: unknown, xmlPath: string[]) {
  return xmlPath.reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), value);
}

function findXmlRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    const records = value.filter(isRecord);
    return records.length > 0 && records.some(looksLikePropertyRecord) ? records : [];
  }

  if (!isRecord(value)) return [];
  for (const child of Object.values(value)) {
    const found = findXmlRecordArray(child);
    if (found.length > 0) return found;
  }
  return [];
}

function looksLikePropertyRecord(value: Record<string, unknown>) {
  const flattened: Record<string, string> = {};
  flattenXmlValue(flattened, value);
  const normalizedKeys = Object.keys(flattened).map(normalizeLabel);
  return Object.entries(fieldAliases).some(([field, aliases]) => {
    if (!["code", "title", "description", "property_type", "city", "sale_price_cents", "rent_price_cents"].includes(field)) {
      return false;
    }
    const candidates = [field, ...aliases].map(normalizeLabel);
    return normalizedKeys.some((key) => candidates.includes(key));
  });
}

function stringifyXmlValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function extractJsonItems(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed.filter(isRecord);
  if (!isRecord(parsed)) return [];

  const possibleArrays = ["items", "rows", "data", "properties", "imoveis", "owners", "proprietarios"];
  for (const key of possibleArrays) {
    const value = parsed[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }

  return [parsed];
}

function jsonItemToRow(item: Record<string, unknown>) {
  const row: Record<string, string> = {};

  for (const [key, value] of Object.entries(item)) {
    if (key === "owner" && isRecord(value)) {
      copyJsonObject(row, value, "owner");
      continue;
    }

    if (key === "proprietario" && isRecord(value)) {
      copyJsonObject(row, value, "owner");
      continue;
    }

    if (key === "property" && isRecord(value)) {
      copyJsonObject(row, value);
      continue;
    }

    if (key === "imovel" && isRecord(value)) {
      copyJsonObject(row, value);
      continue;
    }

    row[key] = stringifyJsonValue(value);
  }

  return row;
}

function copyJsonObject(row: Record<string, string>, value: Record<string, unknown>, prefix?: string) {
  for (const [key, fieldValue] of Object.entries(value)) {
    const normalizedKey = prefix ? `${prefix}_${key}` : key;
    row[normalizedKey] = stringifyJsonValue(fieldValue);
  }
}

function stringifyJsonValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function suggestMapping(headers: string[]) {
  const normalizedHeaders = headers.map((header) => ({
    raw: header,
    normalized: normalizeLabel(header),
  }));

  return Object.fromEntries(
    Object.entries(fieldAliases).map(([field, aliases]) => {
      const normalizedAliases = [field, ...aliases].map(normalizeLabel);
      const match = normalizedHeaders.find((header) => normalizedAliases.includes(header.normalized));
      return [field, match?.raw ?? ""];
    }),
  );
}

function applyMappingOverride(
  suggestedMapping: Record<string, string>,
  headers: string[],
  mappingOverride?: Record<string, string>,
) {
  if (!mappingOverride) return suggestedMapping;

  const headerSet = new Set(headers);
  return Object.fromEntries(
    Object.entries(suggestedMapping).map(([field, suggestedHeader]) => {
      const overrideHeader = mappingOverride[field];
      return [field, overrideHeader && headerSet.has(overrideHeader) ? overrideHeader : suggestedHeader];
    }),
  );
}

function readMapped(row: Record<string, string>, header?: string | null) {
  if (!header) return null;
  const value = row[header];
  return value?.trim() || null;
}

function decodeBase64Text(content: string) {
  return decodeBase64Buffer(content).toString("utf8").replace(/^\uFEFF/, "");
}

function decodeBase64Buffer(content: string) {
  const base64 = content.includes(",") ? content.split(",").at(-1) : content;
  return Buffer.from(base64 ?? "", "base64");
}

function detectDelimiter(csv: string) {
  const firstLine = csv.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const candidates = [",", ";", "\t"];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: firstLine.split(delimiter).length,
    }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

function detectSourceType(fileName: string): ImportSourceType {
  const lowerFileName = fileName.toLowerCase();
  if (lowerFileName.endsWith(".json")) return "json";
  if (lowerFileName.endsWith(".xml")) return "xml";
  if (lowerFileName.endsWith(".zip")) return "zip";
  if (lowerFileName.endsWith(".xlsx") || lowerFileName.endsWith(".xls")) return "excel";
  return "csv";
}

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeEnum(value: string | null, catalog: Record<string, string>, fallback: string) {
  if (!value) return fallback;
  return catalog[normalizeLabel(value)] ?? catalog[value.toLowerCase()] ?? fallback;
}

function parseInteger(value: string | null) {
  if (!value) return null;
  const parsed = Number(value.replace(/\D/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDecimal(value: string | null) {
  if (!value) return null;
  const parsed = Number(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMoneyCents(value: string | null) {
  const parsed = parseDecimal(value);
  return parsed === null ? null : Math.round(parsed * 100);
}

function parseUrlList(value: string | null) {
  if (!value) return [];
  return value
    .split(/[\n,;|]+/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function cleanEmpty<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null && value !== undefined && value !== ""),
  );
}
