import * as tf from './tensorflow';
import type { Dashboard } from './types';
import { Agent } from './rl';
export interface Checkpoint { version:1; online:tf.io.ModelArtifacts; target:tf.io.ModelArtifacts; decisions:number; updates:number; dashboard:Dashboard; savedAt:string }
async function artifacts(model:tf.LayersModel) {
  let result:tf.io.ModelArtifacts|undefined;
  await model.save(tf.io.withSaveHandler(async data=>{result=data;return {modelArtifactsInfo:{dateSaved:new Date(),modelTopologyType:'JSON'}};}));
  if(!result) throw new Error('Unable to serialize model');
  return result;
}
export async function capture(agent:Agent,dashboard:Dashboard):Promise<Checkpoint> {
  return {version:1,online:await artifacts(agent.online),target:await artifacts(agent.target),decisions:agent.decisions,updates:agent.updates,dashboard,savedAt:new Date().toISOString()};
}
export function validate(cp:Checkpoint) {
  if(cp?.version!==1 || !Number.isSafeInteger(cp.decisions)||cp.decisions<0 || !Number.isSafeInteger(cp.updates)||cp.updates<0 || !cp.online?.modelTopology || !cp.target?.modelTopology) throw new Error('This is not a compatible Learning Lab backup.');
  const d=cp.dashboard;
  if(!d || !Array.isArray(d.history)||d.history.length>500 || !['1','5','max'].includes(d.speed) || ![d.games,d.deaths,d.timeouts,d.best,d.nextSeed].every(n=>Number.isSafeInteger(n)&&n>=0) || !d.history.every(e=>[e.score,e.deaths,e.reward,e.seconds,e.clears].every(Number.isFinite)&&typeof e.timeout==='boolean')) throw new Error('Backup statistics are invalid.');
  if(d.evaluation!==null&&(!d.evaluation||d.evaluation.games!==20||![d.evaluation.learned,d.evaluation.random].every(e=>e&&[e.score,e.seconds,e.clears].every(n=>Number.isFinite(n)&&n>=0)))) throw new Error('Backup evaluation is invalid.');
}
function decodeFixedWeights(source:tf.io.ModelArtifacts,destination:tf.LayersModel) {
  if(!source.weightSpecs||!source.weightData||Array.isArray(source.weightData)) throw new Error('Missing model weights');
  const expected=destination.getWeights();
  if(source.weightSpecs.length!==expected.length) throw new Error('Incompatible model weights');
  let expectedBytes=0;
  const specs=expected.map((tensor,index)=> {
    const supplied=source.weightSpecs![index];
    if(tensor.dtype!=='float32'||supplied.dtype!=='float32'||!Array.isArray(supplied.shape)||supplied.shape.length!==tensor.shape.length||supplied.shape.some((size,axis)=>!Number.isSafeInteger(size)||size!==tensor.shape[axis])) throw new Error('Incompatible model weights');
    expectedBytes+=tensor.size*4;
    return {name:`weight-${index}`,shape:[...tensor.shape],dtype:'float32' as const};
  });
  if(source.weightData.byteLength!==expectedBytes) throw new Error('Incompatible model weights');
  const decoded=tf.io.decodeWeights(source.weightData,specs);
  const ordered=specs.map(spec=>decoded[spec.name]);
  try {
    if(ordered.some(tensor=>Array.from(tensor.dataSync()).some(value=>!Number.isFinite(value)))) throw new Error('Invalid model weights');
    destination.setWeights(ordered);
  } finally {Object.values(decoded).forEach(tensor=>tensor.dispose());}
}
export async function restore(cp:Checkpoint) {
  validate(cp);
  const candidate=new Agent();
  try {
    // Fixed architecture: never execute an imported model topology or custom layer.
    for(const [source,destination] of [[cp.online,candidate.online],[cp.target,candidate.target]] as const) decodeFixedWeights(source,destination);
    candidate.decisions=cp.decisions;candidate.updates=cp.updates;
    return candidate;
  } catch(error){candidate.dispose();throw error;}
}
async function db() {
  return new Promise<IDBDatabase>((resolve,reject)=> {
    const request=indexedDB.open('pacman-learning-lab',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('checkpoints');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
export async function storage(mode:'read'|'write'|'delete',value?:Checkpoint):Promise<Checkpoint|undefined> {
  const database=await db();
  try {
    return await new Promise((resolve,reject)=> {
      const tx=database.transaction('checkpoints',mode==='read'?'readonly':'readwrite');
      const store=tx.objectStore('checkpoints');
      const request=mode==='read'?store.get('latest'):mode==='write'?store.put(value,'latest'):store.delete('latest');
      // Online weights, target weights and metadata commit together in one transaction.
      tx.oncomplete=()=>resolve(mode==='read'?request.result:undefined);
      tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('Saving was interrupted'));
    });
  } finally {database.close();}
}
function encode(buffer:ArrayBuffer) {let s='';const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
function decode(text:string){const s=atob(text);return Uint8Array.from(s,c=>c.charCodeAt(0)).buffer;}
export function exportJSON(cp:Checkpoint) {
  return JSON.stringify(cp,(_key,value)=>value instanceof ArrayBuffer?{binary:encode(value)}:value);
}
export function importJSON(text:string):Checkpoint {
  if(text.length>30_000_000) throw new Error('Backup exceeds the 30 MB limit');
  const cp=JSON.parse(text,(_key,value)=>value&&typeof value==='object'&&typeof value.binary==='string'?decode(value.binary):value);
  validate(cp);return cp;
}
