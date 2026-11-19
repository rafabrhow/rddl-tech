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
  const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : code === "COMPANY_NOT_FOUND" ? 404 : code === "SUBSCRIPTION_BLOCKED" ? 403 : 500;
  const message = code === "UNAUTHORIZED" ? "Sessão não informada." : code === "FORBIDDEN" ? "Acesso restrito ao administrador da assistência." : code === "COMPANY_NOT_FOUND" ? "Assistência não encontrada." : code === "SUBSCRIPTION_BLOCKED" ? "Assinatura inativa ou período de teste encerrado." : "Não foi possível concluir a operação.";
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
    const docs = await getAllDocuments(db.collection("empresas").doc(empresaId).collection("clientes").orderBy("createdAt", "desc"));
    return NextResponse.json({ customers: docs.map(doc => ({ id: doc.id, ...doc.data() })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return authError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const { db, empresaId, decoded } = await authorize(request);
    const body = await request.json();
    const name = clean(body.name), phone = clean(body.phone, 40), email = clean(body.email, 160);
    if (!name || !phone) return NextResponse.json({ error: "Nome e telefone são obrigatórios." }, { status: 400 });
    const ref = db.collection("empresas").doc(empresaId).collection("clientes").doc();
    const record = { name, phone, ...(email ? { email } : {}), createdAt: new Date().toLocaleDateString("pt-BR"), createdAtServer: FieldValue.serverTimestamp(), createdBy: decoded.uid, updatedAt: FieldValue.serverTimestamp() };
    await ref.set(record);
    return NextResponse.json({ customer: { id: ref.id, name, phone, ...(email ? { email } : {}), createdAt: record.createdAt } }, { status: 201 });
  } catch (error) { return authError(error); }
}
export async function PUT(request: NextRequest) {
  try {
    const { db, empresaId, decoded } = await authorize(request);
    const body = await request.json();
    const id = clean(body.id, 150), name = clean(body.name), phone = clean(body.phone, 40), email = clean(body.email, 160);
    if (!id || !name || !phone) return NextResponse.json({ error: "ID, nome e telefone são obrigatórios." }, { status: 400 });
    const ref = db.collection("empresas").doc(empresaId).collection("clientes").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    await ref.set({ name, phone, email, updatedAt: FieldValue.serverTimestamp(), updatedBy: decoded.uid }, { merge: true });
    return NextResponse.json({ customer: { id, name, phone, email, createdAt: snap.data()?.createdAt || "" } });
  } catch (error) { return authError(error); }
}
