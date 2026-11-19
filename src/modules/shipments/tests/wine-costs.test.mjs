import './resolve.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {legacyShipment} from '../data/legacy.mjs';
const {shipmentWineCosts,withShipmentCosts}=await import('../data/wine-costs.ts');
const {calculate}=await import('../calculations/shipment-costing.ts');
const {cost,costBasis,metrics}=await import('../../wine-database/lib/model.ts');
const source=JSON.parse(readFileSync(new URL('../data/legacy-shipments.json',import.meta.url)));
const catalogue=JSON.parse(readFileSync(new URL('../../wine-database/data/catalogue.json',import.meta.url)));
const shipments=source.shipments.map(legacyShipment);
const fixture=()=>structuredClone(shipments.find(s=>s.name==='Golding / Hatch'));
const dated=s=>({...s,version:1,updatedAt:'2026-11-19T10:00:00Z'});
function snapshot(s,kind,date='2026-11-19T12:00:00Z') {
  return {id:kind,name:kind,kind,created:date,data:structuredClone(s),calculation:calculate(s)};
}
test('all imported shipment wines link by stable product ID, preserving frozen saved costs',()=>{
 const result=withShipmentCosts(catalogue.wines,shipments.map(dated));
 const ids=new Set(catalogue.wines.map(w=>w.id));
 for(const s of shipments)for(const w of s.wines)assert.ok(ids.has(w.productId));
 for(const s of shipments)for(const v of s.snapshots)for(const w of v.data.wines){
   const entry=result.find(x=>x.id===w.productId)?.shipmentCosts.history.find(x=>x.shipmentId===s.id&&x.versionId===v.id);
   assert.ok(entry);
   const line=v.calculation?.lines.find(l=>l.id===w.id);
   if(line)assert.equal(entry.total,line.cost);
 }
 const missing=result.find(w=>w.id===shipments.find(s=>s.name==='Marlborist 27').wines[0].productId);
 assert.equal(cost(missing),null); // Never use stale imported projections when inputs are missing.
 assert.equal(costBasis(missing),'Calculated');
 assert.equal(result.length,123);
 assert.deepEqual(result[0].importedCost,catalogue.wines[0].importedCost);
});
test('actuals supersede calculated costs; partial actuals are explicit and profit uses displayed basis',()=>{
 const s=dated(fixture()),id=s.wines[0].productId;
 s.snapshots=[snapshot(s,'Forecast','2026-11-17T12:00:00Z')];s.stage='ordered';
 const forecast=shipmentWineCosts([s]).get(id).calculated.cost;
 s.stage='actuals';s.fx=30;
 assert.equal(shipmentWineCosts([s]).get(id).actual,null,'opening or landing alone is not an actual');
 s.snapshots.push(snapshot(s,'Actual (partial)'));
 let wine={id,sellingPrice:1000,importedCost:{cost:1},shipmentCosts:shipmentWineCosts([s]).get(id)};
 assert.equal(costBasis(wine),'Actual · partial');assert.notEqual(cost(wine),forecast);
 assert.equal(metrics(wine).profit,1000-cost(wine));
 s.snapshots.push(snapshot(s,'Actual (complete)','2026-11-20T12:00:00Z'));s.stage='closed';
 wine={...wine,shipmentCosts:shipmentWineCosts([s]).get(id)};
 assert.equal(costBasis(wine),'Actual');assert.equal(wine.shipmentCosts.calculated.cost,forecast);
 assert.equal(wine.shipmentCosts.history.length,3);
});
test('repeated wines on different pallets use total cost divided by bottles, excluding VAT',()=>{
 const s=dated(fixture());s.wines=s.wines.slice(0,1);s.wines[0].qty=12;
 s.pallets=['Pallet 1','Pallet 2'];s.wines[0].pallet='Pallet 1';
 s.wines.push({...s.wines[0],id:'second-line',qty:24,pallet:'Pallet 2'});
 s.expenses=[{id:'fee',name:'Fee',category:'Other',pallet:'Pallet 1',status:'estimate',amount:120,vat:8.4,currency:'THB',fx:1,note:''}];
 const c=calculate(s);assert.deepEqual(c.errors,[]);
 const result=shipmentWineCosts([s]).get(s.wines[0].productId).calculated;
 assert.equal(result.bottles,36);assert.equal(result.total,c.total);
 assert.equal(result.cost,Math.round(c.total/36*100)/100);
 assert.notEqual(result.total,c.cash);assert.equal(result.currency,'THB');assert.equal(result.vatBasis,'ex-vat');
});
test('newest version wins deterministically, never an old cost made newer by a note edit',()=>{
 const a=dated(fixture());a.stage='ordered';a.snapshots=[snapshot(a,'Forecast','2026-01-01T00:00:00Z')];
 const b=structuredClone(a);b.id='new-shipment';b.fx=30;b.snapshots=[snapshot(b,'Forecast','2026-02-01T00:00:00Z')];
 a.updatedAt='2099-01-01T00:00:00Z';const id=a.wines[0].productId;
 assert.deepEqual(shipmentWineCosts([a,b]),shipmentWineCosts([b,a]));
 assert.equal(shipmentWineCosts([a,b]).get(id).calculated.shipmentId,b.id);
});
test('no name matching, no source mutation, and no silent fallback for an unknown recorded actual',()=>{
 const s=dated(fixture()),id=s.wines[0].productId;s.snapshots=[snapshot(s,'Actual (partial)')];s.stage='actuals';
 s.snapshots[0].calculation={...s.snapshots[0].calculation,errors:['Missing cost input.'],lines:[]};
 const before=JSON.stringify(s),costs=shipmentWineCosts([s]);
 assert.equal(cost({id,importedCost:{cost:999},shipmentCosts:costs.get(id)}),null);
 assert.equal(JSON.stringify(s),before);
 const wines=withShipmentCosts([{id:'same-name-different-id',name:s.wines[0].name,importedCost:{cost:100}}],[s]);
 assert.equal(wines[0].shipmentCosts.history.length,0);assert.equal(cost(wines[0]),100);
});
