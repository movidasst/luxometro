// Business-behavior regression tests. Isolated DOM doubles; no authentication or network calls.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture(){
  const elements=new Map(),events=[],pending=[],stored=new Map();
  function element(id){
    if(elements.has(id))return elements.get(id);
    const classes=new Set();
    const el={textContent:'',innerHTML:'',hidden:false,value:'',disabled:false,checked:false,options:[{}],style:{setProperty(){}},dataset:{},children:[],
      classList:{add(...x){x.forEach(v=>classes.add(v));},remove(...x){x.forEach(v=>classes.delete(v));},contains(x){return classes.has(x);},toggle(x,on){on??=!classes.has(x);on?classes.add(x):classes.delete(x);}},
      setAttribute(k,v){this[k]=v;},addEventListener(){},querySelectorAll(){return[];},querySelector(sel){return element(id+sel);},replaceChildren(...x){this.children=x;},append(...x){this.children.push(...x);}};
    elements.set(id,el);return el;
  }
  const document={readyState:'loading',hidden:false,body:element('body'),getElementById:element,querySelector:element,querySelectorAll(){return[];},createElement(){return element('new'+elements.size);},addEventListener(){},dispatchEvent:e=>events.push(e)};
  const ctx={document,console,performance:{now:()=>0},Date,Math,Number,JSON,Set,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},navigator:{},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},setTimeout:fn=>{pending.push(fn);return pending.length;},setInterval(){},clearInterval(){},clearTimeout(){},sessionStorage:{getItem(){return null;}}};
  ctx.window={dispatchEvent:e=>events.push(e),addEventListener(){}};
  let code=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
  code=code.replace('  init();', '  window.testAPI={state,resetMeasurements,canRecord,recordGridPoint,recordCyl,gridStats,zeroMeter,conditionSensor,toggleCover,powerToggle,updateInstrument,emitProgress,saveEvaluation,changeUnit};');
  vm.runInNewContext(code,ctx);
  return {...ctx.window.testAPI,element,events,pending,stored,flush:async()=>{while(pending.length){pending.shift()();await Promise.resolve();}}};
}

function prepared(f){Object.assign(f.state,{powered:true,conditioned:true,zeroed:true,coverOn:false,currentLux:500});}
test('registro bloquea preparación incompleta, OL, REL y mala posición',()=>{const f=fixture();assert.equal(f.canRecord(500),false);prepared(f);assert.equal(f.canRecord(500),true);for(const [k,v] of [['range','20'],['rel',true],['hold',true],['angle',30],['position','shadow']]){const old=f.state[k];f.state[k]=v;assert.equal(f.canRecord(500),false,k);f.state[k]=old;}});
test('ZERO se cancela al destapar durante el ajuste',async()=>{const f=fixture();prepared(f);f.state.coverOn=true;f.zeroMeter();f.toggleCover();await f.flush();assert.equal(f.state.zeroed,false);assert.equal(f.state.currentLux,null);});
test('estabilización se cancela al cubrir el sensor',async()=>{const f=fixture();f.state.powered=true;f.conditionSensor();f.toggleCover();await f.flush();assert.equal(f.state.conditioned,false);assert.equal(f.state.conditioning,false);});
test('reiniciar condiciones elimina puntos anteriores y extremos',()=>{const f=fixture();prepared(f);Object.assign(f.state.grid,{rows:1,cols:2,generated:true,readings:[400,600]});f.resetMeasurements();assert.equal(f.gridStats(),null);assert.equal(f.state.grid.readings.length,2);assert.equal(f.state.currentLux,null);});
test('OL absoluto no se oculta con una referencia REL',()=>{const f=fixture();prepared(f);Object.assign(f.state,{range:'200',rel:true,relReferenceLux:500});f.updateInstrument();assert.equal(f.element('mainReading').textContent,'OL');});
test('promedio y uniformidad calculados con puntos válidos',()=>{const f=fixture();f.state.grid.readings=[400,500,600,500];const g=f.gridStats();assert.equal(g.avg,500);assert.equal(g.uo,.8);assert.equal(g.count,g.total);});
test('evaluación incompleta no se guarda',()=>{const f=fixture();f.state.grid.readings=[500,null];f.saveEvaluation();assert.equal(f.state.memories.length,0);});
test('guía recibe finalización real de ZERO incluso sin clic corto',async()=>{const f=fixture();prepared(f);f.state.coverOn=true;f.zeroMeter();await f.flush();assert.equal(f.state.zeroed,true);const e=f.events.filter(e=>e.type==='lux:state').at(-1);assert.equal(e.detail.zeroed,true);assert.equal(e.detail.measured,false);});
test('rango insuficiente no añade un punto',()=>{const f=fixture();prepared(f);Object.assign(f.state.grid,{rows:1,cols:1,generated:true,readings:[null]});f.state.range='20';f.recordGridPoint(0);assert.equal(f.gridStats(),null);});
