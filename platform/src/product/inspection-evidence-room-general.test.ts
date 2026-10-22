import { describe, expect, it } from "vitest";
import { filterEvidenceFor, type MysqlInspectionEvidence } from "./inspections";

/**
 * SUB-BLOCO 3 (ajuste) — "Fotos gerais do ambiente" (InspectionRoomWorkspace)
 * usa filterEvidenceFor(evidence, room.id, null), ou seja, o MESMO filtro já
 * usado pela evidência por item (room.id, item.id) — nenhum domínio novo.
 * Este teste garante que o filtro já existente separa corretamente as três
 * categorias e que nenhuma foto geral do ambiente "vaza" para a galeria de
 * um item, nem o contrário.
 */
function evidence(overrides: Partial<MysqlInspectionEvidence>): MysqlInspectionEvidence {
  return {
    id: overrides.id ?? "evidence-id",
    inspection_id: "inspection-1",
    room_id: null,
    item_id: null,
    file_name: "foto.jpg",
    mime_type: "image/jpeg",
    file_size: 1024,
    width: 800,
    height: 600,
    caption: null,
    position: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    signed_url: null,
    ...overrides,
  };
}

describe("filterEvidenceFor — evidência geral do ambiente vs. evidência por item (SUB-BLOCO 3 ajuste)", () => {
  const roomGeneral1 = evidence({ id: "room-general-1", room_id: "room-1", item_id: null });
  const roomGeneral2 = evidence({ id: "room-general-2", room_id: "room-1", item_id: null });
  const itemA1 = evidence({ id: "item-a-1", room_id: "room-1", item_id: "item-a" });
  const itemB1 = evidence({ id: "item-b-1", room_id: "room-1", item_id: "item-b" });
  const otherRoom = evidence({ id: "other-room-1", room_id: "room-2", item_id: null });
  const all = [roomGeneral1, roomGeneral2, itemA1, itemB1, otherRoom];

  it("evidência geral do ambiente (room_id, item_id=null) não aparece na galeria de um item", () => {
    const itemARows = filterEvidenceFor(all, "room-1", "item-a");
    expect(itemARows.map((row) => row.id)).toEqual(["item-a-1"]);
    expect(itemARows).not.toContainEqual(roomGeneral1);
    expect(itemARows).not.toContainEqual(roomGeneral2);
  });

  it("evidência de um item não aparece na seção de fotos gerais do ambiente", () => {
    const generalRows = filterEvidenceFor(all, "room-1", null);
    expect(generalRows.map((row) => row.id)).toEqual(["room-general-1", "room-general-2"]);
    expect(generalRows).not.toContainEqual(itemA1);
    expect(generalRows).not.toContainEqual(itemB1);
  });

  it("evidência de outro ambiente nunca aparece neste ambiente (geral ou por item)", () => {
    expect(filterEvidenceFor(all, "room-1", null)).not.toContainEqual(otherRoom);
    expect(filterEvidenceFor(all, "room-2", null)).toEqual([otherRoom]);
  });

  it("o total de fotos do resumo (evidence.length) soma geral do ambiente + de todos os itens sem perder nem duplicar", () => {
    expect(all.length).toBe(5);
    const generalCount = filterEvidenceFor(all, "room-1", null).length;
    const itemACount = filterEvidenceFor(all, "room-1", "item-a").length;
    const itemBCount = filterEvidenceFor(all, "room-1", "item-b").length;
    const otherRoomCount = filterEvidenceFor(all, "room-2", null).length;
    expect(generalCount + itemACount + itemBCount + otherRoomCount).toBe(all.length);
  });
});
