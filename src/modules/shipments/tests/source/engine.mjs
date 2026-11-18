import {registeredPrice,validPrice} from './prices.mjs';
const validImageKey = value => typeof value === 'string' && /^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(value);
export const round = v => Math.round((v + Number.EPSILON) * 100) / 100;
export const uid = () => crypto.randomUUID();
export function allocate(amount, weights) {
  const cents = Math.round(amount * 100), total = weights.reduce((a,b)=>a+b,0);
  if (!total) return weights.map(()=>0);
  const exact=weights.map(w=>cents*w/total), parts=exact.map(Math.floor);
  const order=exact.map((v,i)=>({i,r:v-parts[i]})).sort((a,b)=>b.r-a.r||a.i-b.i);
  for(let n=cents-parts.reduce((a,b)=>a+b,0),i=0;i<n;i++) parts[order[i%order.length].i]++;
  return parts.map(c=>c/100);
}
// One value/volume excise formula for shipments, quick estimates and future scenarios.
export function excisePerUnit(w,rules){
 const {value,alcohol}=exciseComponents(w,rules);
 return value+alcohol;
}
export function exciseComponents(w,rules){
 const price=registeredPrice(w);
 return {value:validPrice(price)?price*rules.valueRate/100:NaN,alcohol:w.ml/1000*w.abv/100*rules.alcoholRate};
}
export function calculate(s) {
  const errors=[];
  if(!s.wines.length) errors.push('Add at least one wine.');
  if(!(s.fx>0)) errors.push('Supplier exchange rate must be greater than zero.');
  s.wines.forEach(w=>{
    if(!w.name.trim()||!w.producer.trim()) errors.push('Every wine needs a name and producer.');
    if(!(Number.isInteger(w.qty)&&w.qty>0&&w.caseSize>0&&Number.isInteger(w.caseSize)&&w.casePrice>=0&&w.discount>=0&&w.discount<=100&&w.abv>=0&&w.abv<=100&&w.ml>0)) errors.push(`${w.name}: check quantity, price, discount, bottle size and ABV.`);
    if(s.taxMode==='model'&&!validPrice(registeredPrice(w)))errors.push(`${w.name}: Registered Price needs review before costing or confirming this order.`);
    if(!s.pallets.includes(w.pallet)) errors.push(`${w.name}: choose an existing pallet.`);
    if(s.taxMode==='assessed' && w.assessedQty!==w.qty) errors.push(`${w.name}: quantity differs from the assessment. Update assessed taxes or use the model.`);
  });
  const net=s.wines.map(w=>w.qty/w.caseSize*w.casePrice*(1-w.discount/100));
  const goods=allocate(round(net.reduce((a,b)=>a+b,0)*s.fx),net);
  const lines=s.wines.map((w,i)=>{
    const excise=s.taxMode==='assessed'?w.excise:round(w.qty*(excisePerUnit(w,s.rules)));
    const local=s.taxMode==='assessed'?w.local:round(excise*s.rules.localRate/100);
    const funds=s.taxMode==='assessed'?w.funds:round(excise*.02)*3+round(excise*.015);
    return {id:w.id,qty:w.qty,netForeign:net[i],goods:goods[i],excise,local,funds:round(funds),tax:round(excise+local+funds+w.duty),shared:0,cost:0,unit:0};
  });
  const importVatMode=s.importVatMode==='recorded'?'recorded':'sku-7';
  const recordedVat=importVatMode==='recorded'?allocate(s.importVat,s.wines.map(w=>w.qty)):null;
  lines.forEach((l,i)=>{
    l.vatBase=round(l.goods+l.excise+l.local);
    l.importVat=recordedVat?recordedVat[i]:round(l.vatBase*.07);
  });
  const importVat=importVatMode==='recorded'?s.importVat:round(lines.reduce((a,l)=>a+l.importVat,0));
  let serviceVat=0,expenses=0;
  const allocations=[];
  s.expenses.forEach(e=>{
    if(!Number.isFinite(e.amount)||e.amount<0||!Number.isFinite(e.vat)||e.vat<0) errors.push(`${e.name}: costs and VAT must be zero or positive.`);
    const weights=s.wines.map(w=>e.pallet==='all'||w.pallet===e.pallet?w.qty:0);
    if(e.amount>0&&!weights.some(x=>x>0))errors.push(`${e.name}: its selected pallet has no bottles.`);
    const a=allocate(e.amount,weights); a.forEach((v,i)=>lines[i].shared=round(lines[i].shared+v));
    allocations.push({name:e.name,amount:e.amount,values:a});
    expenses+=e.amount;serviceVat+=e.vat;
  });
  lines.forEach(l=>{l.cost=round(l.goods+l.tax+l.shared);l.unit=l.cost/l.qty;});
  const total=round(lines.reduce((a,l)=>a+l.cost,0)),quantity=s.wines.reduce((a,w)=>a+w.qty,0);
  return {errors:[...new Set(errors)],lines,allocations,quantity,goods:round(goods.reduce((a,b)=>a+b,0)),tax:round(lines.reduce((a,l)=>a+l.tax,0)),expenses:round(expenses),importVat,importVatMode,serviceVat:round(serviceVat),vat:round(importVat+serviceVat),total,cash:round(total+importVat+serviceVat),average:quantity?total/quantity:0,estimated:s.expenses.filter(e=>e.status==='estimate').length};
}
export function validateImport(data){
  if(data?.format!=='gs-import-review-v1'||!Array.isArray(data.shipments)||data.shipments.length>100)throw Error('Choose a GS Import review JSON file (maximum 100 shipments).');
  const identifier=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
  if(data.catalog!==undefined){
    if(!Array.isArray(data.catalog)||data.catalog.length>20000)throw Error('Invalid wine library.');
    for(const p of data.catalog){
      if(p.registeredPrice!==undefined&&p.registeredPrice!==null&&!validPrice(p.registeredPrice))throw Error('Invalid Registered Price.');
      if(data.schemaVersion>=3&&!Object.hasOwn(p,'registeredPrice'))throw Error('Registered Price field is required; reload the workspace.');
      if(p.caseSize!==undefined&&(!Number.isSafeInteger(p.caseSize)||p.caseSize<1))throw Error('Invalid library case size.');
      if(p.imageKey!==undefined&&p.imageKey!==null&&!validImageKey(p.imageKey))throw Error('Invalid bottle image reference.');
      if(!identifier(p.id)||!['name','producer','vintage','variety','currency','country','sku','sourceNote'].every(k=>typeof p[k]==='string'))throw Error('Invalid library wine details.');
      if(!['abv','ml','sourceCost','landedReference'].every(k=>p[k]===null||Number.isFinite(p[k])&&p[k]>=0)||!['rrp','discount','sellingPrice'].every(k=>Number.isFinite(p[k])&&p[k]>=0))throw Error('Invalid library prices or units.');
    }
  }
  data.shipments.forEach(s=>{
    if(!s||typeof s.id!=='string'||typeof s.name!=='string'||!Array.isArray(s.wines)||s.wines.length>1000||!Array.isArray(s.expenses)||!Array.isArray(s.pallets)||!s.pallets.every(p=>typeof p==='string')||!s.rules||!Array.isArray(s.snapshots)||!Array.isArray(s.notes))throw Error('Invalid shipment structure.');
    if(!identifier(s.id)||!['model','assessed'].includes(s.taxMode)||![s.fx,s.importVat,s.rules.valueRate,s.rules.alcoholRate,s.rules.localRate].every(v=>Number.isFinite(v)&&v>=0)||!s.fx||!Array.isArray(s.reviewFlags)||!s.reviewFlags.every(v=>typeof v==='string')||!['name','reference','currency','incoterm'].every(k=>typeof s[k]==='string'))throw Error('Invalid shipment fields.');
    if(s.importVatMode!==undefined&&!['sku-7','recorded'].includes(s.importVatMode))throw Error('Invalid import VAT calculation mode.');
    s.wines.forEach(w=>{
      if(w.registeredPrice!==undefined&&w.registeredPrice!==null&&!validPrice(w.registeredPrice))throw Error('Invalid shipment Registered Price.');
      if(w.productId!==undefined&&!identifier(w.productId))throw Error('Invalid library link.');
      if(!identifier(w.id)||!['name','producer','pallet','sku','vintage','country'].every(k=>typeof w[k]==='string')||!['qty','caseSize','casePrice','discount','abv','ml','rrp','excise','local','funds','duty','assessedQty'].every(k=>Number.isFinite(w[k])&&w[k]>=0)||!w.prices||!Object.values(w.prices).every(v=>Number.isFinite(v)&&v>=0))throw Error('Invalid wine record.');
      if(!Number.isInteger(w.qty)||w.qty<=0||!Number.isInteger(w.caseSize)||w.caseSize<=0||!w.ml||w.discount>100||w.abv>100)throw Error('Invalid wine quantity or conversion.');
    });
    s.expenses.forEach(e=>{if(!identifier(e.id)||!['name','pallet','note'].every(k=>typeof e[k]==='string')||!['estimate','actual'].includes(e.status)||![e.amount,e.vat].every(v=>Number.isFinite(v)&&v>=0))throw Error('Invalid expense record.');});
    // Saved data is untrusted: derive all calculations when loaded, never execute content.
    s.snapshots.forEach(v=>{if(!identifier(v.id)||!v.data||typeof v.name!=='string'||!Number.isFinite(Date.parse(v.created))||!['Forecast','Actual (partial)','Actual (complete)'].includes(v.kind)||typeof v.note!=='string')throw Error('Invalid saved version.');validateImport({format:'gs-import-review-v1',shipments:[{...v.data,snapshots:[],notes:[]}]});});
    s.notes.forEach(n=>{if(typeof n.text!=='string'||typeof n.author!=='string'||!Number.isFinite(Date.parse(n.created)))throw Error('Invalid review note.');});
    // Incomplete drafts (including new empty shipments) must survive reload/export.
  });
  return data;
}
