import PDFDocument from 'pdfkit';
import Decimal from 'decimal.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const font=require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff');
const currency=v=>'₹ '+new Decimal(v||0).toFixed(2);
export function renderPdf(kind,data){return new Promise((resolve,reject)=>{
 const doc=new PDFDocument({size:'A4',margin:48,bufferPages:true,info:{Title:kind==='invoice'?data.invoice_number:data.receipt_number,Author:'Photography Studio'}});
 const chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
 try{
 doc.font(font);const studio=kind==='invoice'?data.studio_snapshot:data.studio;
 const customer=kind==='invoice'?data.customer_snapshot:{name:data.customer_name,mobile:data.mobile,email:data.email,address:data.address};
 const paragraph=(value,size=10,color='#4b607c')=>{doc.fontSize(size).fillColor(color).text(String(value||''),{width:499});doc.moveDown(.5);};
 doc.roundedRect(38,34,519,8,4).fill('#4e8ce9');doc.y=58;
 paragraph(studio.name,23,'#27476e');paragraph(studio.address);paragraph([studio.phone,studio.email].filter(Boolean).join('  ·  '));
 doc.moveDown();paragraph(kind==='invoice'?'INVOICE':'PAYMENT RECEIPT',20,'#3979e8');
 paragraph(kind==='invoice'?data.invoice_number:data.receipt_number,12);
 paragraph(`Booking #${data.booking_id}  |  ${kind==='invoice'?'Invoice date: '+data.invoice_date+'  |  Due: '+data.due_date:'Payment date: '+data.date}`);
 if(kind==='invoice')paragraph(`Status: ${data.status==='Void'?'VOID':data.payment_status}`,11,data.status==='Void'?'#b34848':'#4b607c');
 doc.moveDown();paragraph('CUSTOMER',9,'#7491b5');paragraph(customer.name,13,'#27476e');paragraph([customer.mobile,customer.email].filter(Boolean).join('  ·  '));paragraph(customer.address);doc.moveDown();
 const ensure=height=>{if(doc.y+height>doc.page.height-90){doc.addPage();doc.font(font);}};
 const pair=(label,value)=>{ensure(28);const y=doc.y;doc.fontSize(10).fillColor('#6d819e').text(label,48,y,{width:320});doc.fillColor('#27476e').text(String(value),370,y,{width:175,align:'right'});doc.y=y+25;};
 if(kind==='invoice'){
  paragraph('ITEMS',10,'#3979e8');
  for(const item of data.items){const height=doc.heightOfString(item.description,{width:300})+46;ensure(height);const y=doc.y;doc.fontSize(11).fillColor('#27476e').text(item.description,48,y,{width:300});const bottom=doc.y;doc.fontSize(11).text(currency(item.line_total),365,y,{width:180,align:'right'});doc.y=Math.max(bottom,doc.y)+7;paragraph(`${item.quantity} × ${currency(item.unit_price)}`,9);doc.moveTo(48,doc.y).lineTo(547,doc.y).strokeColor('#e6edf7').stroke();doc.y+=12;}
  pair('Subtotal',currency(data.subtotal));pair('Discount',currency(data.discount));pair('Tax','Not applied');pair('Invoice total',currency(data.total_amount));pair('Payments received for booking',currency(data.paid_amount));pair(data.status==='Void'?'Invoice balance (void)':'Outstanding balance',currency(data.balance_amount));
  if(data.status==='Void')paragraph('Voided: '+data.void_reason,10,'#b34848');
  if(data.terms){ensure(55);paragraph('TERMS',9,'#7491b5');paragraph(data.terms);}
 }else{
  pair('Payment ID','#'+data.id);pair('Payment method',data.method);pair('Transaction reference',data.reference||'—');pair('Amount received',currency(data.amount));pair('Booking total',currency(data.agreed_amount));pair('Total booking receipts',currency(data.paid_amount));pair('Current outstanding balance',currency(new Decimal(data.agreed_amount).minus(data.paid_amount)));
  if(data.remarks)paragraph(data.remarks);
  ensure(80);doc.y+=40;paragraph('____________________________',10);paragraph('Authorized signature',9);paragraph('This receipt acknowledges an existing payment; it does not create a new charge.',9);
 }
 const range=doc.bufferedPageRange();for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;doc.fontSize(8).fillColor('#8b9bb2').text(`Thank you for choosing ${studio.name}.  ·  ${i+1} / ${range.count}`,48,doc.page.height-38,{width:499,align:'center'});}
 doc.end();
 }catch(error){doc.destroy();reject(error);}
 });}
