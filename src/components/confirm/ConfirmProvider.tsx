"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type ConfirmVariant = "default" | "danger" | "warning";
type ConfirmOptions = {
  title: string;
  message: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
};
type ConfirmContextValue = { confirm: (options: ConfirmOptions) => Promise<boolean> };

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((nextOptions: ConfirmOptions) => {
    if (resolver.current) resolver.current(false);
    setOptions(nextOptions);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const finish = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOptions(null);
  }, []);

  useEffect(() => {
    if (!options) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(false);
      if (event.key === "Enter") finish(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [options, finish]);

  const danger = options?.variant === "danger";
  const warning = options?.variant === "warning";
  const Icon = danger ? AlertTriangle : warning ? Info : CheckCircle2;

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {options && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[3px]" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(false); }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="rddl-confirm-title" aria-describedby="rddl-confirm-message" className="w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl">
            <div className="flex items-start gap-3 p-5 sm:p-6">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${danger ? "bg-rose-50 text-rose-600" : warning ? "bg-amber-50 text-amber-600" : "bg-violet-50 text-violet-600"}`}>
                <Icon size={22} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 id="rddl-confirm-title" className="text-base font-extrabold text-slate-800">{options.title}</h2>
                <p id="rddl-confirm-message" className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{options.message}</p>
                {options.description && <p className="mt-2 text-xs leading-relaxed text-slate-400">{options.description}</p>}
              </div>
              <button type="button" onClick={() => finish(false)} aria-label="Fechar" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={17} /></button>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 p-4 sm:flex-row sm:justify-end sm:px-6">
              <button type="button" onClick={() => finish(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100">{options.cancelText || "Voltar"}</button>
              <button type="button" autoFocus onClick={() => finish(true)} className={`rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-sm ${danger ? "bg-rose-600 hover:bg-rose-700" : warning ? "bg-amber-600 hover:bg-amber-700" : "bg-violet-600 hover:bg-violet-700"}`}>{options.confirmText || "Confirmar"}</button>
            </div>
          </section>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm precisa ser usado dentro de ConfirmProvider.");
  return context.confirm;
}
