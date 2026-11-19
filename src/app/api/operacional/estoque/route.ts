import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import { FieldValue, type DocumentSnapshot, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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
  const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" || code === "SUBSCRIPTION_BLOCKED" ? 403 : code === "COMPANY_NOT_FOUND" || code === "ORDER_NOT_FOUND" ? 404 : code === "INSUFFICIENT_STOCK" || code === "ALREADY_DEDUCTED" ? 409 : code === "INVALID_SALE" || code === "BUDGET_NOT_APPROVED" || code === "NO_BUDGET_STOCK_ITEMS" || code === "INVALID_BUDGET_ITEMS" ? 400 : 500;
  const message = code === "UNAUTHORIZED" ? "Sessão não informada." : code === "FORBIDDEN" ? "Acesso restrito ao administrador da assistência." : code === "COMPANY_NOT_FOUND" ? "Assistência não encontrada." : code === "SUBSCRIPTION_BLOCKED" ? "Assinatura inativa ou período de teste encerrado." : code === "INSUFFICIENT_STOCK" ? "Estoque insuficiente para concluir a operação." : code === "ORDER_NOT_FOUND" ? "Ordem de serviço não encontrada." : code === "INVALID_SALE" ? "O total da venda deve ser maior que zero." : code === "BUDGET_NOT_APPROVED" ? "O orçamento precisa estar aprovado antes da baixa." : code === "NO_BUDGET_STOCK_ITEMS" ? "Esta OS não possui peças vinculadas ao estoque." : code === "INVALID_BUDGET_ITEMS" ? "O orçamento contém peças ou quantidades inválidas." : code === "ALREADY_DEDUCTED" ? "As peças desta OS já foram baixadas." : "Não foi possível concluir a operação.";
  return NextResponse.json({ error: message }, { status });
}

async function getAllDocuments(query: Query, pageSize = 500) {
  const documents: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  while (true) { let pageQuery = query.limit(pageSize); if (cursor) pageQuery = pageQuery.startAfter(cursor); const page = await pageQuery.get(); documents.push(...page.docs); if (page.size < pageSize) break; cursor = page.docs[page.docs.length - 1]; }
  return documents;
}

