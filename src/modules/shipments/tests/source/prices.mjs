// Shared price semantics. Legacy reads are only for unchanged historical records.
export const PRICE_SCHEMA_VERSION=3;
export const validPrice=v=>Number.isFinite(v)&&v>=0;
export function registeredPrice(w){return Object.hasOwn(w,'registeredPrice')?w.registeredPrice:w.rrp;}
export function migratePrices(data){
 for(const p of data.catalog||[]){
  if(Object.hasOwn(p,'registeredPrice'))continue;
  // The spreadsheet importer duplicated its commercial column into rrp.
  // A positive value explicitly entered in the old manual-record form is distinct evidence.
  const known=p.sourceNote==='Manually created library record.'&&validPrice(p.rrp)&&p.rrp>0;
  p.registeredPrice=known?p.rrp:null;
  p.registeredPriceSource=known?'Legacy Registered Price entry':'Needs review: legacy imported price was copied from Sales Price';
 }
 for(const s of data.shipments||[]){
  if((s.stage||'proposed')!=='proposed'||s.taxMode!=='model')continue;
  for(const w of s.wines){
   if(Object.hasOwn(w,'registeredPrice'))continue;
   const p=data.catalog?.find(p=>p.id===(w.productId||w.id));
   w.registeredPrice=p?.registeredPrice??null;
   w.registeredPriceSource='library';
  }
 }
 data.schemaVersion=PRICE_SCHEMA_VERSION;return data;
}
export function setRegisteredPrice(data,p,value){
 if(value!==null&&!validPrice(value))throw Error('Enter a valid Registered Price or leave it blank for review.');
 p.registeredPrice=value;p.registeredPriceSource=value===null?'Needs review':'Confirmed manual entry';
 for(const s of data.shipments){
  if((s.stage||'proposed')!=='proposed'||s.taxMode!=='model')continue;
  for(const w of s.wines)if((w.productId||w.id)===p.id&&w.registeredPriceSource==='library')w.registeredPrice=value;
 }
}
export function recommendedSalesPrice(cost){return validPrice(cost)?Math.round((cost*1.5+Number.EPSILON)*100)/100:null;}
export function profitability(salesPrice,cost){
 if(!validPrice(salesPrice)||!validPrice(cost))return {profit:null,margin:null,markup:null};
 const profit=salesPrice-cost;
 return {profit,margin:salesPrice>0?profit/salesPrice*100:null,markup:cost>0?profit/cost*100:null};
}
