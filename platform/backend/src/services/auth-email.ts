import { env } from "../config/env.js";

export async function sendAuthenticationEmail(input: {
  to: string;
  subject: string;
  body: string;
  action: "invitation" | "password_reset" | "account_activation";
}) {
  if (!env.EMAIL_PROVIDER_URL) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(env.EMAIL_PROVIDER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.EMAIL_PROVIDER_TOKEN
          ? { authorization: `Bearer ${env.EMAIL_PROVIDER_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        channel: "email",
        to: input.to,
        subject: input.subject,
        body: input.body,
        metadata: { source: "imobiflow_identity", action: input.action },
      }),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function mayExposeAuthenticationTokenForTests() {
  return env.NODE_ENV === "test" && env.AUTH_EXPOSE_TEST_TOKENS === "true";
}