const clean = (value: unknown, max = 160) => typeof value === "string" ? value.trim().slice(0, max) : "";
export async function GET(request: NextRequest) {
  try {
    const { db, empresaId } = await authorize(request);
    const root = db.collection("empresas").doc(empresaId);
    const [itemsSnap, movementsSnap] = await Promise.all([
      getAllDocuments(root.collection("estoque").orderBy("createdAtServer", "desc")),
      getAllDocuments(root.collection("movimentacoesEstoque").orderBy("createdAtServer", "desc")),
    ]);
    return NextResponse.json({
      items: itemsSnap.map(doc => ({ id: doc.id, ...doc.data() })),
      movements: movementsSnap.map(doc => ({ id: doc.id, ...doc.data() })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return authError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const { db, empresaId, decoded } = await authorize(request);
    const body = await request.json();
    const root = db.collection("empresas").doc(empresaId);
    if (body.action === "create") {
      const name = clean(body.name), category = clean(body.category, 80) || "Peças";
      const quantity = Number(body.quantity), min = Number(body.min), cost = Number(body.cost), price = Number(body.price);
      if (!name || ![quantity, min, cost, price].every(Number.isFinite) || quantity < 0 || min < 0 || cost < 0 || price < 0) return NextResponse.json({ error: "Informe os dados válidos do item." }, { status: 400 });
      const ref = root.collection("estoque").doc();
      const item = { name, category, quantity, min, cost, price, createdAt: new Date().toLocaleDateString("pt-BR"), createdAtServer: FieldValue.serverTimestamp(), createdBy: decoded.uid, updatedAt: FieldValue.serverTimestamp() };
      await db.runTransaction(async tx => {
        tx.set(ref, item);
        if (quantity > 0) {
          const movementRef = root.collection("movimentacoesEstoque").doc();
          tx.set(movementRef, { stockItemId: ref.id, stockItemName: name, type: "entrada", quantity, quantityBefore: 0, quantityAfter: quantity, note: "Saldo inicial do cadastro", createdAt: new Date().toLocaleString("pt-BR"), createdAtServer: FieldValue.serverTimestamp(), createdBy: decoded.uid });
        }
      });
      return NextResponse.json({ item: { id: ref.id, ...item, createdAtServer: new Date().toISOString() } }, { status: 201 });
    }
    if (body.action === "update") {
      const id = clean(body.id, 150);
      const name = clean(body.name), category = clean(body.category, 80) || "Peças";
      const min = Number(body.min), cost = Number(body.cost), price = Number(body.price);
      if (!id || !name || ![min, cost, price].every(Number.isFinite) || min < 0 || cost < 0 || price < 0) return NextResponse.json({ error: "Informe os dados válidos do produto." }, { status: 400 });
      const ref = root.collection("estoque").doc(id);
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error("STOCK_ITEM_NOT_FOUND");
        tx.update(ref, { name, category, min, cost, price, updatedAt: FieldValue.serverTimestamp(), updatedBy: decoded.uid });
      });
      const snap = await ref.get();
      return NextResponse.json({ item: { id, ...snap.data() } });
    }
    if (body.action === "movement") {
      const id = clean(body.stockItemId, 150), type = clean(body.type, 20), note = clean(body.note, 240);
      const quantity = Number(body.quantity), newQuantity = Number(body.newQuantity);
      if (!id || !["entrada", "ajuste"].includes(type) || (type === "entrada" && (!Number.isInteger(quantity) || quantity <= 0)) || (type === "ajuste" && (!Number.isInteger(newQuantity) || newQuantity < 0))) return NextResponse.json({ error: "Informe uma quantidade válida para a movimentação." }, { status: 400 });
      const itemRef = root.collection("estoque").doc(id), movementRef = root.collection("movimentacoesEstoque").doc();
      const movement = await db.runTransaction(async tx => {
        const snap = await tx.get(itemRef);
        if (!snap.exists) throw new Error("STOCK_ITEM_NOT_FOUND");
        const item = snap.data()!;
        const before = Number(item.quantity || 0);
        const after = type === "entrada" ? before + quantity : newQuantity;
        const delta = after - before;
        if (delta === 0) throw new Error("NO_STOCK_CHANGE");
        const createdAt = new Date().toLocaleString("pt-BR");
        const record = { stockItemId: id, stockItemName: clean(item.name, 200), type, quantity: delta, quantityBefore: before, quantityAfter: after, note, createdAt, createdAtServer: FieldValue.serverTimestamp(), createdBy: decoded.uid };
        tx.update(itemRef, { quantity: after, updatedAt: FieldValue.serverTimestamp(), updatedBy: decoded.uid });
        tx.set(movementRef, record);
        return { id: movementRef.id, ...record, createdAtServer: new Date().toISOString() };
      });
      const [itemSnap, movementsSnap] = await Promise.all([itemRef.get(), root.collection("movimentacoesEstoque").orderBy("createdAtServer", "desc").limit(500).get()]);
      return NextResponse.json({ item: { id, ...itemSnap.data() }, movement, movements: movementsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }
    if (body.action === "sale") {
      const requested = Array.isArray(body.items) ? body.items : [];
      const paymentMethod = clean(body.paymentMethod, 40);
      if (!requested.length || !["Dinheiro", "PIX", "Cartão"].includes(paymentMethod)) return NextResponse.json({ error: "Informe os produtos e a forma de pagamento." }, { status: 400 });
      const quantities = new Map<string, number>();
      for (const row of requested) {
        const id = clean(row?.stockItemId, 150), quantity = Number(row?.quantity);
        if (!id || !Number.isInteger(quantity) || quantity <= 0) return NextResponse.json({ error: "Produto ou quantidade inválida." }, { status: 400 });
        quantities.set(id, (quantities.get(id) || 0) + quantity);
      }
      const refs = [...quantities.keys()].map(id => root.collection("estoque").doc(id));
      const saleRef = root.collection("vendas").doc();
      const movementRefs = [...quantities.keys()].map(() => root.collection("movimentacoesEstoque").doc());
      const sale = await db.runTransaction(async tx => {
        const snapshots: DocumentSnapshot[] = [];
        for (const ref of refs) snapshots.push(await tx.get(ref));
        const lines = snapshots.map((snap, index) => {
          if (!snap.exists) throw new Error("INSUFFICIENT_STOCK");
          const product = snap.data()!; const quantity = quantities.get(refs[index].id)!;
          if (Number(product.quantity || 0) < quantity) throw new Error("INSUFFICIENT_STOCK");
          return { stockItemId: refs[index].id, name: clean(product.name, 200), quantity, unitPrice: Number(product.price || 0), unitCost: Number(product.cost || 0), lineTotal: Number(product.price || 0) * quantity, lineProfit: (Number(product.price || 0) - Number(product.cost || 0)) * quantity };
        });
        const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
        const cost = lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0);
        if (total <= 0) throw new Error("INVALID_SALE");
        const createdAt = new Date().toLocaleString("pt-BR");
        lines.forEach((line, index) => {
          tx.update(refs[index], { quantity: Number(snapshots[index].data()?.quantity || 0) - line.quantity, updatedAt: FieldValue.serverTimestamp() });
          tx.set(movementRefs[index], { stockItemId: line.stockItemId, stockItemName: line.name, type: "saida_venda", quantity: line.quantity, saleId: saleRef.id, createdAt, createdAtServer: FieldValue.serverTimestamp(), createdBy: decoded.uid });
        });
        const record = { items: lines, total, cost, profit: total - cost, paymentMethod, createdAt, createdAtServer: FieldValue.serverTimestamp(), createdBy: decoded.uid };
        tx.set(saleRef, record);
        return { id: saleRef.id, ...record, createdAtServer: new Date().toISOString() };
      });
      const [itemsSnap, movementsSnap] = await Promise.all([root.collection("estoque").orderBy("createdAtServer", "desc").limit(2000).get(), root.collection("movimentacoesEstoque").orderBy("createdAtServer", "desc").limit(500).get()]);
      return NextResponse.json({ sale, items: itemsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })), movements: movementsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) }, { status: 201 });
    }
    if (body.action === "consume") {
      const orderId = clean(body.orderId, 150);
      if (!orderId) return NextResponse.json({ error: "Identificador da OS não informado." }, { status: 400 });

      const orderRef = root.collection("ordensServico").doc(orderId);
      const now = new Date().toLocaleString("pt-BR");
      const result = await db.runTransaction(async tx => {
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists) throw new Error("ORDER_NOT_FOUND");
        const orderData = orderSnap.data() || {};
        if (orderData.stockDeductedAt) throw new Error("ALREADY_DEDUCTED");
        if (orderData.budgetApproval !== "Aprovado") throw new Error("BUDGET_NOT_APPROVED");

        // A lista e os preços vêm do orçamento salvo no Firestore, nunca do navegador.
        const budgetItems = Array.isArray(orderData.budgetItems) ? orderData.budgetItems : [];
        const lines = budgetItems
          .filter((line: any) => typeof line.stockItemId === "string" && line.stockItemId.trim())
          .map((line: any) => ({
            stockItemId: clean(line.stockItemId, 150),
            description: clean(line.description, 200) || "Peça",
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
          }));

        if (!lines.length) throw new Error("NO_BUDGET_STOCK_ITEMS");
        if (lines.some((line: any) => !line.stockItemId || !Number.isInteger(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) {
          throw new Error("INVALID_BUDGET_ITEMS");
        }

        const totals = new Map<string, number>();
        for (const line of lines) totals.set(line.stockItemId, (totals.get(line.stockItemId) || 0) + line.quantity);
        const stockRefs = [...totals.keys()].map(id => root.collection("estoque").doc(id));
        const stockSnaps: DocumentSnapshot[] = [];
        for (const ref of stockRefs) stockSnaps.push(await tx.get(ref));

        const stockById = new Map<string, any>();
        stockSnaps.forEach((snap, index) => {
          if (!snap.exists) throw new Error("INSUFFICIENT_STOCK");
          const data = snap.data()!;
          const required = totals.get(stockRefs[index].id) || 0;
          if (!Number.isFinite(Number(data.quantity)) || Number(data.quantity) < required) throw new Error("INSUFFICIENT_STOCK");
          stockById.set(stockRefs[index].id, data);
        });

        const consumedParts = lines.map((line: any) => {
          const stockItem = stockById.get(line.stockItemId);
          const unitCost = Number(stockItem.cost || 0);
          return {
            stockItemId: line.stockItemId,
            description: line.description,
            quantity: line.quantity,
            unitCost,
            chargedUnitPrice: line.unitPrice,
            profit: (line.unitPrice - unitCost) * line.quantity,
          };
        });
        const partsRevenue = lines.reduce((sum: number, line: any) => sum + line.unitPrice * line.quantity, 0);
        const partsCost = consumedParts.reduce((sum: number, line: any) => sum + line.unitCost * line.quantity, 0);
        const partsProfit = partsRevenue - partsCost;
        const stockDeductedAt = now;
        const historyEntry = {
          id: `stock-${Date.now()}`,
          description: `Baixa de ${lines.length} item(ns) do estoque vinculada à OS ${orderId}`,
          actor: clean(orderData.technician, 120) || "Técnico",
          createdAt: now,
        };

        // Todas as leituras foram concluídas antes das gravações da transação.
        stockRefs.forEach(ref => {
          const data = stockById.get(ref.id);
          const before = Number(data.quantity);
          const quantity = totals.get(ref.id) || 0;
          tx.update(ref, { quantity: before - quantity, updatedAt: FieldValue.serverTimestamp(), updatedBy: decoded.uid });
          const movementRef = root.collection("movimentacoesEstoque").doc();
          const matchingLines = consumedParts.filter((line: any) => line.stockItemId === ref.id);
          const revenue = matchingLines.reduce((sum: number, line: any) => sum + line.chargedUnitPrice * line.quantity, 0);
          const cost = matchingLines.reduce((sum: number, line: any) => sum + line.unitCost * line.quantity, 0);
          tx.set(movementRef, {
            stockItemId: ref.id,
            stockItemName: clean(data.name, 200),
            type: "saida_os",
            quantity,
            quantityBefore: before,
            quantityAfter: before - quantity,
            orderId,
            customer: clean(orderData.customer, 160),
            technician: clean(orderData.technician, 120),
            lineCost: cost,
            lineRevenue: revenue,
            lineProfit: revenue - cost,
            createdAt: now,
            createdAtServer: FieldValue.serverTimestamp(),
            createdBy: decoded.uid,
          });
        });

        tx.update(orderRef, {
          stockDeductedAt,
          consumedParts,
          partsRevenue,
          partsCost,
          partsProfit,
          laborProfit: Number(orderData.laborValue ?? 0),
          partsProfitRecordedAt: FieldValue.serverTimestamp(),
          history: [...(Array.isArray(orderData.history) ? orderData.history : []), historyEntry],
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: decoded.uid,
        });

        return { stockDeductedAt, consumedParts, partsRevenue, partsCost, partsProfit, laborProfit: Number(orderData.laborValue ?? 0), historyEntry };
      });

      const [itemsSnap, movementsSnap] = await Promise.all([
        root.collection("estoque").orderBy("createdAtServer", "desc").limit(2000).get(),
        root.collection("movimentacoesEstoque").orderBy("createdAtServer", "desc").limit(500).get(),
      ]);
      return NextResponse.json({ ...result, items: itemsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })), movements: movementsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }
    return NextResponse.json({ error: "Ação de estoque inválida." }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "ORDER_NOT_FOUND") return NextResponse.json({ error: "Ordem de serviço não encontrada." }, { status: 404 });
    if (code === "ALREADY_DEDUCTED") return NextResponse.json({ error: "As peças desta OS já foram baixadas." }, { status: 409 });
    return authError(error);
  }
}
