/**
 * TEIXACELL — Migração controlada do primeiro usuário para superadmin.
 * Execute localmente. Nunca publique serviceAccountKey.json no GitHub.
 */
import { createRequire } from "node:module";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const require = createRequire(import.meta.url);
const serviceAccount = require("../serviceAccountKey.json");

const app = getApps().length
  ? getApps()[0]
  : initializeApp({ credential: cert(serviceAccount) });

const adminAuth = getAuth(app);

async function migrarParaSuperadmin(uid) {
  if (!uid) {
    throw new Error("Informe o UID do usuário que será superadministrador.");
  }

  const usuario = await adminAuth.getUser(uid);
  const claimsAtuais = usuario.customClaims ?? {};

  await adminAuth.setCustomUserClaims(uid, {
    ...claimsAtuais,
    role: "superadmin",
    ativo: true,
    empresaId: null,
  });

  console.log("Superadministrador configurado com sucesso.");
  console.log("E-mail:", usuario.email ?? "não informado");
  console.log("Perfil: superadmin");
  console.log("Ativo: true");
  console.log("Empresa: plataforma (sem vínculo empresarial)");
  console.log("Faça logout e login novamente para atualizar o token.");
}

migrarParaSuperadmin(process.argv[2]).catch((erro) => {
  console.error("Falha ao configurar superadministrador:", erro.message);
  process.exitCode = 1;
});
