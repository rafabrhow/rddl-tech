/** Upload privado de fotos de aparelhos para a pasta da assistência no Google Drive. */
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import { getGoogleDriveAccessToken } from "@/lib/server/drive-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function findOrCreateFolder(token: string, name: string, parentId: string) {
  const query = `name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and mimeType = '${FOLDER_MIME}' and '${parentId}' in parents and trashed = false`;
  const url = new URL(DRIVE_FILES_URL);
  url.search = new URLSearchParams({ q: query, fields: "files(id)", pageSize: "1" }).toString();
  const search = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!search.ok) throw new Error("Não foi possível localizar a pasta da assistência no Drive.");
  const result = await search.json();
  if (result.files?.[0]?.id) return result.files[0].id as string;

  const created = await fetch(DRIVE_FILES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    cache: "no-store",
  });
  const folder = await created.json();
  if (!created.ok || typeof folder.id !== "string") throw new Error("Não foi possível criar a pasta da assistência.");
  return folder.id as string;
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "Sessão não informada." }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    const empresaId = decoded.empresaId;
    if (decoded.role !== "admin" || decoded.ativo !== true || typeof empresaId !== "string" || !empresaId.trim()) {
      return NextResponse.json({ error: "Somente um administrador ativo de assistência pode enviar arquivos." }, { status: 403 });
    }

    const db = getAdminDb();
    const empresaSnap = await db.collection("empresas").doc(empresaId).get();
    if (!empresaSnap.exists) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    const empresaData = empresaSnap.data() ?? {};
    const trialEnd = empresaData.trialEndsAt;
    const trialEndMs = trialEnd && typeof trialEnd.toDate === "function" ? trialEnd.toDate().getTime() : 0;
    const trialExpired = empresaData.status === "em_teste" && (!trialEndMs || trialEndMs <= Date.now());
    if (trialExpired || empresaData.status !== "em_teste" && empresaData.status !== "ativa") {
      return NextResponse.json({ error: "O período de teste terminou ou a assinatura está suspensa. Contrate um plano para continuar." }, { status: 403 });
    }

    const form = await request.formData();
    const file = form.get("file");
    const orderId = String(form.get("orderId") ?? "").trim();
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione uma foto para enviar." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Formato não permitido. Use JPG, PNG ou WebP." }, { status: 415 });
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Cada foto deve ter até 10 MB." }, { status: 413 });
    if (!orderId || orderId.length > 80) return NextResponse.json({ error: "Identificador da ordem inválido." }, { status: 400 });

    // Impede anexar arquivos a uma OS inexistente ou pertencente a outra assistência.
    // A consulta é sempre feita dentro da subcoleção da empresa autenticada.
    const orderRef = db.collection("empresas").doc(empresaId).collection("ordensServico").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return NextResponse.json({ error: "Ordem de serviço não encontrada nesta assistência." }, { status: 404 });

    const settings = await db.collection("platformSettings").doc("googleDrive").get();
    const photoParentId = settings.data()?.folders?.["Aparelhos e fotos"];
    if (!settings.exists || typeof photoParentId !== "string") {
      return NextResponse.json({ error: "A estrutura de pastas da plataforma ainda não foi configurada." }, { status: 409 });
    }
    const secret = await db.collection("platformSecrets").doc("googleDrive").get();
    const encrypted = secret.data()?.refreshToken;
    if (!encrypted?.ciphertext || !encrypted?.iv || !encrypted?.authTag) {
      return NextResponse.json({ error: "Google Drive não está conectado." }, { status: 409 });
    }

    const fileBytes = Buffer.from(await file.arrayBuffer());
    const isJpeg = fileBytes.length >= 3 && fileBytes[0] === 0xff && fileBytes[1] === 0xd8 && fileBytes[2] === 0xff;
    const isPng = fileBytes.length >= 8 && fileBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isWebp = fileBytes.length >= 12 && fileBytes.toString("ascii", 0, 4) === "RIFF" && fileBytes.toString("ascii", 8, 12) === "WEBP";
    const validSignature = file.type === "image/jpeg" ? isJpeg : file.type === "image/png" ? isPng : file.type === "image/webp" ? isWebp : false;
    if (!validSignature) return NextResponse.json({ error: "O conteúdo do arquivo não corresponde a uma imagem JPG, PNG ou WebP válida." }, { status: 415 });

    const token = await getGoogleDriveAccessToken(encrypted);
    const tenantFolderId = await findOrCreateFolder(token, empresaId, photoParentId);
    const orderFolderId = await findOrCreateFolder(token, orderId, tenantFolderId);
    const safeName = file.name.replace(/[^\w.\-]/g, "_").slice(-100) || "foto-aparelho";
    const boundary = `rddl_${crypto.randomUUID()}`;
    const metadata = JSON.stringify({ name: `${Date.now()}_${safeName}`, mimeType: file.type, parents: [orderFolderId] });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`),
      fileBytes,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const uploaded = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,mimeType,size`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}`, "Content-Length": String(body.length) },
      body,
      cache: "no-store",
    });
    const driveFile = await uploaded.json();
    if (!uploaded.ok || typeof driveFile.id !== "string") {
      console.error("Google Drive upload error:", driveFile);
      return NextResponse.json({ error: "O Google Drive não conseguiu receber a foto." }, { status: 502 });
    }

    const record = {
      empresaId,
      orderId,
      driveFileId: driveFile.id,
      name: driveFile.name,
      mimeType: driveFile.mimeType,
      size: Number(driveFile.size ?? file.size),
      category: "aparelho-foto",
      uploadedBy: decoded.uid,
      createdAt: new Date(),
    };
    const saved = await db.collection("empresas").doc(empresaId).collection("arquivos").add(record);
    return NextResponse.json({
      attachment: { id: saved.id, fileId: driveFile.id, name: driveFile.name, mimeType: driveFile.mimeType, size: record.size },
    }, { status: 201 });
  } catch (error) {
    console.error("Falha ao enviar foto para o Google Drive:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível enviar a foto." }, { status: 500 });
  }
}
