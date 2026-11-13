// Deliberately bounded JSON Schema interpreter for the checked-in public schemas.
// No default insertion, coercion, or removal of fields. Unknown assertions fail closed.
const annotations=new Set(['title','description','default','examples','deprecated','discriminator','readOnly','$defs','components','$schema','$id']);
const assertions=new Set(['$ref','type','const','enum','anyOf','oneOf','allOf','properties','required','additionalProperties','items','prefixItems','minItems','maxItems','uniqueItems','minimum','maximum','exclusiveMinimum','exclusiveMaximum','minLength','maxLength','pattern','format']);
const isRaw=x=>x!==null&&typeof x==='object'&&JSON.isRawJSON(x);
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&!isRaw(x);
const numeric=x=>isRaw(x)?BigInt(x.rawJSON):x;
const integer=x=>isRaw(x)?/^\d+$/.test(x.rawJSON):Number.isSafeInteger(x);
export function resolveSchema(root,ref){
 if(!ref.startsWith('#/'))throw Error('External schema reference refused');
 let s=root;for(const key of ref.slice(2).split('/'))s=s?.[key.replace(/~1/g,'/').replace(/~0/g,'~')];
 if(!s)throw Error('Missing schema reference '+ref);return s;
}
export function assertSchema(value,schema,root=schema,at='$'){
 const fail=message=>{throw Error('Schema '+at+': '+message)};
 if(schema===true)return;if(schema===false)fail('not allowed');
 for(const key of Object.keys(schema))if(!assertions.has(key)&&!annotations.has(key))fail('unsupported schema keyword '+key);
 if(schema.$ref)assertSchema(value,resolveSchema(root,schema.$ref),root,at);
 for(const kind of ['anyOf','oneOf','allOf'])if(schema[kind]){
  let matches=0;for(const branch of schema[kind])try{assertSchema(value,branch,root,at);matches++}catch{}
  if(kind==='anyOf'&&matches<1||kind==='oneOf'&&matches!==1||kind==='allOf'&&matches!==schema[kind].length)fail(kind);
 }
 if(schema.type){const allowed=Array.isArray(schema.type)?schema.type:[schema.type];
  const matches=t=>t==='object'?isObject(value):t==='array'?Array.isArray(value):t==='integer'?integer(value):t==='number'?integer(value)||typeof value==='number'&&Number.isFinite(value):t==='null'?value===null:typeof value===t;
  if(!allowed.some(matches))fail('expected '+allowed.join('|'));
 }
 if('const'in schema&&JSON.stringify(value)!==JSON.stringify(schema.const))fail('const');
 if(schema.enum&&!schema.enum.some(v=>JSON.stringify(v)===JSON.stringify(value)))fail('enum');
 if(isObject(value)){
  for(const key of schema.required||[])if(!Object.hasOwn(value,key))fail('required '+key);
  for(const [key,child]of Object.entries(value)){
   if(Object.hasOwn(schema.properties||{},key))assertSchema(child,schema.properties[key],root,at+'/'+key);
   else if(schema.additionalProperties===false)fail('unknown field '+key);
   else if(isObject(schema.additionalProperties))assertSchema(child,schema.additionalProperties,root,at+'/'+key);
  }
 }
 if(Array.isArray(value)){
  if('minItems'in schema&&value.length<schema.minItems||'maxItems'in schema&&value.length>schema.maxItems)fail('array length');
  if(schema.uniqueItems&&new Set(value.map(v=>JSON.stringify(v))).size!==value.length)fail('uniqueItems');
  value.forEach((v,i)=>{const item=schema.prefixItems?.[i]??schema.items;if(item!==undefined)assertSchema(v,item,root,at+'/'+i)});
 }
 if(typeof value==='string'){
  if('minLength'in schema&&[...value].length<schema.minLength||'maxLength'in schema&&[...value].length>schema.maxLength)fail('string length');
  // Python-generated patterns use Unicode \w, whereas JS \w is ASCII.
  if(schema.pattern&&!new RegExp(schema.pattern.replace(/\(\?P</g,'(?<').replace(/\\w/g,'\\p{L}\\p{N}_'),'u').test(value))fail('pattern');
  if(schema.format==='uri'){try{new URL(value)}catch{fail('URI')}}
  else if(schema.format==='date-time'&&!Number.isFinite(Date.parse(value)))fail('date-time');
  else if(schema.format&&!['path','date-time','uri'].includes(schema.format))fail('unsupported format '+schema.format);
 }
 if(integer(value)||typeof value==='number')for(const k of ['minimum','maximum','exclusiveMinimum','exclusiveMaximum'])if(k in schema){
  const a=numeric(value),b=numeric(schema[k]);if(k==='minimum'&&a<b||k==='maximum'&&a>b||k==='exclusiveMinimum'&&a<=b||k==='exclusiveMaximum'&&a>=b)fail(k);
 }
}
