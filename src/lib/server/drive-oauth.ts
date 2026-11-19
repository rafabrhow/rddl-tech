/**
 * Utilitários privados para a autorização OAuth do Google Drive.
 * O refresh token é criptografado antes de ser persistido no Firestore.
 */
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function encryptionKey(): Buffer {
  const encoded = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Configure GOOGLE_TOKEN_ENCRYPTION_KEY no ambiente do servidor.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY deve ser uma chave Base64 de 32 bytes.");
  return key;
}

export function encryptRefreshToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    algorithm: "aes-256-gcm",
  };
}

export function decryptRefreshToken(payload: { ciphertext: string; iv: string; authTag: string }) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no ambiente do servidor.");

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error_description === "string" ? result.error_description : "O Google não autorizou a conexão. Confira o cliente OAuth e o URI de retorno.");
  if (typeof result.refresh_token !== "string" || !result.refresh_token) throw new Error("O Google não retornou refresh token. Revogue a autorização anterior e tente novamente com acesso offline.");
  return { refreshToken: result.refresh_token, scope: String(result.scope ?? "") };
}

export function getDriveRedirectUri(requestUrl: string) {
  return process.env.GOOGLE_REDIRECT_URI || new URL("/api/drive/oauth/callback", requestUrl).toString();
}


/** Obtém um access token temporário usando o refresh token criptografado. */
export async function getGoogleDriveAccessToken(encrypted: { ciphertext: string; iv: string; authTag: string }) {
  const refreshToken = decryptRefreshToken(encrypted);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Configure as credenciais OAuth do Google no servidor.");

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || typeof result.access_token !== "string") {
    throw new Error("Não foi possível renovar o acesso ao Google Drive. Reconecte a conta Google.");
  }
  return result.access_token as string;
}
