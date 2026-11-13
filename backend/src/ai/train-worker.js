import { parentPort, workerData } from 'node:worker_threads';
import { trainSensor } from './sensor-model.js';
try {
  const result=trainSensor(workerData.rows,workerData.options,progress=>parentPort.postMessage({type:'progress',progress}));
  parentPort.postMessage({type:'done',result});
} catch(error){parentPort.postMessage({type:'failed',error:error.message});}
