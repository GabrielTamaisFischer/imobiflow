import { describe, expect, it, vi } from "vitest";
import { ownerSchema } from "../src/routes/real-estate.js";
import { errorHandler } from "../src/middleware/error-handler.js";

describe("errorHandler — validation details", () => {
  it("preserves safe field-level Zod messages without echoing the request", () => {
    let validationError: unknown;
    try {
      ownerSchema.parse({ owner_type: "individual", name: "Pessoa sintética", document: "312.321.232-12" });
    } catch (error) {
      validationError = error;
    }

    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    errorHandler(validationError, {} as never, response as never, (() => undefined) as never);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      error: "VALIDATION_ERROR",
      field_errors: { document: "CPF/CNPJ inválido para o tipo de pessoa." },
    }));
  });
});
