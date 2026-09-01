"use client";

import Link from "next/link";

import { useEffect, useMemo, useState } from "react";

import AuthGuard from "@/components/auth/auth-guard";
import {
  listarFinanceiroAtivo,
  obterFinanceiroOS,
  registrarPagamento,
  estornarPagamento,
  salvarValoresFinanceiro,
  type FormaPagamento,
  type Pagamento,
  type ResumoFinanceiroOS,
} from "@/lib/financeiro";

const statusLabels = {
  pendente: "Pendente",
  parcial: "Parcial",
  pago: "Pago",
  estornado: "Estornado",
} as const;

const formaLabels: Record<FormaPagamento, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  outro: "Outro",
};

function dinheiro(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// =========================================================
// MÁSCARA MONETÁRIA BRASILEIRA
// Mantemos o estado como texto para permitir uma digitação
// confortável no celular e convertemos para número somente
// no momento de salvar/calcular.
// =========================================================
function formatarMoedaInput(valor: string) {
  const somenteDigitos = valor.replace(/\D/g, "");

  if (!somenteDigitos) {
    return "R$ 0,00";
  }

  const centavos = Number(somenteDigitos) / 100;

  return centavos.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function moedaParaNumero(valor: string) {
  const somenteDigitos = valor.replace(/\D/g, "");
  if (!somenteDigitos) return 0;

  return Number(somenteDigitos) / 100;
}

function statusClass(
  status: keyof typeof statusLabels
) {
  switch (status) {
    case "pago":
      return "bg-emerald-500/10 text-emerald-400";
    case "parcial":
      return "bg-yellow-500/10 text-yellow-400";
    case "pendente":
      return "bg-red-500/10 text-red-400";
    default:
      return "bg-zinc-700 text-zinc-300";
  }
}

function dataPagamentoTexto(
  valor: Pagamento["dataPagamento"]
) {
  if (!valor) return "—";

  if (typeof valor === "string") {
    const partes = valor.split("-");
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return valor;
  }

  if (
    typeof valor?.toDate === "function"
  ) {
    return valor.toDate().toLocaleDateString(
      "pt-BR"
    );
  }

  return "—";
}

export default function FinanceiroPage() {
  const [itens, setItens] =
    useState<ResumoFinanceiroOS[]>([]);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<
    "todas" | "pendente" | "parcial" | "pago"
  >("todas");
  const [carregando, setCarregando] =
    useState(true);
  const [erro, setErro] = useState("");

  const [itemSelecionado, setItemSelecionado] =
    useState<ResumoFinanceiroOS | null>(null);
  const [pagamentos, setPagamentos] =
    useState<Pagamento[]>([]);
  const [carregandoDetalhe, setCarregandoDetalhe] =
    useState(false);

  const [valorServico, setValorServico] =
    useState("");
  const [desconto, setDesconto] =
    useState("");
  const [salvandoValores, setSalvandoValores] =
    useState(false);

  const [valorPagamento, setValorPagamento] =
    useState("");
  const [formaPagamento, setFormaPagamento] =
    useState<FormaPagamento>("pix");
  const [dataPagamento, setDataPagamento] =
    useState(() =>
      new Date().toISOString().slice(0, 10)
    );
  const [observacaoPagamento, setObservacaoPagamento] =
    useState("");
  const [salvandoPagamento, setSalvandoPagamento] =
    useState(false);

  // Pagamento selecionado para visualização da Nota de Pagamento.
  const [pagamentoNota, setPagamentoNota] =
    useState<Pagamento | null>(null);

  // Estados usados somente no fluxo de estorno.
  // O pagamento original nunca será apagado do histórico.
  const [pagamentoEstorno, setPagamentoEstorno] =
    useState<Pagamento | null>(null);
  const [motivoEstorno, setMotivoEstorno] =
    useState("");
  const [processandoEstorno, setProcessandoEstorno] =
    useState(false);

  async function carregar() {
    try {
      setCarregando(true);
      setErro("");
      setItens(await listarFinanceiroAtivo());
    } catch {
      setErro(
        "Não foi possível carregar o financeiro."
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return itens.filter((item) => {
      const correspondeBusca =
        !termo ||
        item.os.codigo
          .toLowerCase()
          .includes(termo) ||
        item.os.clienteNome
          .toLowerCase()
          .includes(termo) ||
        item.os.aparelhoMarca
          .toLowerCase()
          .includes(termo) ||
        item.os.aparelhoModelo
          .toLowerCase()
          .includes(termo);

      const correspondeFiltro =
        filtro === "todas" ||
        item.statusPagamento === filtro;

      return (
        correspondeBusca &&
        correspondeFiltro
      );
    });
  }, [itens, busca, filtro]);

  const resumo = useMemo(() => {
    return itens.reduce(
      (acc, item) => ({
        total: acc.total + item.total,
        recebido:
          acc.recebido + item.totalPago,
        receber:
          acc.receber + item.saldo,
      }),
      {
        total: 0,
        recebido: 0,
        receber: 0,
      }
    );
  }, [itens]);

  async function abrirDetalhe(
    item: ResumoFinanceiroOS
  ) {
    setErro("");
    setItemSelecionado(item);
    setValorServico(
      formatarMoedaInput(
        String(Math.round(item.valorServico * 100))
      )
    );
    setDesconto(
      formatarMoedaInput(
        String(Math.round(item.desconto * 100))
      )
    );
    setValorPagamento("");
    setFormaPagamento("pix");
    setObservacaoPagamento("");
    setPagamentos([]);
    setCarregandoDetalhe(true);

    try {
      const financeiro =
        await obterFinanceiroOS(item.os.id);

      setPagamentos(
        financeiro?.pagamentos ?? []
      );
    } catch {
      setErro(
        "Não foi possível carregar os pagamentos desta OS."
      );
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  function fecharDetalhe() {
    setItemSelecionado(null);
    setPagamentos([]);
  }

  function atualizarItemLocal(
    osId: string,
    alteracoes: Partial<ResumoFinanceiroOS>
  ) {
    setItens((atual) =>
      atual.map((item) =>
        item.os.id === osId
          ? { ...item, ...alteracoes }
          : item
      )
    );

    setItemSelecionado((atual) =>
      atual?.os.id === osId
        ? { ...atual, ...alteracoes }
        : atual
    );
  }

  async function salvarValores() {
    if (!itemSelecionado) return;

    const valorServicoNumero =
      moedaParaNumero(valorServico);
    const descontoNumero =
      moedaParaNumero(desconto);

    if (
      !Number.isFinite(valorServicoNumero) ||
      valorServicoNumero < 0
    ) {
      setErro(
        "Informe um valor de serviço válido."
      );
      return;
    }

    if (
      !Number.isFinite(descontoNumero) ||
      descontoNumero < 0
    ) {
      setErro(
        "Informe um desconto válido."
      );
      return;
    }

    const totalPago = itemSelecionado.totalPago;
    const valorPecas =
      itemSelecionado.valorPecas;
    const novoTotal = Math.max(
      0,
      valorServicoNumero +
        valorPecas -
        descontoNumero
    );

    if (novoTotal + 0.009 < totalPago) {
      setErro(
        `O novo total não pode ser menor que o valor já recebido de ${dinheiro(
          totalPago
        )}.`
      );
      return;
    }

    try {
      setSalvandoValores(true);
      setErro("");

      await salvarValoresFinanceiro(
        itemSelecionado.os.id,
        {
          valorServico:
            valorServicoNumero,
          desconto: descontoNumero,
        }
      );

      const saldo = Math.max(
        0,
        novoTotal - totalPago
      );

      atualizarItemLocal(
        itemSelecionado.os.id,
        {
          valorServico:
            valorServicoNumero,
          desconto: descontoNumero,
          total: novoTotal,
          saldo,
          statusPagamento:
            totalPago <= 0
              ? "pendente"
              : totalPago < novoTotal
                ? "parcial"
                : "pago",
        }
      );
    } catch {
      setErro(
        "Não foi possível salvar os valores."
      );
    } finally {
      setSalvandoValores(false);
    }
  }

  async function confirmarPagamento() {
    if (!itemSelecionado) return;

    const valor =
      moedaParaNumero(valorPagamento);

    if (!Number.isFinite(valor) || valor <= 0) {
      setErro(
        "Informe um valor de pagamento válido."
      );
      return;
    }

    if (valor > itemSelecionado.saldo + 0.009) {
      setErro(
        `O pagamento não pode ultrapassar o saldo de ${dinheiro(
          itemSelecionado.saldo
        )}.`
      );
      return;
    }

    try {
      setSalvandoPagamento(true);
      setErro("");

      await registrarPagamento(
        itemSelecionado.os.id,
        {
          valor,
          forma: formaPagamento,
          dataPagamento,
          observacao:
            observacaoPagamento.trim() ||
            undefined,
        }
      );

      const financeiro =
        await obterFinanceiroOS(
          itemSelecionado.os.id
        );

      const novosPagamentos =
        financeiro?.pagamentos ?? [];

      const totalPago =
        novosPagamentos.reduce(
          (total, pagamento) =>
            pagamento.estornado
              ? total
              : total + Number(
                  pagamento.valor ?? 0
                ),
          0
        );

      const total =
        itemSelecionado.total;
      const saldo = Math.max(
        0,
        total - totalPago
      );

      atualizarItemLocal(
        itemSelecionado.os.id,
        {
          totalPago,
          saldo,
          statusPagamento:
            totalPago <= 0
              ? "pendente"
              : totalPago < total
                ? "parcial"
                : "pago",
        }
      );

      setPagamentos(novosPagamentos);
      setValorPagamento("");
      setObservacaoPagamento("");
      // Fecha o modal após o pagamento ser gravado com sucesso.
        setItemSelecionado(null);
        setPagamentos([]);
      await carregar();
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar o pagamento."
      );
    } finally {
      setSalvandoPagamento(false);
    }
  }

  // =========================================================
  // CONFIRMAR ESTORNO
  // ---------------------------------------------------------
  // O estorno é feito sobre um pagamento específico.
  // O lançamento original continua no histórico e apenas
  // passa a ser identificado como estornado.
  // =========================================================
  async function confirmarEstorno() {
    if (!itemSelecionado || !pagamentoEstorno) {
      return;
    }

    const valorEstorno = Number(
      pagamentoEstorno.valor ?? 0
    );

    if (!Number.isFinite(valorEstorno) || valorEstorno <= 0) {
      setErro("O valor do pagamento para estorno é inválido.");
      return;
    }

    try {
      setProcessandoEstorno(true);
      setErro("");

      await estornarPagamento(
        itemSelecionado.os.id,
        pagamentoEstorno.id,
        motivoEstorno.trim() || undefined
      );

      // Recarrega os dados da OS após a confirmação do Firestore.
      const financeiro = await obterFinanceiroOS(
        itemSelecionado.os.id
      );

      const novosPagamentos =
        financeiro?.pagamentos ?? [];

      // Pagamentos estornados deixam de compor o total recebido.
      const totalPago = novosPagamentos.reduce(
        (total, pagamento) =>
          pagamento.estornado
            ? total
            : total + Number(pagamento.valor ?? 0),
        0
      );

      const total = itemSelecionado.total;
      const saldo = Math.max(0, total - totalPago);

      const novoStatus =
        totalPago <= 0
          ? "pendente"
          : totalPago < total
            ? "parcial"
            : "pago";

      atualizarItemLocal(
        itemSelecionado.os.id,
        {
          totalPago,
          saldo,
          statusPagamento: novoStatus,
        }
      );

      setPagamentos(novosPagamentos);
      setPagamentoEstorno(null);
      setMotivoEstorno("");

      // Fecha o modal financeiro somente depois que o estorno
      // foi confirmado e os dados foram atualizados com sucesso.
      setPagamentoNota(null);
      setItemSelecionado(null);
      setPagamentos([]);

      await carregar();
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível realizar o estorno."
      );
    } finally {
      setProcessandoEstorno(false);
    }
  }

  return (
    <AuthGuard>
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }

          #nota-pagamento,
          #nota-pagamento * {
            visibility: visible !important;
          }

          #nota-pagamento {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            color: black !important;
          }
        }
      `}</style>

      <main className="min-h-screen bg-zinc-950 pb-8 text-zinc-100">
        <div className="mx-auto w-full max-w-3xl px-4 py-5">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
              Financeiro
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              Recebimentos
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Valores e pagamentos das OS ativas.
            </p>
            <Link
              href="/dashboard"
              className="ml-auto mt-3 inline-flex h-10 items-center rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-xs font-bold text-zinc-300 active:scale-95"
            >
              ← Inicio
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 border-l-2 border-l-sky-400 bg-white/[0.045] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-[0_12px_30px_rgba(0,0,0,0.36)]">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
                Total
              </p>
              <p className="mt-1 text-lg font-black tracking-tight">
                {dinheiro(resumo.total)}
              </p>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-white/10 border-l-2 border-l-emerald-400 bg-white/[0.045] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-[0_12px_30px_rgba(0,0,0,0.36)]">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
                Recebido
              </p>
              <p className="mt-1 text-lg font-bold text-emerald-400">
                {dinheiro(resumo.recebido)}
              </p>
            </div>

            <div className="relative col-span-2 overflow-hidden rounded-2xl border border-white/10 border-l-2 border-l-amber-400 bg-white/[0.045] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-[0_12px_30px_rgba(0,0,0,0.36)] sm:col-span-1">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
                A receber
              </p>
              <p className="mt-1 text-lg font-bold text-yellow-400">
                {dinheiro(resumo.receber)}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <input
              value={busca}
              onChange={(event) =>
                setBusca(event.target.value)
              }
              placeholder="Buscar cliente, OS ou aparelho..."
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm shadow-[0_6px_18px_rgba(0,0,0,0.20)] backdrop-blur-xl outline-none transition focus:border-orange-500/60 focus:bg-white/[0.06]"
            />

                <div className="grid grid-cols-4 gap-1.5 pb-1  ">
               {(
                [
                  ["todas", "Todas"],
                  ["pendente", "Pendentes"],
                  ["parcial", "Parciais"],
                  ["pago", "Pagas"],
                ] as const
              ).map(([valor, label]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setFiltro(valor)}
                  className={`w-full min-w-0 rounded-xl px-1.5 py-2 text-[11px] border border-white/10 border-l-2 border-l-emerald-400 font-bold whitespace-nowrap transition-all active:scale-95 ${
                  filtro === valor
                      ? "bg-orange-400 text-black"
                      : "bg-white/[0.045] text-zinc-400 hover:bg-white/[0.07]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {erro && (
            <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {erro}
            </div>
          )}

          {carregando ? (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.045] p-6 text-center text-sm text-zinc-500 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl">
              Carregando financeiro...
            </div>
          ) : itensFiltrados.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-white/10 bg-white/[0.035] p-7 text-center shadow-[0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur-xl">
              <p className="font-semibold">
                Nenhuma OS encontrada
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                As OS ativas aparecerão aqui automaticamente.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {itensFiltrados.map((item) => (
                <button
                  key={item.os.id}
                  type="button"
                  onClick={() => void abrirDetalhe(item)}
                  className={`block w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] p-3 text-left shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-[0_12px_30px_rgba(0,0,0,0.36)] active:translate-y-0 active:scale-[0.985] active:bg-white/[0.055] ${
                    item.statusPagamento === "pago"
                      ? "border-l-2 border-l-emerald-400"
                      : item.statusPagamento === "parcial"
                        ? "border-l-2 border-l-amber-400"
                        : item.statusPagamento === "pendente"
                          ? "border-l-2 border-l-red-400"
                          : "border-l-2 border-l-sky-400"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-orange-400">
                        {item.os.codigo}
                      </p>
                      <h2 className="mt-1 truncate font-bold">
                        {item.os.clienteNome}
                      </h2>
                      <p className="mt-1 truncate text-sm text-zinc-500">
                        {item.os.aparelhoMarca}{" "}
                        {item.os.aparelhoModelo}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold uppercase ${statusClass(
                        item.statusPagamento
                      )}`}
                    >
                      {statusLabels[item.statusPagamento]}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-sm">
                    <div>
                      <p className="text-xs text-zinc-600">
                        Total
                      </p>
                      <p className="mt-1 font-bold">
                        {dinheiro(item.total)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-zinc-600">
                        Pago
                      </p>
                      <p className="mt-1 font-bold text-emerald-400">
                        {dinheiro(item.totalPago)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-zinc-600">
                        Restante
                      </p>
                      <p className="mt-1 font-bold text-yellow-400">
                        {dinheiro(item.saldo)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-600">
                    <span>
                      Serviço:{" "}
                      {dinheiro(item.valorServico)}
                    </span>
                    <span>
                      Peças:{" "}
                      {dinheiro(item.valorPecas)}
                    </span>
                  </div>

                  <p className="mt-3 text-center text-xs font-semibold text-orange-500">
                    Toque para abrir o financeiro
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {itemSelecionado && (
          <div className="fixed inset-0 z-50 bg-black/80 p-3 sm:p-6">
            <div className="mx-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/90 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:max-h-[calc(100vh-3rem)]">
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 bg-white/[0.025] p-5">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                    Financeiro da OS
                  </p>
                  <h2 className="mt-1 text-xl font-bold">
                    {itemSelecionado.os.codigo}
                  </h2>
                  <p className="mt-1 truncate text-sm text-zinc-500">
                    {itemSelecionado.os.clienteNome}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={fecharDetalhe}
                  className="shrink-0 rounded-full bg-zinc-900 px-4 py-3 text-sm font-bold text-zinc-400 active:bg-zinc-800"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-y-auto p-5">
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl p-4">
                  <p className="text-xs text-zinc-500">
                    Cliente
                  </p>
                  <p className="mt-1 font-bold">
                    {itemSelecionado.os.clienteNome}
                  </p>

                  <p className="mt-3 text-xs text-zinc-500">
                    Aparelho
                  </p>
                  <p className="mt-1 font-bold">
                    {itemSelecionado.os.aparelhoMarca}{" "}
                    {itemSelecionado.os.aparelhoModelo}
                  </p>
                </div>

                <section className="mt-4">
                  <div className="mb-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                      Valores
                    </p>
                    <h3 className="mt-1 text-lg font-black tracking-tight">
                      Composição da OS
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-sm text-zinc-400">
                        Valor do serviço
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={valorServico}
                        onChange={(event) =>
                          setValorServico(
                            formatarMoedaInput(
                              event.target.value
                            )
                          )
                        }
                        className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-base outline-none focus:border-orange-500"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm text-zinc-400">
                        Desconto
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={desconto}
                        onChange={(event) =>
                          setDesconto(
                            formatarMoedaInput(
                              event.target.value
                            )
                          )
                        }
                        className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-base outline-none focus:border-orange-500"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.045] shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl p-4">
                        <p className="text-xs text-zinc-500">
                          Peças
                        </p>
                        <p className="mt-1 font-bold">
                          {dinheiro(
                            itemSelecionado.valorPecas
                          )}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-orange-400/30 border-l-2 border-l-orange-400 bg-orange-500/[0.06] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                        <p className="text-xs text-zinc-500">
                          Total
                        </p>
                        <p className="mt-1 font-bold text-orange-400">
                          {dinheiro(
                            Math.max(
                              0,
                              moedaParaNumero(
                                valorServico
                              ) +
                                itemSelecionado.valorPecas -
                                moedaParaNumero(
                                  desconto
                                )
                            )
                          )}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void salvarValores()}
                      disabled={salvandoValores}
                      className="h-12 w-full rounded-xl bg-orange-500 font-bold text-black active:scale-[0.99] disabled:opacity-60"
                    >
                      {salvandoValores
                        ? "Salvando..."
                        : "Salvar valores"}
                    </button>
                  </div>
                </section>

                <section className="mt-6">
                  <div className="mb-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                      Pagamento
                    </p>
                    <h3 className="mt-1 text-lg font-black tracking-tight">
                      Registrar recebimento
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.045] shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl p-4">
                      <p className="text-xs text-zinc-500">
                        Pago
                      </p>
                      <p className="mt-1 font-bold text-emerald-400">
                        {dinheiro(
                          itemSelecionado.totalPago
                        )}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.045] shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl p-4">
                      <p className="text-xs text-zinc-500">
                        Restante
                      </p>
                      <p className="mt-1 font-bold text-yellow-400">
                        {dinheiro(
                          itemSelecionado.saldo
                        )}
                      </p>
                    </div>
                  </div>

                  {itemSelecionado.saldo > 0 && (
                    <div className="mt-3 space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-sm text-zinc-400">
                          Valor recebido
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={valorPagamento}
                          onChange={(event) =>
                            setValorPagamento(
                              formatarMoedaInput(
                                event.target.value
                              )
                            )
                          }
                          placeholder="R$ 0,00"
                          className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-base outline-none focus:border-orange-500"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm text-zinc-400">
                          Forma de pagamento
                        </span>
                        <select
                          value={formaPagamento}
                          onChange={(event) =>
                            setFormaPagamento(
                              event.target
                                .value as FormaPagamento
                            )
                          }
                          className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-base outline-none focus:border-orange-500"
                        >
                          {Object.entries(
                            formaLabels
                          ).map(
                            ([valor, label]) => (
                              <option
                                key={valor}
                                value={valor}
                              >
                                {label}
                              </option>
                            )
                          )}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm text-zinc-400">
                          Data do pagamento
                        </span>
                        <input
                          type="date"
                          value={dataPagamento}
                          onChange={(event) =>
                            setDataPagamento(
                              event.target.value
                            )
                          }
                          className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-base outline-none focus:border-orange-500"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm text-zinc-400">
                          Observação
                        </span>
                        <textarea
                          value={
                            observacaoPagamento
                          }
                          onChange={(event) =>
                            setObservacaoPagamento(
                              event.target.value
                            )
                          }
                          rows={3}
                          placeholder="Opcional"
                          className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-base outline-none focus:border-orange-500"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() =>
                          void confirmarPagamento()
                        }
                        disabled={
                          salvandoPagamento
                        }
                        className="h-12 w-full rounded-xl bg-emerald-500 font-bold text-black active:scale-[0.99] disabled:opacity-60"
                      >
                        {salvandoPagamento
                          ? "Registrando..."
                          : "Confirmar pagamento"}
                      </button>
                    </div>
                  )}

                  {itemSelecionado.saldo <= 0 && (
                    <div className="mt-3 rounded-2xl border border-emerald-400/25 border-l-2 border-l-emerald-400 bg-emerald-500/[0.06] p-4 text-center text-sm font-semibold text-emerald-300 shadow-[0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur-xl">
                      Esta OS está totalmente paga.
                    </div>
                  )}
                </section>

                <section className="mt-6">
                  <div className="mb-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                      Histórico
                    </p>
                    <h3 className="mt-1 text-lg font-bold">
                      Pagamentos
                    </h3>
                  </div>

                  {carregandoDetalhe ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.045] shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl p-4 text-center text-sm text-zinc-500">
                      Carregando histórico...
                    </div>
                  ) : pagamentos.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.035] p-4 text-center text-sm text-zinc-500 shadow-[0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur-xl">
                      Nenhum pagamento registrado.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {[...pagamentos]
                        .reverse()
                        .map((pagamento) => (
                          <div
                            key={pagamento.id}
                            className={`rounded-2xl border p-4 shadow-[0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur-xl ${
                              pagamento.estornado
                                ? "border-red-400/25 border-l-2 border-l-red-400 bg-red-500/[0.06]"
                                : "border-white/10 border-l-2 border-l-emerald-400 bg-white/[0.045]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-bold">
                                  {dinheiro(
                                    Number(
                                      pagamento.valor ??
                                        0
                                    )
                                  )}
                                </p>
                                <p className="mt-1 text-sm text-zinc-500">
                                  {
                                    formaLabels[
                                      pagamento.forma
                                    ]
                                  }
                                </p>
                              </div>

                              <p className="text-xs text-zinc-500">
                                {dataPagamentoTexto(
                                  pagamento.dataPagamento
                                )}
                              </p>
                            </div>

                            {pagamento.estornado && (
                              <p className="mt-2 text-xs font-bold text-red-400">
                                ESTORNADO
                              </p>
                            )}

                            {pagamento.observacao && (
                              <p className="mt-3 border-t border-zinc-800 pt-3 text-sm text-zinc-500">
                                {pagamento.observacao}
                              </p>
                            )}

                            {/* Cada pagamento possui sua própria nota/comprovante. */}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setPagamentoNota(pagamento);
                              }}
                              className="mt-3 h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 text-sm font-bold text-orange-400 active:bg-zinc-800"
                            >
                              {pagamento.estornado
                                ? "↩️ Ver nota de estorno"
                                : "🧾 Ver nota de pagamento"}
                            </button>

                            {/* Um pagamento já estornado não pode ser estornado novamente. */}
                            {!pagamento.estornado && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setErro("");
                                  setMotivoEstorno("");
                                  setPagamentoEstorno(pagamento);
                                }}
                                className="mt-2 h-11 w-full rounded-xl border border-red-900/50 bg-red-950/20 text-sm font-bold text-red-400 active:bg-red-950/40"
                              >
                                ↩️ Estornar pagamento
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            MODAL — CONFIRMAÇÃO DE ESTORNO
            O pagamento continua no histórico após o estorno.
           ===================================================== */}
        {pagamentoEstorno && itemSelecionado && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-red-400">
                    Estorno
                  </p>
                  <h2 className="mt-1 text-xl font-bold">
                    Devolver pagamento?
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!processandoEstorno) {
                      setPagamentoEstorno(null);
                      setMotivoEstorno("");
                    }
                  }}
                  disabled={processandoEstorno}
                  className="rounded-full bg-zinc-900 px-4 py-3 text-sm font-bold text-zinc-400 disabled:opacity-50"
                >
                  ✕
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-red-400/25 border-l-2 border-l-red-400 bg-red-500/[0.06] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                <p className="text-sm text-zinc-400">
                  Cliente
                </p>
                <p className="mt-1 font-bold">
                  {itemSelecionado.os.clienteNome}
                </p>

                <p className="mt-3 text-sm text-zinc-400">
                  Valor a devolver
                </p>
                <p className="mt-1 text-2xl font-black text-red-400">
                  {dinheiro(
                    Number(pagamentoEstorno.valor ?? 0)
                  )}
                </p>

                <p className="mt-3 text-xs text-zinc-500">
                  O pagamento não será apagado. Ele ficará registrado
                  no histórico como estornado.
                </p>
              </div>

              <label className="mt-4 block">
                <span className="mb-1 block text-sm text-zinc-400">
                  Motivo do estorno
                </span>
                <textarea
                  value={motivoEstorno}
                  onChange={(event) =>
                    setMotivoEstorno(event.target.value)
                  }
                  rows={3}
                  placeholder="Opcional"
                  disabled={processandoEstorno}
                  className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-base outline-none focus:border-red-500 disabled:opacity-60"
                />
              </label>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPagamentoEstorno(null);
                    setMotivoEstorno("");
                  }}
                  disabled={processandoEstorno}
                  className="h-12 rounded-xl bg-zinc-900 font-bold text-zinc-300 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={() => void confirmarEstorno()}
                  disabled={processandoEstorno}
                  className="h-12 rounded-xl bg-red-500 font-bold text-white active:scale-[0.99] disabled:opacity-60"
                >
                  {processandoEstorno
                    ? "Estornando..."
                    : "Confirmar estorno"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            MODAL — NOTA DE PAGAMENTO
            A nota é vinculada ao pagamento individual.
            Isso preserva o histórico mesmo quando há várias
            entradas para a mesma OS.
           ===================================================== */}
        {pagamentoNota && itemSelecionado && (
          <div className="fixed inset-0 z-[60] bg-black/80 p-3 sm:p-6">
            <div className="mx-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white text-zinc-900 shadow-2xl sm:max-h-[calc(100vh-3rem)]">
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
                <div>
                  <p
                    className={`text-xs font-bold uppercase tracking-wider ${
                      pagamentoNota.estornado
                        ? "text-red-600"
                        : "text-orange-600"
                    }`}
                  >
                    Comprovante
                  </p>
                  <h2 className="text-lg font-bold">
                    {pagamentoNota.estornado
                      ? "Nota de Estorno"
                      : "Nota de Pagamento"}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setPagamentoNota(null)}
                  className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-600"
                >
                  ✕
                </button>
              </div>

              <div id="nota-pagamento" className="overflow-y-auto p-6">
                <div className="text-center">
                  <p className="text-xl font-black">
                    TEIXA CELL
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Assistência Técnica
                  </p>
                </div>

                <div className="my-5 border-y border-dashed border-zinc-300 py-4">
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-zinc-500">OS</span>
                    <strong>{itemSelecionado.os.codigo}</strong>
                  </div>

                  <div className="mt-2 flex justify-between gap-4 text-sm">
                    <span className="text-zinc-500">Cliente</span>
                    <strong className="text-right">
                      {itemSelecionado.os.clienteNome}
                    </strong>
                  </div>

                  <div className="mt-2 flex justify-between gap-4 text-sm">
                    <span className="text-zinc-500">Aparelho</span>
                    <strong className="text-right">
                      {itemSelecionado.os.aparelhoMarca}{" "}
                      {itemSelecionado.os.aparelhoModelo}
                    </strong>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    {pagamentoNota.estornado
                      ? "Valor estornado"
                      : "Valor recebido"}
                  </p>
                  <p
                    className={`mt-1 text-3xl font-black ${
                      pagamentoNota.estornado
                        ? "text-red-600"
                        : "text-zinc-900"
                    }`}
                  >
                    {dinheiro(
                      Number(pagamentoNota.valor ?? 0)
                    )}
                  </p>
                  <p className="mt-2 text-sm font-semibold">
                    {formaLabels[pagamentoNota.forma]}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {pagamentoNota.estornado
                      ? "Pagamento devolvido ao cliente"
                      : dataPagamentoTexto(
                          pagamentoNota.dataPagamento
                        )}
                  </p>
                </div>

                <div className="mt-5 rounded-2xl border border-zinc-300/30 bg-zinc-100 p-4 text-sm shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
                  <div className="flex justify-between gap-4">
                    <span className="text-zinc-500">
                      Total da OS
                    </span>
                    <strong>
                      {dinheiro(itemSelecionado.total)}
                    </strong>
                  </div>

                  <div className="mt-2 flex justify-between gap-4">
                    <span className="text-zinc-500">
                      {pagamentoNota.estornado
                        ? "Pago após o estorno"
                        : "Pago após este lançamento"}
                    </span>
                    <strong>
                      {dinheiro(
                        itemSelecionado.totalPago
                      )}
                    </strong>
                  </div>

                  <div className="mt-2 flex justify-between gap-4">
                    <span className="text-zinc-500">
                      Saldo {pagamentoNota.estornado ? "após o estorno" : "restante"}
                    </span>
                    <strong>
                      {dinheiro(itemSelecionado.saldo)}
                    </strong>
                  </div>
                </div>

                {pagamentoNota.observacao && (
                  <div className="mt-4 text-sm">
                    <p className="font-bold">
                      Observação
                    </p>
                    <p className="mt-1 text-zinc-600">
                      {pagamentoNota.observacao}
                    </p>
                  </div>
                )}

                <p className="mt-6 text-center text-[11px] text-zinc-400">
                  {pagamentoNota.estornado
                    ? "Comprovante referente à devolução do pagamento registrada no sistema."
                    : "Comprovante referente ao recebimento registrado no sistema."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-zinc-200 p-4">
                <button
                  type="button"
                  onClick={() => setPagamentoNota(null)}
                  className="h-12 rounded-xl bg-zinc-100 font-bold text-zinc-700"
                >
                  Fechar
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="h-12 rounded-xl bg-orange-500 font-bold text-black"
                >
                  🖨️ Imprimir
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
