import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import { FieldValue, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORDER_STATUSES = ["Recebido", "Em diagnóstico", "Aguardando aprovação", "Aguardando peça", "Em conserto", "Pronto", "Entregue", "Cancelado"] as const;
const BUDGET_APPROVALS = ["Não enviado", "Aguardando aprovação", "Aprovado", "Recusado"] as const;

async function authorize(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new Error("UNAUTHORIZED");
  const decoded = await getAdminAuth().verifyIdToken(token, true);
  if (decoded.role !== "admin" || decoded.ativo !== true || typeof decoded.empresaId !== "string" || !decoded.empresaId.trim()) throw new Error("FORBIDDEN");
  const db = getAdminDb();
  const company = await db.collection("empresas").doc(decoded.empresaId).get();
  if (!company.exists) throw new Error("COMPANY_NOT_FOUND");
  const data = company.data() ?? {};
  const trialEnd = data.trialEndsAt?.toDate?.()?.getTime?.() ?? 0;
  if (data.status !== "ativa" && !(data.status === "em_teste" && trialEnd > Date.now())) throw new Error("SUBSCRIPTION_BLOCKED");
  return { decoded, db, empresaId: decoded.empresaId };
}
function authError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" || code === "SUBSCRIPTION_BLOCKED" ? 403 : code === "COMPANY_NOT_FOUND" || code === "ORDER_NOT_FOUND" ? 404 : code === "INVALID_ORDER" || code === "INVALID_UPDATE" ? 400 : code === "ORDER_LOCKED" || code === "INVALID_TRANSITION" || code === "BUDGET_LOCKED" ? 409 : 500;
  const message = code === "UNAUTHORIZED" ? "Sessão não informada." : code === "FORBIDDEN" ? "Acesso restrito ao administrador da assistência." : code === "COMPANY_NOT_FOUND" ? "Assistência não encontrada." : code === "SUBSCRIPTION_BLOCKED" ? "Assinatura inativa ou período de teste encerrado." : code === "ORDER_NOT_FOUND" ? "Ordem de serviço não encontrada." : code === "INVALID_ORDER" ? "Confira os dados obrigatórios da ordem de serviço." : code === "INVALID_UPDATE" ? "Os dados enviados para atualização são inválidos." : code === "ORDER_LOCKED" ? "Esta OS já foi entregue, cancelada ou estornada e não pode mais ser alterada." : code === "INVALID_TRANSITION" ? "Não é permitido reabrir uma OS entregue ou cancelada." : code === "BUDGET_LOCKED" ? "O orçamento não pode ser alterado depois da aprovação ou da baixa das peças." : "Não foi possível concluir a operação.";
  return NextResponse.json({ error: message }, { status });
}

async function getAllDocuments(query: Query, pageSize = 500) {
  const documents: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  while (true) { let pageQuery = query.limit(pageSize); if (cursor) pageQuery = pageQuery.startAfter(cursor); const page = await pageQuery.get(); documents.push(...page.docs); if (page.size < pageSize) break; cursor = page.docs[page.docs.length - 1]; }
  return documents;
}
const clean = (value: unknown, max = 300) => typeof value === "string" ? value.trim().slice(0, max) : "";
const isMoney = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const EDITABLE_FIELDS = [
  "customerId", "customer", "phone", "device", "issue", "status", "value", "technician", "photos",
  "imei", "color", "physicalCondition", "accessories", "estimatedDelivery", "technicalDiagnosis",
  "identifiedDefect", "serviceRequired", "technicalNotes", "budgetItems", "laborValue", "discountValue",
  "budgetApproval", "serviceCompleted", "finalTests", "deliveryNotes", "deliveredTo", "deliveredAt",
  "warrantyDays", "warrantyUntil",
] as const;

