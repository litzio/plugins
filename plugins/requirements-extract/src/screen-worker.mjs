import {workerData,parentPort} from 'node:worker_threads';
import {screenService} from './screen-service.mjs';
try {parentPort.postMessage({ok:true,result:await screenService(workerData.context)[workerData.method](...(workerData.args??[]))});}
catch(e){parentPort.postMessage({ok:false,diagnostics:e.diagnostics?.map(d=>({code:d.code,severity:d.severity,message:d.message,location:d.location}))??[{code:/^[a-z0-9-]+$/.test(e.message)?e.message:'operation-failed',severity:'error',message:'처리를 완료하지 못했습니다'}]});}
