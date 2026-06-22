import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  splitting: false,
  external: [
    "react",
    "react/jsx-runtime",
    "ink",
    "@inkjs/ui",
    "citty",
    "@kud/bsky",
  ],
  banner: { js: "#!/usr/bin/env node" },
})
