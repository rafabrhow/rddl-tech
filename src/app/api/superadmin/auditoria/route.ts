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
    if (decoded.role !== "superadmin" || decoded.ativo !== true || decoded.empresaId !== null) {
      return NextResponse.json({ error: "Acesso restrito ao superadministrador." }, { status: 403 });
    }
    const url = new URL(request.url);
    const empresaId = url.searchParams.get("empresaId") || "";
    const acao = url.searchParams.get("acao") || "";
    const snapshot = await getAdminDb().collection("auditoriaAdmin").orderBy("criadoEm", "desc").limit(500).get();
    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      const date = data.criadoEm?.toDate?.()?.toISOString?.() || null;
      return {
        id: doc.id, acao: String(data.acao || "acao_administrativa"),
        descricao: String(data.descricao || ""), empresaId: data.empresaId || null,
        empresaNome: data.empresaNome || "Plataforma", responsavelUid: data.responsavelUid || "",
        responsavelEmail: data.responsavelEmail || "", alvoNome: data.alvoNome || "",
        alvoEmail: data.alvoEmail || "", detalhes: data.detalhes || {}, criadoEm: date,
      };
    }).filter((item) => (!empresaId || item.empresaId === empresaId) && (!acao || item.acao === acao));
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: "Não foi possível carregar o histórico de atividades." }, { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500 });
  }
}
