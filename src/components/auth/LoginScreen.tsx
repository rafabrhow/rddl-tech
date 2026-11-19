"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { User } from "firebase/auth";

interface LoginScreenProps {
  authenticatedUser: User | null;
  loginEmail: string;
  setLoginEmail: (value: string) => void;
  loginPassword: string;
  setLoginPassword: (value: string) => void;
  loginError: string;
  loginMessage: string;
  loginBusy: boolean;
  showPassword: boolean;
  setShowPassword: (value: boolean | ((current: boolean) => boolean)) => void;
  onLogin: (event: React.FormEvent<HTMLFormElement>) => void;
  onPasswordReset: () => void;
  onLogout: () => void | Promise<void>;
}

/** Tela de entrada da plataforma RDDL TECH, preservando a logomarca da assistência. */
export function LoginScreen(props: LoginScreenProps) {
  const {
    authenticatedUser, loginEmail, setLoginEmail, loginPassword, setLoginPassword,
    loginError, loginMessage, loginBusy, showPassword, setShowPassword,
    onLogin, onPasswordReset, onLogout,
  } = props;

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="glass-card w-full max-w-md rounded-3xl border border-white/80 p-7 shadow-soft sm:p-9">
        <div className="mb-7 flex justify-center">
          <div className="relative h-44 w-44 overflow-hidden rounded-2xl bg-black shadow-lg sm:h-48 sm:w-48">
            <Image src="/teixacell-logo.jpeg" alt="Logomarca da assistência técnica" fill priority sizes="192px" className="object-contain" />
          </div>
        </div>
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-extrabold text-slate-800">Acesse sua conta</h1>
          <p className="mt-1 text-sm text-slate-500">Entre com seu e-mail e senha para continuar.</p>
        </div>
        {!authenticatedUser ? (
          <form onSubmit={onLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-xs font-semibold text-slate-600">E-mail</label>
              <input id="login-email" type="email" autoComplete="username" required value={loginEmail} onChange={event => setLoginEmail(event.target.value)} placeholder="seuemail@exemplo.com" className="w-full rounded-xl border border-white/80 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none focus:border-orange-400" />
            </div>
            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-xs font-semibold text-slate-600">Senha</label>
              <div className="relative">
                <input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={loginPassword} onChange={event => setLoginPassword(event.target.value)} placeholder="Sua senha" className="w-full rounded-xl border border-white/80 bg-white/70 px-4 py-3 pr-16 text-sm text-slate-800 outline-none focus:border-orange-400" />
                <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-3 text-xs font-semibold text-orange-700">{showPassword ? "Ocultar" : "Mostrar"}</button>
              </div>
            </div>
            {loginError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs leading-relaxed text-rose-700">{loginError}</p>}
            {loginMessage && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-700">{loginMessage}</p>}
            <button type="submit" disabled={loginBusy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{loginBusy ? "Entrando..." : "Entrar no sistema"}<ArrowRight size={16} /></button>
            <button type="button" onClick={onPasswordReset} className="w-full py-2 text-xs font-semibold text-orange-700 hover:text-orange-900">Esqueci minha senha</button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-rose-50 p-4 text-sm leading-relaxed text-rose-700">A conta <strong>{authenticatedUser.email}</strong> não possui perfil válido, vínculo de empresa ou autorização ativa para acessar o RDDL TECH.</div>
            <button type="button" onClick={onLogout} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-white">Sair e entrar com outra conta</button>
          </div>
        )}
        <p className="mt-7 border-t border-white/70 pt-5 text-center text-[10px] text-slate-400">Acesso protegido por autenticação Firebase.</p>
      </div>
    </main>
  );
}
