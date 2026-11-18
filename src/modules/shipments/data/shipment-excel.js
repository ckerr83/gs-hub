import { zipFiles } from './zip.ts';
import { D } from '../calculations/decimal.ts';
// A compact OOXML workbook for the supplier order, independent of landed-cost taxes.
const xml=v=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const round=v=>Math.round((v+Number.EPSILON)*100)/100;
const pre='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export function shipmentExportName(s){return (s.name||'Shipment').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/[. ]+$/,'').slice(0,100)+' - '+s.currency+'.xlsx';}
export function shipmentWorkbookParts(s){
 if(!s?.wines?.length)throw Error('Add wines to this shipment before exporting.');
 if(!/^[A-Z]{3}$/.test(s.currency))throw Error('Set the shipment source currency before exporting.');
 for(const w of s.wines)if(!s.pallets.includes(w.pallet)||!Number.isSafeInteger(w.qty)||w.qty<1||!Number.isSafeInteger(w.caseSize)||w.caseSize<1||!Number.isFinite(w.casePrice)||w.casePrice<0||!Number.isFinite(w.discount)||w.discount<0||w.discount>100)throw Error(`Check source price, quantity, case size and pallet for ${w.name}.`);
 const rows=[],merges=[],totals=[];let row=0;
 const text=(col,value,style=0)=>({col,value,style});
 const number=(col,value,style=3,formula)=>({col,value,style,formula});
 const add=(cells,height=30)=>{row++;rows.push(`<row r="${row}" ht="${height}" customHeight="1">${cells.map(c=>{const ref=c.col+row;return typeof c.value==='number'?`<c r="${ref}" s="${c.style}">${c.formula?`<f>${xml(c.formula)}</f>`:''}<v>${c.value}</v></c>`:`<c r="${ref}" s="${c.style}" t="inlineStr"><is><t xml:space="preserve">${xml(c.value)}</t></is></c>`;}).join('')}</row>`);return row;};
 const merged=(value,style,height=28)=>{const n=add([text('A',value,style)],height);merges.push(`A${n}:H${n}`);};
 merged(s.name,1,34);
 merged(`GS Import · ${s.reference||'No reference'} · ${s.currency} · ${s.stage||'proposed'}`,5,24);
 merged('Supplier goods only. Source cost / bottle is after discounts; shipping, import taxes and VAT are excluded.',5,30);
 add([],10);
 const headers=['Wine','Producer','Vintage',`Source / bottle (${s.currency})`,'Bottles / case','Cases','Bottles',`SKU cost (${s.currency})`];
 for(const pallet of s.pallets){
  const wines=s.wines.filter(w=>w.pallet===pallet);
  merged(pallet,2);
  add(headers.map((v,i)=>text(String.fromCharCode(65+i),v,2)),34);
  const first=row+1;let cases=0,bottles=0,cost=0;
  for(const w of wines){
   const exact=D(w.casePrice).div(D(w.caseSize)).mul(D(1).sub(D(w.discount).div(D(100)))),unit=exact.number(),amount=exact.mul(D(w.qty)).money(),r=row+1;
   add([text('A',w.name),text('B',w.producer),text('C',w.vintage),number('D',unit,4),number('E',w.caseSize),number('F',w.qty/w.caseSize,7,`G${r}/E${r}`),number('G',w.qty),number('H',amount,6,`ROUND(D${r}*G${r},2)`)],Math.max(30,15*Math.max(Math.ceil(String(w.name).length/28),Math.ceil(String(w.producer).length/24))));
   cases+=w.qty/w.caseSize;bottles+=w.qty;cost=round(cost+amount);
  }
  if(!wines.length)merged('No wines on this pallet',5);
  const last=row;
  const totalRow=add([text('A',`${pallet} total`,8),number('F',cases,10,wines.length?`SUM(F${first}:F${last})`:'0'),number('G',bottles,9,wines.length?`SUM(G${first}:G${last})`:'0'),number('H',cost,11,wines.length?`SUM(H${first}:H${last})`:'0')],30);
  merges.push(`A${totalRow}:E${totalRow}`);totals.push({row:totalRow,cases,bottles,cost});add([],14);
 }
 const sum=k=>totals.reduce((a,t)=>a+t[k],0),formula=col=>`SUM(${totals.map(t=>col+t.row).join(',')})`;
 const grand=add([text('A',`Shipment total (${s.currency})`,8),number('F',sum('cases'),10,formula('F')),number('G',sum('bottles'),9,formula('G')),number('H',round(sum('cost')),11,formula('H'))],34);merges.push(`A${grand}:E${grand}`);
 const sheet=pre+`<worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:H${row}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="30"/><cols>${[34,29,12,19,15,12,13,22].map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
 const xf=(font=0,fill=0,format=0,border=0)=>`<xf numFmtId="${format}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyAlignment="1" applyFill="1" applyFont="1" applyBorder="1"><alignment vertical="center" wrapText="1"${format?' horizontal="right"':''}/></xf>`;
 const styles=pre+`<styleSheet xmlns="${ns}"><numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.0000"/><numFmt numFmtId="165" formatCode="#,##0.00"/><numFmt numFmtId="166" formatCode="#,##0.##"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="18"/><color rgb="FF703545"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF703545"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3E9EC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF703545"/></top><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="12">${[xf(),xf(1),xf(2,2),xf(0,0,3),xf(0,0,164),xf(),xf(0,0,165),xf(0,0,166),xf(3,3,0,1),xf(3,3,3,1),xf(3,3,166,1),xf(3,3,165,1)].join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
 return {
  '[Content_Types].xml':pre+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  '_rels/.rels':pre+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':pre+`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Shipment" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
  'xl/_rels/workbook.xml.rels':pre+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  'xl/styles.xml':styles,'xl/worksheets/sheet1.xml':sheet
 };
}
export async function shipmentXlsx(s){ return zipFiles(shipmentWorkbookParts(s)); }
