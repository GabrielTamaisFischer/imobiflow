export type BuilderSection = {
  id: string;
  type: string;
  enabled: boolean;
  order: number;
  props: Record<string, unknown>;
};

export function reorderSections(sections: BuilderSection[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= sections.length) return sections;
  const next = [...sections];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((item, order) => ({ ...item, order }));
}

export function duplicateSection(section: BuilderSection, id: string, order: number) {
  return { ...section, id, order, props: { ...section.props } };
}

export function removeSection(sections: BuilderSection[], id: string) {
  return sections
    .filter((section) => section.id !== id)
    .map((section, order) => ({ ...section, order }));
}
