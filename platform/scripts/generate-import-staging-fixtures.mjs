import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

if (process.env.NODE_ENV === "production") throw new Error("Fixtures de staging sao proibidas em producao.");
if (process.env.ALLOW_IMPORT_STAGING_TEST !== "true") throw new Error("Defina ALLOW_IMPORT_STAGING_TEST=true.");

const count = Number(process.argv.find((arg) => arg.startsWith("--count="))?.split("=")[1] ?? 50);
if (![50, 500].includes(count)) throw new Error("Use --count=50 ou --count=500.");
if (count === 500 && process.env.CONFIRM_IMPORT_500_STAGING !== "true") {
  throw new Error("500 registros exigem CONFIRM_IMPORT_500_STAGING=true.");
}

const outputDir = resolve(process.cwd(), ".tmp", "import-staging", String(count));
await mkdir(outputDir, { recursive: true });
const header = "Codigo;Titulo;Cidade;Status;Valor Venda;Fotos;Video URL;Tour URL";
const imageUrl = process.env.STAGING_TEST_IMAGE_URL ?? "https://httpbin.org/image/jpeg";

function rowsFor(company) {
  const rows = [header];
  for (let index = 1; index <= count; index += 1) {
    const code = `${company}-${String(index).padStart(5, "0")}`;
    let photo = imageUrl;
    if (index === 2) photo = "https://example.invalid/imagem-inexistente.jpg";
    if (index === 3) photo = "http://127.0.0.1/private.jpg";
    if (index === count) photo = imageUrl;
    rows.push(`${code};Imovel simulado ${index};Curitiba;disponivel;${100000 + index};${photo};https://video.example/${code};https://tour.example/${code}`);
  }
  // Duplicidade intencional dentro do mesmo arquivo, sem ampliar o total esperado.
  rows[rows.length - 1] = rows[1];
  return rows.join("\n");
}

await writeFile(resolve(outputDir, "company-a.csv"), rowsFor("A"), "utf8");
await writeFile(resolve(outputDir, "company-b.csv"), rowsFor("B"), "utf8");
await writeFile(resolve(outputDir, "manifest.json"), JSON.stringify({
  generatedAt: new Date().toISOString(), count, synthetic: true,
  companies: [
    { key: "company-a", user: "staging-import-a@example.invalid", file: "company-a.csv" },
    { key: "company-b", user: "staging-import-b@example.invalid", file: "company-b.csv" },
  ],
  cases: ["imagem controlada", "imagem invalida", "SSRF localhost", "duplicidade", "video URL", "tour URL"],
}, null, 2), "utf8");

console.log(`Fixtures sinteticas geradas em ${outputDir}. Nenhum dado foi enviado.`);
