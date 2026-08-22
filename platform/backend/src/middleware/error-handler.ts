import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const isValidationError = error instanceof ZodError;
  const isUniqueConflict = error?.code === "P2002";
  const status = isValidationError
    ? 400
    : isUniqueConflict
      ? 409
      : typeof error.statusCode === "number"
        ? error.statusCode
        : 500;

  if (status === 500) {
    console.error({ name: error?.name, code: error?.code, message: error?.message });
  }

  res.status(status).json({
    error:
      status === 500
        ? "INTERNAL_ERROR"
        : isValidationError
          ? "VALIDATION_ERROR"
          : isUniqueConflict
            ? "CONFLICT"
            : (error.code ?? "REQUEST_ERROR"),
    message:
      status === 500
        ? "Nao foi possivel processar a solicitacao."
        : isValidationError
          ? "Dados invalidos. Revise os campos informados."
          : isUniqueConflict
            ? "O registro informado ja existe."
            : (error.message ?? "Solicitacao invalida."),
  });
};
