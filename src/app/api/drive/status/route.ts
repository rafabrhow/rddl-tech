import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import { getGoogleDriveAccessToken } from "@/lib/server/drive-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sessão não informada." }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    if (decoded.role !== "superadmin" || decoded.ativo !== true || decoded.empresaId !== null) return NextResponse.json({ error: "Acesso restrito ao superadministrador." }, { status: 403 });

    const db = getAdminDb();
    const [secretSnap, settingsSnap] = await Promise.all([
      db.collection("platformSecrets").doc("googleDrive").get(),
      db.collection("platformSettings").doc("googleDrive").get(),
    ]);
    const secret = secretSnap.data()?.refreshToken;
    const settings = settingsSnap.data() ?? {};
    const connected = Boolean(secret?.ciphertext && secret?.iv && secret?.authTag);
    let connectionOk: boolean | null = null;
    if (request.nextUrl.searchParams.get("test") === "1" && connected) {
      const accessToken = await getGoogleDriveAccessToken(secret);
      const check = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id,name)", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      if (!check.ok) {
        const details = await check.json().catch(() => ({}));
        throw new Error(typeof details.error?.message === "string" ? details.error.message : "O Google recusou o teste de conexão. Reconecte a conta.");
      }
      connectionOk = true;
    } else if (request.nextUrl.searchParams.get("test") === "1") {
      connectionOk = false;
    }
    const folders = settings.folders && typeof settings.folders === "object" ? settings.folders : {};
    const folderNames = Object.keys(folders);
    return NextResponse.json({
      connected,
      connectionOk,
      connectedAt: secretSnap.data()?.connectedAt?.toDate?.()?.toISOString?.() ?? null,
      foldersConfigured: Boolean(settings.rootFolderId && folderNames.length),
      configuredAt: settings.configuredAt?.toDate?.()?.toISOString?.() ?? null,
      folderNames,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha ao consultar conexão do Google Drive:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível consultar o Google Drive." }, { status: 500 });
  }
}
