"use client";

import Link from "next/link";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import AuthGuard from "@/components/auth/auth-guard";

import {
  atualizarPeca,
  criarPeca,
  excluirPeca,
  listarMovimentacoesPeca,
  listarPecas,
} from "@/lib/pecas";

import type {
  MovimentacaoEstoque,
  Peca,
} from "@/lib/types";

/* =========================================================
   FUNÇÕES AUXILIARES
   ========================================================= */

function formatarData(
  valor: MovimentacaoEstoque["criadoEm"]
) {
  if (!valor) {
    return "Data não disponível";
  }

  const data =
    typeof valor.toDate === "function"
      ? valor.toDate()
      : new Date(
          valor as unknown as string
        );

  return data.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/* =========================================================
   PÁGINA DE ESTOQUE
   ========================================================= */

export default function EstoquePage() {
  /* -------------------------------------------------------
     DADOS
     ------------------------------------------------------- */

  const [pecas, setPecas] = useState<Peca[]>(
    []
  );

  const [busca, setBusca] = useState("");

  /* -------------------------------------------------------
     MODAIS
     ------------------------------------------------------- */

  const [abrirCadastro, setAbrirCadastro] =
    useState(false);

  const [abrirEdicao, setAbrirEdicao] =
    useState(false);

  const [abrirHistorico, setAbrirHistorico] =
    useState(false);

  const [abrirExclusao, setAbrirExclusao] =
    useState(false);

  /* -------------------------------------------------------
     PEÇA SELECIONADA
     ------------------------------------------------------- */

  const [pecaSelecionada, setPecaSelecionada] =
    useState<Peca | null>(null);

  /* -------------------------------------------------------
     HISTÓRICO
     ------------------------------------------------------- */

  const [movimentacoes, setMovimentacoes] =
    useState<MovimentacaoEstoque[]>([]);

  const [
    carregandoHistorico,
    setCarregandoHistorico,
  ] = useState(false);

  /* -------------------------------------------------------
     ESTADOS
     ------------------------------------------------------- */

  const [carregando, setCarregando] =
    useState(true);

  const [salvando, setSalvando] =
    useState(false);

  const [erro, setErro] = useState("");

  /* -------------------------------------------------------
     FORMULÁRIO
     ------------------------------------------------------- */

  const [nome, setNome] = useState("");

  const [categoria, setCategoria] =
    useState("");

  const [fornecedor, setFornecedor] =
    useState("");

  const [quantidade, setQuantidade] =
    useState("");

  const [estoqueMinimo, setEstoqueMinimo] =
    useState("1");

  const [custoUnitario, setCustoUnitario] =
    useState("");

  const [precoVenda, setPrecoVenda] =
    useState("");

  /* =======================================================
     CARREGAR PEÇAS
     ======================================================= */

  async function carregarPecas() {
    try {
      setErro("");

      const resultado =
        await listarPecas();

      setPecas(resultado);
    } catch {
      setErro(
        "Não foi possível carregar o estoque."
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarPecas();
  }, []);

  /* =======================================================
     FILTRAR PEÇAS
     ======================================================= */

  const pecasFiltradas = useMemo(() => {
    const termo = busca
      .trim()
      .toLowerCase();

    if (!termo) {
      return pecas;
    }

    return pecas.filter((peca) =>
      [
        peca.codigo,
        peca.nome,
        peca.categoria,
        peca.fornecedor,
      ]
        .filter(Boolean)
        .some((valor) =>
          valor!
            .toLowerCase()
            .includes(termo)
        )
    );
  }, [pecas, busca]);

  /* =======================================================
     RESUMO DO ESTOQUE
     ======================================================= */

  const resumoEstoque = useMemo(() => {
    const totalItens =
      pecas.reduce(
        (total, peca) =>
          total + peca.quantidade,
        0
      );

    const itensBaixos =
      pecas.filter(
        (peca) =>
          peca.quantidade <=
          peca.estoqueMinimo
      ).length;

    const itensZerados =
      pecas.filter(
        (peca) =>
          peca.quantidade === 0
      ).length;

    return {
      totalLotes: pecas.length,
      totalItens,
      itensBaixos,
      itensZerados,
    };
  }, [pecas]);

  /* =======================================================
     LIMPAR FORMULÁRIO
     ======================================================= */

  function limparFormulario() {
    setNome("");
    setCategoria("");
    setFornecedor("");
    setQuantidade("");
    setEstoqueMinimo("1");
    setCustoUnitario("");
    setPrecoVenda("");
    setErro("");
  }

  /* =======================================================
     NOVA COMPRA
     ======================================================= */

  function abrirNovaCompra() {
    limparFormulario();

    setPecaSelecionada(null);

    setAbrirCadastro(true);
  }

  /* =======================================================
     PREPARAR EDIÇÃO
     ======================================================= */

  function prepararEdicao(
    peca: Peca
  ) {
    setPecaSelecionada(peca);

    setNome(peca.nome);

    setCategoria(
      peca.categoria ?? ""
    );

    setFornecedor(
      peca.fornecedor ?? ""
    );

    setQuantidade(
      String(peca.quantidade)
    );

    setEstoqueMinimo(
      String(peca.estoqueMinimo)
    );

    setCustoUnitario(
      String(peca.custoUnitario)
    );

    setPrecoVenda(
      String(peca.precoVenda)
    );

    setErro("");

    setAbrirEdicao(true);
  }

  /* =======================================================
     CADASTRAR NOVA COMPRA
     ======================================================= */

  async function salvarPeca(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErro("");

    const quantidadeNumero =
      Number(quantidade);

    const estoqueMinimoNumero =
      Number(estoqueMinimo);

    const custoNumero =
      Number(custoUnitario);

    const vendaNumero =
      Number(precoVenda);

    if (
      !nome.trim() ||
      quantidadeNumero < 0 ||
      estoqueMinimoNumero < 0 ||
      custoNumero < 0 ||
      vendaNumero <= 0
    ) {
      setErro(
        "Preencha os campos obrigatórios corretamente."
      );

      return;
    }

    if (vendaNumero < custoNumero) {
      setErro(
        "O preço de venda não pode ser menor que o custo."
      );

      return;
    }

    try {
      setSalvando(true);

      await criarPeca({
        nome: nome.trim(),

        categoria:
          categoria.trim() ||
          undefined,

        fornecedor:
          fornecedor.trim() ||
          undefined,

        quantidade:
          quantidadeNumero,

        estoqueMinimo:
          estoqueMinimoNumero,

        custoUnitario:
          custoNumero,

        precoVenda:
          vendaNumero,
      });

      limparFormulario();

      setAbrirCadastro(false);

      await carregarPecas();
    } catch {
      setErro(
        "Não foi possível cadastrar a compra."
      );
    } finally {
      setSalvando(false);
    }
  }

  /* =======================================================
     EDITAR LOTE
     ======================================================= */

  async function salvarEdicao(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!pecaSelecionada) {
      return;
    }

    setErro("");

    const estoqueMinimoNumero =
      Number(estoqueMinimo);

    const custoNumero =
      Number(custoUnitario);

    const vendaNumero =
      Number(precoVenda);

    if (
      !nome.trim() ||
      estoqueMinimoNumero < 0 ||
      custoNumero < 0 ||
      vendaNumero <= 0
    ) {
      setErro(
        "Preencha os campos obrigatórios corretamente."
      );

      return;
    }

    if (vendaNumero < custoNumero) {
      setErro(
        "O preço de venda não pode ser menor que o custo."
      );

      return;
    }

    try {
      setSalvando(true);

      await atualizarPeca(
        pecaSelecionada.id,
        {
          nome: nome.trim(),

          categoria:
            categoria.trim() ||
            undefined,

          fornecedor:
            fornecedor.trim() ||
            undefined,

          estoqueMinimo:
            estoqueMinimoNumero,

          custoUnitario:
            custoNumero,

          precoVenda:
            vendaNumero,
        }
      );

      limparFormulario();

      setPecaSelecionada(null);

      setAbrirEdicao(false);

      await carregarPecas();
    } catch {
      setErro(
        "Não foi possível atualizar o lote."
      );
    } finally {
      setSalvando(false);
    }
  }

  /* =======================================================
     HISTÓRICO
     ======================================================= */

  async function abrirHistoricoPeca(
    peca: Peca
  ) {
    try {
      setPecaSelecionada(peca);

      setMovimentacoes([]);

      setErro("");

      setAbrirHistorico(true);

      setCarregandoHistorico(true);

      const resultado =
        await listarMovimentacoesPeca(
          peca.id
        );

      resultado.sort((a, b) => {
        const dataA =
          a.criadoEm?.toMillis?.() ?? 0;

        const dataB =
          b.criadoEm?.toMillis?.() ?? 0;

        return dataB - dataA;
      });

      setMovimentacoes(resultado);
    } catch {
      setErro(
        "Não foi possível carregar o histórico."
      );
    } finally {
      setCarregandoHistorico(false);
    }
  }

  /* =======================================================
     EXCLUIR
     ======================================================= */

  async function confirmarExclusao() {
    if (!pecaSelecionada) {
      return;
    }

    try {
      setSalvando(true);

      setErro("");

      await excluirPeca(
        pecaSelecionada.id
      );

      setPecaSelecionada(null);

      setAbrirExclusao(false);

      await carregarPecas();
    } catch {
      setErro(
        "Não foi possível excluir o lote."
      );
    } finally {
      setSalvando(false);
    }
  }

  /* =======================================================
     FECHAR MODAIS
     ======================================================= */

  function fecharModais() {
    if (salvando) {
      return;
    }

    setAbrirCadastro(false);

    setAbrirEdicao(false);

    setAbrirHistorico(false);

    setAbrirExclusao(false);

    setPecaSelecionada(null);

    setMovimentacoes([]);

    limparFormulario();
  }

  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <AuthGuard>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,122,0,0.08),transparent_38%),#09090b] text-zinc-100">

        <div className="mx-auto w-full max-w-5xl px-3 pb-8 pt-4 sm:px-4 sm:pt-5">

          {/* =================================================
              CABEÇALHO
             ================================================= */}

          <header className="mb-4">

            <div className="flex items-center justify-between">

              <div>

                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-orange-400">
                  TEIXA CELL
                </p>

                <h1 className="mt-1 text-xl font-black sm:text-2xl">
                  Estoque
                </h1>

              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/dashboard"
                  className="flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.045] px-3 text-xs font-bold text-zinc-300 shadow-[0_6px_18px_rgba(0,0,0,0.22)] backdrop-blur-xl transition active:scale-95 hover:bg-white/[0.07]"
                >
                  ← Inicio
                </Link>
