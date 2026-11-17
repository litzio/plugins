import { readFile, writeFile } from "node:fs/promises";
await writeFile(new URL("./worker-source.js", import.meta.url), "// Generated from pdfjs-dist (Apache-2.0); run node prepare.mjs after installing dependencies.\nexport default " + JSON.stringify(await readFile(new URL("./node_modules/pdfjs-dist/build/pdf.worker.mjs", import.meta.url), "utf8")) + ";\n");
