// Explicit import adapter. Never loaded as an application fallback.
import { createHash } from 'node:crypto';
import { calculate as originalCalculate } from '../tests/source/engine.mjs';
const amount=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
export function legacyData(source){
  return {
    id:source.id,name:source.name,supplier:source.supplier??'',reference:source.reference??'',currency:source.currency,fx:amount(source.fx),incoterm:source.incoterm??'',
    stage:source.stage==='arrived'?'actuals':source.stage??'proposed',arrivalDate:source.arrivalDate??'',orderDate:source.orderDate??'',expectedDate:source.expectedDate??'',
    taxMode:source.taxMode,importVatMode:source.importVatMode??(['ordered','closed'].includes(source.stage)?'recorded':'sku-7'),importVat:amount(source.importVat),rules:structuredClone(source.rules),pallets:[...source.pallets],
    forecastId:source.forecastId??null,actualConfirmed:source.actualConfirmed??false,
    wines:source.wines.map(w=>({...w,productId:w.productId??w.id,variety:w.variety??'',imageUrl:null,registeredPrice:amount(Object.hasOwn(w,'registeredPrice')?w.registeredPrice:w.rrp),salesPrice:amount(w.prices?.Wholesale)})),
    expenses:source.expenses.map(e=>({...e,category:e.category??'Other',currency:e.currency??'THB',fx:e.fx??1})),
  };
}
export function legacyShipment(source){
  const shipment={...legacyData(source),version:0,updatedAt:null,snapshots:source.snapshots.map(v=>{
    const original={...v.data,importVatMode:v.data.importVatMode??'recorded'}, result=originalCalculate(original);
    const {average,...calculation}=result;void average;
    calculation.source=original.wines.reduce((n,w)=>n+w.qty/w.caseSize*w.casePrice*(1-w.discount/100),0);
    calculation.lines=calculation.lines.map((line,i)=>({...line,duty:original.wines[i].duty}));
    return {...v,data:legacyData(original),...(result.errors.length?{}:{calculation})};
  }),notes:source.notes.map((n,i)=>({...n,id:n.id??'legacy-'+createHash('sha256').update(source.id+':'+i+':'+JSON.stringify(n)).digest('hex').slice(0,32)}))};
  // Original snapshots can predate forecastId/orderDate fields. Never infer prices.
  if(!shipment.orderDate&&shipment.forecastId){const v=shipment.snapshots.find(v=>v.id===shipment.forecastId);shipment.orderDate=v?.created?.slice(0,10)??'';}
  return shipment;
}
