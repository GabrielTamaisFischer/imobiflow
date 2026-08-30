import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../lib/website-builder-prisma.js";

/**
 * A4 (Fase A): idempotência real, no nível de banco, para operações que
 * criam efeitos colaterais financeiros (cobrança, pagamento). O ledger vive
 * em Prisma/MySQL (arquitetura canônica) com uma constraint UNIQUE em
 * (company_id, scope, idempotency_key) — a proteção não depende de nenhum
 * lock em memória do processo Node (que não sobreviveria a múltiplas
 * instâncias do backend), e sim de o banco rejeitar a segunda tentativa de
 * reservar a mesma chave.
 *
 * Uso: withIdempotency(companyId, "finance.charges.from_contract", key, fn).
 * - Se a chave nunca foi vista: reserva-a (INSERT) e executa `fn`.
 * - Se outra requisição já reservou a MESMA chave e já terminou: retorna o
 *   resultado registrado (replay), sem repetir o efeito colateral.
 * - Se outra requisição já reservou a chave e AINDA está em andamento
 *   (corrida real, ex.: duplo clique quase simultâneo): retorna 409 pedindo
 *   para tentar novamente — nunca deixa duas execuções passarem.
 */

export class IdempotencyConflictError extends Error {
  statusCode = 409;
  code = "IDEMPOTENCY_CONFLICT" as const;
  constructor() {
    super("Uma requisição idêntica já está em processamento. Tente novamente em instantes.");
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function withIdempotency<T>(
  companyId: string,
  scope: string,
  idempotencyKey: string,
  fn: () => Promise<T>,
): Promise<{ result: T; replayed: boolean }> {
  const prisma = getPrisma();
  const id = randomUUID();

  try {
    await prisma.idempotencyKey.create({
      data: { id, companyId, scope, idempotencyKey, status: "in_progress" },
    });
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) throw error;

    const existing = await prisma.idempotencyKey.findUnique({
      where: { companyId_scope_idempotencyKey: { companyId, scope, idempotencyKey } },
    });

    if (existing?.status === "completed" && existing.responseJson !== null) {
      return { result: existing.responseJson as T, replayed: true };
    }

    // Ainda em andamento (corrida perdida) ou terminou em erro anteriormente
    // sem um resultado utilizável: não deixamos uma segunda execução passar.
    throw new IdempotencyConflictError();
  }

  try {
    const result = await fn();
    await prisma.idempotencyKey.update({
      where: { companyId_scope_idempotencyKey: { companyId, scope, idempotencyKey } },
      data: { status: "completed", responseJson: result as unknown as Prisma.InputJsonValue },
    });
    return { result, replayed: false };
  } catch (error) {
    await prisma.idempotencyKey.update({
      where: { companyId_scope_idempotencyKey: { companyId, scope, idempotencyKey } },
      data: { status: "failed" },
    });
    throw error;
  }
}

/**
 * Deriva uma chave de idempotência padrão quando o cliente não envia o
 * cabeçalho `Idempotency-Key` explicitamente — assim a proteção funciona
 * mesmo sem nenhuma mudança no frontend. A chave é estável para o mesmo
 * "evento de negócio" dentro de uma janela curta, o que é exatamente o caso
 * do duplo clique / retry de rede que motivou o RISCO-017.
 */
export function resolveIdempotencyKey(req: { headers: Record<string, unknown> }, fallback: string) {
  const header = req.headers["idempotency-key"];
  if (typeof header === "string" && header.trim()) return header.trim().slice(0, 200);
  return fallback;
}
