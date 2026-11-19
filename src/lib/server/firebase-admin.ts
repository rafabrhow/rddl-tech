/**
 * Inicialização preguiçosa do Firebase Admin exclusivamente no servidor.
 * A credencial deve ser fornecida pela variável FIREBASE_SERVICE_ACCOUNT_JSON.
 * Nunca importe este módulo em componentes "use client".
 * A inicialização ocorre somente quando uma rota realmente usa o Admin SDK,
 * evitando falhas durante o build do Next.js.
 */
import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  const existing = getApps().find((app) => app.name === "[DEFAULT]");
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64
  ? Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64,
      "base64"
    ).toString("utf8")
  : process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("A variável FIREBASE_SERVICE_ACCOUNT_JSON não está configurada no servidor.");
  }

  let serviceAccount: { project_id?: string; client_email?: string; private_key?: string };
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON não contém um JSON válido.");
  }

  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("A credencial Firebase Admin está incompleta.");
  }

  return initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
    }),
  });
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
