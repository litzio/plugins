import { spawnSync } from 'node:child_process';
import { writeFileSync, lstatSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readInspection, authoring } from './document.mjs';

// Caller explicitly supplies a source-checkout tsx executable/CLI entry and a
// scratch root. No installed CLI, daemon discovery or implicit user-folder access.
export function sourceCli({ node = process.execPath, tsx, entry, root }) {
  root = resolve(root);
  if (realpathSync(root).toLowerCase() !== root.toLowerCase()) throw new Error('임시 폴더는 링크일 수 없습니다');
  const scoped = path => {
    const absolute = resolve(root, path), rel = relative(root, absolute);
    if (rel === '..' || rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(rel)) throw new Error('임시 작업 폴더 밖 경로');
    let current = root;
    for (const part of rel.split(/[\\/]/)) {
      current = join(current, part);
      if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('임시 작업 경로의 링크는 허용하지 않습니다');
    }
    // Only a caller-created scratch directory is accepted. Never follow links.
    return absolute;
  };
  const run = (...args) => {
    const r = spawnSync(node, [...(tsx ? ['--import', pathToFileURL(tsx).href] : []), entry, ...args], { encoding: 'utf8', timeout: 60000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout || String(r.error));
    const line = r.stdout.trim().split('\n').findLast(l => l.trim().startsWith('{'));
    return line ? JSON.parse(line) : r.stdout;
  };
  function create(s, name) {
    const file = scoped(name), input = scoped(randomUUID() + '.json');
    writeFileSync(input, JSON.stringify({ authoring: authoring(s), images: [] }), { flag: 'wx' });
    run('create', file, '--input', input, '--format', 'json');
    const inspect = run('inspect', file, '--format', 'json');
    const heads = inspect.nodes.filter(n => n.type === 'heading' && n.level === 2 && !inspect.nodes.some(t => t.type === 'target' && t.path[0] === n.path[0] - 1)).reverse();
    const operations = heads.map((n, i) => ({ command: 'insert-target', at: n.path[0], label: s.requirements[s.requirements.length - i - 1].id }));
    if (operations.length) {
      const ops = scoped(randomUUID() + '.json'); writeFileSync(ops, JSON.stringify(operations), { flag: 'wx' });
      run('apply-batch', file, '--operations', ops, '--if-revision', inspect.revision, '--format', 'json');
    }
    run('check', file, '--format', 'json');
    return file;
  }
  function read(name) {
    const file = scoped(name), inspection = run('inspect', file, '--format', 'json');
    const comparison = run('compare', file, file, '--json');
    if (comparison.receipt?.beforeRevision !== inspection.revision || comparison.receipt?.afterRevision !== inspection.revision) throw new Error('의미 읽기 revision 불일치');
    const s = readInspection(inspection, name, comparison.before);
    // Guard against an inspect/compare race, including metadata changes.
    if (inspection.revision !== run('inspect', file, '--format', 'json').revision) throw new Error('읽는 동안 문서가 변경되었습니다');
    return s;
  }
  return { run, create, read, scoped, root };
}
