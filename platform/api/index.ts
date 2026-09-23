// This file was previously named `[...path].ts` (Next.js-style catch-all bracket
// syntax). That is undocumented and unreliable for a generic (non-Next.js) `/api`
// directory on Vercel: in production it only matched requests exactly one path
// segment deep (e.g. `/api/auth`) and returned Vercel's own platform-level 404 for
// anything nested further (e.g. `/api/auth/register`), which is nearly every real
// route in this Express app. See `vercel.json`: a `rewrites` entry
// (`/api/:path*` -> `/api`) now sends every request under `/api` to this fixed
// function instead, matching Vercel's own documented pattern for deploying a full
// Express app as a single Function
// (https://examples.vercel.com/kb/guide/using-express-with-vercel).
//
// This still works with the manual `req.url` prefix-stripping below: Vercel
// preserves the client's original request URL in `req.url` for regular (non-Prerender)
// Node.js Serverless Functions regardless of any `rewrites` match — only the function
// selection changes, not what the invoked function observes as the request path.
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
