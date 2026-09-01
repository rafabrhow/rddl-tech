"use client";

import Link from "next/link";

import { useEffect, useMemo, useState } from "react";

import AuthGuard from "@/components/auth/auth-guard";

import {
  criarGastoFinanceiro,
  criarRetiradaPessoal,
  listarGastosFinanceiros,
  listarRetiradasPessoais,
  obterApuracaoMensal,
  type ApuracaoMensal,
  type GastoFinanceiro,
  type RetiradaPessoal,
} from "@/lib/controle-financeiro";

function dinheiro(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function mesAtual() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(
    agora.getMonth() + 1
  ).padStart(2, "0")}`;
}

function formatarMes(mes: string) {
  const [ano, numeroMes] = mes.split("-");

  return new Date(
    Number(ano),
    Number(numeroMes) - 1,
    1
  ).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function alterarMes(mes: string, quantidade: number) {
  const [ano, numeroMes] = mes.split("-").map(Number);

  const data = new Date(
    ano,
    numeroMes - 1 + quantidade,
    1
  );

  return `${data.getFullYear()}-${String(
    data.getMonth() + 1
  ).padStart(2, "0")}`;
}

function hojeISO() {
  const agora = new Date();

  return `${agora.getFullYear()}-${String(
    agora.getMonth() + 1
  ).padStart(2, "0")}-${String(
    agora.getDate()
  ).padStart(2, "0")}`;
}

function moedaParaNumero(valor: string) {
  const digitos = valor.replace(/\D/g, "");

  return digitos ? Number(digitos) / 100 : 0;
}

function formatarMoedaInput(valor: string) {
  const digitos = valor.replace(/\D/g, "");

  if (!digitos) return "";

  return (Number(digitos) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function ControleFinanceiroPage() {
  const [mesSelecionado, setMesSelecionado] = useState(mesAtual());
  const [apuracao, setApuracao] = useState<ApuracaoMensal | null>(null);
  const [retiradas, setRetiradas] = useState<RetiradaPessoal[]>([]);
  const [gastos, setGastos] = useState<GastoFinanceiro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [modal, setModal] = useState<"retirada" | "gasto" | null>(null);
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [descricao, setDescricao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const tituloMes = useMemo(
    () => formatarMes(mesSelecionado),
    [mesSelecionado]
  );

  async function carregar() {
    try {
      setCarregando(true);
      setErro("");

      const [resumo, listaRetiradas, listaGastos] = await Promise.all([
        obterApuracaoMensal(mesSelecionado),
        listarRetiradasPessoais(mesSelecionado),
        listarGastosFinanceiros(mesSelecionado),
      ]);

      setApuracao(resumo);
      setRetiradas(listaRetiradas);
      setGastos(listaGastos);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o controle financeiro."
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, [mesSelecionado]);

  function abrirModal(tipo: "retirada" | "gasto") {
    setErro("");
    setModal(tipo);
    setValor("");
    setData(hojeISO());
    setDescricao("");
    setObservacao("");
  }

  function fecharModal() {
    if (salvando) return;

    setModal(null);
    setValor("");
    setDescricao("");
    setObservacao("");
  }

  async function salvarMovimentacao() {
    const valorNumero = moedaParaNumero(valor);

    if (valorNumero <= 0) {
      setErro("Informe um valor válido.");
      return;
    }

    if (!data) {
      setErro("Informe a data.");
      return;
    }

    try {
      setSalvando(true);
      setErro("");

      if (modal === "gasto") {
        if (!descricao.trim()) {
          setErro("Informe a descrição do gasto.");
          return;
        }

        await criarGastoFinanceiro({
          valor: valorNumero,
          data,
          descricao: descricao.trim(),
          observacao: observacao.trim() || undefined,
        });
      }

      if (modal === "retirada") {
        if (!observacao.trim()) {
          setErro("Informe o objetivo da retirada.");
          return;
        }

        await criarRetiradaPessoal({
          valor: valorNumero,
          data,
          observacao: observacao.trim(),
        });
      }

      setModal(null);
      await carregar();
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a movimentação."
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <AuthGuard>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,122,0,0.08),transparent_38%),#09090b] pb-8 text-zinc-100">
        <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-5">

          {/* CABEÇALHO */}
          <header className="mb-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-orange-400">
              Financeiro
            </p>

            <h1 className="mt-1 text-xl font-black sm:text-2xl">
              Controle Financeiro
            </h1>

            <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
              Visão geral da movimentação da loja.
            </p>
            <Link
              href="/dashboard"
              className="mt-3 inline-flex h-9 items-center rounded-xl border border-white/10 bg-white/[0.045] px-3 text-xs font-bold text-zinc-300 shadow-[0_6px_18px_rgba(0,0,0,0.22)] backdrop-blur-xl transition active:scale-95 hover:bg-white/[0.07]"
            >
              ← Inicio
            </Link>
          </header>

          {/* MÊS */}
          <section className="mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.045] p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            <button
              type="button"
              onClick={() =>
                setMesSelecionado(
                  alterarMes(mesSelecionado, -1)
                )
              }
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.07] text-lg font-black shadow-sm transition hover:bg-white/[0.10] active:scale-95"
            >
              ‹
            </button>

            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
                Apuração mensal
              </p>

              <p className="mt-1 text-sm font-black capitalize">
                {tituloMes}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setMesSelecionado(
                  alterarMes(mesSelecionado, 1)
                )
              }
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.07] text-lg font-black shadow-sm transition hover:bg-white/[0.10] active:scale-95"
            >
              ›
            </button>
          </section>

          {erro && (
            <div className="mb-3 rounded-xl border border-red-400/25 border-l-2 border-l-red-400 bg-red-500/[0.07] p-3 text-sm text-red-300 shadow-[0_8px_24px_rgba(0,0,0,0.20)] backdrop-blur-xl">
              {erro}
            </div>
          )}

          {carregando ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl p-8 text-center text-sm text-zinc-500">
              Calculando movimentação do mês...
            </div>
          ) : (
            <>
              {/* CARDS PRINCIPAIS */}
              <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                <div className="rounded-2xl border border-white/10 border-l-2 border-l-emerald-400 bg-white/[0.045] p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-[0_12px_30px_rgba(0,0,0,0.36)]">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
                    Recebido
                  </p>
                  <p className="mt-1 text-base font-black text-emerald-400 sm:text-xl">
                    {dinheiro(apuracao?.receitaRecebida ?? 0)}
                  </p>
                  <p className="mt-0.5 text-[9px] leading-tight text-zinc-600">
                    Pagamentos efetivos
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 border-l-2 border-l-yellow-400 bg-white/[0.045] p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-[0_12px_30px_rgba(0,0,0,0.36)]">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
                    A receber
                  </p>
                  <p className="mt-1 text-base font-black text-yellow-400 sm:text-xl">
                    {dinheiro(apuracao?.aReceber ?? 0)}
                  </p>
                  <p className="mt-0.5 text-[9px] leading-tight text-zinc-600">
                    OS abertas + finalizadas
                  </p>
                </div>

                <div className="rounded-2xl border border-orange-400/30 border-l-2 border-l-orange-400 bg-orange-500/[0.055] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-orange-500/[0.08] hover:shadow-[0_12px_30px_rgba(0,0,0,0.36)]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
                    Possível ganho
                  </p>
                  <p className="mt-1 text-base font-black text-orange-400 sm:text-xl">
                    {dinheiro(apuracao?.possivelGanho ?? 0)}
                  </p>
                  <p className="mt-0.5 text-[9px] leading-tight text-zinc-600">
                    Saldo das OS abertas
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 border-l-2 border-l-orange-400 bg-white/[0.045] p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-[0_12px_30px_rgba(0,0,0,0.36)]">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
                    Lucro apurado
                  </p>
                  <p className="mt-1 text-base font-black tracking-tight sm:text-xl">
                    {dinheiro(apuracao?.lucro ?? 0)}
                  </p>
                  <p className="mt-0.5 text-[9px] leading-tight text-zinc-600">
                    Resultado das OS finalizadas
                  </p>
                </div>
              </section>

              {/* DETALHAMENTO */}
              <section className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 border-l-2 border-l-sky-400 bg-white/[0.045] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-[0_12px_30px_rgba(0,0,0,0.36)]">
                  <p className="text-xs font-black">
                    Contas a receber
                  </p>

                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between rounded-xl border border-white/[0.06] bg-black/30 p-2.5 shadow-[0_5px_16px_rgba(0,0,0,0.20)] backdrop-blur-md">
                      <span className="text-xs text-zinc-500">
                        OS abertas
                      </span>
                      <strong className="text-yellow-400">
                        {dinheiro(
                          apuracao?.aReceberOSAbertas ?? 0
                        )}
                      </strong>
                    </div>

                    <div className="flex justify-between rounded-xl border border-white/[0.06] bg-black/30 p-2.5 shadow-[0_5px_16px_rgba(0,0,0,0.20)] backdrop-blur-md">
                      <span className="text-xs text-zinc-500">
                        OS finalizadas
                      </span>
                      <strong>
                        {dinheiro(
                          apuracao?.aReceberOSFinalizadas ?? 0
                        )}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200">
                  <p className="text-xs font-black">
                    Situação das OS
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-white/[0.06] bg-black/30 p-2.5 shadow-[0_5px_16px_rgba(0,0,0,0.20)] backdrop-blur-md">
                      <p className="text-[10px] uppercase text-zinc-600">
                        Em aberto
                      </p>
                      <p className="mt-1 text-lg font-black">
                        {apuracao?.quantidadeOSAbertas ?? 0}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/[0.06] bg-black/30 p-2.5 shadow-[0_5px_16px_rgba(0,0,0,0.20)] backdrop-blur-md">
                      <p className="text-[10px] uppercase text-zinc-600">
                        Finalizadas
                      </p>
                      <p className="mt-1 text-lg font-black">
                        {apuracao?.quantidadeOSFinalizadas ?? 0}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* RESULTADO */}
              <section className="mt-3 rounded-2xl border border-white/10 bg-white/[0.045] shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl p-5">
                <p className="text-xs font-black uppercase tracking-wider text-zinc-400">
                  Resultado do mês
                </p>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Recebido</span>
                    <strong>
                      {dinheiro(apuracao?.receitaRecebida ?? 0)}
                    </strong>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-zinc-500">
                      Custo das peças
                    </span>
                    <strong>
                      {dinheiro(apuracao?.custoPecas ?? 0)}
                    </strong>
                  </div>

                  <div className="my-3 border-t border-white/10" />

                  <div className="flex justify-between text-base">
                    <span className="font-bold">
                      Lucro da loja
                    </span>
                    <strong className="text-emerald-400">
                      {dinheiro(apuracao?.lucro ?? 0)}
                    </strong>
                  </div>
                </div>
              </section>

              {/* DÍZIMO / GASTOS / RETIRADAS */}
              <section className="mt-4 grid gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
                    Dízimo · 10%
                  </p>
                  <p className="mt-1 text-lg font-black tracking-tight sm:text-xl">
                    {dinheiro(apuracao?.dizimo ?? 0)}
                  </p>
                  <p className="mt-0.5 text-[9px] leading-tight text-zinc-600">
                    Calculado sobre o lucro
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
                        Gastos da loja
                      </p>
                      <p className="mt-1 text-lg font-black tracking-tight sm:text-xl">
                        {dinheiro(apuracao?.gastos ?? 0)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => abrirModal("gasto")}
                      className="rounded-xl bg-orange-500 px-3 py-2 text-[10px] font-black text-black shadow-[0_5px_16px_rgba(249,115,22,0.18)] transition hover:bg-orange-400 active:scale-95"
                    >
                      + Gasto
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
                        Retiradas pessoais
                      </p>
                      <p className="mt-1 text-lg font-black tracking-tight sm:text-xl">
                        {dinheiro(apuracao?.retiradas ?? 0)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => abrirModal("retirada")}
                      className="rounded-xl bg-orange-500 px-3 py-2 text-[10px] font-black text-black shadow-[0_5px_16px_rgba(249,115,22,0.18)] transition hover:bg-orange-400 active:scale-95"
                    >
                      + Retirada
                    </button>
                  </div>
                </div>
              </section>

              {/* SALDO */}
              <section className="mt-3 rounded-2xl border border-emerald-400/30 border-l-2 border-l-emerald-400 bg-emerald-500/[0.06] p-5 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Saldo disponível
                </p>

                <p className="mt-1 text-2xl font-black tracking-tight text-emerald-400 sm:text-3xl">
                  {dinheiro(apuracao?.saldoDisponivel ?? 0)}
                </p>

                <p className="mt-1 text-xs text-zinc-600">
                  Lucro − dízimo − gastos − retiradas
                </p>
              </section>

              {/* GASTOS */}
              <section className="mt-3 rounded-2xl border border-white/10 bg-white/[0.045] shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
                      Gastos do mês
                    </p>
                    <p className="mt-1 text-sm font-black">
                      {gastos.length} movimentação
                      {gastos.length === 1 ? "" : "ões"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {gastos.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center text-xs text-zinc-600">
                      Nenhum gasto neste mês.
                    </div>
                  ) : (
                    gastos.map((gasto) => (
                      <div
                        key={gasto.id}
                        className="rounded-xl border border-white/[0.06] bg-black/30 p-2.5 shadow-[0_5px_16px_rgba(0,0,0,0.20)] backdrop-blur-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold">
                              {gasto.data
                                .split("-")
                                .reverse()
                                .join("/")}
                            </p>
                            <p className="mt-1 text-sm font-semibold">
                              {gasto.descricao}
                            </p>
                            {gasto.observacao && (
                              <p className="mt-1 text-xs text-zinc-600">
                                {gasto.observacao}
                              </p>
                            )}
                          </div>

                          <p className="shrink-0 text-sm font-black text-red-300">
                            - {dinheiro(gasto.valor)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* RETIRADAS */}
              <section className="mt-3 rounded-2xl border border-white/10 bg-white/[0.045] shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl p-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
                    Retiradas pessoais
                  </p>
                  <p className="mt-1 text-sm font-black">
                    {retiradas.length} movimentação
                    {retiradas.length === 1 ? "" : "ões"}
                  </p>
                </div>

                <div className="mt-3 space-y-2">
                  {retiradas.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center text-xs text-zinc-600">
                      Nenhuma retirada neste mês.
                    </div>
                  ) : (
                    retiradas.map((retirada) => (
                      <div
                        key={retirada.id}
                        className="rounded-xl border border-white/[0.06] bg-black/30 p-2.5 shadow-[0_5px_16px_rgba(0,0,0,0.20)] backdrop-blur-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold">
                              {retirada.data
                                .split("-")
                                .reverse()
                                .join("/")}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {retirada.observacao}
                            </p>
                          </div>

                          <p className="shrink-0 text-sm font-black">
                            {dinheiro(retirada.valor)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          )}
        </div>

        {/* MODAL */}
        {modal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-orange-500">
                    Controle Financeiro
                  </p>

                  <h2 className="mt-1 text-lg font-black">
                    {modal === "retirada"
                      ? "Nova retirada pessoal"
                      : "Novo gasto da loja"}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={fecharModal}
                  className="h-9 w-9 rounded-lg bg-zinc-800 text-zinc-400"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
                    Valor *
                  </label>

                  <input
                    value={valor}
                    onChange={(event) =>
                      setValor(
                        formatarMoedaInput(event.target.value)
                      )
                    }
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-lg font-black shadow-inner backdrop-blur-md outline-none transition focus:border-orange-400/60 focus:bg-white/[0.06]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
                    Data *
                  </label>

                  <input
                    type="date"
                    value={data}
                    onChange={(event) => setData(event.target.value)}
                    className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 shadow-inner backdrop-blur-md outline-none transition focus:border-orange-400/60 focus:bg-white/[0.06]"
                  />
                </div>

                {modal === "gasto" && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
                      Descrição *
                    </label>

                    <input
                      value={descricao}
                      onChange={(event) =>
                        setDescricao(event.target.value)
                      }
                      placeholder="Ex.: Energia elétrica"
                      className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm shadow-inner backdrop-blur-md outline-none transition focus:border-orange-400/60 focus:bg-white/[0.06]"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
                    {modal === "retirada"
                      ? "Objetivo da retirada *"
                      : "Observação"}
                  </label>

                  <textarea
                    value={observacao}
                    onChange={(event) =>
                      setObservacao(event.target.value)
                    }
                    rows={3}
                    placeholder={
                      modal === "retirada"
                        ? "Ex.: retirada para uso pessoal"
                        : "Observação adicional"
                    }
                    className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.045] p-3 text-sm shadow-inner backdrop-blur-md outline-none transition focus:border-orange-400/60 focus:bg-white/[0.06]"
                  />
                </div>

                {modal === "retirada" && (
                  <div className="rounded-xl border border-amber-400/20 border-l-2 border-l-amber-400 bg-amber-500/[0.06] p-3 text-xs leading-5 text-amber-300">
                    A retirada pessoal não é uma despesa operacional. Ela reduz o saldo disponível depois do lucro, dízimo e gastos.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={fecharModal}
                    disabled={salvando}
                    className="h-12 rounded-xl border border-white/10 bg-white/[0.045] font-bold text-zinc-300 transition hover:bg-white/[0.07] active:scale-95"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={salvarMovimentacao}
                    disabled={salvando}
                    className="h-12 rounded-xl bg-orange-500 font-black text-black shadow-[0_8px_20px_rgba(249,115,22,0.18)] transition hover:bg-orange-400 active:scale-95 disabled:opacity-50"
                  >
                    {salvando ? "Salvando..." : "Registrar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
