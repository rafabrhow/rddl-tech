
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import { getGoogleDriveAccessToken } from "@/lib/server/drive-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

async function folder(token: string, name: string, parentId: string) {
  const q = `name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and mimeType = '${FOLDER_MIME}' and '${parentId}' in parents and trashed = false`;
  const url = new URL(DRIVE_FILES_URL);
  url.search = new URLSearchParams({ q, fields: "files(id)", pageSize: "1" }).toString();
  const found = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!found.ok) throw new Error("Não foi possível localizar a pasta de comprovantes.");
  const result = await found.json();
  if (result.files?.[0]?.id) return result.files[0].id as string;
  const created = await fetch(DRIVE_FILES_URL, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }), cache: "no-store",
  });
  const data = await created.json();
  if (!created.ok || typeof data.id !== "string") throw new Error("Não foi possível criar a pasta de comprovantes.");
  return data.id as string;
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sessão não informada." }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    if (decoded.role !== "admin" || decoded.ativo !== true || typeof decoded.empresaId !== "string" || !decoded.empresaId) {
      return NextResponse.json({ error: "Somente o administrador da assistência pode solicitar a contratação." }, { status: 403 });
    }

    const db = getAdminDb();
    const empresaRef = db.collection("empresas").doc(decoded.empresaId);
    const empresaSnap = await empresaRef.get();
    if (!empresaSnap.exists) return NextResponse.json({ error: "Assistência não encontrada." }, { status: 404 });
    const empresa = empresaSnap.data() ?? {};
    if (empresa.status === "ativa") return NextResponse.json({ error: "Esta assistência já possui uma assinatura ativa." }, { status: 409 });

    const form = await request.formData();
    const file = form.get("comprovante");
    if (!(file instanceof File)) return NextResponse.json({ error: "Anexe o comprovante do PIX." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Formato não permitido. Envie PDF, JPG, PNG ou WebP." }, { status: 415 });
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "O comprovante deve ter até 8 MB." }, { status: 413 });

    const settingsSnap = await db.collection("platformSettings").doc("billing").get();
    const settings = settingsSnap.data() ?? {};
    const valorCentavos = Number.isInteger(settings.valorMensalCentavos) && settings.valorMensalCentavos > 0 ? settings.valorMensalCentavos : 3000;
    const driveSettings = await db.collection("platformSettings").doc("googleDrive").get();
    const docsRoot = driveSettings.data()?.folders?.["Documentos e comprovantes"];
    if (!driveSettings.exists || typeof docsRoot !== "string") return NextResponse.json({ error: "O Google Drive ainda não está configurado para receber comprovantes." }, { status: 409 });
    const secret = await db.collection("platformSecrets").doc("googleDrive").get();
    const encrypted = secret.data()?.refreshToken;
    if (!encrypted?.ciphertext || !encrypted?.iv || !encrypted?.authTag) return NextResponse.json({ error: "Google Drive não está conectado." }, { status: 409 });

    const accessToken = await getGoogleDriveAccessToken(encrypted);
    const companyFolder = await folder(accessToken, decoded.empresaId, docsRoot);
    const proofFolder = await folder(accessToken, "Comprovantes de pagamento", companyFolder);
    const safeName = file.name.replace(/[^\w.\-]/g, "_").slice(-90) || "comprovante";
    const boundary = `rddl_${crypto.randomUUID()}`;
    const metadata = JSON.stringify({ name: `${Date.now()}_${safeName}`, mimeType: file.type, parents: [proofFolder] });
    const bytes = Buffer.from(await file.arrayBuffer());
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isWebp = bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    const isPdf = bytes.length >= 5 && bytes.toString("ascii", 0, 5) === "%PDF-";
    const validSignature = file.type === "image/jpeg" ? isJpeg : file.type === "image/png" ? isPng : file.type === "image/webp" ? isWebp : file.type === "application/pdf" ? isPdf : false;
    if (!validSignature) return NextResponse.json({ error: "O conteúdo do arquivo não corresponde ao formato informado." }, { status: 415 });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`),
      bytes, Buffer.from(`\r\n--${boundary}--`),
    ]);
    const uploaded = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,mimeType,size`, {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body, cache: "no-store",
    });
    const driveFile = await uploaded.json();
    if (!uploaded.ok || typeof driveFile.id !== "string") throw new Error("O Google Drive não conseguiu armazenar o comprovante.");

    const requestRef = db.collection("solicitacoesPagamento").doc();
    try {
      await db.runTransaction(async transaction => {
        // A consulta e a criação acontecem na mesma transação para evitar
        // solicitações pendentes duplicadas em envios simultâneos.
        const pendingQuery = db.collection("solicitacoesPagamento")
          .where("empresaId", "==", decoded.empresaId)
          .where("status", "==", "pendente").limit(1);
        const pending = await transaction.get(pendingQuery);
        if (!pending.empty) throw new Error("PAYMENT_ALREADY_PENDING");
        transaction.create(requestRef, {
          empresaId: decoded.empresaId, empresaNome: String(empresa.nome ?? ""),
          adminUid: decoded.uid, adminEmail: String(decoded.email ?? ""),
          planoId: "mensal", planoNome: "Plano mensal", valorCentavos,
          status: "pendente", driveFileId: driveFile.id, arquivoNome: String(driveFile.name ?? safeName),
          arquivoMimeType: file.type, arquivoTamanho: file.size,
          criadoEm: new Date(), atualizadoEm: new Date(),
        });
      });
    } catch (error) {
      // Remove o arquivo do Drive se a transação não gravar a solicitação.
      await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(driveFile.id)}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store",
      }).catch(() => undefined);
      if (error instanceof Error && error.message === "PAYMENT_ALREADY_PENDING") {
        return NextResponse.json({ error: "Já existe uma solicitação aguardando análise. Aguarde a conferência do comprovante." }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ submitted: true, message: "Comprovante enviado. Aguardando confirmação do superadministrador." }, { status: 201 });
  } catch (error) {
    console.error("Falha ao solicitar contratação:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível enviar a solicitação." }, { status: 500 });
  }
}
