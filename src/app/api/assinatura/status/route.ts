import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "Sessão não informada." }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    if (decoded.role !== "admin" || decoded.ativo !== true || typeof decoded.empresaId !== "string" || !decoded.empresaId) {
      return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
    }

    const db = getAdminDb();
    const empresaSnap = await db.collection("empresas").doc(decoded.empresaId).get();
    if (!empresaSnap.exists) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    const empresa = empresaSnap.data() ?? {};
    const now = Date.now();
    const trialEndValue = empresa.trialEndsAt;
    const trialEndMs = trialEndValue && typeof trialEndValue.toDate === "function" ? trialEndValue.toDate().getTime() : null;
    const trialEndsAt = trialEndMs ? new Date(trialEndMs).toISOString() : null;
    const daysRemaining = trialEndMs ? Math.max(0, Math.ceil((trialEndMs - now) / 86400000)) : 0;

    if (empresa.status === "em_teste" && trialEndMs && trialEndMs > now) {
      return NextResponse.json({ status: "trial", trialEndsAt, daysRemaining, planName: "Teste grátis — 5 dias" }, { headers: { "Cache-Control": "no-store" } });
    }

    if (empresa.status === "ativa") {
      const paidEnd = empresa.assinaturaVenceEm;
      const paidEndMs = paidEnd && typeof paidEnd.toDate === "function" ? paidEnd.toDate().getTime() : 0;
      if (paidEndMs && paidEndMs <= now) {
        await db.collection("empresas").doc(decoded.empresaId).update({ status: "suspensa", atualizadoEm: new Date() });
        return NextResponse.json({ status: "expired", trialEndsAt: null, daysRemaining: 0, planName: empresa.planoAtual?.nome || "Plano mensal" }, { headers: { "Cache-Control": "no-store" } });
      }
      const subscriptionEndMs = paidEnd && typeof paidEnd.toDate === "function" ? paidEnd.toDate().getTime() : null;
      const subscriptionEndsAt = subscriptionEndMs ? new Date(subscriptionEndMs).toISOString() : null;
      const daysUntilRenewal = subscriptionEndMs ? Math.max(0, Math.ceil((subscriptionEndMs - now) / 86400000)) : null;
      return NextResponse.json({ status: "active", trialEndsAt: null, daysRemaining: 0, subscriptionEndsAt, daysUntilRenewal, planName: empresa.planoAtual?.nome || "Plano mensal" }, { headers: { "Cache-Control": "no-store" } });
    }

    if (empresa.status === "em_teste" && (!trialEndMs || trialEndMs <= now)) {
      return NextResponse.json({ status: "expired", trialEndsAt, daysRemaining: 0, planName: "Teste grátis — 5 dias" }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ status: "suspended", trialEndsAt, daysRemaining: 0, planName: empresa.planoAtual?.nome || "Sem plano ativo" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha ao verificar assinatura:", error);
    return NextResponse.json({ error: "Não foi possível verificar a situação da assinatura." }, { status: 500 });
  }
}
