/** Cria a pasta raiz e as subpastas padrão da plataforma no Google Drive. */
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import { getGoogleDriveAccessToken } from "@/lib/server/drive-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";

async function findOrCreateFolder(accessToken: string, name: string, parentId?: string) {
  const clauses = [`name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`, `mimeType = '${FOLDER_MIME}'`, "trashed = false"];
  if (parentId) clauses.push(`'${parentId}' in parents`);
  const searchUrl = new URL(DRIVE_API);
  searchUrl.search = new URLSearchParams({ q: clauses.join(" and "), fields: "files(id,name)", pageSize: "10", spaces: "drive" }).toString();
  const search = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!search.ok) throw new Error("Falha ao consultar pastas no Google Drive.");
  const found = await search.json();
  if (Array.isArray(found.files) && found.files.length) return found.files[0].id as string;

  const created = await fetch(DRIVE_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
    cache: "no-store",
  });
  const result = await created.json();
  if (!created.ok || typeof result.id !== "string") throw new Error("Não foi possível criar uma pasta no Google Drive.");
  return result.id as string;
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "Sessão não informada." }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    if (decoded.role !== "superadmin" || decoded.ativo !== true || decoded.empresaId !== null) {
      return NextResponse.json({ error: "Somente o superadministrador pode configurar o armazenamento da plataforma." }, { status: 403 });
    }

    const db = getAdminDb();
    const secretSnapshot = await db.collection("platformSecrets").doc("googleDrive").get();
    const encrypted = secretSnapshot.data()?.refreshToken;
    if (!secretSnapshot.exists || !encrypted?.ciphertext || !encrypted?.iv || !encrypted?.authTag) {
      return NextResponse.json({ error: "Google Drive ainda não está conectado. Autorize a conta primeiro." }, { status: 409 });
    }

    const accessToken = await getGoogleDriveAccessToken(encrypted);
    const rootId = await findOrCreateFolder(accessToken, "RDDL TECH");
    const folderNames = ["Logomarcas", "Aparelhos e fotos", "Ordens de serviço", "Documentos e comprovantes"];
    const folders: Record<string, string> = {};
    for (const name of folderNames) folders[name] = await findOrCreateFolder(accessToken, name, rootId);

    await db.collection("platformSettings").doc("googleDrive").set({
      provider: "google-drive",
      rootFolderId: rootId,
      folders,
      configuredAt: new Date(),
      configuredBy: decoded.uid,
    }, { merge: true });

    return NextResponse.json({
      configured: true,
      message: "Estrutura principal da RDDL TECH criada ou confirmada no Google Drive.",
      folders: Object.keys(folders),
    });
  } catch (error) {
    console.error("Falha ao configurar pastas do Google Drive:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível configurar as pastas do Drive." }, { status: 500 });
  }
}
