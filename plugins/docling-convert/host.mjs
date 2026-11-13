import {createService} from './service.mjs';
export function activate(context){
 const service=createService(context);
 return {operations:{
  defaults:()=>service.operations.defaults(),
  convert:input=>service.operations.convert(input),
  job:input=>service.operations.job(input),
  stop:input=>service.operations.stop(input),
  recover:input=>service.operations.recover(input)
 },status:()=>service.status(),dispose:()=>service.dispose()};
}
