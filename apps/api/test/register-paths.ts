import fs from "node:fs";
import Module from "node:module";
import path from "node:path";

const src = path.resolve(process.cwd(), "../web/src");
const resolve = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename.bind(Module);

(Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename = function resolveAlias(
  request: unknown,
  ...rest: unknown[]
) {
  if (typeof request === "string" && request.startsWith("@/")) {
    const base = path.join(src, request.slice(2));
    const found = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((file) => fs.existsSync(file));
    if (found) request = found;
  }
  return resolve(request, ...rest);
};
