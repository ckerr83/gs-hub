import './resolve.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {calculate}=await import('../calculations/shipment-costing.ts');
const {D,allocate}=await import('../calculations/decimal.ts');
import {calculate as original} from './source/engine.mjs';
import {legacyShipment} from '../data/legacy.mjs';
const {newShipment,applyAction,completed,productLine}=await import('../data/model.ts');
const {validShipment}=await import('../data/validation.ts');
const legacy=JSON.parse(readFileSync(new URL('../data/legacy-shipments.json',import.meta.url),'utf8'));
const fixture=()=>legacyShipment(legacy.shipments[0]);
test('original calculations match the audited decimal differences; frozen results remain exact',()=>{
 const expected=JSON.parse(readFileSync(new URL('../docs/decimal-comparison.json',import.meta.url),'utf8'));
 const differences=[];let checked=0;
 for(const source of legacy.shipments){const normalized=legacyShipment(source);for(const [a,b,label] of [[source,normalized,'current'],...source.snapshots.map((v,i)=>[v.data,normalized.snapshots[i].data,v.name])]){const x=original(a),y=calculate(b);if(x.errors.length||y.errors.length)continue;checked++;for(const key of ['goods','tax','expenses','importVat','serviceVat','vat','total','cash'])if(x[key]!==y[key])differences.push({shipment:source.name,label,field:key,old:x[key],next:y[key]});for(let i=0;i<x.lines.length;i++)for(const key of ['goods','excise','funds','local','tax','shared','cost','importVat'])if(x.lines[i][key]!==y.lines[i][key])differences.push({shipment:source.name,label,line:i,field:key,old:x.lines[i][key],next:y.lines[i][key]});}
 for(let i=0;i<source.snapshots.length;i++){const originalCost=original({...source.snapshots[i].data,importVatMode:source.snapshots[i].data.importVatMode??'recorded'}),saved=normalized.snapshots[i].calculation;assert.equal(saved.cash,originalCost.cash);for(let j=0;j<saved.lines.length;j++)assert.equal(saved.lines[j].cost,originalCost.lines[j].cost);}
 }
 assert.equal(checked,27);assert.deepEqual(differences,expected.differences);
});
test('decimal rounding and allocation preserve cents, scoped pallets and foreign expenses',()=>{
 assert.equal(D('1.005').money(),1.01);assert.equal(D('999999.995').money(),1000000);
 for(const amount of ['0.01','5000','21272.96'])assert.equal(D(allocate(D(amount),[1,3,7].map(D)).reduce((n,x)=>n+x,0)).money(),Number(amount));
 const s=fixture();s.pallets.push('Second');s.wines[0].pallet='Second';s.expenses=[{id:'test',name:'Freight',category:'International freight',currency:'USD',fx:33.1234,amount:100.01,vat:7,pallet:'Second',status:'actual',note:''}];const c=calculate(s);assert.deepEqual(c.errors,[]);assert.equal(c.expenses,3312.67);assert.equal(c.lines[0].shared,3312.67);assert.equal(c.lines[1].shared,0);assert.equal(c.serviceVat,231.86);assert.equal(D(c.lines.reduce((n,l)=>n+l.cost,0)).money(),c.total);assert.equal(D(c.total).add(D(c.vat)).money(),c.cash);
});
test('missing inputs remain unknown; registered price never falls back to sales price',()=>{const s=fixture();s.taxMode='model';s.wines[0].registeredPrice=null;s.wines[0].salesPrice=9999;assert.equal(calculate(s).total,null);assert.ok(calculate(s).errors.includes('Registered Price is required for forecast taxes.'));s.wines[0].registeredPrice=0;s.wines[0].duty=null;assert.equal(calculate(s).total,null);});
test('assessment quantity changes require explicit tax review',()=>{const s=fixture();s.wines[0].qty++;assert.equal(calculate(s).total,null);assert.ok(calculate(s).errors.some(e=>e.includes('assessed taxes')));});
test('per-wine VAT rounding preserves original formula and excludes funds, duty and freight',()=>{const s=fixture();s.wines=s.wines.slice(0,2).map(w=>({...w,qty:1,assessedQty:1,caseSize:1,casePrice:.05,discount:0,excise:0,local:0,funds:0,duty:0}));s.fx=1;s.expenses=[];s.importVatMode='sku-7';assert.equal(calculate(s).importVat,0);s.wines[0].duty=500;s.wines[0].funds=100;assert.equal(calculate(s).importVat,0);});
test('arrival classification is independent from compared status and preserves forecasts',()=>{
 const s=fixture();s.stage='proposed';s.arrivalDate='';s.version=1;s.forecastId=null;s.snapshots=[];s.orderDate='';s.wines.forEach(w=>w.qty=Math.ceil(w.qty/w.caseSize)*w.caseSize);s.taxMode='model';s.wines.forEach(w=>w.registeredPrice??=690);
 const ordered=applyAction(s,s,'confirm');const frozen=JSON.stringify(ordered.snapshots[0]);const actual=applyAction(ordered,ordered,'actuals');assert.equal(completed(actual),false);const landed=applyAction(actual,actual,'land',{date:'2026-11-15'});assert.equal(completed(landed),true);assert.equal(landed.stage,'actuals');const edited=structuredClone(landed);edited.fx=40;const saved=applyAction(landed,edited,'save');assert.equal(JSON.stringify(saved.snapshots[0]),frozen);assert.throws(()=>applyAction(landed,{...edited,version:0},'save'),/conflict/);
});
test('complete actuals require explicit verification and expense assessments; no library mutation',()=>{const s=fixture();s.stage='actuals';s.actualConfirmed=false;assert.throws(()=>applyAction(s,s,'complete'),/Verify all/);s.actualConfirmed=true;s.expenses.forEach(e=>e.status='actual');const done=applyAction(s,s,'complete');assert.equal(done.stage,'closed');assert.equal(done.snapshots.at(-1).kind,'Actual (complete)');const p={id:'product',name:'Wine',producer:'Producer',vintage:'2026',sku:'A',country:'Chile',variety:'Red',imageUrl:null,caseSize:12,sourceCost:10,discount:0,abv:13,ml:750,registeredPrice:690,sellingPrice:890};const item=productLine(p,'Pallet 1');p.sourceCost=99;assert.equal(item.casePrice,120);assert.equal(item.registeredPrice,690);assert.equal(item.salesPrice,890);});
test('draft validation rejects malformed data without rejecting null financial fields',()=>{const s=newShipment();s.name='Draft';s.currency='USD';assert.equal(validShipment(s),true);assert.equal(calculate(s).total,null);s.expectedDate='2026-99-99';assert.equal(validShipment(s),false);});
