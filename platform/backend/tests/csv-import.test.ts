import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { previewCsvImport, previewDataImport } from "../src/services/csv-import.js";

function b64(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

async function excelB64(rows: Array<Array<string | number>>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Imoveis");
  sheet.addRows(rows);
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64");
}

async function zipB64(files: Record<string, string | Buffer>) {
  const zip = new JSZip();
  for (const [fileName, content] of Object.entries(files)) {
    zip.file(fileName, content);
  }
  return (await zip.generateAsync({ type: "nodebuffer" })).toString("base64");
}

describe("csv import parser", () => {
  it("mapeia CSV de imoveis e proprietarios com valores brasileiros", () => {
    const preview = previewCsvImport({
      fileName: "imoveis.csv",
      contentBase64: b64(
        [
          "Codigo;Titulo;Tipo;Finalidade;Valor Aluguel;Valor Venda;Proprietario;CPF;Email proprietario;Cidade;UF",
          "IM-001;Apartamento Centro;Apartamento;Locacao;R$ 3.003,79;R$ 450.000,00;Maria Silva;123.456.789-00;maria@email.com;Sao Paulo;SP",
        ].join("\n"),
      ),
      importType: "owners_properties",
    });

    expect(preview.delimiter).toBe(";");
    expect(preview.total_rows).toBe(1);
    expect(preview.valid_rows).toBe(1);
    expect(preview.preview_rows[0]?.mapped_data.owner.name).toBe("Maria Silva");
    expect(preview.preview_rows[0]?.mapped_data.property.operation).toBe("rent");
    expect(preview.preview_rows[0]?.mapped_data.property.rent_price_cents).toBe(300379);
    expect(preview.preview_rows[0]?.mapped_data.property.sale_price_cents).toBe(45000000);
  });

  it("rejeita linha de imovel sem titulo e sem codigo", () => {
    const preview = previewCsvImport({
      fileName: "imoveis.csv",
      contentBase64: b64(["Titulo;Cidade", ";Curitiba"].join("\n")),
      importType: "properties",
    });

    expect(preview.valid_rows).toBe(0);
    expect(preview.invalid_rows).toBe(1);
    expect(preview.preview_rows[0]?.errors).toContain("Informe titulo ou codigo do imovel.");
  });

  it("mapeia JSON com imovel e proprietario aninhados", async () => {
    const preview = await previewDataImport({
      fileName: "imoveis.json",
      contentBase64: b64(
        JSON.stringify([
          {
            property: {
              code: "IM-JSON-1",
              title: "Casa Jardim",
              operation: "venda",
              sale_price: "R$ 850.000,00",
              city: "Curitiba",
            },
            owner: {
              name: "Carlos Proprietario",
              document: "12.345.678/0001-99",
              email: "carlos@email.com",
            },
          },
        ]),
      ),
      importType: "owners_properties",
      sourceType: "json",
    });

    expect(preview.source_type).toBe("json");
    expect(preview.total_rows).toBe(1);
    expect(preview.valid_rows).toBe(1);
    expect(preview.preview_rows[0]?.mapped_data.owner.name).toBe("Carlos Proprietario");
    expect(preview.preview_rows[0]?.mapped_data.property.title).toBe("Casa Jardim");
    expect(preview.preview_rows[0]?.mapped_data.property.sale_price_cents).toBe(85000000);
  });

  it("respeita mapeamento manual quando cabecalhos nao seguem aliases", () => {
    const preview = previewCsvImport({
      fileName: "base-personalizada.csv",
      contentBase64: b64(["Imovel XPTO;Dono XPTO", "Cobertura Alto;Ana Souza"].join("\n")),
      importType: "owners_properties",
      mappingOverride: {
        title: "Imovel XPTO",
        owner_name: "Dono XPTO",
      },
    });

    expect(preview.valid_rows).toBe(1);
    expect(preview.mapping.title).toBe("Imovel XPTO");
    expect(preview.mapping.owner_name).toBe("Dono XPTO");
    expect(preview.preview_rows[0]?.mapped_data.property.title).toBe("Cobertura Alto");
    expect(preview.preview_rows[0]?.mapped_data.owner.name).toBe("Ana Souza");
  });

  it("mapeia URLs de fotos e rejeita URL invalida", () => {
    const preview = previewCsvImport({
      fileName: "imoveis-com-fotos.csv",
      contentBase64: b64(
        [
          "Codigo;Titulo;Proprietario;Fotos",
          "IM-010;Casa com fotos;Laura Costa;https://cdn.site.com/a.jpg|https://cdn.site.com/b.jpg",
          "IM-011;Casa com foto ruim;Laura Costa;nao-e-url",
        ].join("\n"),
      ),
      importType: "owners_properties",
    });

    expect(preview.preview_rows[0]?.mapped_data.property.media_urls).toEqual([
      "https://cdn.site.com/a.jpg",
      "https://cdn.site.com/b.jpg",
    ]);
    expect(preview.preview_rows[1]?.errors).toContain("Uma ou mais URLs de foto sao invalidas.");
    expect(preview.valid_rows).toBe(1);
    expect(preview.invalid_rows).toBe(1);
  });

  it("mapeia planilha Excel de imoveis e proprietarios", async () => {
    const preview = await previewDataImport({
      fileName: "base-imobiliaria.xlsx",
      contentBase64: await excelB64([
        ["Codigo", "Titulo", "Proprietario", "Valor Aluguel", "Cidade", "Fotos"],
        [
          "IM-XLS-1",
          "Apartamento Excel",
          "Renata Lima",
          "R$ 2.500,00",
          "Florianopolis",
          "https://cdn.site.com/excel.jpg",
        ],
      ]),
      importType: "owners_properties",
    });

    expect(preview.source_type).toBe("excel");
    expect(preview.delimiter).toBeNull();
    expect(preview.total_rows).toBe(1);
    expect(preview.valid_rows).toBe(1);
    expect(preview.mapping.title).toBe("Titulo");
    expect(preview.preview_rows[0]?.mapped_data.owner.name).toBe("Renata Lima");
    expect(preview.preview_rows[0]?.mapped_data.property.rent_price_cents).toBe(250000);
    expect(preview.preview_rows[0]?.mapped_data.property.media_urls).toEqual([
      "https://cdn.site.com/excel.jpg",
    ]);
  });

  it("mapeia XML de portal com imovel, contato, endereco, valores e fotos", async () => {
    const preview = await previewDataImport({
      fileName: "feed-imobiliario.xml",
      contentBase64: b64(`
        <ListingDataFeed>
          <Listings>
            <Listing>
              <ListingID>XML-001</ListingID>
              <Title>Casa XML Jardim</Title>
              <TransactionType>For Sale</TransactionType>
              <Details>
                <PropertyType>Casa</PropertyType>
                <Description>Casa importada por feed XML.</Description>
                <Bedrooms>3</Bedrooms>
                <Bathrooms>2</Bathrooms>
                <ListPrice>R$ 890.000,00</ListPrice>
              </Details>
              <Location>
                <Address>Rua das Flores</Address>
                <Number>123</Number>
                <Neighborhood>Centro</Neighborhood>
                <City>Curitiba</City>
                <State>PR</State>
                <PostalCode>80000-000</PostalCode>
              </Location>
              <Contact>
                <Name>Patricia Owner</Name>
                <Email>patricia@example.com</Email>
                <Phone>41999990000</Phone>
              </Contact>
              <Media>
                <Item>https://cdn.site.com/xml-1.jpg</Item>
                <Item>https://cdn.site.com/xml-2.jpg</Item>
              </Media>
            </Listing>
          </Listings>
        </ListingDataFeed>
      `),
      importType: "owners_properties",
    });

    expect(preview.source_type).toBe("xml");
    expect(preview.total_rows).toBe(1);
    expect(preview.valid_rows).toBe(1);
    expect(preview.preview_rows[0]?.mapped_data.owner.name).toBe("Patricia Owner");
    expect(preview.preview_rows[0]?.mapped_data.owner.email).toBe("patricia@example.com");
    expect(preview.preview_rows[0]?.mapped_data.property.code).toBe("XML-001");
    expect(preview.preview_rows[0]?.mapped_data.property.title).toBe("Casa XML Jardim");
    expect(preview.preview_rows[0]?.mapped_data.property.property_type).toBe("house");
    expect(preview.preview_rows[0]?.mapped_data.property.sale_price_cents).toBe(89000000);
    expect(preview.preview_rows[0]?.mapped_data.property.city).toBe("Curitiba");
    expect(preview.preview_rows[0]?.mapped_data.property.media_urls).toEqual([
      "https://cdn.site.com/xml-1.jpg",
      "https://cdn.site.com/xml-2.jpg",
    ]);
  });

  it("mapeia ZIP com CSV e imagens por codigo do imovel", async () => {
    const preview = await previewDataImport({
      fileName: "migracao-imoveis.zip",
      contentBase64: await zipB64({
        "base.csv": [
          "Codigo;Titulo;Proprietario;Valor Venda",
          "IM-ZIP-1;Casa ZIP;Helena Fotos;R$ 510.000,00",
          "IM-ZIP-2;Apartamento ZIP;Helena Fotos;R$ 610.000,00",
        ].join("\n"),
        "fotos/IM-ZIP-1/frente.jpg": Buffer.from("fake-jpg-1"),
        "fotos/IM-ZIP-1/sala.webp": Buffer.from("fake-webp-1"),
        "fotos/IM-ZIP-2.png": Buffer.from("fake-png-2"),
      }),
      importType: "owners_properties",
      includeMediaContent: true,
    });

    expect(preview.source_type).toBe("zip");
    expect(preview.total_rows).toBe(2);
    expect(preview.valid_rows).toBe(2);
    expect(preview.preview_rows[0]?.mapped_data.property.media_files).toEqual([
      expect.objectContaining({
        file_name: "fotos/IM-ZIP-1/frente.jpg",
        mime_type: "image/jpeg",
        size_bytes: 10,
        content_base64: expect.any(String),
      }),
      expect.objectContaining({
        file_name: "fotos/IM-ZIP-1/sala.webp",
        mime_type: "image/webp",
        size_bytes: 11,
        content_base64: expect.any(String),
      }),
    ]);
    expect(preview.preview_rows[1]?.mapped_data.property.media_files).toEqual([
      expect.objectContaining({
        file_name: "fotos/IM-ZIP-2.png",
        mime_type: "image/png",
      }),
    ]);
  });
});
