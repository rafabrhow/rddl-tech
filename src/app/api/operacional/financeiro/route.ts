import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import { FieldValue, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function authorize(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new Error("UNAUTHORIZED");
  const decoded = await getAdminAuth().verifyIdToken(token, true);
  if (decoded.role !== "admin" || decoded.ativo !== true || typeof decoded.empresaId !== "string" || !decoded.empresaId.trim()) throw new Error("FORBIDDEN");
  const db = getAdminDb(); const company = await db.collection("empresas").doc(decoded.empresaId).get();
  if (!company.exists) throw new Error("COMPANY_NOT_FOUND");
  const data = company.data() ?? {}; const trialEnd = data.trialEndsAt?.toDate?.()?.getTime?.() ?? 0;
  if (data.status !== "ativa" && !(data.status === "em_teste" && trialEnd > Date.now())) throw new Error("SUBSCRIPTION_BLOCKED");
  return { db, empresaId: decoded.empresaId, uid: decoded.uid };
}
const clean=(v:unknown,max=180)=>typeof v==="string"?v.trim().slice(0,max):"";

async function getAllDocuments(query: Query, pageSize = 500) {
 const documents: QueryDocumentSnapshot[] = [];
 let cursor: QueryDocumentSnapshot | undefined;
 while (true) {
  let pageQuery = query.limit(pageSize);
  if (cursor) pageQuery = pageQuery.startAfter(cursor);
  const page = await pageQuery.get();
  documents.push(...page.docs);
  if (page.size < pageSize) break;
  cursor = page.docs[page.docs.length - 1];
 }
 return documents;
}

function serializeValue(value: any): any {
 if (value == null) return value;
 if (typeof value?.toDate === "function") return value.toDate().toISOString();
 if (Array.isArray(value)) return value.map(serializeValue);
 if (typeof value === "object" && !(value instanceof Date)) {
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serializeValue(nested)]));
 }
 if (value instanceof Date) return value.toISOString();
 return value;
}
function serializeDoc(doc: { id: string; data: () => Record<string, any> | undefined }) {
 return { id: doc.id, ...serializeValue(doc.data() ?? {}) };
}
function fail(error:unknown){const code=error instanceof Error?error.message:"";const status=code==="UNAUTHORIZED"?401:code==="FORBIDDEN"||code==="SUBSCRIPTION_BLOCKED"?403:code==="COMPANY_NOT_FOUND"?404:["MONTH_ALREADY_CLOSED","MONTH_NOT_CLOSED","TITHE_ALREADY_PAID","NO_TITHE_DUE","TITHE_AMOUNT_MISMATCH"].includes(code)?409:400;return NextResponse.json({error:status===401?"Sessão não informada.":status===403?"Acesso não autorizado ou assinatura inativa.":status===404?"Assistência não encontrada.":code==="MONTH_ALREADY_CLOSED"?"Esta competência já foi fechada.":code==="MONTH_NOT_CLOSED"?"Feche a competência antes de registrar o pagamento.":code==="TITHE_ALREADY_PAID"?"O pagamento deste dízimo já foi registrado.":code==="NO_TITHE_DUE"?"Não existe dízimo pendente nesta competência.":code==="TITHE_AMOUNT_MISMATCH"?"O valor informado precisa corresponder exatamente ao dízimo apurado no fechamento.":"Não foi possível concluir a operação."},{status});}
export async function GET(request:NextRequest){
 try { const {db,empresaId}=await authorize(request); const root=db.collection("empresas").doc(empresaId);
 const [sales,expenses,orders,reversals,tithe,closings]=await Promise.all([
 getAllDocuments(root.collection("vendas").orderBy("createdAtServer","desc")),
 getAllDocuments(root.collection("despesas").orderBy("createdAtServer","desc")),
 getAllDocuments(root.collection("ordensServico").where("status","==","Entregue")),
 getAllDocuments(root.collection("estornos").orderBy("createdAtServer","desc")),
 root.collection("configuracoes").doc("dizimo").get(),
 getAllDocuments(root.collection("fechamentosFinanceiros").orderBy("closedAtServer","desc"))
 ]);
 const auth = getAdminAuth();
 const userCache = new Map<string, Promise<{ name: string; email: string }>>();
 const serializedReversals = await Promise.all(reversals.map(async doc => {
  const item = serializeDoc(doc);
  if ((!item.createdByName || !item.createdByEmail) && typeof item.createdBy === "string") {
   if (!userCache.has(item.createdBy)) userCache.set(item.createdBy, auth.getUser(item.createdBy).then(user => ({ name: user.displayName || user.email || item.createdBy, email: user.email || "" })).catch(() => ({ name: item.createdBy, email: "" })));
   const user = await userCache.get(item.createdBy)!;
   item.createdByName = item.createdByName || user.name;
   item.createdByEmail = item.createdByEmail || user.email;
  }
  return item;
 }));
 return NextResponse.json({sales:sales.map(serializeDoc),expenses:expenses.map(serializeDoc),orders:orders.map(serializeDoc),reversals:serializedReversals,tithe:serializeValue(tithe.data()||{}),closings:closings.map(serializeDoc)},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return fail(e);}
}
export async function POST(request:NextRequest){
 try {const {db,empresaId,uid}=await authorize(request);const body=await request.json();const root=db.collection("empresas").doc(empresaId);
 if(body.action==="expense"){
  const description=clean(body.description),category=clean(body.category,80),amount=Number(body.amount),date=clean(body.date,10);
  if(!description||!Number.isFinite(amount)||amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date))return NextResponse.json({error:"Informe descrição, data e valor válido."},{status:400});
  const ref=root.collection("despesas").doc();
  const createdAt=new Date().toISOString();
  const history=[{action:"created",at:createdAt,by:uid,summary:"Despesa registrada"}];
  const data={description,category:category||"Geral",amount,date,status:"active",history,createdAtServer:FieldValue.serverTimestamp(),createdBy:uid};
  await ref.set(data);
  return NextResponse.json({expense:{id:ref.id,...data,createdAtServer:createdAt}},{status:201});
 }
 if(body.action==="expense-update"){
  const id=clean(body.id,180),description=clean(body.description),category=clean(body.category,80),amount=Number(body.amount),date=clean(body.date,10);
  if(!id||!description||!Number.isFinite(amount)||amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date))return NextResponse.json({error:"Confira descrição, data e valor da despesa."},{status:400});
  const ref=root.collection("despesas").doc(id),snapshot=await ref.get();
  if(!snapshot.exists)return NextResponse.json({error:"Despesa não encontrada."},{status:404});
  const current=snapshot.data()||{};
  if(current.status==="cancelled")return NextResponse.json({error:"Uma despesa cancelada não pode ser editada."},{status:409});
  const before={description:current.description||"",category:current.category||"Geral",amount:Number(current.amount||0),date:current.date||""};
  const after={description,category:category||"Geral",amount,date};
  const changed=Object.keys(after).some(key=>String((before as any)[key])!==String((after as any)[key]));
  if(!changed)return NextResponse.json({expense:{id,...current}});
  const historyEntry={action:"updated",at:new Date().toISOString(),by:uid,summary:"Despesa editada",before,after};
  await ref.update({...after,updatedAt:FieldValue.serverTimestamp(),updatedBy:uid,history:FieldValue.arrayUnion(historyEntry)});
  const updated=await ref.get();
  return NextResponse.json({expense:serializeDoc(updated)});
 }
 if(body.action==="expense-cancel"){
  const id=clean(body.id,180),reason=clean(body.reason,240);
  if(!id)return NextResponse.json({error:"Despesa não informada."},{status:400});
  const ref=root.collection("despesas").doc(id),snapshot=await ref.get();
  if(!snapshot.exists)return NextResponse.json({error:"Despesa não encontrada."},{status:404});
  const current=snapshot.data()||{};
  if(current.status==="cancelled")return NextResponse.json({error:"Esta despesa já está cancelada."},{status:409});
  const cancelledAt=new Date().toISOString();
  const historyEntry={action:"cancelled",at:cancelledAt,by:uid,summary:"Despesa cancelada",reason:reason||"Cancelamento solicitado pelo administrador"};
  await ref.update({status:"cancelled",cancelledAt:FieldValue.serverTimestamp(),cancelledBy:uid,cancellationReason:reason||"Cancelamento solicitado pelo administrador",history:FieldValue.arrayUnion(historyEntry)});
  const updated=await ref.get();
  return NextResponse.json({expense:serializeDoc(updated)});
 }

 if(body.action==="close-month"){
  const month=clean(body.month,7);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return NextResponse.json({error:"Mês inválido."},{status:400});
  const [year,monthNumber]=month.split("-").map(Number);
  const end=new Date(Date.UTC(year,monthNumber,1));
  if(Date.now()<end.getTime())return NextResponse.json({error:"A competência só pode ser fechada após o último dia do mês."},{status:409});
  const monthOf=(value:any):string=>{
   if(!value)return "";
   const date=typeof value?.toDate==="function"?value.toDate():value instanceof Date?value:new Date(value);
   return Number.isNaN(date.getTime())?"":`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`;
  };
  const [sales,orders,expenses,reversals]=await Promise.all([
   getAllDocuments(root.collection("vendas").orderBy("createdAtServer","desc")),
   getAllDocuments(root.collection("ordensServico").where("status","==","Entregue")),
   getAllDocuments(root.collection("despesas")),
   getAllDocuments(root.collection("estornos").orderBy("createdAtServer","desc"))
  ]);
  const monthSales=sales.map(serializeDoc).filter((item:any)=>monthOf(item.createdAtServer||item.createdAt)===month);
  const monthOrders=orders.map(serializeDoc).filter((item:any)=>monthOf(item.deliveredAt||item.createdAt)===month);
  const monthExpenses=expenses.map(serializeDoc).filter((item:any)=>item.status!=="cancelled"&&monthOf(item.date)===month);
  const monthReversals=reversals.map(serializeDoc).filter((item:any)=>monthOf(item.createdAtServer||item.createdAt)===month);
  const reversedOrders=monthReversals.filter((item:any)=>item.type==="os");
  const reversedSales=monthReversals.filter((item:any)=>item.type==="pdv");
  const sum=(items:any[],pick:(item:any)=>number)=>items.reduce((total,item)=>total+Number(pick(item)||0),0);
  const laborGross=sum(monthOrders,(item:any)=>item.laborProfit??item.laborValue??item.value??0);
  const partsGross=sum(monthOrders,(item:any)=>item.partsProfit||0);
  const pdvGross=sum(monthSales,(item:any)=>item.profit||0);
  const laborReversed=sum(reversedOrders,(item:any)=>item.laborReversed||0);
  const partsReversed=sum(reversedOrders,(item:any)=>item.partsProfitReversed||0);
  const pdvReversed=sum(reversedSales,(item:any)=>item.profitReversed||0);
  const gross=laborGross+partsGross+pdvGross;
  const reversalsTotal=laborReversed+partsReversed+pdvReversed;
  const net=Math.max(0,gross-reversalsTotal);
  const titheAmount=Math.round(net*10)/100;
  const expensesTotal=sum(monthExpenses,(item:any)=>item.amount||0);
  const snapshot={
   month, closedAt:new Date().toISOString(), closedBy:uid,
   totals:{laborGross,partsGross,pdvGross,gross,laborReversed,partsReversed,pdvReversed,reversalsTotal,net,titheRate:0.10,titheAmount,expenses:expensesTotal,balance:net-titheAmount-expensesTotal},
   counts:{sales:monthSales.length,orders:monthOrders.length,expenses:monthExpenses.length,reversals:monthReversals.length},
   tithe:{amount:titheAmount,status:"pending"},
   sourceIds:{sales:monthSales.map((item:any)=>item.id),orders:monthOrders.map((item:any)=>item.id),expenses:monthExpenses.map((item:any)=>item.id),reversals:monthReversals.map((item:any)=>item.id)}
  };
  const closeRef=root.collection("fechamentosFinanceiros").doc(month);
  await db.runTransaction(async tx=>{
   const existing=await tx.get(closeRef);
   const titheRef=root.collection("configuracoes").doc("dizimo");
   const titheSnap=await tx.get(titheRef);
   if(existing.exists)throw new Error("MONTH_ALREADY_CLOSED");
   const previous=(titheSnap.data()||{})[month]||{};
   const previousPayment=previous.paid?{paid:true,paidAt:previous.paidAt||null,paidAmount:Number(previous.paidAmount||0),legacy:true}:null;
   tx.create(closeRef,{...snapshot,previousPayment,closedAtServer:FieldValue.serverTimestamp()});
   tx.set(titheRef,{[month]:{closed:true,closedAt:snapshot.closedAt,closedBy:uid,dueAmount:titheAmount,status:"pending",closeId:closeRef.id,previousPayment}},{merge:true});
  });
  return NextResponse.json({closed:true,closing:snapshot},{status:201,headers:{"Cache-Control":"no-store"}});
 }
 if(body.action==="tithe-status"){
  const month=clean(body.month,7),status=clean(body.status,20),amount=Number(body.amount);
  if(!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month))return NextResponse.json({error:"Mês inválido."},{status:400});
  if(status!=="paid")return NextResponse.json({error:"O dízimo só pode ser pago após o fechamento mensal."},{status:409});
  if(!Number.isFinite(amount)||amount<=0)return NextResponse.json({error:"Informe o valor pago do dízimo."},{status:400});
  const closingRef=root.collection("fechamentosFinanceiros").doc(month);
  const titheRef=root.collection("configuracoes").doc("dizimo");
  const now=new Date().toISOString();
  let update:any;
  await db.runTransaction(async tx=>{
   const [closingSnap,titheSnap]=await Promise.all([tx.get(closingRef),tx.get(titheRef)]);
   if(!closingSnap.exists)throw new Error("MONTH_NOT_CLOSED");
   const closing=closingSnap.data()||{};
   const due=Number(closing.totals?.titheAmount||0);
   const existing=(titheSnap.data()||{})[month]||{};
   if(existing.paid||existing.status==="paid")throw new Error("TITHE_ALREADY_PAID");
   if(due<=0)throw new Error("NO_TITHE_DUE");
   if(Math.abs(amount-due)>0.01)throw new Error("TITHE_AMOUNT_MISMATCH");
   update={paid:true,paidAt:now,paidAmount:due,updatedBy:uid,status:"paid",closed:true,closedAt:closing.closedAt||null,closedBy:closing.closedBy||null,dueAmount:due,closeId:closingRef.id};
   tx.set(titheRef,{[month]:update},{merge:true});
  });
  return NextResponse.json({saved:true,record:update});
 }
 return NextResponse.json({error:"Ação financeira inválida."},{status:400});
 }catch(e){return fail(e);}
}
