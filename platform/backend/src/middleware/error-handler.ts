import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);

  const status = typeof error.statusCode === "number" ? error.statusCode : 500;

  res.status(status).json({
    error: status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
    message:
      status === 500
        ? "Não foi possível processar a solicitação."
        : (error.message ?? "Solicitação inválida."),
  });
};
