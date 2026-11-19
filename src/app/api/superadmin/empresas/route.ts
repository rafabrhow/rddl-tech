import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import { registrarAuditoria } from "@/lib/server/audit";

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
    const db = getAdminDb();
    const [companiesSnap, subscriptionsSnap] = await Promise.all([
      db.collection("empresas").orderBy("createdAt", "desc").limit(500).get(),
      db.collection("assinaturas").orderBy("createdAt", "desc").limit(1000).get(),
    ]);
    const subscriptionsByCompany = new Map<string, any[]>();
    for (const doc of subscriptionsSnap.docs) {
      const data = doc.data();
      const list = subscriptionsByCompany.get(String(data.empresaId || "")) || [];
      list.push({ id: doc.id, ...data,
        inicio: data.inicio?.toDate?.()?.toISOString?.() || null,
        fim: data.fim?.toDate?.()?.toISOString?.() || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
      });
      subscriptionsByCompany.set(String(data.empresaId || ""), list);
    }
    const empresas = companiesSnap.docs.map(doc => {
      const data = doc.data();
      const date = (value: any) => value?.toDate?.()?.toISOString?.() || null;
      return {
        id: doc.id, nome: data.nome || "Sem nome", telefone: data.telefone || "",
        status: data.status || "desconhecido", adminUid: data.adminUid || "",
        adminNome: data.adminNome || "", adminEmail: data.adminEmail || "",
        createdAt: date(data.createdAt), trialStartedAt: date(data.trialStartedAt),
        trialEndsAt: date(data.trialEndsAt), assinaturaAtivadaEm: date(data.assinaturaAtivadaEm),
        assinaturaVenceEm: date(data.assinaturaVenceEm),
        planoAtual: data.planoAtual || null,
        subscriptions: subscriptionsByCompany.get(doc.id) || [],
      };
    });
    return NextResponse.json({ empresas }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: message === "auth/id-token-revoked" ? "Sessão expirada." : "Não foi possível carregar as assistências." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sessão não informada." }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    if (decoded.role !== "superadmin" || decoded.ativo !== true || decoded.empresaId !== null) {
      return NextResponse.json({ error: "Acesso restrito ao superadministrador." }, { status: 403 });
    }
    const body = await request.json();
    const empresaId = typeof body.empresaId === "string" ? body.empresaId : "";
    const action = typeof body.action === "string" ? body.action : "";
    if (!empresaId || empresaId.length > 150) return NextResponse.json({ error: "Assistência inválida." }, { status: 400 });
    const db = getAdminDb();
    const empresaRef = db.collection("empresas").doc(empresaId);
    const empresaSnap = await empresaRef.get();
    if (!empresaSnap.exists) return NextResponse.json({ error: "Assistência não encontrada." }, { status: 404 });
    const empresa = empresaSnap.data() || {};
    const now = new Date();

    if (action === "renew-trial") {
      const days = Number(body.days);
      if (![2, 3, 5].includes(days)) {
        return NextResponse.json({ error: "Selecione uma renovação de 2, 3 ou 5 dias." }, { status: 400 });
      }
      if (empresa.status !== "em_teste") {
        return NextResponse.json({ error: "A renovação está disponível somente para assistências em período de teste." }, { status: 409 });
      }
      const currentEnd = empresa.trialEndsAt?.toDate?.()?.getTime?.() || 0;
      const baseDate = new Date(Math.max(now.getTime(), currentEnd));
      const nextEnd = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
      const subscriptionsSnap = await db.collection("assinaturas")
        .where("empresaId", "==", empresaId)
        .where("tipoPlano", "==", "trial")
        .get();
      const trialSubscription = subscriptionsSnap.docs
        .sort((a, b) => (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0))[0];
      const batch = db.batch();
      batch.update(empresaRef, {
        trialEndsAt: Timestamp.fromDate(nextEnd),
        atualizadoEm: now,
        atualizadoPor: decoded.uid,
        ultimoAjusteTesteEm: Timestamp.fromDate(now),
        ultimoAjusteTesteDias: days,
      });
      if (trialSubscription) {
        batch.update(trialSubscription.ref, {
          fim: Timestamp.fromDate(nextEnd),
          duracaoDias: Number(trialSubscription.data().duracaoDias || 5) + days,
          atualizadoEm: Timestamp.fromDate(now),
          ultimoAjusteDias: days,
        });
      } else {
        const subscriptionRef = db.collection("assinaturas").doc();
        batch.set(subscriptionRef, {
          empresaId,
          contratanteUid: empresa.adminUid || null,
          planoId: "teste-5-dias",
          planoNome: "Teste grátis",
          tipoPlano: "trial",
          status: "em_teste",
          inicio: Timestamp.fromDate(now),
          fim: Timestamp.fromDate(nextEnd),
          duracaoDias: days,
          valor: 0,
          criadoPor: decoded.uid,
          createdAt: Timestamp.fromDate(now),
          renovacao: true,
        });
      }
      await batch.commit();
      await registrarAuditoria({
        acao: "teste_renovado",
        descricao: `Período de teste renovado por ${days} dias`,
        empresaId,
        empresaNome: empresa.nome || "",
        alvoUid: empresa.adminUid || "",
        alvoNome: empresa.adminNome || "",
        alvoEmail: empresa.adminEmail || "",
        detalhes: { diasAdicionados: days, vencimentoAnterior: currentEnd ? new Date(currentEnd).toISOString() : null, novoVencimento: nextEnd.toISOString() },
      }, { uid: decoded.uid, email: decoded.email });
      return NextResponse.json({ updated: true, trialEndsAt: nextEnd.toISOString(), days });
    }

    if (action === "update") {
      const nome = typeof body.nome === "string" ? body.nome.trim() : "";
      const telefone = typeof body.telefone === "string" ? body.telefone.trim() : "";
      if (!nome || nome.length > 120 || telefone.length > 30) return NextResponse.json({ error: "Informe nome válido e telefone com até 30 caracteres." }, { status: 400 });
      await empresaRef.update({ nome, telefone, atualizadoEm: now, atualizadoPor: decoded.uid });
      await registrarAuditoria({ acao: "empresa_atualizada", descricao: "Dados da assistência atualizados", empresaId, empresaNome: nome, detalhes: { nomeAnterior: empresa.nome || "", telefoneAnterior: empresa.telefone || "", nomeNovo: nome, telefoneNovo: telefone } }, { uid: decoded.uid, email: decoded.email });
      return NextResponse.json({ updated: true });
    }

    if (action === "suspend" || action === "reactivate") {
      let nextStatus = "suspensa";
      if (action === "reactivate") {
        const paidEnd = empresa.assinaturaVenceEm?.toDate?.()?.getTime?.() || 0;
        const trialEnd = empresa.trialEndsAt?.toDate?.()?.getTime?.() || 0;
        if (paidEnd > now.getTime()) nextStatus = "ativa";
        else if (trialEnd > now.getTime()) nextStatus = "em_teste";
        else return NextResponse.json({ error: "Esta assistência não possui período de teste ou assinatura vigente. É necessário confirmar um novo pagamento antes de reativar." }, { status: 409 });
      }
      const uid = String(empresa.adminUid || "");
      const batch = db.batch();
      batch.update(empresaRef, { status: nextStatus, atualizadoEm: now, atualizadoPor: decoded.uid, ...(action === "suspend" ? { suspensaEm: now, suspensaPor: decoded.uid } : { reativadaEm: now, reativadaPor: decoded.uid }) });
      if (uid) {
        try {
          const user = await getAdminAuth().getUser(uid);
          const claims = user.customClaims || {};
          const shouldEnable = action === "reactivate";
          await getAdminAuth().setCustomUserClaims(uid, { ...claims, ativo: shouldEnable });
          await getAdminAuth().updateUser(uid, { disabled: !shouldEnable });
          batch.set(db.collection("usuarios").doc(uid), { ativo: shouldEnable, atualizadoEm: now }, { merge: true });
        } catch (error) {
          console.error("Falha ao atualizar acesso do administrador:", error);
          throw new Error("Não foi possível atualizar o acesso do administrador.");
        }
      }
      await batch.commit();
      await registrarAuditoria({ acao: action === "suspend" ? "acesso_suspenso" : "acesso_reativado", descricao: action === "suspend" ? "Acesso da assistência suspenso" : "Acesso da assistência reativado", empresaId, empresaNome: empresa.nome || "", alvoUid: uid, alvoNome: empresa.adminNome || "", alvoEmail: empresa.adminEmail || "", detalhes: { statusAnterior: empresa.status || "", statusNovo: nextStatus } }, { uid: decoded.uid, email: decoded.email });
      return NextResponse.json({ updated: true, status: nextStatus });
    }

    if (action === "change-admin") {
      const adminNome = typeof body.adminNome === "string" ? body.adminNome.trim() : "";
      const adminEmail = typeof body.adminEmail === "string" ? body.adminEmail.trim().toLowerCase() : "";
      const senha = typeof body.senha === "string" ? body.senha : "";
      if (!adminNome || adminNome.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || senha.length < 8 || senha.length > 128) {
        return NextResponse.json({ error: "Informe nome, e-mail válido e senha inicial de pelo menos 8 caracteres para o novo administrador." }, { status: 400 });
      }
      const adminAuth = getAdminAuth();
      try { await adminAuth.getUserByEmail(adminEmail); return NextResponse.json({ error: "Este e-mail já possui uma conta no sistema." }, { status: 409 }); }
      catch (error) { if ((error as { code?: string }).code !== "auth/user-not-found") throw error; }
      const newUser = await adminAuth.createUser({ email: adminEmail, password: senha, displayName: adminNome, disabled: empresa.status === "suspensa" });
      try {
        await adminAuth.setCustomUserClaims(newUser.uid, { role: "admin", empresaId, ativo: empresa.status !== "suspensa" });
        const batch = db.batch();
        const oldUid = String(empresa.adminUid || "");
        if (oldUid) {
          try {
            const oldUser = await adminAuth.getUser(oldUid);
            await adminAuth.setCustomUserClaims(oldUid, { ...(oldUser.customClaims || {}), ativo: false });
            await adminAuth.updateUser(oldUid, { disabled: true });
            batch.set(db.collection("usuarios").doc(oldUid), { ativo: false, saiuEm: now, substituidoPor: newUser.uid }, { merge: true });
          } catch (error) { console.error("Falha ao desativar administrador anterior:", error); }
        }
        batch.update(empresaRef, { adminUid: newUser.uid, adminNome, adminEmail, atualizadoEm: now, administradorAnterior: oldUid ? { uid: oldUid, nome: empresa.adminNome || "", email: empresa.adminEmail || "", substituidoEm: now } : null });
        batch.set(db.collection("usuarios").doc(newUser.uid), { uid: newUser.uid, nome: adminNome, email: adminEmail, role: "admin", perfil: "admin", empresaId, ativo: empresa.status !== "suspensa", createdAt: now, createdBy: decoded.uid }, { merge: true });
        await batch.commit();
      } catch (error) {
        try { await adminAuth.deleteUser(newUser.uid); } catch {}
        throw error;
      }
      await registrarAuditoria({ acao: "administrador_substituido", descricao: "Administrador da assistência substituído", empresaId, empresaNome: empresa.nome || "", alvoUid: newUser.uid, alvoNome: adminNome, alvoEmail: adminEmail, 
      detalhes: {
        administradorAnteriorNome: empresa.adminNome || "", administradorAnteriorEmail: empresa.adminEmail || "" } }, { uid: decoded.uid, email: decoded.email });
      return NextResponse.json({ updated: true, adminNome, adminEmail });
    }

    return NextResponse.json({ error: "Ação administrativa inválida." }, { status: 400 });
  } catch (error) {
    console.error("Falha na operação administrativa:", error);
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: message || "Não foi possível concluir a operação." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let createdUid: string | null = null;
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "Sessão não informada." }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    if (decoded.role !== "superadmin" || decoded.ativo !== true || decoded.empresaId !== null) {
      return NextResponse.json({ error: "Somente o superadministrador pode cadastrar assistências." }, { status: 403 });
    }

    const body = await request.json();
    const nome = typeof body.nome === "string" ? body.nome.trim() : "";
    const telefone = typeof body.telefone === "string" ? body.telefone.trim() : "";
    const adminNome = typeof body.adminNome === "string" ? body.adminNome.trim() : "";
    const adminEmail = typeof body.adminEmail === "string" ? body.adminEmail.trim().toLowerCase() : "";
    const senha = typeof body.senha === "string" ? body.senha : "";
    if (!nome || nome.length > 120 || !adminNome || adminNome.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || senha.length < 8 || senha.length > 128 || telefone.length > 30) {
      return NextResponse.json({ error: "Confira os dados. Nome, administrador, e-mail válido e senha de pelo menos 8 caracteres são obrigatórios." }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    try { await adminAuth.getUserByEmail(adminEmail); return NextResponse.json({ error: "Este e-mail já possui uma conta no sistema." }, { status: 409 }); }
    catch (error) { if ((error as { code?: string }).code !== "auth/user-not-found") throw error; }

    const now = new Date();
    const trialEnd = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    const db = getAdminDb();
    const empresaRef = db.collection("empresas").doc();
    const user = await adminAuth.createUser({ email: adminEmail, password: senha, displayName: adminNome, disabled: false });
    createdUid = user.uid;
    await adminAuth.setCustomUserClaims(user.uid, { role: "admin", empresaId: empresaRef.id, ativo: true });

    const assinaturaRef = db.collection("assinaturas").doc();
    const batch = db.batch();
    batch.set(empresaRef, {
      nome, ...(telefone ? { telefone } : {}), status: "em_teste", adminUid: user.uid,
      adminNome, adminEmail, createdAt: Timestamp.fromDate(now), createdBy: decoded.uid,
      trialStartedAt: Timestamp.fromDate(now), trialEndsAt: Timestamp.fromDate(trialEnd),
      planoAtual: { id: "teste-5-dias", nome: "Teste grátis — 5 dias", tipo: "trial" },
    });
    batch.set(db.collection("usuarios").doc(user.uid), {
      uid: user.uid, nome: adminNome, email: adminEmail, role: "admin", perfil: "admin",
      empresaId: empresaRef.id, ativo: true, createdAt: Timestamp.fromDate(now), createdBy: decoded.uid,
    });
    batch.set(assinaturaRef, {
      empresaId: empresaRef.id, contratanteUid: user.uid, planoId: "teste-5-dias",
      planoNome: "Teste grátis — 5 dias", tipoPlano: "trial", status: "em_teste",
      inicio: Timestamp.fromDate(now), fim: Timestamp.fromDate(trialEnd), duracaoDias: 5,
      valor: 0, criadoPor: decoded.uid, createdAt: Timestamp.fromDate(now),
    });
    await batch.commit();
    await registrarAuditoria({ acao: "empresa_cadastrada", descricao: "Nova assistência cadastrada", empresaId: empresaRef.id, empresaNome: nome, alvoUid: user.uid, alvoNome: adminNome, alvoEmail: adminEmail, detalhes: { telefone, trialEndsAt: trialEnd.toISOString() } }, { uid: decoded.uid, email: decoded.email });
    return NextResponse.json({
      created: true,
      empresa: { id: empresaRef.id, nome, adminEmail, trialEndsAt: trialEnd.toISOString() },
    }, { status: 201 });
  } catch (error) {
    if (createdUid) {
      try { await getAdminAuth().deleteUser(createdUid); } catch (cleanupError) { console.error("Falha ao remover usuário após erro no cadastro:", cleanupError); }
    }
    console.error("Falha ao cadastrar assistência:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível cadastrar a assistência." }, { status: 500 });
  }
}
