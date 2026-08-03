import { describe, expect, it } from "vitest";
import { createTestScenarioPlan, getInspectionRoomImages, getScenarioImages } from "./test-lab";

describe("test lab scenario plan", () => {
  it("covers every property type option with unique property codes", () => {
    const plan = createTestScenarioPlan();
    const codes = plan.properties.map((property) => property.code);

    expect(plan.properties).toHaveLength(29);
    expect(new Set(codes).size).toBe(codes.length);
    expect(plan.coverage.property_type_options).toContain("Apartamento");
    expect(plan.coverage.property_type_options).toContain("Galpão/Depósito/Armazém");
    expect(plan.coverage.property_type_options).toContain("Terreno");
  });

  it("covers operations, statuses and feature groups used by the property form", () => {
    const plan = createTestScenarioPlan();

    expect(plan.coverage.operations).toEqual(expect.arrayContaining(["sale", "rent", "both"]));
    expect(plan.coverage.statuses).toEqual(
      expect.arrayContaining(["draft", "available", "reserved", "rented", "inactive"]),
    );
    expect(plan.coverage.feature_groups).toEqual(
      expect.arrayContaining(["infraestrutura", "lazer", "piso", "servicos", "estrutura", "culturas"]),
    );
  });

  it("creates agenda and inspection scenarios linked to planned properties", () => {
    const plan = createTestScenarioPlan();
    const propertyCodes = new Set(plan.properties.map((property) => property.code));
    const inspectionTypes = new Set(plan.inspections.map((inspection) => inspection.inspection_type));

    expect(plan.appointments.length).toBeGreaterThan(0);
    expect(plan.inspections.length).toBeGreaterThan(0);
    expect(inspectionTypes).toEqual(new Set(["entry", "exit"]));
    expect(plan.appointments.every((appointment) => propertyCodes.has(appointment.property_code))).toBe(true);
    expect(plan.inspections.every((inspection) => propertyCodes.has(inspection.property_code))).toBe(true);
  });

  it("uses multiple real external images for each property scenario", () => {
    const plan = createTestScenarioPlan();

    expect(plan.coverage.media_per_property).toBeGreaterThanOrEqual(24);
    expect(plan.coverage.media_source).toBe("real_external_images");

    for (const property of plan.properties) {
      const images = getScenarioImages(property);
      expect(images).toHaveLength(plan.coverage.media_per_property);
      expect(
        images.every(
          (image) => image.startsWith("https://images.unsplash.com/") || image.startsWith("https://loremflickr.com/"),
        ),
      ).toBe(true);
    }
  });

  it("creates a heavy visual package for inspection rooms", () => {
    const plan = createTestScenarioPlan();

    expect(plan.coverage.inspection_property_limit).toBeGreaterThanOrEqual(12);
    expect(plan.coverage.media_per_inspection_room).toBeGreaterThanOrEqual(12);

    const salaImages = getInspectionRoomImages("Sala", "QA Entrada - QA-0001");
    const cozinhaImages = getInspectionRoomImages("Cozinha", "QA Entrada - QA-0001");

    expect(salaImages).toHaveLength(plan.coverage.media_per_inspection_room);
    expect(cozinhaImages).toHaveLength(plan.coverage.media_per_inspection_room);
    expect(new Set(salaImages).size).toBe(salaImages.length);
    expect(
      [...salaImages, ...cozinhaImages].every(
        (image) => image.startsWith("https://images.unsplash.com/") || image.startsWith("https://loremflickr.com/"),
      ),
    ).toBe(true);
  });
});
