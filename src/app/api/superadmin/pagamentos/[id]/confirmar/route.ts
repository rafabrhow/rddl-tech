
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";

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
    let companyName = "";
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    // ID determinístico impede a criação de mais de uma assinatura para o mesmo pagamento.
    const subscriptionRef = db.collection("assinaturas").doc(`pagamento_${id}`);
    const auditRef = db.collection("auditoriaAdmin").doc();

    await db.runTransaction(async transaction => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) throw new Error("NOT_FOUND");
      const currentPayment = requestSnap.data() ?? {};
      if (currentPayment.status !== "pendente" || typeof currentPayment.empresaId !== "string" || !currentPayment.empresaId) {
        throw new Error("ALREADY_REVIEWED");
      }
      const empresaRef = db.collection("empresas").doc(currentPayment.empresaId);
      const [empresaSnap, existingSubscription] = await Promise.all([
        transaction.get(empresaRef), transaction.get(subscriptionRef),
      ]);
      if (!empresaSnap.exists) throw new Error("COMPANY_NOT_FOUND");
      if (existingSubscription.exists) throw new Error("SUBSCRIPTION_EXISTS");

      companyName = String(currentPayment.empresaNome || empresaSnap.data()?.nome || "");
      const valorCentavos = Number.isInteger(currentPayment.valorCentavos) && currentPayment.valorCentavos > 0
        ? currentPayment.valorCentavos : 3000;
      transaction.update(empresaRef, {
        status: "ativa",
        planoAtual: { id: "mensal", nome: "Plano mensal", tipo: "pago", valorCentavos },
        assinaturaAtivadaEm: now,
        assinaturaVenceEm: expiresAt,
        atualizadoEm: now,
      });
      transaction.create(subscriptionRef, {
        empresaId: currentPayment.empresaId, contratanteUid: currentPayment.adminUid,
        planoId: "mensal", planoNome: "Plano mensal", tipoPlano: "pago",
        status: "ativa", inicio: now, fim: expiresAt, duracaoDias: 30,
        valorCentavos, pagamentoId: id, confirmadoPor: decoded.uid,
        confirmadoEm: now, createdAt: now,
      });
      transaction.update(requestRef, {
        status: "confirmado", confirmadoEm: now, confirmadoPor: decoded.uid,
        assinaturaId: subscriptionRef.id,
      });
      // O registro de auditoria é gravado atomicamente com a confirmação.
      transaction.create(auditRef, {
        acao: "pagamento_confirmado", descricao: "Pagamento confirmado e assinatura ativada",
        empresaId: currentPayment.empresaId, empresaNome: companyName || null,
        alvoUid: currentPayment.adminUid || null, alvoEmail: currentPayment.adminEmail || null,
        detalhes: { pagamentoId: id, assinaturaId: subscriptionRef.id, valorCentavos, vencimento: expiresAt.toISOString() },
        responsavelUid: decoded.uid, responsavelEmail: decoded.email || null,
        criadoEm: now, origem: "painel_superadministrador",
      });
    });
    return NextResponse.json({ confirmed: true, message: "Pagamento confirmado e assinatura ativada por 30 dias." });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
    if (code === "ALREADY_REVIEWED" || code === "SUBSCRIPTION_EXISTS") return NextResponse.json({ error: "Esta solicitação já foi analisada ou já possui assinatura." }, { status: 409 });
    if (code === "COMPANY_NOT_FOUND") return NextResponse.json({ error: "A assistência vinculada não foi encontrada." }, { status: 404 });
    console.error("Falha ao confirmar pagamento:", error);
    return NextResponse.json({ error: "Não foi possível confirmar o pagamento." }, { status: 500 });
  }
}
