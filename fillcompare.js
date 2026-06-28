// Compare grid fill speed under fixed vs pop-scaled birth threshold. No DB/canvas.
'use strict';
const fs = require('fs'); const path = require('path'); const vm = require('vm');
function ctx() {
    const c = vm.createContext({
        Math, Number, Array, Object, JSON, Infinity, NaN, isNaN, isFinite, parseInt, parseFloat, setTimeout, clearTimeout,
        window: { requestAnimationFrame(){}, io: undefined },
        document: { getElementById: () => ({ classList:{remove(){},add(){}}, value:'', innerText:'', checked:false }) },
        socket: { emit(){} }, console: { log(){}, warn(){}, error(){} },
        saveParametersToUI(){}, loadParametersFromUI(){}, loadNextRunParameters(){},
    });
    const load = f => { let s = fs.readFileSync(path.join(__dirname,f),'utf8')
        .replace(/^const\s+/gm,'var ').replace(/^let\s+/gm,'var ').replace(/^class\s+(\w+)/gm,'var $1 = class $1');
        vm.runInContext(s, c); };
    ['util.js','parameters.js','agent.js','village.js','world.js'].forEach(load);
    return c;
}
const CELLS = 8*8, EPOCH = 600;
const base = { spatial:true, epoch:EPOCH, idCounter:0, gridRows:8, gridCols:8, cap:40,
    seedVillages:6, seedPop:15, initialStock:5, pNoGather:0.10, pNoConsume:0.11,
    catastropheChance:0, deathChance:0.01, starveDeathChance:0.5, randomizeGenes:true };
const cases = [
    { label:'base20 + 0*pop',     p:{ birthThreshold:20, birthThresholdRate:0.0 } },  // flat (current)
    { label:'base20 + 0.5*pop',   p:{ birthThreshold:20, birthThresholdRate:0.5 } },
    { label:'base20 + 1*pop',     p:{ birthThreshold:20, birthThresholdRate:1.0 } },
    { label:'base0  + 1*pop',     p:{ birthThreshold:0,  birthThresholdRate:1.0 } },  // pure pop-scaling
    { label:'base20 + 2*pop',     p:{ birthThreshold:20, birthThresholdRate:2.0 } },
];
for (const cse of cases) {
    const c = ctx(); Object.assign(c.PARAMETERS, base, cse.p);
    let done=false; c.loadNextRunParameters = () => { done = true; };
    const w = vm.runInContext('new World()', c);
    const cp=[25,50,100,300,600], occ={}; let sat=null, t=0, guard=EPOCH+50;
    while(!done && guard-->0){ w.update(); t++;
        const o=w.villages().length;
        if(sat===null && o>=0.95*CELLS) sat=t;
        if(cp.includes(t)){ const pop=w.villages().reduce((a,v)=>a+v.pop,0); occ[t]=`${o}c/${pop}p`; }
    }
    console.log(cse.label.padEnd(16)+' | sat@'+String(sat??'never').padStart(5)+' | '+cp.map(k=>`t${k}:${occ[k]||'-'}`).join('  '));
}
