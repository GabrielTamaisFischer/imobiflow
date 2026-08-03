import { describe, expect, it } from "vitest";
import {
  getWebsiteBuilderSectionBlock,
  listWebsiteBuilderSectionBlocks,
  websiteBuilderSectionBlocks,
} from "../src/services/website-builder-block-library.js";

describe("Website Builder block library", () => {
  it("exposes structural section blocks for the builder", () => {
    expect(websiteBuilderSectionBlocks.map((block) => block.key)).toEqual([
      "luxury-hero",
      "property-carousel",
      "property-grid",
      "owner-lead-form",
      "trust-differentials",
      "contact-cta",
    ]);

    for (const block of websiteBuilderSectionBlocks) {
      expect(block.name).toBeTruthy();
      expect(block.category).toBeTruthy();
      expect(block.sectionType).toBeTruthy();
      expect(Array.isArray(block.components)).toBe(true);
    }
  });

  it("filters blocks by category", () => {
    const propertyBlocks = listWebsiteBuilderSectionBlocks("properties");

    expect(propertyBlocks).toHaveLength(2);
    expect(propertyBlocks.every((block) => block.category === "properties")).toBe(true);
  });

  it("keeps property blocks connected to real published property data only", () => {
    const propertyBlocks = listWebsiteBuilderSectionBlocks("properties");

    for (const block of propertyBlocks) {
      expect(block.propsJson?.source).toBe("published_properties");
      expect(block.propsJson?.emptyState).toBe("Nenhum imóvel publicado ainda.");
      expect(JSON.stringify(block).toLowerCase()).not.toContain("preview");
      expect(JSON.stringify(block).toLowerCase()).not.toContain("teste");
    }
  });

  it("returns a single block by key or null when missing", () => {
    expect(getWebsiteBuilderSectionBlock("luxury-hero")?.sectionType).toBe("hero");
    expect(getWebsiteBuilderSectionBlock("nao-existe")).toBeNull();
  });
});
