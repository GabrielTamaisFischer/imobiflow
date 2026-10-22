import { describe, expect, it } from "vitest";
import { pickInitialRoomId } from "./inspection-room-selection";
import type { MysqlInspectionItem, MysqlInspectionRoom } from "./inspections";

function item(condition: MysqlInspectionItem["condition"]): MysqlInspectionItem {
  return { id: crypto.randomUUID(), name: "x", condition, position: 0, notes: null };
}
function room(id: string, items: MysqlInspectionItem[]): MysqlInspectionRoom {
  return { id, name: id, position: 0, notes: null, items };
}

describe("pickInitialRoomId", () => {
  it("sem ambientes: nenhuma seleção", () => {
    expect(pickInitialRoomId([])).toBeNull();
  });

  it("seleciona o primeiro ambiente incompleto", () => {
    const rooms = [room("a", [item("good")]), room("b", [item("not_inspected")]), room("c", [item("good")])];
    expect(pickInitialRoomId(rooms)).toBe("b");
  });

  it("todos completos: seleciona o primeiro", () => {
    const rooms = [room("a", [item("good")]), room("b", [item("damaged")])];
    expect(pickInitialRoomId(rooms)).toBe("a");
  });

  it("ambiente sem itens conta como incompleto", () => {
    const rooms = [room("a", [item("good")]), room("b", [])];
    expect(pickInitialRoomId(rooms)).toBe("b");
  });
});
