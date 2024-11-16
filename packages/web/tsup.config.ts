import { defineConfig } from "tsup"

export default defineConfig([
  {
    entry: [ "src/index.ts"],
    outDir: "dist_esm",
    format: ["esm", "cjs"],
    dts: true,
    publicDir: '../../public/',
  },
  {
    entry: {"vad.worklet.bundle.min" :  "src/worklet.ts"},
    outDir: "dist_esm",
    format: [  "iife",  ],
  },
])
