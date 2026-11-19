import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import { registrarAuditoria } from "@/lib/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new Error("UNAUTHORIZED");
  const decoded = await getAdminAuth().verifyIdToken(token, true);
  if (decoded.role !== "superadmin" || decoded.ativo !== true || decoded.empresaId !== null) throw new Error("FORBIDDEN");
  return decoded;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return NextResponse.json({ error: message === "UNAUTHORIZED" ? "Sessão não informada." : message === "FORBIDDEN" ? "Acesso restrito ao superadministrador." : "Não foi possível processar os dados institucionais." }, { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500 });
}

export async function GET(request: NextRequest) {
  try {
    await authorize(request);
    const snap = await getAdminDb().collection("platformSettings").doc("general").get();
    const data = snap.data() ?? {};
    return NextResponse.json({
      nome: typeof data.nome === "string" ? data.nome : "RDDL TECH",
      emailSuporte: typeof data.emailSuporte === "string" ? data.emailSuporte : "",
      telefoneSuporte: typeof data.telefoneSuporte === "string" ? data.telefoneSuporte : "",
      site: typeof data.site === "string" ? data.site : "",
      descricao: typeof data.descricao === "string" ? data.descricao : "",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const decoded = await authorize(request);
    const body = await request.json();
    const nome = typeof body.nome === "string" ? body.nome.trim().slice(0, 100) : "";
    const emailSuporte = typeof body.emailSuporte === "string" ? body.emailSuporte.trim().slice(0, 160) : "";
    const telefoneSuporte = typeof body.telefoneSuporte === "string" ? body.telefoneSuporte.trim().slice(0, 30) : "";
    const site = typeof body.site === "string" ? body.site.trim().slice(0, 200) : "";
    const descricao = typeof body.descricao === "string" ? body.descricao.trim().slice(0, 500) : "";
    if (!nome) return NextResponse.json({ error: "Informe o nome da plataforma." }, { status: 400 });
    if (emailSuporte && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailSuporte)) return NextResponse.json({ error: "Informe um e-mail de suporte válido." }, { status: 400 });
    if (site && !/^https?:\/\//i.test(site)) return NextResponse.json({ error: "O site deve começar com http:// ou https://." }, { status: 400 });
    const db = getAdminDb();
    const previous = (await db.collection("platformSettings").doc("general").get()).data() || {};
    await db.collection("platformSettings").doc("general").set({ nome, emailSuporte, telefoneSuporte, site, descricao, atualizadoEm: new Date(), atualizadoPor: decoded.uid }, { merge: true });
    await registrarAuditoria({ acao: "dados_institucionais_alterados", descricao: "Dados institucionais da plataforma atualizados", detalhes: { nomeAnterior: previous.nome || "RDDL TECH", nomeNovo: nome } }, { uid: decoded.uid, email: decoded.email });
    return NextResponse.json({ saved: true });
  } catch (error) { return errorResponse(error); }
}
