"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AuthGuard from "@/components/auth/auth-guard";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { obterApuracaoMensal } from "@/lib/controle-financeiro";
import { listarPecas } from "@/lib/pecas";
import { listarServicos } from "@/lib/servicos";
import type { Peca } from "@/lib/types";
import type { Servico } from "@/lib/servicos";

/* =========================================================
   DASHBOARD TEIXA CELL
   ---------------------------------------------------------
   O Dashboard é a central do sistema.

   Ele NÃO cria dados próprios:
   - OS vêm de servicos;
   - estoque vem de pecas;
   - financeiro vem do Controle Financeiro.

   Indicadores financeiros respeitam o mês selecionado.
   Indicadores operacionais mostram a situação atual das OS.
   ========================================================= */

type ResumoOS = {
  total: number;
  orcamento: number;
  aguardandoAprovacao: number;
  emAndamento: number;
  aguardandoPeca: number;
  finalizadas: number;
  entregues: number;
};

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

function resumirOS(servicos: Servico[]): ResumoOS {
  const resumo: ResumoOS = {
    total: servicos.length,
    orcamento: 0,
    aguardandoAprovacao: 0,
    emAndamento: 0,
    aguardandoPeca: 0,
    finalizadas: 0,
    entregues: 0,
  };

  servicos.forEach((servico) => {
    switch (servico.status) {
      case "orcamento":
        resumo.orcamento++;
        break;

      case "aguardando_aprovacao":
        resumo.aguardandoAprovacao++;
        break;

      case "em_andamento":
        resumo.emAndamento++;
        break;

      case "aguardando_peca":
        resumo.aguardandoPeca++;
        break;

      /*
       * Na estrutura atual do projeto, "pronto" representa
       * a OS que já foi concluída e está pronta para entrega.
       */
      case "concluido":
        resumo.finalizadas++;
        break;

      case "entregue":
        resumo.entregues++;
        break;

      default:
        break;
    }
  });

  return resumo;
}

function CardIndicador({
  titulo,
  valor,
  detalhe,
  href,
  destaque = false,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  href?: string;
  destaque?: boolean;
}) {
  // A cor da borda identifica rapidamente o tipo de informação,
  // seguindo o padrão visual do novo Dashboard.
  const acento =
    titulo === "Recebido" || titulo === "Concluídas"
      ? "border-l-2 border-l-emerald-400"
      : titulo === "A receber" || titulo === "Orçamento" || titulo === "Estoque baixo"
      ? "border-l-2 border-l-amber-400"
      : titulo === "Gastos" || titulo === "Sem estoque" || titulo === "Aguardando peça"
      ? "border-l-2 border-l-red-400"
      : titulo === "Possível ganho" || titulo === "Saldo disponível"
      ? "border-l-2 border-l-orange-400"
      : "border-l-2 border-l-sky-400";

  const corTitulo =
    titulo === "Recebido" || titulo === "Concluídas"
      ? "text-emerald-400"
      : titulo === "A receber" || titulo === "Orçamento" || titulo === "Estoque baixo"
      ? "text-amber-400"
      : titulo === "Gastos" || titulo === "Sem estoque" || titulo === "Aguardando peça"
      ? "text-red-400"
      : destaque
      ? "text-orange-400"
      : "text-zinc-500";

  const conteudo = (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] p-3
        shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)]
        backdrop-blur-xl transition-all duration-200
        ${acento}
        ${href ? "cursor-pointer hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-[0_12px_30px_rgba(0,0,0,0.36)] active:translate-y-0 active:scale-[0.985]" : ""}
        ${destaque ? "ring-1 ring-orange-400/10" : ""}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.045] via-transparent to-transparent" />

      <div className="relative">
        <p
          className={`text-[10px] font-black uppercase tracking-[0.12em] ${corTitulo}`}
        >
          {titulo}
        </p>

        <p className="mt-1 text-lg font-black tracking-tight text-zinc-100 sm:text-xl">
          {valor}
        </p>

        <p className="mt-0.5 text-[9px] leading-tight text-zinc-500">
          {detalhe}
        </p>
      </div>
    </div>
  );

  return href ? <Link href={href}>{conteudo}</Link> : conteudo;
}

