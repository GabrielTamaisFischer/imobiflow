// Workaround for a build/SSR bug in the current nitro (v3 beta) + @tanstack/react-start
// + Vite 7 Environment API combination: some server-rendered chunks end up compiled
// with the automatic JSX *dev* transform (calls to `jsxDEV`) even in a production
// build, instead of the production transform (`jsx`/`jsxs`). React's own production
// build of `react/jsx-dev-runtime` intentionally exports `jsxDEV = undefined` in that
// case (it is meant to only ever be reached in development), so those call sites throw:
//   TypeError: jsxDevRuntimeExports.jsxDEV is not a function
//
// This shim re-points `react/jsx-dev-runtime` (production builds only, see
// vite.config.ts) at React's real production `jsx-runtime`, so any `jsxDEV(...)` calls
// that slip through resolve to the production `jsx`/`jsxs` element factory instead of
// the broken stub. The extra dev-only diagnostic arguments (`isStaticChildren`,
// `source`, `self`) that `jsxDEV` normally takes are simply ignored, which only means
// those elements lose some dev-mode-only console warnings — element creation and
// rendering behavior are unaffected.
//
// This is a targeted mitigation for the symptom, not a fix for the underlying
// bundler/environment-mode bug; remove it once the upstream packages resolve the
// dev/prod JSX runtime selection correctly for SSR builds.
export { Fragment, jsx, jsx as jsxDEV, jsxs } from "react/jsx-runtime";
