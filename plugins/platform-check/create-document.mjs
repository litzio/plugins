import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const [folder,cli]=process.argv.slice(2);
const chunks=(await readFile(path.join(folder,'input.md'),'utf8')).split(/\r?\n\s*\r?\n/).filter(x=>x.trim());
const blocks=chunks.map(s=>{s=s.trim();const h=/^(#{1,6})\s+([\s\S]*)/.exec(s);if(h)return {kind:'heading',level:h[1].length,text:h[2].replace(/\s+/g,' ')};return {kind:'paragraph',text:s.startsWith('<!--')?'Table or figure placeholder':s};});
await writeFile(path.join(folder,'authoring.json'),JSON.stringify({authoring:{inputs:[{key:'source',blocks}]}}));
const t=performance.now();const r=spawnSync(process.execPath,[cli,'create',path.join(folder,'converted.md'),'--input',path.join(folder,'authoring.json'),'--format','json'],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
await writeFile(path.join(folder,'create-result.json'),JSON.stringify({ms:performance.now()-t,inputBlocks:blocks.length,status:r.status,stdout:r.stdout,stderr:r.stderr}));
console.log({ms:performance.now()-t,inputBlocks:blocks.length,status:r.status});if(r.status)console.log(r.stderr.slice(0,2200));
if(r.status===0){const inspect=spawnSync(process.execPath,[cli,'inspect',path.join(folder,'converted.md'),'--format','json'],{encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});await writeFile(path.join(folder,'inspect.json'),inspect.stdout);console.log({inspectStatus:inspect.status});}