function MenuAcesso({
  href,
  icone,
  titulo,
  descricao,
}: {
  href: string;
  icone: string;
  titulo: string;
  descricao: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-white/10 bg-white/[0.045] p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.26)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.07] hover:shadow-[0_12px_30px_rgba(0,0,0,0.34)] active:translate-y-0 active:scale-[0.985] sm:rounded-2xl sm:p-3"
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/40 text-lg sm:h-10 sm:w-10">
          {icone}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-black group-hover:text-orange-400 sm:text-sm">
            {titulo}
          </p>

          <p className="mt-0.5 text-[10px] leading-tight text-zinc-500 sm:text-xs">
            {descricao}
          </p>
        </div>

        <span className="ml-auto text-lg text-zinc-700 group-hover:text-zinc-300">
          ›
        </span>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const [menuUsuarioAberto, setMenuUsuarioAberto] = useState(false);
  const router = useRouter();

  const [mes, setMes] = useState(mesAtual());

  const [servicos, setServicos] = useState<Servico[]>([]);
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [financeiro, setFinanceiro] =
    useState<Awaited<ReturnType<typeof obterApuracaoMensal>> | null>(null);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const resumoOS = useMemo(
    () => resumirOS(servicos),
    [servicos]
  );

  const estoqueResumo = useMemo(() => {
    const semEstoque = pecas.filter(
      (peca) => Number(peca.quantidade ?? 0) <= 0
    ).length;

    const estoqueBaixo = pecas.filter(
      (peca) =>
        Number(peca.quantidade ?? 0) > 0 &&
        Number(peca.quantidade ?? 0) <=
          Number(peca.estoqueMinimo ?? 0)
    ).length;

    const unidades = pecas.reduce(
      (total, peca) =>
        total + Number(peca.quantidade ?? 0),
      0
    );

    return {
      itens: pecas.length,
      unidades,
      estoqueBaixo,
      semEstoque,
    };
  }, [pecas]);

  async function carregarDashboard() {
    try {
      setCarregando(true);
      setErro("");

      const [listaServicos, listaPecas, resumoFinanceiro] =
        await Promise.all([
          listarServicos(),
          listarPecas(),
          obterApuracaoMensal(mes),
        ]);

      setServicos(listaServicos);
      setPecas(listaPecas);
      setFinanceiro(resumoFinanceiro);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o Dashboard."
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregarDashboard();
  }, [mes]);

  async function sair() {
    try {
      await signOut(auth);
      router.replace("/");
    } catch (error) {
      console.error("Erro ao sair do sistema:", error);
    }
  }

  return (
    <AuthGuard>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,122,0,0.08),transparent_38%),#09090b] pb-8 text-zinc-100">
        <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-5">

          {/* =================================================
              CABEÇALHO
             ================================================= */}

          <header className="mb-4">
            <div className="relative flex min-h-28 w-full items-center justify-center overflow-hidden rounded-2xl border border-orange-500/30 bg-white/[0.045] px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.30)] backdrop-blur-xl">
              <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-orange-500 shadow-[0_0_18px_rgba(249,115,22,0.45)]" />

              <img
                src="/logo-teixa-cell.png"
                alt="Teixa Cell"
                className="h-24 w-auto max-w-[72%] object-contain sm:h-28"
              />

              <button
                type="button"
                aria-label="Sair do sistema"
                onClick={() => void sair()}
                className="absolute right-2 top-2 flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2.5 text-[10px] font-black text-zinc-300 shadow-lg backdrop-blur-md transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-400 active:scale-95 sm:right-3 sm:top-3 sm:h-9 sm:px-3 sm:text-xs"
              >
                <span aria-hidden="true">↪</span>
                Sair
              </button>
            </div>
          </header>

          {/* =================================================
              NAVEGAÇÃO PRINCIPAL
             ================================================= */}

          <section className="mb-4">
            <div className="mb-2">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">
                Acesso rápido
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <MenuAcesso
                href="/dashboard/servicos"
                icone="🔧"
                titulo="Serviços"
                descricao="Ordens de serviço e atendimentos"
              />

              <MenuAcesso
                href="/dashboard/estoque"
                icone="📦"
                titulo="Estoque"
                descricao="Peças, quantidades e movimentações"
              />

              <MenuAcesso
                href="/dashboard/financeiro"
                icone="💳"
                titulo="Financeiro das OS"
                descricao="Pagamentos, parcelas e estornos"
              />

              <MenuAcesso
                href="/dashboard/controle-financeiro"
                icone="💰"
                titulo="Controle Financeiro"
                descricao="Resultado, dízimo, gastos e retiradas"
              />
            </div>
          </section>

          {/* =================================================
              PERÍODO FINANCEIRO
             ================================================= */}

          <section className="mb-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur-xl">
            <button
              type="button"
              onClick={() =>
                setMes(alterarMes(mes, -1))
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.07] text-base font-black"
              aria-label="Mês anterior"
            >
              ‹
            </button>

            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Financeiro
              </p>

              <p className="mt-0.5 text-xs font-black capitalize sm:text-sm">
                {formatarMes(mes)}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setMes(alterarMes(mes, 1))
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.07] text-base font-black"
              aria-label="Próximo mês"
            >
              ›
            </button>
          </section>

          {erro && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {erro}
            </div>
          )}

          {carregando ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500">
              Carregando Dashboard...
            </div>
          ) : (
            <>
              {/* =================================================
                  OS — SITUAÇÃO ATUAL
                 ================================================= */}

              <section>
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">
                      Ordens de serviço
                    </p>

                    <p className="mt-1 text-xs text-zinc-600">
                      Situação atual das OS
                    </p>
                  </div>

                  <Link
                    href="/dashboard/servicos"
                    className="text-xs font-bold text-orange-400"
                  >
                    Ver todas →
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <CardIndicador
                    titulo="Total"
                    valor={String(resumoOS.total)}
                    detalhe="OS cadastradas"
                    href="/dashboard/servicos"
                  />

                  <CardIndicador
                    titulo="Orçamento"
                    valor={String(resumoOS.orcamento)}
                    detalhe="Aguardando aprovação"
                    href="/dashboard/servicos"
                  />

                  <CardIndicador
                    titulo="Em andamento"
                    valor={String(resumoOS.emAndamento)}
                    detalhe="Serviço em execução"
                    href="/dashboard/servicos"
                    destaque={resumoOS.emAndamento > 0}
                  />

                  <CardIndicador
                    titulo="Aguardando peça"
                    valor={String(resumoOS.aguardandoPeca)}
                    detalhe="Serviço parado"
                    href="/dashboard/servicos"
                    destaque={resumoOS.aguardandoPeca > 0}
                  />

                  <CardIndicador
                    titulo="Concluídas"
                    valor={String(resumoOS.finalizadas)}
                    detalhe="Prontas para entrega"
                    href="/dashboard/servicos"
                  />

                  <CardIndicador
                    titulo="Entregues"
                    valor={String(resumoOS.entregues)}
                    detalhe="Já devolvidas ao cliente"
                    href="/dashboard/servicos"
                  />
                </div>
              </section>

              {/* =================================================
                  FINANCEIRO
                 ================================================= */}

              <section className="mt-4">
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">
                      Financeiro
                    </p>

                    <p className="mt-1 text-xs text-zinc-600">
                      Valores do mês selecionado
                    </p>
                  </div>

                  <Link
                    href="/dashboard/controle-financeiro"
                    className="text-xs font-bold text-orange-400"
                  >
                    Controle completo →
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <CardIndicador
                    titulo="Recebido"
                    valor={dinheiro(
                      financeiro?.receitaRecebida ?? 0
                    )}
                    detalhe="Pagamentos efetivos"
                    href="/dashboard/financeiro"
                  />

                  <CardIndicador
                    titulo="A receber"
                    valor={dinheiro(
                      financeiro?.aReceber ?? 0
                    )}
                    detalhe="OS abertas + finalizadas"
                    href="/dashboard/controle-financeiro"
                  />

                  <CardIndicador
                    titulo="Possível ganho"
                    valor={dinheiro(
                      financeiro?.possivelGanho ?? 0
                    )}
                    detalhe="Saldo das OS abertas"
                    href="/dashboard/controle-financeiro"
                    destaque={
                      (financeiro?.possivelGanho ?? 0) > 0
                    }
                  />

                  <CardIndicador
                    titulo="Lucro"
                    valor={dinheiro(
                      financeiro?.lucro ?? 0
                    )}
                    detalhe="Resultado apurado"
                    href="/dashboard/controle-financeiro"
                  />
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <CardIndicador
                    titulo="Dízimo"
                    valor={dinheiro(
                      financeiro?.dizimo ?? 0
                    )}
                    detalhe="10% do lucro"
                    href="/dashboard/controle-financeiro"
                  />

                  <CardIndicador
                    titulo="Gastos"
                    valor={dinheiro(
                      financeiro?.gastos ?? 0
                    )}
                    detalhe="Despesas da loja"
                    href="/dashboard/controle-financeiro"
                  />

                  <CardIndicador
                    titulo="Retiradas"
                    valor={dinheiro(
                      financeiro?.retiradas ?? 0
                    )}
                    detalhe="Uso pessoal"
                    href="/dashboard/controle-financeiro"
                  />

                  <CardIndicador
                    titulo="Saldo disponível"
                    valor={dinheiro(
                      financeiro?.saldoDisponivel ?? 0
                    )}
                    detalhe="Após saídas"
                    href="/dashboard/controle-financeiro"
                    destaque
                  />
                </div>
              </section>

              {/* =================================================
                  ESTOQUE
                 ================================================= */}

              <section className="mt-4">
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">
                      Estoque
                    </p>

                    <p className="mt-1 text-xs text-zinc-600">
                      Situação atual das peças
                    </p>
                  </div>

                  <Link
                    href="/dashboard/estoque"
                    className="text-xs font-bold text-orange-400"
                  >
                    Abrir estoque →
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <CardIndicador
                    titulo="Itens"
                    valor={String(estoqueResumo.itens)}
                    detalhe="Cadastros de peças"
                    href="/dashboard/estoque"
                  />

                  <CardIndicador
                    titulo="Unidades"
                    valor={String(estoqueResumo.unidades)}
                    detalhe="Quantidade disponível"
                    href="/dashboard/estoque"
                  />

                  <CardIndicador
                    titulo="Estoque baixo"
                    valor={String(
                      estoqueResumo.estoqueBaixo
                    )}
                    detalhe="No mínimo ou abaixo"
                    href="/dashboard/estoque"
                    destaque={
                      estoqueResumo.estoqueBaixo > 0
                    }
                  />

                  <CardIndicador
                    titulo="Sem estoque"
                    valor={String(
                      estoqueResumo.semEstoque
                    )}
                    detalhe="Quantidade zerada"
                    href="/dashboard/estoque"
                    destaque={
                      estoqueResumo.semEstoque > 0
                    }
                  />
                </div>
              </section>

              {/* =================================================
                  RESUMO OPERACIONAL
                 ================================================= */}

              <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 shadow-lg shadow-black/10 backdrop-blur-xl">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">
                  Atenção
                </p>

                <div className="mt-2 space-y-1.5">
                  {resumoOS.aguardandoPeca > 0 && (
                    <Link
                      href="/dashboard/servicos"
                      className="flex items-center justify-between rounded-lg bg-black/30 p-2.5"
                    >
                      <div>
                        <p className="text-sm font-bold">
                          OS aguardando peça
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-600">
                          Existem serviços parados por falta de peça.
                        </p>
                      </div>

                      <span className="text-lg font-black text-orange-400">
                        {resumoOS.aguardandoPeca}
                      </span>
                    </Link>
                  )}

                  {estoqueResumo.estoqueBaixo > 0 && (
                    <Link
                      href="/dashboard/estoque"
                      className="flex items-center justify-between rounded-lg bg-black/30 p-2.5"
                    >
                      <div>
                        <p className="text-sm font-bold">
                          Estoque baixo
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-600">
                          Peças precisam de atenção.
                        </p>
                      </div>

                      <span className="text-lg font-black text-yellow-400">
                        {estoqueResumo.estoqueBaixo}
                      </span>
                    </Link>
                  )}

                  {estoqueResumo.semEstoque > 0 && (
                    <Link
                      href="/dashboard/estoque"
                      className="flex items-center justify-between rounded-lg bg-black/30 p-2.5"
                    >
                      <div>
                        <p className="text-sm font-bold">
                          Peças sem estoque
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-600">
                          Há itens zerados no estoque.
                        </p>
                      </div>

                      <span className="text-lg font-black text-red-400">
                        {estoqueResumo.semEstoque}
                      </span>
                    </Link>
                  )}

                  {resumoOS.aguardandoPeca === 0 &&
                    estoqueResumo.estoqueBaixo === 0 &&
                    estoqueResumo.semEstoque === 0 && (
                      <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-600">
                        Nenhum alerta operacional no momento.
                      </div>
                    )}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}
