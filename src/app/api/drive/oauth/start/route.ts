/** Inicia a autorização do Google Drive. Somente o superadministrador pode iniciar. */
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/server/firebase-admin";
import { getDriveRedirectUri } from "@/lib/server/drive-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "Sessão não informada." }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    if (decoded.role !== "superadmin" || decoded.ativo !== true || decoded.empresaId !== null) {
      return NextResponse.json({ error: "Somente o superadministrador pode conectar o Drive da plataforma." }, { status: 403 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return NextResponse.json({ error: "Configure GOOGLE_CLIENT_ID no servidor." }, { status: 503 });

    const state = randomBytes(32).toString("hex");
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getDriveRedirectUri(request.url),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive.file",
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();

    const response = NextResponse.json({ authorizationUrl: authorizationUrl.toString() });
    response.cookies.set("rddl_drive_oauth_state", state, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/drive/oauth", maxAge: 600,
    });
    return response;
  } catch (error) {
    console.error("Falha ao iniciar OAuth do Drive:", error);
    return NextResponse.json({ error: "Não foi possível iniciar a autorização do Google Drive." }, { status: 500 });
  }
}
