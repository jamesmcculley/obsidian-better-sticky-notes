import esbuild from "esbuild";
import process from "node:process";

const production = process.argv.includes("production");
await esbuild.build({
  banner: { js: "/* Better Sticky Notes for Obsidian */" },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
});
