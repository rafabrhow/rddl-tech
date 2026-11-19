/** Recebe o retorno OAuth, valida o estado anti-CSRF e guarda o refresh token criptografado. */
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/server/firebase-admin";
import { encryptRefreshToken, exchangeGoogleCode, getDriveRedirectUri } from "@/lib/server/drive-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const stateCookie = request.cookies.get("rddl_drive_oauth_state")?.value;
  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state");
  const code = searchParams.get("code");
  const googleError = searchParams.get("error");
  const fail = (message: string, status = 400) => {
    const response = NextResponse.json({ error: message }, { status });
    response.cookies.delete("rddl_drive_oauth_state");
    return response;
  };

  if (googleError) return fail("A autorização do Google foi cancelada ou recusada.");
  if (!stateCookie || !state || stateCookie !== state) return fail("Estado OAuth inválido ou expirado. Inicie a conexão novamente.");
  if (!code) return fail("O Google não retornou o código de autorização.");

  try {
    const { refreshToken, scope } = await exchangeGoogleCode(code, getDriveRedirectUri(request.url));
    const encryptedToken = encryptRefreshToken(refreshToken);
    await getAdminDb().collection("platformSecrets").doc("googleDrive").set({
      refreshToken: encryptedToken, scope, provider: "google-drive", connectedAt: new Date(), connectedBy: "superadmin",
    }, { merge: true });

    const response = NextResponse.json({ connected: true, message: "Google Drive autorizado. O token foi armazenado criptografado no servidor." });
    response.cookies.delete("rddl_drive_oauth_state");
    return response;
  } catch (error) {
    console.error("Falha no callback OAuth do Drive:", error);
    return fail(error instanceof Error ? error.message : "Não foi possível concluir a conexão.", 500);
  }
}
