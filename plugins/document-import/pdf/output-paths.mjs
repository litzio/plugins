import path from 'node:path';
export function outputPaths(pdf) {
  const name = path.basename(pdf, path.extname(pdf));
  const folder = path.join(path.dirname(pdf), name);
  return { folder, doc: path.join(folder, name + '.md'), side: path.join(folder, name + '.pdf-source.json') };
}
