import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist/public", { recursive: true });
await Promise.all([
  build({
    entryPoints: ["src/ui/main.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: "dist/public/app.js",
    sourcemap: true,
  }),
  build({
    entryPoints: ["src/server/main.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    outfile: "dist/server.mjs",
    packages: "external",
    sourcemap: true,
  }),
]);
await copyFile("src/ui/index.html", "dist/public/index.html");
await copyFile("src/ui/style.css", "dist/public/style.css");
console.log("Built FMBE Studio");
