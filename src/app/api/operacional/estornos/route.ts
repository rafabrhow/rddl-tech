import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (value: unknown, max = 240) => typeof value === "string" ? value.trim().slice(0, max) : "";

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
  let actorName = typeof decoded.name === "string" ? decoded.name.trim() : "";
  if (!actorName) {
    try { actorName = (await getAdminAuth().getUser(decoded.uid)).displayName?.trim() || ""; } catch {}
  }
  const actorEmail = typeof decoded.email === "string" ? decoded.email : "";
  return { db, empresaId: decoded.empresaId, uid: decoded.uid, actor: actorName || actorEmail || decoded.uid, actorName: actorName || actorEmail || "Administrador", actorEmail };
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" || code === "SUBSCRIPTION_BLOCKED" ? 403 : code === "NOT_FOUND" ? 404 : code === "ALREADY_REVERSED" || code === "INVALID_STATUS" ? 409 : code === "INVALID_INPUT" ? 400 : 500;
  const message = code === "UNAUTHORIZED" ? "Sessão não informada." : code === "FORBIDDEN" ? "Acesso restrito ao administrador da assistência." : code === "SUBSCRIPTION_BLOCKED" ? "Assinatura inativa ou período de teste encerrado." : code === "NOT_FOUND" ? "Registro não encontrado nesta assistência." : code === "ALREADY_REVERSED" ? "Este registro já possui estorno." : code === "INVALID_STATUS" ? "Somente vendas concluídas e ordens entregues podem ser estornadas." : code === "INVALID_INPUT" ? "Informe o registro e o motivo do estorno." : "Não foi possível registrar o estorno.";
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const { db, empresaId, uid, actor, actorName, actorEmail } = await authorize(request);
    const body = await request.json();
    const type = clean(body.type, 20);
    const recordId = clean(body.recordId, 180);
    const reason = clean(body.reason, 240);
    if (!recordId || reason.length < 3 || !["pdv", "os"].includes(type)) throw new Error("INVALID_INPUT");

    const root = db.collection("empresas").doc(empresaId);
    const reversalRef = root.collection("estornos").doc(`${type}_${recordId}`);
    const now = new Date().toISOString();

    const result = await db.runTransaction(async tx => {
      const existingReversal = await tx.get(reversalRef);
      if (existingReversal.exists) throw new Error("ALREADY_REVERSED");

      if (type === "pdv") {
        const saleRef = root.collection("vendas").doc(recordId);
        const saleSnap = await tx.get(saleRef);
        if (!saleSnap.exists) throw new Error("NOT_FOUND");
        const sale = saleSnap.data() ?? {};
        if (sale.status === "estornada" || sale.refundedAt) throw new Error("ALREADY_REVERSED");
        if (sale.status && sale.status !== "concluida") throw new Error("INVALID_STATUS");
        const items = Array.isArray(sale.items) ? sale.items : [];
        if (!items.length) throw new Error("INVALID_STATUS");

        const stockRefs = items.map((item: any) => root.collection("estoque").doc(clean(item.stockItemId, 150)));
        const stockSnaps: DocumentSnapshot[] = [];
        for (const ref of stockRefs) stockSnaps.push(await tx.get(ref));
        if (stockSnaps.some(snap => !snap.exists)) throw new Error("NOT_FOUND");

        const movementRefs = items.map(() => root.collection("movimentacoesEstoque").doc());
        items.forEach((item: any, index: number) => {
          const stock = stockSnaps[index].data() ?? {};
          const quantity = Number(item.quantity);
          if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("INVALID_STATUS");
          const before = Number(stock.quantity || 0);
          const after = before + quantity;
          tx.update(stockRefs[index], { quantity: after, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
          tx.set(movementRefs[index], {
            stockItemId: stockRefs[index].id,
            stockItemName: clean(stock.name || item.name, 200),
            type: "estorno_venda",
            quantity,
            quantityBefore: before,
            quantityAfter: after,
            saleId: recordId,
            note: `Devolução por estorno da venda ${recordId}`,
            createdAt: new Date().toLocaleString("pt-BR"),
            createdAtServer: FieldValue.serverTimestamp(),
            createdBy: uid,
          });
        });

        const reversal = { id: reversalRef.id, type: "pdv", recordId, reason, amount: Number(sale.total || 0), cost: Number(sale.cost || 0), profitReversed: Number(sale.profit || 0), createdAt: now, createdBy: uid, createdByName: actorName, createdByEmail: actorEmail, stockReturned: true };
        tx.update(saleRef, { status: "estornada", refundedAt: FieldValue.serverTimestamp(), refundedBy: uid, refundedByName: actorName, refundReason: reason, refundId: reversalRef.id });
        tx.create(reversalRef, { ...reversal, createdAtServer: FieldValue.serverTimestamp() });
        return reversal;
      }

      const orderRef = root.collection("ordensServico").doc(recordId);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error("NOT_FOUND");
      const order = orderSnap.data() ?? {};
      if (order.status !== "Entregue") throw new Error("INVALID_STATUS");
      if (order.financialReversedAt || order.financialReversalId) throw new Error("ALREADY_REVERSED");

      const labor = Number(order.laborProfit ?? order.laborValue ?? order.value ?? 0);
      const partsProfit = Number(order.partsProfit || 0);
      const reversal = { id: reversalRef.id, type: "os", recordId, reason, laborReversed: labor, partsProfitReversed: partsProfit, profitReversed: labor + partsProfit, createdAt: now, createdBy: uid, createdByName: actorName, createdByEmail: actorEmail, stockReturned: false };
      const historyEntry = {
        id: reversalRef.id,
        description: `Financeiro da OS revertido · Motivo: ${reason}`,
        actor: actorName,
        actorEmail,
        actorUid: uid,
        createdAt: new Date().toLocaleString("pt-BR"),
        type: "financial_reversal",
        reason,
        reversalId: reversalRef.id,
      };
      tx.update(orderRef, {
        financialReversedAt: FieldValue.serverTimestamp(),
        financialReversedBy: uid,
        financialReversedByName: actorName,
        financialReversedByEmail: actorEmail,
        financialReversalReason: reason,
        financialReversalId: reversalRef.id,
        financialReversalLabor: labor,
        financialReversalPartsProfit: partsProfit,
        history: FieldValue.arrayUnion(historyEntry),
      });
      tx.create(reversalRef, { ...reversal, createdAtServer: FieldValue.serverTimestamp() });
      return reversal;
    });

    return NextResponse.json({ reversal: result }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
