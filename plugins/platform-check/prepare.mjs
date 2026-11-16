import {readFile,writeFile} from 'node:fs/promises';
await writeFile(new URL('./worker-source.js',import.meta.url),'export default '+JSON.stringify(await readFile(new URL('./node_modules/pdfjs-dist/build/pdf.worker.mjs',import.meta.url),'utf8'))+';');
