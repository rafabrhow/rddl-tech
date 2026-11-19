import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import { registrarAuditoria } from "@/lib/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const body = await request.json().catch(() => ({}));
    const motivo = typeof body.motivo === "string" ? body.motivo.trim().slice(0, 500) : "";
    if (motivo.length < 5) return NextResponse.json({ error: "Informe um motivo de recusa com pelo menos 5 caracteres." }, { status: 400 });

    const db = getAdminDb();
    const requestRef = db.collection("solicitacoesPagamento").doc(id);
    let auditPayment: any = null;
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(requestRef);
      if (!snap.exists) throw new Error("NOT_FOUND");
      const payment = snap.data() ?? {};
      if (payment.status !== "pendente") throw new Error("ALREADY_REVIEWED");
      auditPayment = payment;
      const now = new Date();
      transaction.update(requestRef, {
        status: "recusado", motivoRecusa: motivo, recusadoEm: now,
        recusadoPor: decoded.uid, atualizadoEm: now,
      });
    });
    await registrarAuditoria({ acao: "pagamento_recusado", descricao: "Comprovante de pagamento recusado", empresaId: auditPayment?.empresaId || null, empresaNome: auditPayment?.empresaNome || "", detalhes: { pagamentoId: id, valorCentavos: auditPayment?.valorCentavos || 0, motivo } }, { uid: decoded.uid, email: decoded.email });
    return NextResponse.json({ rejected: true, message: "Pagamento recusado. A assistência poderá corrigir e enviar outro comprovante." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "NOT_FOUND" ? 404 : message === "ALREADY_REVIEWED" ? 409 : 500;
    return NextResponse.json({ error: message === "NOT_FOUND" ? "Solicitação não encontrada." : message === "ALREADY_REVIEWED" ? "Esta solicitação já foi analisada." : "Não foi possível recusar o pagamento." }, { status });
  }
}
