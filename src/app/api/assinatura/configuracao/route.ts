
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sessão não informada." }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    if (decoded.role !== "admin" || decoded.ativo !== true || typeof decoded.empresaId !== "string" || !decoded.empresaId) {
      return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
    }
    const snap = await getAdminDb().collection("platformSettings").doc("billing").get();
    const data = snap.data() ?? {};
    return NextResponse.json({
      valorMensalCentavos: Number.isInteger(data.valorMensalCentavos) && data.valorMensalCentavos > 0 ? data.valorMensalCentavos : 3000,
      pixTipo: typeof data.pixTipo === "string" ? data.pixTipo : "telefone",
      pixChave: typeof data.pixChave === "string" ? data.pixChave : "99984936958",
      pixTitular: typeof data.pixTitular === "string" ? data.pixTitular : "",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha ao carregar dados de cobrança:", error);
    return NextResponse.json({ error: "Não foi possível carregar os dados de pagamento." }, { status: 500 });
  }
}
