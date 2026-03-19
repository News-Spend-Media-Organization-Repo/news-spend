import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  noExternal: [/@news-spend-media\/.*/],
  external: [
    // Native node modules (binary .node files)
    "*.node",
    "**/*.node",
    "ssh2",
    "cpu-features",
    // Other packages that shouldn't be bundled
    "sharp",
  ],
});
