import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const isValidationError = error instanceof ZodError;
  const isUniqueConflict = error?.code === "P2002";
  // Achado real em QA de video (2026-08-30): upload de midia envia o
  // arquivo como base64 dentro do corpo JSON (mesma arquitetura de
  // foto/panorama, ver services/storage). Isso infla o tamanho em ~33% e
  // esbarra no limite de app.ts (express.json({limit:"15mb"})) antes mesmo
  // da validacao Zod rodar — na pratica, o teto real de upload e ~10-11MB
  // de arquivo bruto, bem abaixo do que o schema de validacao (50MB)
  // sugere. Sem esta mensagem dedicada, o usuario via só "request entity
  // too large" em ingles, sem entender o porquê nem ter uma alternativa
  // clara — o oposto do que o escopo pede ("não fingir suporte, definir a
  // estratégia do MVP claramente"). Decisão de estratégia adotada: upload
  // real funciona para arquivos de video pequenos/médios (dentro do
  // limite); para vídeos maiores, a mensagem já indica a alternativa que a
  // UI oferece (link externo).
  const isPayloadTooLarge = error?.type === "entity.too.large" || error?.status === 413 || error?.statusCode === 413;
  const status = isValidationError
    ? 400
    : isUniqueConflict
      ? 409
      : isPayloadTooLarge
        ? 413
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
            : isPayloadTooLarge
              ? "PAYLOAD_TOO_LARGE"
              : (error.code ?? "REQUEST_ERROR"),
    message:
      status === 500
        ? "Nao foi possivel processar a solicitacao."
        : isValidationError
          ? "Dados invalidos. Revise os campos informados."
          : isUniqueConflict
            ? "O registro informado ja existe."
            : isPayloadTooLarge
              ? "Arquivo muito grande para upload direto (limite pratico de ~10MB). Use um video menor ou informe um link externo (YouTube, Vimeo etc.) no campo de video."
              : (error.message ?? "Solicitacao invalida."),
  });
};
