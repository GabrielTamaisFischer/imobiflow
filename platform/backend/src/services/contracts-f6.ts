import { createHash } from "node:crypto";

export const contractTypes = ["rental", "sale"] as const;
export const contractStatuses = ["draft", "generated", "waiting_signature", "awaiting_signature", "partially_signed", "signed", "active", "cancelled", "terminated", "archived"] as const;
export type ContractStatus = (typeof contractStatuses)[number];

export function canTransitionContract(from: string, to: ContractStatus) {
  const allowed: Record<string, ContractStatus[]> = {
    draft: ["generated", "cancelled", "archived"],
    generated: ["waiting_signature", "draft", "cancelled", "archived"],
    waiting_signature: ["partially_signed", "signed", "generated", "cancelled"],
    awaiting_signature: ["partially_signed", "signed", "generated", "cancelled"],
    partially_signed: ["signed", "cancelled"],
    signed: ["active", "terminated", "archived"],
    active: ["terminated", "archived"],
    cancelled: ["archived"],
    terminated: ["archived"],
    archived: [],
  };
  return from === to || allowed[from]?.includes(to) === true;
}

export function stableContractJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableContractJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableContractJson(item)}`).join(",")}}`;
}

export function contractSnapshotHash(snapshot: unknown) {
  return createHash("sha256").update(stableContractJson(snapshot)).digest("hex");
}
