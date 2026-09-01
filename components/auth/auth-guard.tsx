"use client";

import { useEffect, useState } from "react";
import { onIdTokenChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";

import { auth } from "@/lib/firebase";

type Props = {
  children: React.ReactNode;
};

export default function AuthGuard({
  children,
}: Props) {
  const router = useRouter();

  const [carregando, setCarregando] = useState(true);
  const [autorizado, setAutorizado] = useState(false);

  useEffect(() => {
    const cancelar = onIdTokenChanged(
      auth,
      async (usuario) => {
        if (!usuario) {
          setAutorizado(false);
          setCarregando(false);
          router.replace("/login");
          return;
        }

        try {
          const resultado =
            await usuario.getIdTokenResult(true);

          const role = resultado.claims.role;
          const ativo = resultado.claims.ativo;

          if (
            role !== "admin" ||
            ativo !== true
          ) {
            await signOut(auth);
            setAutorizado(false);
            router.replace("/login");
            return;
          }

          setAutorizado(true);
        } catch {
          await signOut(auth);
          setAutorizado(false);
          router.replace("/login");
        } finally {
          setCarregando(false);
        }
      }
    );

    return () => cancelar();
  }, [router]);

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-orange-500" />

          <p className="text-sm text-zinc-400">
            Verificando acesso...
          </p>
        </div>
      </main>
    );
  }

  if (!autorizado) {
    return null;
  }

  return <>{children}</>;
}