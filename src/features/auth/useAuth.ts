"use client";

import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export type UserRole = "superadmin" | "admin";

export type SubscriptionAccess = {
  status: "trial" | "active" | "expired" | "suspended" | "error";
  trialEndsAt: string | null;
  daysRemaining: number;
  subscriptionEndsAt?: string | null;
  daysUntilRenewal?: number;
  planName: string;
  message?: string;
};

/** Centraliza a sessão Firebase e a validação das permissões da plataforma. */
export function useAuth() {
  const [authLoading, setAuthLoading] = useState(true);
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [accessAllowed, setAccessAllowed] = useState(false);
  const [subscriptionAccess, setSubscriptionAccess] = useState<SubscriptionAccess | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Mantém a tela de verificação visível enquanto o perfil e as permissões são validados.
      // Evita exibir a tela de acesso negado durante o carregamento inicial após o login.
      setAuthLoading(true);
      setAuthenticatedUser(user);
      setAccessAllowed(false);
      setUserRole(null);
      setSubscriptionAccess(null);
      setSubscriptionLoading(true);

      if (!user) {
        setAuthLoading(false);
        return;
      }

      try {
        // Força a atualização para considerar as custom claims mais recentes.
        const token = await user.getIdTokenResult(true);
        const role = token.claims.role;
        const empresaId = token.claims.empresaId;
        const isSuperadmin = role === "superadmin" && empresaId === null;
        const isAdmin = role === "admin" && typeof empresaId === "string" && empresaId.length > 0;
        const authorized = token.claims.ativo === true && (isSuperadmin || isAdmin);

        setUserRole(authorized ? (role as UserRole) : null);
        setAccessAllowed(authorized);
        if (authorized && role === "admin") {
          const response = await fetch("/api/assinatura/status", {
            headers: { Authorization: `Bearer ${await user.getIdToken(true)}` },
            cache: "no-store",
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Não foi possível verificar a assinatura.");
          setSubscriptionAccess(result as SubscriptionAccess);
        } else {
          setSubscriptionAccess(null);
        }
      } catch (error) {
        console.error("Não foi possível validar o perfil ou a assinatura do usuário:", error);
        if (user) {
          setSubscriptionAccess({ status: "error", trialEndsAt: null, daysRemaining: 0, planName: "", message: "Não foi possível verificar a situação da assinatura. Atualize a página ou tente novamente." });
        }
      } finally {
        setSubscriptionLoading(false);
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    setLoginError("");
    setLoginMessage("");
    setLoginBusy(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      const token = await credential.user.getIdTokenResult(true);
      const role = token.claims.role;
      const empresaId = token.claims.empresaId;
      const isSuperadmin = role === "superadmin" && empresaId === null;
      const isAdmin = role === "admin" && typeof empresaId === "string" && empresaId.length > 0;

      if (token.claims.ativo !== true || (!isSuperadmin && !isAdmin)) {
        await signOut(auth);
        setLoginError("Esta conta não possui um perfil válido, vínculo de empresa ou acesso ativo no RDDL TECH.");
      }
    } catch (error) {
      console.error("Erro ao entrar no RDDL TECH:", error);
      setLoginError("Não foi possível entrar. Confira seu e-mail e sua senha.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handlePasswordReset() {
    if (!auth || !loginEmail.trim()) {
      setLoginError("Informe seu e-mail para receber o link de recuperação.");
      return;
    }
    setLoginError("");
    setLoginMessage("");
    try {
      await sendPasswordResetEmail(auth, loginEmail.trim());
      setLoginMessage("Se o endereço estiver cadastrado, você receberá um e-mail com as instruções de recuperação.");
    } catch (error) {
      console.error("Erro ao solicitar recuperação de senha:", error);
      setLoginError("Não foi possível solicitar a recuperação. Confira o e-mail informado.");
    }
  }

  async function handleLogout() {
    if (auth) await signOut(auth);
  }

  return {
    authLoading, authenticatedUser, accessAllowed, userRole,
    subscriptionAccess, subscriptionLoading,
    loginEmail, setLoginEmail, loginPassword, setLoginPassword,
    loginError, loginMessage, loginBusy, showPassword, setShowPassword,
    handleLogin, handlePasswordReset, handleLogout,
  };
}
