// Only the browser learning modules; no converter, data loader or CLI dependencies.
import '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-core/dist/base_side_effects';
import '@tensorflow/tfjs-core/dist/register_all_gradients';
import '@tensorflow/tfjs-core/dist/public/chained_ops/register_all_chained_ops';
import '@tensorflow/tfjs-backend-cpu';
import '@tensorflow/tfjs-backend-webgl';
export * from '@tensorflow/tfjs-core';
export * from '@tensorflow/tfjs-layers';