<button
                type="button"
                onClick={abrirNovaCompra}
                className="flex h-11 items-center rounded-xl bg-orange-500 px-4 text-sm font-black text-black shadow-[0_8px_22px_rgba(249,115,22,0.16)] transition active:scale-95 hover:bg-orange-400"
              >
                + Nova compra
              </button>
              </div>

            </div>

          </header>

          {/* =================================================
              RESUMO OPERACIONAL
             ================================================= */}

          <section className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">

            <div className="rounded-2xl border border-white/10 border-l-2 border-l-sky-400 bg-white/[0.045] p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-[0_12px_30px_rgba(0,0,0,0.36)]">

              <p className="text-[11px] text-zinc-500">
                Lotes
              </p>

              <p className="mt-1 text-xl font-bold">
                {resumoEstoque.totalLotes}
              </p>

            </div>

            <div className="rounded-2xl border border-white/10 border-l-2 border-l-cyan-400 bg-white/[0.045] p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-[0_12px_30px_rgba(0,0,0,0.36)]">

              <p className="text-[11px] text-zinc-500">
                Unidades
              </p>

              <p className="mt-1 text-xl font-bold">
                {resumoEstoque.totalItens}
              </p>

            </div>

            <div
              className={`rounded-2xl border p-3 ${
                resumoEstoque.itensBaixos > 0
                  ? "border-orange-400/30 border-l-2 border-l-orange-400 bg-orange-500/[0.055] shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl"
                  : "border-white/10 border-l-2 border-l-orange-400 bg-white/[0.045] shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl"
              }`}
            >

              <p className="text-[11px] text-zinc-500">
                Estoque baixo
              </p>

              <p
                className={`mt-1 text-xl font-bold ${
                  resumoEstoque.itensBaixos > 0
                    ? "text-orange-400"
                    : "text-white"
                }`}
              >
                {resumoEstoque.itensBaixos}
              </p>

            </div>

          </section>

          {/* =================================================
              BUSCA
             ================================================= */}

          <div className="relative mb-4">

            <input
              type="search"
              value={busca}
              onChange={(event) =>
                setBusca(
                  event.target.value
                )
              }
              placeholder="Buscar peça ou código..."
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-sm text-zinc-100 shadow-[0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur-xl outline-none transition focus:border-orange-400/60 focus:bg-white/[0.06] placeholder:text-zinc-600"
            />

          </div>

          {/* =================================================
              ERRO
             ================================================= */}

          {erro &&
            !abrirCadastro &&
            !abrirEdicao &&
            !abrirHistorico &&
            !abrirExclusao && (
              <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                {erro}
              </div>
            )}

          {/* =================================================
              LISTAGEM
             ================================================= */}

          {carregando ? (

            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-8 text-center text-sm text-zinc-500 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl">
              Carregando estoque...
            </div>

          ) : pecasFiltradas.length === 0 ? (

            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-6 py-12 text-center shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-xl">

              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-2xl">
                📦
              </div>

              <p className="mt-4 font-semibold">
                Nenhum lote encontrado
              </p>

              <p className="mt-2 text-sm text-zinc-500">
                Cadastre uma nova compra para começar.
              </p>

            </div>

          ) : (

            <div className="space-y-3">

              {pecasFiltradas.map(
                (peca) => {

                  const estoqueBaixo =
                    peca.quantidade <=
                    peca.estoqueMinimo;

                  const estoqueZerado =
                    peca.quantidade === 0;

                  return (
                    <article
                      key={peca.id}
                      className={`overflow-hidden rounded-2xl border bg-white/[0.045] shadow-[0_10px_28px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.06] hover:shadow-[0_14px_34px_rgba(0,0,0,0.38)] ${estoqueZerado ? "border-red-400/25 border-l-2 border-l-red-400" : estoqueBaixo ? "border-orange-400/25 border-l-2 border-l-orange-400" : "border-white/10 border-l-2 border-l-emerald-400"}`}
                    >

                      <div className="p-3.5">

                        {/* -------------------------------
                            CÓDIGO + STATUS
                           ------------------------------- */}

                        <div className="flex items-start justify-between gap-3">

                          <div className="min-w-0">

                            <span className="inline-flex rounded-lg bg-orange-500/10 px-2.5 py-1 text-[11px] font-bold text-orange-400">
                              {peca.codigo}
                            </span>

                            <h2 className="mt-2 truncate text-base font-bold">
                              {peca.nome}
                            </h2>

                          </div>

                          {estoqueZerado ? (

                            <span className="shrink-0 rounded-full bg-red-500/10 px-2.5 py-1 text-[10px] font-bold text-red-400">
                              SEM ESTOQUE
                            </span>

                          ) : estoqueBaixo ? (

                            <span className="shrink-0 rounded-full bg-orange-500/10 px-2.5 py-1 text-[10px] font-bold text-orange-400">
                              ESTOQUE BAIXO
                            </span>

                          ) : (

                            <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400">
                              DISPONÍVEL
                            </span>

                          )}

                        </div>

                        {/* -------------------------------
                            INFORMAÇÕES DE ESTOQUE
                           ------------------------------- */}

                        <div className="mt-4 grid grid-cols-2 gap-3">

                          <div className="rounded-xl border border-white/[0.05] bg-black/30 p-2.5 shadow-[0_5px_16px_rgba(0,0,0,0.20)] backdrop-blur-md">

                            <p className="text-[11px] text-zinc-500">
                              Quantidade
                            </p>

                            <p className="mt-1 text-lg font-bold">
                              {peca.quantidade}
                              <span className="ml-1 text-xs font-normal text-zinc-500">
                                un.
                              </span>
                            </p>

                          </div>

                          <div className="rounded-xl border border-white/[0.05] bg-black/30 p-2.5 shadow-[0_5px_16px_rgba(0,0,0,0.20)] backdrop-blur-md">

                            <p className="text-[11px] text-zinc-500">
                              Estoque mínimo
                            </p>

                            <p className="mt-1 text-lg font-bold">
                              {peca.estoqueMinimo}
                              <span className="ml-1 text-xs font-normal text-zinc-500">
                                un.
                              </span>
                            </p>

                          </div>

                        </div>

                        {/* -------------------------------
                            CATEGORIA / FORNECEDOR
                           ------------------------------- */}

                        {(peca.categoria ||
                          peca.fornecedor) && (

                          <div className="mt-3 flex flex-wrap gap-2">

                            {peca.categoria && (
                              <span className="rounded-lg border border-white/[0.06] bg-white/[0.06] px-2.5 py-1 text-[11px] text-zinc-400 backdrop-blur-md">
                                {peca.categoria}
                              </span>
                            )}

                            {peca.fornecedor && (
                              <span className="rounded-lg border border-white/[0.06] bg-white/[0.06] px-2.5 py-1 text-[11px] text-zinc-400 backdrop-blur-md">
                                {peca.fornecedor}
                              </span>
                            )}

                          </div>

                        )}

                      </div>

                      {/* -------------------------------
                          AÇÕES
                         ------------------------------- */}

                      <div className="grid grid-cols-3 border-t border-white/[0.08] bg-black/10">

                        <button
                          type="button"
                          onClick={() =>
                            prepararEdicao(
                              peca
                            )
                          }
                          className="border-r border-white/[0.08] py-3 text-xs font-semibold text-zinc-300 transition active:bg-white/[0.06] hover:bg-white/[0.04]"
                        >
                          ✏️ Editar
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            abrirHistoricoPeca(
                              peca
                            )
                          }
                          className="border-r border-white/[0.08] py-3 text-xs font-semibold text-zinc-300 transition active:bg-white/[0.06] hover:bg-white/[0.04]"
                        >
                          📋 Histórico
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setPecaSelecionada(
                              peca
                            );

                            setErro("");

                            setAbrirExclusao(
                              true
                            );
                          }}
                          className="py-3 text-xs font-semibold text-red-400 transition active:bg-red-950/30 hover:bg-red-500/[0.05]"
                        >
                          🗑️ Excluir
                        </button>

                      </div>

                    </article>
                  );
                }
              )}

            </div>

          )}

        </div>

        {/* ===================================================
            MODAL — NOVA COMPRA
           =================================================== */}

        {abrirCadastro && (

          <div className="fixed inset-0 z-50 bg-black/70">

            <div className="mx-auto flex h-full w-full max-w-xl flex-col bg-zinc-900">

              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-4">

                <div>

                  <p className="text-[11px] font-bold uppercase tracking-wider text-orange-500">
                    NOVO LOTE
                  </p>

                  <h2 className="mt-1 text-xl font-bold">
                    Nova compra
                  </h2>

                </div>

                <button
                  type="button"
                  onClick={fecharModais}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-xl text-zinc-400"
                >
                  ×
                </button>

              </div>

              <div className="flex-1 overflow-y-auto px-4 py-5">

                {erro && (
                  <div className="mb-5 rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                    {erro}
                  </div>
                )}

                <form
                  id="form-nova-compra"
                  onSubmit={salvarPeca}
                  className="space-y-4"
                >

                  <div>

                    <label className="mb-2 block text-sm font-medium">
                      Nome da peça *
                    </label>

                    <input
                      value={nome}
                      onChange={(event) =>
                        setNome(
                          event.target.value
                        )
                      }
                      placeholder="Ex.: Tela iPhone 11"
                      required
                      className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                    />

                  </div>

                  <div className="grid grid-cols-2 gap-3">

                    <div>

                      <label className="mb-2 block text-sm font-medium">
                        Categoria
                      </label>

                      <input
                        value={categoria}
                        onChange={(event) =>
                          setCategoria(
                            event.target.value
                          )
                        }
                        placeholder="Tela"
                        className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                      />

                    </div>

                    <div>

                      <label className="mb-2 block text-sm font-medium">
                        Fornecedor
                      </label>

                      <input
                        value={fornecedor}
                        onChange={(event) =>
                          setFornecedor(
                            event.target.value
                          )
                        }
                        className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                      />

                    </div>

                  </div>

                  <div className="grid grid-cols-2 gap-3">

                    <div>

                      <label className="mb-2 block text-sm font-medium">
                        Quantidade *
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={quantidade}
                        onChange={(event) =>
                          setQuantidade(
                            event.target.value
                          )
                        }
                        required
                        className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                      />

                    </div>

                    <div>

                      <label className="mb-2 block text-sm font-medium">
                        Estoque mínimo
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={estoqueMinimo}
                        onChange={(event) =>
                          setEstoqueMinimo(
                            event.target.value
                          )
                        }
                        required
                        className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                      />

                    </div>

                  </div>

                  {/* -----------------------------------------
                      CAMPOS FINANCEIROS
                     ----------------------------------------- */}

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">

                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Dados da compra
                    </p>

                    <div className="grid grid-cols-2 gap-3">

                      <div>

                        <label className="mb-2 block text-sm font-medium">
                          Custo unitário *
                        </label>

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={custoUnitario}
                          onChange={(event) =>
                            setCustoUnitario(
                              event.target.value
                            )
                          }
                          required
                          className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm outline-none focus:border-orange-500"
                        />

                      </div>

                      <div>

                        <label className="mb-2 block text-sm font-medium">
                          Preço de venda *
                        </label>

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={precoVenda}
                          onChange={(event) =>
                            setPrecoVenda(
                              event.target.value
                            )
                          }
                          required
                          className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm outline-none focus:border-orange-500"
                        />

                      </div>

                    </div>

                    <p className="mt-3 text-[11px] leading-5 text-zinc-600">
                      Esses valores serão utilizados posteriormente no módulo Financeiro. Eles não aparecem na tela principal do estoque.
                    </p>

                  </div>

                </form>

              </div>

              <div className="border-t border-zinc-800 p-4">

                <button
                  form="form-nova-compra"
                  type="submit"
                  disabled={salvando}
                  className="h-12 w-full rounded-xl bg-orange-500 font-bold text-black active:scale-[0.99] disabled:opacity-60"
                >
                  {salvando
                    ? "Salvando..."
                    : "Cadastrar compra"}
                </button>

              </div>

            </div>

          </div>

        )}

        {/* ===================================================
            MODAL — EDITAR
           =================================================== */}

        {abrirEdicao &&
          pecaSelecionada && (

            <div className="fixed inset-0 z-50 bg-black/70">

              <div className="mx-auto flex h-full w-full max-w-xl flex-col bg-zinc-900">

                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-4">

                  <div>

                    <p className="text-[11px] font-bold uppercase tracking-wider text-orange-500">
                      {pecaSelecionada.codigo}
                    </p>

                    <h2 className="mt-1 text-xl font-bold">
                      Editar lote
                    </h2>

                  </div>

                  <button
                    type="button"
                    onClick={fecharModais}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-xl text-zinc-400"
                  >
                    ×
                  </button>

                </div>

                <div className="flex-1 overflow-y-auto px-4 py-5">

                  {erro && (
                    <div className="mb-5 rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                      {erro}
                    </div>
                  )}

                  <form
                    id="form-editar"
                    onSubmit={salvarEdicao}
                    className="space-y-4"
                  >

                    <div>

                      <label className="mb-2 block text-sm font-medium">
                        Código do lote
                      </label>

                      <input
                        value={
                          pecaSelecionada.codigo
                        }
                        disabled
                        className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm text-zinc-500"
                      />

                    </div>

                    <div>

                      <label className="mb-2 block text-sm font-medium">
                        Nome da peça *
                      </label>

                      <input
                        value={nome}
                        onChange={(event) =>
                          setNome(
                            event.target.value
                          )
                        }
                        required
                        className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                      />

                    </div>

                    <div className="grid grid-cols-2 gap-3">

                      <div>

                        <label className="mb-2 block text-sm font-medium">
                          Categoria
                        </label>

                        <input
                          value={categoria}
                          onChange={(event) =>
                            setCategoria(
                              event.target.value
                            )
                          }
                          className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                        />

                      </div>

                      <div>

                        <label className="mb-2 block text-sm font-medium">
                          Fornecedor
                        </label>

                        <input
                          value={fornecedor}
                          onChange={(event) =>
                            setFornecedor(
                              event.target.value
                            )
                          }
                          className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                        />

                      </div>

                    </div>

                    <div className="grid grid-cols-2 gap-3">

                      <div>

                        <label className="mb-2 block text-sm font-medium">
                          Quantidade atual
                        </label>

                        <input
                          value={quantidade}
                          disabled
                          className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm text-zinc-500"
                        />

                      </div>

                      <div>

                        <label className="mb-2 block text-sm font-medium">
                          Estoque mínimo
                        </label>

                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={estoqueMinimo}
                          onChange={(event) =>
                            setEstoqueMinimo(
                              event.target.value
                            )
                          }
                          required
                          className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                        />

                      </div>

                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">

                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                        Valores da peça
                      </p>

                      <div className="grid grid-cols-2 gap-3">

                        <div>

                          <label className="mb-2 block text-sm font-medium">
                            Custo unitário
                          </label>

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={custoUnitario}
                            onChange={(event) =>
                              setCustoUnitario(
                                event.target.value
                              )
                            }
                            required
                            className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm outline-none focus:border-orange-500"
                          />

                        </div>

                        <div>

                          <label className="mb-2 block text-sm font-medium">
                            Preço de venda
                          </label>

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={precoVenda}
                            onChange={(event) =>
                              setPrecoVenda(
                                event.target.value
                              )
                            }
                            required
                            className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm outline-none focus:border-orange-500"
                          />

                        </div>

                      </div>

                    </div>

                  </form>

                </div>

                <div className="border-t border-zinc-800 p-4">

                  <button
                    form="form-editar"
                    type="submit"
                    disabled={salvando}
                    className="h-12 w-full rounded-xl bg-orange-500 font-bold text-black disabled:opacity-60"
                  >
                    {salvando
                      ? "Salvando..."
                      : "Salvar alterações"}
                  </button>

                </div>

              </div>

            </div>

          )}

        {/* ===================================================
            MODAL — HISTÓRICO
           =================================================== */}

        {abrirHistorico &&
          pecaSelecionada && (

            <div className="fixed inset-0 z-50 bg-black/70">

              <div className="mx-auto flex h-full w-full max-w-xl flex-col bg-zinc-900">

                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-4">

                  <div>

                    <p className="text-[11px] font-bold uppercase tracking-wider text-orange-500">
                      {pecaSelecionada.codigo}
                    </p>

                    <h2 className="mt-1 text-xl font-bold">
                      Histórico
                    </h2>

                  </div>

                  <button
                    type="button"
                    onClick={fecharModais}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-xl text-zinc-400"
                  >
                    ×
                  </button>

                </div>

                <div className="flex-1 overflow-y-auto px-4 py-5">

                  <div className="mb-5 rounded-2xl bg-zinc-950 p-4">

                    <p className="text-sm font-semibold">
                      {pecaSelecionada.nome}
                    </p>

                    <p className="mt-1 text-xs text-zinc-500">
                      Estoque atual:{" "}
                      <strong className="text-zinc-300">
                        {pecaSelecionada.quantidade}{" "}
                        unidades
                      </strong>
                    </p>

                  </div>

                  {carregandoHistorico ? (

                    <div className="rounded-2xl border border-zinc-800 p-8 text-center text-sm text-zinc-500">
                      Carregando histórico...
                    </div>

                  ) : movimentacoes.length ===
                    0 ? (

                    <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
                      Nenhuma movimentação encontrada.
                    </div>

                  ) : (

                    <div className="space-y-3">

                      {movimentacoes.map(
                        (movimentacao) => {

                          const entrada =
                            movimentacao.tipo ===
                            "entrada";

                          return (
                            <div
                              key={
                                movimentacao.id
                              }
                              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                            >

                              <div className="flex items-start justify-between gap-4">

                                <div>

                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                      entrada
                                        ? "bg-emerald-500/10 text-emerald-400"
                                        : "bg-red-500/10 text-red-400"
                                    }`}
                                  >
                                    {entrada
                                      ? "ENTRADA"
                                      : "SAÍDA"}
                                  </span>

                                  <p className="mt-2 text-base font-bold">
                                    {entrada
                                      ? "+"
                                      : "-"}
                                    {
                                      movimentacao.quantidade
                                    }{" "}
                                    unidades
                                  </p>

                                  <p className="mt-1 text-xs capitalize text-zinc-500">
                                    {
                                      movimentacao.origem
                                    }
                                  </p>

                                </div>

                                <p className="text-right text-[11px] text-zinc-600">
                                  {formatarData(
                                    movimentacao.criadoEm
                                  )}
                                </p>

                              </div>

                              {movimentacao.observacao && (
                                <p className="mt-3 border-t border-zinc-800 pt-3 text-xs leading-5 text-zinc-500">
                                  {
                                    movimentacao.observacao
                                  }
                                </p>
                              )}

                            </div>
                          );
                        }
                      )}

                    </div>

                  )}

                </div>

              </div>

            </div>

          )}

        {/* ===================================================
            MODAL — EXCLUSÃO
           =================================================== */}

        {abrirExclusao &&
          pecaSelecionada && (

            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">

              <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-5">

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-xl">
                  🗑️
                </div>

                <h2 className="mt-4 text-xl font-bold">
                  Excluir lote?
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Você está excluindo o lote{" "}
                  <strong className="text-white">
                    {pecaSelecionada.codigo}
                  </strong>{" "}
                  —{" "}
                  <strong className="text-white">
                    {pecaSelecionada.nome}
                  </strong>
                  .
                </p>

                <p className="mt-3 rounded-xl bg-orange-500/5 p-3 text-xs leading-5 text-orange-400">
                  Esta ação também remove as movimentações de estoque desse lote. Use somente para registros de teste.
                </p>

                {erro && (
                  <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                    {erro}
                  </div>
                )}

                <div className="mt-5 grid grid-cols-2 gap-3">

                  <button
                    type="button"
                    onClick={fecharModais}
                    disabled={salvando}
                    className="h-12 rounded-xl border border-zinc-700 font-semibold text-zinc-300"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={confirmarExclusao}
                    disabled={salvando}
                    className="h-12 rounded-xl bg-red-600 font-bold text-white disabled:opacity-60"
                  >
                    {salvando
                      ? "Excluindo..."
                      : "Excluir"}
                  </button>

                </div>

              </div>

            </div>

          )}

      </main>
    </AuthGuard>
  );
}