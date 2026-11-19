
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

export async function GET(request: NextRequest) {
  try {
    await authorize(request);
    const db = getAdminDb();
    const [settingsSnap, paymentsSnap] = await Promise.all([
      db.collection("platformSettings").doc("billing").get(),
      db.collection("solicitacoesPagamento").orderBy("criadoEm", "desc").limit(300).get(),
    ]);
    const settings = settingsSnap.data() ?? {};
    const payments = paymentsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id, empresaId: data.empresaId, empresaNome: data.empresaNome,
        adminEmail: data.adminEmail, valorCentavos: data.valorCentavos,
        criadoEm: data.criadoEm?.toDate?.()?.toISOString?.() ?? null,
        arquivoNome: data.arquivoNome, status: data.status || "pendente",
        confirmadoEm: data.confirmadoEm?.toDate?.()?.toISOString?.() ?? null,
        motivoRecusa: data.motivoRecusa || null,
        recusadoEm: data.recusadoEm?.toDate?.()?.toISOString?.() ?? null,
      };
    });
    return NextResponse.json({
      valorMensalCentavos: Number.isInteger(settings.valorMensalCentavos) && settings.valorMensalCentavos > 0 ? settings.valorMensalCentavos : 3000,
      pixTipo: settings.pixTipo || "telefone",
      pixChave: settings.pixChave || "99984936958",
      pixTitular: settings.pixTitular || "",
      pagamentos: payments,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: message === "UNAUTHORIZED" ? "Sessão não informada." : message === "FORBIDDEN" ? "Acesso restrito ao superadministrador." : "Não foi possível carregar o financeiro." }, { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const decoded = await authorize(request);
    const body = await request.json();
    const valorMensalCentavos = Number(body.valorMensalCentavos);
    const pixChave = typeof body.pixChave === "string" ? body.pixChave.trim() : "";
    const pixTipo = typeof body.pixTipo === "string" ? body.pixTipo : "telefone";
    const pixTitular = typeof body.pixTitular === "string" ? body.pixTitular.trim().slice(0, 120) : "";
    if (!Number.isInteger(valorMensalCentavos) || valorMensalCentavos < 100 || valorMensalCentavos > 10000000) {
      return NextResponse.json({ error: "Informe um preço mensal válido, entre R$ 1,00 e R$ 100.000,00." }, { status: 400 });
    }
    if (!pixChave || pixChave.length > 150 || !["cpf", "cnpj", "email", "telefone", "aleatoria"].includes(pixTipo)) {
      return NextResponse.json({ error: "Informe uma chave PIX válida e seu tipo." }, { status: 400 });
    }
    const db = getAdminDb();
    const previous = (await db.collection("platformSettings").doc("billing").get()).data() || {};
    await db.collection("platformSettings").doc("billing").set({
      valorMensalCentavos, pixTipo, pixChave, pixTitular,
      atualizadoEm: new Date(), atualizadoPor: decoded.uid,
    }, { merge: true });
    await registrarAuditoria({ acao: "configuracao_financeira_alterada", descricao: "Configurações de preço e PIX atualizadas", detalhes: { valorAnteriorCentavos: previous.valorMensalCentavos ?? 3000, valorNovoCentavos: valorMensalCentavos, pixTipo } }, { uid: decoded.uid, email: decoded.email });
    return NextResponse.json({ saved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: message === "UNAUTHORIZED" ? "Sessão não informada." : message === "FORBIDDEN" ? "Acesso restrito ao superadministrador." : "Não foi possível salvar as configurações." }, { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500 });
  }
}
