import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asIso(value: any): string | undefined {
  if (!value) return undefined;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sessão não informada." }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    if (decoded.role !== "admin" || decoded.ativo !== true || typeof decoded.empresaId !== "string" || !decoded.empresaId) {
      return NextResponse.json({ error: "Acesso restrito ao administrador da assistência." }, { status: 403 });
    }

    const snapshot = await getAdminDb().collection("solicitacoesPagamento")
      .where("empresaId", "==", decoded.empresaId)
      .limit(100)
      .get();

    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        status: String(data.status ?? "pendente"),
        motivoRecusa: typeof data.motivoRecusa === "string" ? data.motivoRecusa : undefined,
        recusadoEm: asIso(data.recusadoEm),
        criadoEm: asIso(data.criadoEm),
        arquivoNome: typeof data.arquivoNome === "string" ? data.arquivoNome : undefined,
      };
    }).sort((a, b) => new Date(b.criadoEm || 0).getTime() - new Date(a.criadoEm || 0).getTime()).slice(0, 20);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha ao carregar solicitações de pagamento:", error);
    return NextResponse.json({ error: "Não foi possível carregar o histórico de pagamentos." }, { status: 500 });
  }
}
