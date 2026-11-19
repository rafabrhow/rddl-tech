import { getAdminDb } from "@/lib/server/firebase-admin";

export type AuditInput = {
  acao: string;
  descricao: string;
  empresaId?: string | null;
  empresaNome?: string | null;
  alvoUid?: string | null;
  alvoNome?: string | null;
  alvoEmail?: string | null;
  detalhes?: Record<string, unknown>;
};

export async function registrarAuditoria(input: AuditInput, actor: { uid: string; email?: string | null }) {
  const db = getAdminDb();
  try {
    await db.collection("auditoriaAdmin").add({
    ...input,
    empresaId: input.empresaId || null,
    empresaNome: input.empresaNome || null,
    alvoUid: input.alvoUid || null,
    alvoNome: input.alvoNome || null,
    alvoEmail: input.alvoEmail || null,
    detalhes: input.detalhes || {},
    responsavelUid: actor.uid,
    responsavelEmail: actor.email || null,
    criadoEm: new Date(),
    origem: "painel_superadministrador",
    });
  } catch (error) {
    console.error("Falha ao registrar auditoria administrativa:", error);
  }
}
