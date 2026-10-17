import tailwind from "bun-plugin-tailwind";
import { rmSync } from "node:fs";
import { join } from "node:path";

console.log("Building Jam static frontend with Bun...");
const outdir = join(process.cwd(), "dist");

try {
  rmSync(outdir, { recursive: true, force: true });
} catch {
  /* ignore */
}

const result = await Bun.build({
  entrypoints: [join(process.cwd(), "src/web/index.html")],
  outdir,
  publicPath: "/",
  plugins: [tailwind],
  minify: true,
  sourcemap: "external",
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`✓ Build complete! Generated ${result.outputs.length} files in dist/`);
