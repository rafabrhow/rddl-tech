import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import { getGoogleDriveAccessToken } from "@/lib/server/drive-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_LOGO = 2 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

async function authorized(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new Error("Sessão não informada.");
  const decoded = await getAdminAuth().verifyIdToken(token, true);
  const empresaId = decoded.empresaId;
  if (decoded.role !== "admin" || decoded.ativo !== true || typeof empresaId !== "string" || !empresaId.trim()) throw new Error("Acesso não autorizado para esta assistência.");
  return { decoded, empresaId };
}
async function driveToken() {
  const db = getAdminDb();
  const secret = await db.collection("platformSecrets").doc("googleDrive").get();
  const encrypted = secret.data()?.refreshToken;
  if (!encrypted?.ciphertext || !encrypted?.iv || !encrypted?.authTag) throw new Error("Google Drive não está conectado.");
  return getGoogleDriveAccessToken(encrypted);
}
async function findOrCreateFolder(token: string, name: string, parentId: string) {
  const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = '${FOLDER_MIME}' and '${parentId}' in parents and trashed = false`;
  const searchUrl = new URL(DRIVE_FILES);
  searchUrl.search = new URLSearchParams({ q, fields: "files(id)", pageSize: "1" }).toString();
  const found = await fetch(searchUrl, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).then(r => r.json());
  if (found.files?.[0]?.id) return String(found.files[0].id);
  const response = await fetch(DRIVE_FILES, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }), cache: "no-store" });
  const folder = await response.json();
  if (!response.ok || !folder.id) throw new Error("Não foi possível criar a pasta de logomarcas no Drive.");
  return String(folder.id);
}
async function readLogo(token: string, fileId?: string) {
  if (!fileId) return "";
  const response = await fetch(`${DRIVE_FILES}/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) return "";
  const type = response.headers.get("content-type") || "image/png";
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${type};base64,${bytes.toString("base64")}`;
}
export async function GET(request: NextRequest) {
  try {
    const { empresaId } = await authorized(request);
    const db = getAdminDb();
    const snap = await db.collection("empresas").doc(empresaId).collection("configuracoes").doc("branding").get();
    const data = snap.data() || {};
    let logoDataUrl = "";
    if (data.logoFileId) {
      const token = await driveToken();
      logoDataUrl = await readLogo(token, String(data.logoFileId));
    }
    return NextResponse.json({ branding: { ...data, logoDataUrl } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar a personalização.";
    return NextResponse.json({ error: message }, { status: message.includes("Sessão") ? 401 : 403 });
  }
}
export async function POST(request: NextRequest) {
  try {
    const { decoded, empresaId } = await authorized(request);
    const form = await request.formData();
    const proprietario = String(form.get("proprietario") || "").trim();
    const nomeFantasia = String(form.get("nomeFantasia") || "").trim();
    const telefone = String(form.get("telefone") || "").trim();
    const documento = String(form.get("documento") || "").trim();
    const endereco = String(form.get("endereco") || "").trim();
    const corPrincipal = String(form.get("corPrincipal") || "#f47721");
    const removeLogo = form.get("removeLogo") === "true";
    const file = form.get("logo");
    if (!nomeFantasia) return NextResponse.json({ error: "Informe o nome fantasia." }, { status: 400 });
    if (!/^#[0-9a-fA-F]{6}$/.test(corPrincipal)) return NextResponse.json({ error: "Cor principal inválida." }, { status: 400 });
    const db = getAdminDb();
    const ref = db.collection("empresas").doc(empresaId).collection("configuracoes").doc("branding");
    const oldSnap = await ref.get();
    const old = oldSnap.data() || {};
    let logoFileId = String(old.logoFileId || "");
    let logoName = String(old.logoName || "");
    if (file instanceof File) {
      if (!TYPES.has(file.type)) return NextResponse.json({ error: "Envie uma imagem PNG, JPG ou WebP." }, { status: 415 });
      if (file.size <= 0 || file.size > MAX_LOGO) return NextResponse.json({ error: "A logomarca deve ter até 2 MB." }, { status: 413 });
      const settings = await db.collection("platformSettings").doc("googleDrive").get();
      const parentId = settings.data()?.folders?.["Logomarcas"];
      if (typeof parentId !== "string") throw new Error("A pasta Logomarcas ainda não foi configurada no Google Drive.");
      const token = await driveToken();
      const tenantFolder = await findOrCreateFolder(token, empresaId, parentId);
      const boundary = `rddl_logo_${crypto.randomUUID()}`;
      const metadata = JSON.stringify({ name: `logo_${empresaId}_${Date.now()}.${file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"}`, mimeType: file.type, parents: [tenantFolder] });
      const bytes = Buffer.from(await file.arrayBuffer());
      const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--`)]);
      const uploaded = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body, cache: "no-store" });
      const result = await uploaded.json();
      if (!uploaded.ok || !result.id) throw new Error("Não foi possível enviar a logomarca ao Google Drive.");
      logoFileId = String(result.id); logoName = String(result.name || file.name);
    } else if (removeLogo) { logoFileId = ""; logoName = ""; }
    await ref.set({ proprietario, nomeFantasia, telefone, documento, cnpj: documento.length >= 18 ? documento : "", cpf: documento.length > 0 && documento.length < 18 ? documento : "", endereco, corPrincipal, logoFileId, logoName, logoUrl: "", atualizadoEm: new Date(), atualizadoPor: decoded.uid }, { merge: true });
    let logoDataUrl = "";
    if (logoFileId) logoDataUrl = await readLogo(await driveToken(), logoFileId);
    return NextResponse.json({ success: true, branding: { proprietario, nomeFantasia, telefone, documento, endereco, corPrincipal, logoFileId, logoName, logoDataUrl } });
  } catch (error) {
    console.error("Erro na personalização da assistência:", error);
    const message = error instanceof Error ? error.message : "Não foi possível salvar a personalização.";
    return NextResponse.json({ error: message }, { status: message.includes("Sessão") ? 401 : 400 });
  }
}
