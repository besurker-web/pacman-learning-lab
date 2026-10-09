import * as tf from './tensorflow';
export async function initializeBackend() {
  if(typeof OffscreenCanvas!=='undefined') {
    try { if(await tf.setBackend('webgl')) {await tf.ready();return 'WebGL';} }catch{/* CPU works without graphics support. */}
  }
  await tf.setBackend('cpu');await tf.ready();return 'CPU';
}
