import fs from 'node:fs/promises';
import {assertSchema,resolveSchema} from '../schema.mjs';
import {documentSchema,parseServerJson} from '../validation.mjs';
const root=new URL('../../../',import.meta.url);
const samples=['fixtures/lsr-1.1/converted/document.json','fixtures/lsr-1.1/converted/no-bookmarks/document.json','fixtures/lsr-1.1/converted/answer-key/document.json','fixtures/nist-sp1108r4/converted/document.json'];
// Audited Docling reads; not native snapshot/provenance-output properties with the same names.
const nodeFields=new Set(['self_ref','parent','children','label','content_layer','prov','text','orig','level','code_language','marker','enumerated','formatting','hyperlink','meta','captions','footnotes','references']);
const direct={
 '$root':['schema_name','version','body','furniture','texts','tables','pictures','groups','pages','key_value_items','form_items'],
 RefItem:['$ref'],ProvenanceItem:['page_no','bbox','charspan'],BoundingBox:['l','t','r','b','coord_origin'],Size:['width','height'],ImageRef:['uri'],TableData:['num_rows','num_cols','table_cells']
};
function consumed(definition,schema,field){
 if(['TableCell','RichTableCell'].includes(definition))return true; // immutable sourceCell is transferred whole
 if(schema.properties?.self_ref)return nodeFields.has(field)||(definition==='TableItem'&&field==='data')||(definition==='PictureItem'&&field==='image');
 return direct[definition]?.includes(field)===true;
}
const observations=new Map(),normalAbsences=new Map();
function walk(value,schema,path,sample){
 if(schema.$ref){const name=schema.$ref.split('/').at(-1),target=resolveSchema(documentSchema,schema.$ref);observe(value,target,name,path,sample);return walk(value,target,path,sample)}
 for(const kind of ['anyOf','oneOf'])if(schema[kind]){for(const branch of schema[kind]){try{assertSchema(value,branch,documentSchema);walk(value,branch,path,sample);return}catch{}}throw Error('No schema branch '+path)}
 if(Array.isArray(value)){value.forEach((v,i)=>{const child=schema.prefixItems?.[i]??schema.items;if(child&&typeof child==='object')walk(v,child,path+'/'+i,sample)});return}
 if(value&&typeof value==='object'&&!JSON.isRawJSON(value))for(const [key,v]of Object.entries(value)){const child=schema.properties?.[key]??schema.additionalProperties;if(child&&typeof child==='object')walk(v,child,path+'/'+key,sample)}
}
function observe(value,schema,definition,path,sample){
 if(!value||typeof value!=='object'||Array.isArray(value))return;
 if(schema.properties?.self_ref)for(const field of nodeFields)if(!Object.hasOwn(schema.properties,field)&&!Object.hasOwn(value,field)){const key=definition+'.'+field;const r=normalAbsences.get(key)||{definition,field,reason:'Not declared for this node type; normal output omits it. Generic consumer fallback is type-conditional.',samples:{},first_missing:sample+':'+path};r.samples[sample]=(r.samples[sample]||0)+1;normalAbsences.set(key,r)}
 for(const field of Object.keys(schema.properties||{})){
  if(!consumed(definition,schema,field))continue;
  const id=definition+'.'+field;let row=observations.get(id);if(!row){row={definition,field,already_required:schema.required?.includes(field)===true,samples:Object.fromEntries(samples.map(s=>[s,{instances:0,present:0}]))};observations.set(id,row)}
  const stats=row.samples[sample];stats.instances++;if(Object.hasOwn(value,field)){stats.present++;row.examples??={};row.examples[sample]??=path+'/'+field;}
  if(!Object.hasOwn(value,field)&&!row.first_missing)row.first_missing=sample+':'+path;
 }
}
for(const sample of samples){const doc=parseServerJson(await fs.readFile(new URL(sample,root)));assertSchema(doc,documentSchema,documentSchema);observe(doc,documentSchema,'$root','',sample);walk(doc,documentSchema,'',sample)}
// Include schema candidates not observed in these four outputs, without pretending they are absent or universal.
for(const [definition,schema]of Object.entries(documentSchema.$defs))for(const field of Object.keys(schema.properties||{}))if(consumed(definition,schema,field)&&!observations.has(definition+'.'+field))observations.set(definition+'.'+field,{definition,field,already_required:schema.required?.includes(field)===true,samples:Object.fromEntries(samples.map(s=>[s,{instances:0,present:0}]))});
const rows=[...observations.values()].sort((a,b)=>(a.definition+'.'+a.field).localeCompare(b.definition+'.'+b.field));
for(const r of rows){const stats=Object.values(r.samples),count=stats.reduce((n,s)=>n+s.instances,0),missing=stats.some(s=>s.instances!==s.present);r.decision=r.already_required?'already-required':missing?'optional-normal-omission':count?'promote-observed':'promote-unobserved-type';}
console.log(JSON.stringify({samples,rows,normal_absences:[...normalAbsences.values()]},null,2));
