// Small Elman RNN, tanh recurrence, linear output, full BPTT within each window.
// CPU training runs in a Worker; artifacts are plain, versioned JSON.
export function randomGenerator(seed = 42) {
  let n = seed >>> 0;
  return () => { n = (Math.imul(1664525, n) + 1013904223) >>> 0; return n / 4294967296; };
}
export function initialize(hidden = 8, seed = 42) {
  const random = randomGenerator(seed), weights = size => Array.from({ length:size }, () => (random() - .5) * .3);
  return { hidden, wx:weights(hidden * 2), wh:weights(hidden * hidden), bh:Array(hidden).fill(0), wy:weights(2 * hidden), by:[0,0] };
}
export function forward(model, sequence) {
  const h = model.hidden, states = [Array(h).fill(0)];
  for (const x of sequence) {
    const previous = states.at(-1), state = Array(h);
    for (let j=0;j<h;j++) {
      let z = model.bh[j] + model.wx[j*2] * x[0] + model.wx[j*2+1] * x[1];
      for (let k=0;k<h;k++) z += model.wh[j*h+k] * previous[k];
      state[j] = Math.tanh(z);
    }
    states.push(state);
  }
  const output = model.by.slice(), last = states.at(-1);
  for (let k=0;k<2;k++) for (let j=0;j<h;j++) output[k] += model.wy[k*h+j] * last[j];
  return { output, states };
}
export const zeroGradient = model => Object.fromEntries(['wx','wh','bh','wy','by'].map(key => [key,Array(model[key].length).fill(0)]));
export function lossGradient(model, sequence, target) {
  const {output,states} = forward(model,sequence), h = model.hidden, gradient = zeroGradient(model);
  const error = output.map((v,k) => v-target[k]);
  let dh = Array(h).fill(0);
  for (let k=0;k<2;k++) {
    gradient.by[k] = error[k];
    for (let j=0;j<h;j++) { gradient.wy[k*h+j] = error[k]*states.at(-1)[j]; dh[j] += model.wy[k*h+j]*error[k]; }
  }
  for (let t=sequence.length-1;t>=0;t--) {
    const dt = dh.map((v,j) => v*(1-states[t+1][j]**2)), next = Array(h).fill(0);
    for (let j=0;j<h;j++) {
      gradient.bh[j] += dt[j];
      for (let k=0;k<2;k++) gradient.wx[j*2+k] += dt[j]*sequence[t][k];
      for (let k=0;k<h;k++) { gradient.wh[j*h+k] += dt[j]*states[t][k]; next[k] += model.wh[j*h+k]*dt[j]; }
    }
    dh = next;
  }
  return { loss:(error[0]**2+error[1]**2)/2, gradient };
}
const mse = (model, samples) => samples.reduce((sum,s) => sum + forward(model,s.x).output.reduce((v,p,k)=>v+(p-s.y[k])**2,0)/2,0) / samples.length;
export function fitRnn(train,validation,{epochs=40,hidden=8,seed=42,learningRate=.003,onProgress=()=>{}}={}) {
  let model=initialize(hidden,seed), best=structuredClone(model), bestLoss=Infinity, patience=0, updates=0;
  const first=zeroGradient(model), second=zeroGradient(model), random=randomGenerator(seed+1), curve=[];
  for(let epoch=1;epoch<=epochs;epoch++) {
    const order=Array.from({length:train.length},(_,i)=>i);
    for(let i=order.length-1;i>0;i--) {const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    for(let offset=0;offset<order.length;offset+=32) {
      const gradient=zeroGradient(model), batch=order.slice(offset,offset+32);
      for(const index of batch) {
        const result=lossGradient(model,train[index].x,train[index].y);
        for(const key of Object.keys(gradient)) for(let i=0;i<gradient[key].length;i++) gradient[key][i]+=result.gradient[key][i]/batch.length;
      }
      updates++;
      for(const key of Object.keys(gradient)) for(let i=0;i<gradient[key].length;i++) {
        const g=Math.max(-5,Math.min(5,gradient[key][i]));
        first[key][i]=.9*first[key][i]+.1*g; second[key][i]=.999*second[key][i]+.001*g*g;
        model[key][i]-=learningRate*(first[key][i]/(1-.9**updates))/(Math.sqrt(second[key][i]/(1-.999**updates))+1e-8);
      }
    }
    const validationLoss=mse(model,validation), trainingLoss=mse(model,train);
    if(!Number.isFinite(validationLoss)||!Number.isFinite(trainingLoss)) throw new Error('Huấn luyện không hội tụ; kiểm tra dữ liệu.');
    curve.push({epoch,train_mse:trainingLoss,validation_mse:validationLoss});onProgress({epoch,epochs,trainingLoss,validationLoss});
    if(validationLoss<bestLoss-1e-7){bestLoss=validationLoss;best=structuredClone(model);patience=0;}else if(++patience>=6)break;
  }
  return {model:best,curve,best_validation_mse:bestLoss};
}
