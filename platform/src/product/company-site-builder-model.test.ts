import { describe, expect, it } from "vitest";
import {
  duplicateSection,
  removeSection,
  reorderSections,
  type BuilderSection,
} from "./company-site-builder-model";

const sections: BuilderSection[] = [
  { id: "hero", type: "HERO", enabled: true, order: 0, props: { title: "A" } },
  { id: "about", type: "ABOUT", enabled: true, order: 1, props: { title: "B" } },
];

describe("F10B — operações do builder", () => {
  it("reordena e recalcula posições", () => {
    expect(reorderSections(sections, 1, -1).map((item) => item.id)).toEqual(["about", "hero"]);
    expect(reorderSections(sections, 0, 1).map((item) => item.order)).toEqual([0, 1]);
  });

  it("duplica com id e props independentes", () => {
    const copy = duplicateSection(sections[0], "hero-copy", 2);
    copy.props.title = "C";
    expect(copy.id).toBe("hero-copy");
    expect(sections[0].props.title).toBe("A");
  });

  it("remove seção sem deixar ordem quebrada", () => {
    expect(removeSection(sections, "hero")).toEqual([{ ...sections[1], order: 0 }]);
  });
});
