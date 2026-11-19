
/**
 * TEIXACELL — Configuração do primeiro administrador.
 *
 * Executar somente no ambiente local e com a chave
 * privada do Firebase protegida.
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import serviceAccount from "../serviceAccountKey.json" with { type: "json" };

const app = initializeApp({
  credential: cert(serviceAccount),
});

const auth = getAuth(app);

async function configurarAdministrador(uid) {
  if (!uid) {
    throw new Error("Informe o UID do administrador.");
  }

  // Confirma que o usuário existe.
  const usuario = await auth.getUser(uid);

  // Preserva outras permissões já existentes.
  const customClaims = {
    ...usuario.customClaims,
    role: "admin",
    ativo: true,
  };

  await auth.setCustomUserClaims(uid, customClaims);

  console.log("Administrador configurado com sucesso!");
  console.log("UID:", uid);
  console.log("Perfil: admin");
  console.log("Ativo: true");
}

const uid = process.argv[2];

configurarAdministrador(uid)
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error("Erro ao configurar administrador:", erro);
    process.exit(1);
  });
