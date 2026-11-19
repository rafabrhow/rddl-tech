
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import { registrarAuditoria } from "@/lib/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sessão não informada." }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    if (decoded.role !== "superadmin" || decoded.ativo !== true || decoded.empresaId !== null) {
      return NextResponse.json({ error: "Acesso restrito ao superadministrador." }, { status: 403 });
    }
    const { id } = await context.params;
    const snap = await getAdminDb().collection("solicitacoesPagamento").doc(id).get();
    if (!snap.exists) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
    const fileId = snap.data()?.driveFileId;
    if (typeof fileId !== "string" || !fileId) return NextResponse.json({ error: "Comprovante não encontrado." }, { status: 404 });
    const secret = await getAdminDb().collection("platformSecrets").doc("googleDrive").get();
    const encrypted = secret.data()?.refreshToken;
    if (!encrypted?.ciphertext || !encrypted?.iv || !encrypted?.authTag) return NextResponse.json({ error: "Google Drive não está conectado." }, { status: 409 });
    const { getGoogleDriveAccessToken } = await import("@/lib/server/drive-oauth");
    const accessToken = await getGoogleDriveAccessToken(encrypted);
    const driveResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (!driveResponse.ok) return NextResponse.json({ error: "Não foi possível abrir o comprovante no Google Drive." }, { status: 502 });
    const bytes = await driveResponse.arrayBuffer();
    const contentType = snap.data()?.arquivoMimeType || "application/octet-stream";
    return new NextResponse(bytes, { headers: { "Content-Type": contentType, "Content-Disposition": "inline", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha ao abrir comprovante:", error);
    return NextResponse.json({ error: "Não foi possível abrir o comprovante." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sessão não informada." }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    if (decoded.role !== "superadmin" || decoded.ativo !== true || decoded.empresaId !== null) {
      return NextResponse.json({ error: "Acesso restrito ao superadministrador." }, { status: 403 });
    }
    const { id } = await context.params;
    if (!id || id.length > 150) return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
    const db = getAdminDb();
    const requestRef = db.collection("solicitacoesPagamento").doc(id);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
    const payment = requestSnap.data() ?? {};
    if (payment.status !== "pendente" || typeof payment.empresaId !== "string") {
      return NextResponse.json({ error: "Esta solicitação já foi analisada." }, { status: 409 });
    }
    const empresaRef = db.collection("empresas").doc(payment.empresaId);
    const empresaSnap = await empresaRef.get();
    if (!empresaSnap.exists) return NextResponse.json({ error: "A assistência vinculada não foi encontrada." }, { status: 404 });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const subscriptionRef = db.collection("assinaturas").doc();
    const batch = db.batch();
    batch.update(empresaRef, {
      status: "ativa",
      planoAtual: { id: "mensal", nome: "Plano mensal", tipo: "pago", valorCentavos: Number(payment.valorCentavos) || 3000 },
      assinaturaAtivadaEm: now,
      assinaturaVenceEm: expiresAt,
      atualizadoEm: now,
    });
    batch.set(subscriptionRef, {
      empresaId: payment.empresaId, contratanteUid: payment.adminUid,
      planoId: "mensal", planoNome: "Plano mensal", tipoPlano: "pago",
      status: "ativa", inicio: now, fim: expiresAt, duracaoDias: 30,
      valorCentavos: Number(payment.valorCentavos) || 3000,
      pagamentoId: id, confirmadoPor: decoded.uid, confirmadoEm: now, createdAt: now,
    });
    batch.update(requestRef, {
      status: "confirmado", confirmadoEm: now, confirmadoPor: decoded.uid,
      assinaturaId: subscriptionRef.id,
    });
    await batch.commit();
    await registrarAuditoria({ acao: "pagamento_confirmado", descricao: "Pagamento confirmado e assinatura ativada", empresaId: payment.empresaId, empresaNome: payment.empresaNome || empresaSnap.data()?.nome || "", alvoUid: payment.adminUid || null, alvoEmail: payment.adminEmail || null, detalhes: { pagamentoId: id, assinaturaId: subscriptionRef.id, valorCentavos: Number(payment.valorCentavos) || 3000, vencimento: expiresAt.toISOString() } }, { uid: decoded.uid, email: decoded.email });
    return NextResponse.json({ confirmed: true, message: "Pagamento confirmado e assinatura ativada por 30 dias." });
  } catch (error) {
    console.error("Falha ao confirmar pagamento:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível confirmar o pagamento." }, { status: 500 });
  }
}
