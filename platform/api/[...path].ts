import { createApp } from "../backend/src/app.js";

const app = createApp();

export const config = {
  runtime: "nodejs",
  maxDuration: 300,
};

export default function handler(req: any, res: any) {
  const originalUrl = typeof req.url === "string" ? req.url : "/";
  req.url = originalUrl.replace(/^\/api(?=\/|$)/, "") || "/";
  return app(req, res);
}
