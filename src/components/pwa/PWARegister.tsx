"use client";

import { useEffect, useState } from "react";

export default function PWARegister() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;
    let reloading = false;

    const handleControllerChange = () => {
      if (!reloading) {
        reloading = true;
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none"
        });

        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration?.installing;
          if (!installingWorker) return;
          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller && registration?.waiting) {
              setWaitingWorker(registration.waiting);
            }
          });
        });

        const updateWhenVisible = () => {
          if (document.visibilityState === "visible") void registration?.update();
        };
        document.addEventListener("visibilitychange", updateWhenVisible);
      } catch (error) {
        console.error("Não foi possível registrar o Service Worker do TeixaCell:", error);
      }
    };

    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      window.removeEventListener("load", register);
    };
  }, []);

  const applyUpdate = () => {
    if (!waitingWorker) return;
    setUpdating(true);
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  };

  if (!waitingWorker) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-orange-300/30 bg-zinc-950 px-4 py-3 text-white shadow-2xl">
      <p className="text-sm font-medium">Uma nova versão do TeixaCell está pronta.</p>
      <button
        type="button"
        onClick={applyUpdate}
        disabled={updating}
        className="shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-zinc-950 disabled:opacity-60"
      >
        {updating ? "Atualizando..." : "Atualizar"}
      </button>
    </div>
  );
}