export async function GET(request: NextRequest) {
  try {
    const { db, empresaId } = await authorize(request);
    const docs = await getAllDocuments(db.collection("empresas").doc(empresaId).collection("ordensServico").orderBy("createdAtServer", "desc"));
    return NextResponse.json({ orders: docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return authError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { db, empresaId, decoded } = await authorize(request);
    const body = await request.json();
    const customerId = clean(body.customerId, 150);
    if (!customerId || !clean(body.device, 180) || !clean(body.issue, 1000) || !clean(body.technician, 120) || !isMoney(Number(body.value))) throw new Error("INVALID_ORDER");
    const customerSnap = await db.collection("empresas").doc(empresaId).collection("clientes").doc(customerId).get();
    if (!customerSnap.exists) return NextResponse.json({ error: "Cliente não encontrado nesta assistência." }, { status: 404 });
    const customerData = customerSnap.data() ?? {};
    const counterRef = db.collection("empresas").doc(empresaId).collection("configuracoes").doc("contadores");
    const existingOrders = await db.collection("empresas").doc(empresaId).collection("ordensServico").select("id").get();
    const highestExisting = existingOrders.docs.reduce((highest, doc) => {
      const match = String(doc.data().id || doc.id).match(/^OS-(\d+)$/);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 1048);
    const id = await db.runTransaction(async tx => {
      const counter = await tx.get(counterRef);
      const next = Math.max(1049, highestExisting + 1, Number(counter.data()?.proximaOS || 1049));
      tx.set(counterRef, { proximaOS: next + 1 }, { merge: true });
      return `OS-${next}`;
    });
    const orderRef = db.collection("empresas").doc(empresaId).collection("ordensServico").doc(id);
    const data: Record<string, unknown> = {
      id, customerId, customer: clean(customerData.name, 160), phone: clean(customerData.phone, 40),
      device: clean(body.device, 180), issue: clean(body.issue, 1000), status: "Recebido", value: Number(body.value),
      createdAt: clean(body.createdAt, 30) || new Date().toLocaleDateString("pt-BR"),
      technician: clean(body.technician, 120), photos: Array.isArray(body.photos) ? body.photos.slice(0, 5) : [],
      imei: clean(body.imei, 80), color: clean(body.color, 80), physicalCondition: clean(body.physicalCondition, 500),
      accessories: clean(body.accessories, 500), estimatedDelivery: clean(body.estimatedDelivery, 30),
      history: [], createdAtServer: FieldValue.serverTimestamp(), createdBy: decoded.uid, updatedAt: FieldValue.serverTimestamp(),
    };
    await orderRef.create(data);
    return NextResponse.json({ order: { ...data, createdAtServer: new Date().toISOString() } }, { status: 201 });
  } catch (error) { return authError(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const { db, empresaId, decoded } = await authorize(request);
    const body = await request.json();
    const id = clean(body.id, 150);
    if (!id) throw new Error("INVALID_UPDATE");
    const root = db.collection("empresas").doc(empresaId);
    const ref = root.collection("ordensServico").doc(id);

    const patch: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) if (Object.prototype.hasOwnProperty.call(body, field)) patch[field] = body[field];
    if (!Object.keys(patch).length && !Array.isArray(body.history)) throw new Error("INVALID_UPDATE");
    if (patch.status !== undefined && (typeof patch.status !== "string" || !ORDER_STATUSES.includes(patch.status as typeof ORDER_STATUSES[number]))) throw new Error("INVALID_UPDATE");
    if (patch.budgetApproval !== undefined && (typeof patch.budgetApproval !== "string" || !BUDGET_APPROVALS.includes(patch.budgetApproval as typeof BUDGET_APPROVALS[number]))) throw new Error("INVALID_UPDATE");
    for (const field of ["value", "laborValue", "discountValue"] as const) if (patch[field] !== undefined && !isMoney(patch[field])) throw new Error("INVALID_UPDATE");
    if (patch.budgetItems !== undefined) {
      if (!Array.isArray(patch.budgetItems) || patch.budgetItems.length > 50 || patch.budgetItems.some((item: any) => !clean(item?.description, 200) || !Number.isInteger(Number(item?.quantity)) || Number(item.quantity) <= 0 || !isMoney(Number(item?.unitPrice)) || (item.stockItemId !== undefined && typeof item.stockItemId !== "string"))) throw new Error("INVALID_UPDATE");
      patch.budgetItems = patch.budgetItems.map((item: any) => ({ id: clean(item.id, 100), description: clean(item.description, 200), quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), ...(clean(item.stockItemId, 150) ? { stockItemId: clean(item.stockItemId, 150) } : {}) }));
    }
    if (patch.photos !== undefined && (!Array.isArray(patch.photos) || patch.photos.length > 5)) throw new Error("INVALID_UPDATE");

    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("ORDER_NOT_FOUND");
      const current = snap.data() ?? {};
      if (current.status === "Entregue" || current.status === "Cancelado" || current.financialReversedAt || current.financialReversalId) throw new Error("ORDER_LOCKED");
      if (patch.status !== undefined && (current.status === "Entregue" || current.status === "Cancelado")) throw new Error("INVALID_TRANSITION");

      const changedFields = Object.keys(patch).filter(field => JSON.stringify(patch[field]) !== JSON.stringify(current[field]));
      const budgetFields = ["budgetItems", "laborValue", "discountValue", "value", "budgetApproval"];
      if (current.stockDeductedAt && budgetFields.some(field => changedFields.includes(field))) throw new Error("BUDGET_LOCKED");
      if (["Aprovado", "Recusado"].includes(String(current.budgetApproval || "")) && changedFields.includes("budgetApproval") && patch.budgetApproval !== current.budgetApproval) throw new Error("BUDGET_LOCKED");
      if (changedFields.includes("budgetApproval") && (patch.budgetApproval === "Aprovado" || patch.budgetApproval === "Recusado")) {
        if (current.budgetApproval === "Aprovado" || current.budgetApproval === "Recusado") throw new Error("BUDGET_LOCKED");
        patch.budgetDecisionAt = new Date().toLocaleString("pt-BR");
        patch.budgetDecisionBy = decoded.uid;
      }

      // O formulário envia a OS completa. Só revalidamos o vínculo do cliente
      // quando o customerId realmente muda; atualizações de finalização, entrega,
      // diagnóstico etc. não devem falhar por uma nova consulta desnecessária.
      const customerIdChanged = patch.customerId !== undefined
        && patch.customerId !== current.customerId;
      if (customerIdChanged) {
        const customerId = clean(patch.customerId, 150);
        if (!customerId) throw new Error("INVALID_UPDATE");
        const customerSnap = await tx.get(root.collection("clientes").doc(customerId));
        if (!customerSnap.exists) throw new Error("INVALID_UPDATE");
        const customer = customerSnap.data() ?? {};
        patch.customerId = customerId;
        patch.customer = clean(customer.name, 160);
        patch.phone = clean(customer.phone, 40);
      } else {
        // Nome e telefone são derivados do cadastro do cliente e não precisam
        // ser reenviados em operações que não alteram o vínculo.
        delete patch.customer;
        delete patch.phone;
        delete patch.customerId;
      }

      // O histórico é append-only: o navegador não pode apagar nem reescrever eventos anteriores.
      const oldHistory = Array.isArray(current.history) ? current.history : [];
      if (Array.isArray(body.history)) {
        if (body.history.length < oldHistory.length || oldHistory.some((entry: any, index: number) => JSON.stringify(entry) !== JSON.stringify(body.history[index]))) throw new Error("INVALID_UPDATE");
        const additions = body.history.slice(oldHistory.length);
        if (additions.length > 1) throw new Error("INVALID_UPDATE");
        if (additions.length === 1) {
          const incoming = additions[0] ?? {};
          const description = clean(incoming.description, 500);
          if (!description) throw new Error("INVALID_UPDATE");
          patch.history = [...oldHistory, { id: clean(incoming.id, 100) || `history-${Date.now()}`, description, actor: clean(decoded.name, 120) || clean(decoded.email, 160) || "Administrador", createdAt: new Date().toLocaleString("pt-BR") }];
        }
      }
      if (patch.status !== undefined && patch.status !== current.status && patch.history === undefined) {
        // A mudança de status é registrada pelo servidor, sem confiar no histórico enviado pelo cliente.
        patch.history = [...oldHistory, { id: `status-${Date.now()}`, description: `Status alterado de ${clean(current.status, 60)} para ${patch.status}`, actor: clean(decoded.name, 120) || clean(decoded.email, 160) || "Administrador", createdAt: new Date().toLocaleString("pt-BR") }];
      }
      patch.updatedAt = FieldValue.serverTimestamp();
      patch.updatedBy = decoded.uid;
      tx.update(ref, patch);
    });
    return NextResponse.json({ saved: true });
  } catch (error) { return authError(error); }
}
