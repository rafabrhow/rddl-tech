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
  atualizarServico,
  alterarStatusServico,
  criarServico,
  desativarServico,
  excluirServico,
  finalizarServicoComEstoque,
  utilizarPecaNoEstoque,
  listarServicos,
  reabrirServico,
} from "@/lib/servicos";

import { listarPecas } from "@/lib/pecas";

import type {
  AcessorioServico,
  CondicaoAparelho,
  PecaServico,
  Servico,
  StatusServico,
} from "@/lib/servicos";

import type { Peca } from "@/lib/types";

/* =========================================================
   CONFIGURAÇÕES
   ========================================================= */

const statusLabels: Record<
  StatusServico,
  string
> = {
  orcamento: "Orçamento",
  aguardando_aprovacao:
    "Aguardando aprovação",
  em_andamento: "Em andamento",
  aguardando_peca:
    "Aguardando peça",
  concluido: "Concluído",
  cancelado: "Cancelado",
  entregue: "Entregue",
  desativada: "Desativada",
};

const acessorioLabels: Record<
  AcessorioServico,
  string
> = {
  carregador: "Carregador",
  cabo: "Cabo",
  capinha: "Capinha",
  chip: "Chip",
  cartao_memoria:
    "Cartão de memória",
  outros: "Outros",
};

/* =========================================================
   FUNÇÕES AUXILIARES
   ========================================================= */

function statusClass(
  status: StatusServico
) {
  switch (status) {
    case "orcamento":
      return "bg-yellow-500/10 text-yellow-400";

    case "aguardando_aprovacao":
      return "bg-blue-500/10 text-blue-400";

    case "em_andamento":
      return "bg-orange-500/10 text-orange-400";

    case "aguardando_peca":
      return "bg-purple-500/10 text-purple-400";

    case "concluido":
      return "bg-emerald-500/10 text-emerald-400";

    case "cancelado":
      return "bg-red-500/10 text-red-400";

    case "entregue":
      return "bg-zinc-700 text-zinc-300";

    case "desativada":
      return "bg-zinc-700/40 text-zinc-400";

    default:
      return "bg-zinc-800 text-zinc-300";
  }
}

/* =========================================================
   PÁGINA
   ========================================================= */

export default function ServicosPage() {
  /* -------------------------------------------------------
     DADOS
     ------------------------------------------------------- */

  const [servicos, setServicos] =
    useState<Servico[]>([]);

  const [pecasUtilizadas, setPecasUtilizadas] =
    useState<PecaServico[]>([]);

  const [servicoRealizado, setServicoRealizado] =
    useState("");

  const [observacoesTecnicas, setObservacoesTecnicas] =
    useState("");

  const [pecasEstoque, setPecasEstoque] =
    useState<Peca[]>([]);

  const [buscaPeca, setBuscaPeca] =
    useState("");

  const [pecaParaAdicionar, setPecaParaAdicionar] =
    useState<Peca | null>(null);

  const [quantidadePeca, setQuantidadePeca] =
    useState("1");

  const [erroPecas, setErroPecas] =
    useState("");

  const [busca, setBusca] = useState("");

  /* -------------------------------------------------------
     MODAIS
     ------------------------------------------------------- */

  const [abrirCadastro, setAbrirCadastro] =
    useState(false);

  const [abrirEdicao, setAbrirEdicao] =
    useState(false);

  const [abrirFinalizacao, setAbrirFinalizacao] =
    useState(false);

  const [abrirAcaoOS, setAbrirAcaoOS] =
    useState(false);

  const [acaoOS, setAcaoOS] =
    useState<"desativar" | "excluir" | "reabrir" | null>(null);

  const [processandoAcaoOS, setProcessandoAcaoOS] =
    useState(false);

  // Status que o usuário solicitou alterar.
  // A alteração só acontece após confirmação.
  const [statusAlvo, setStatusAlvo] =
    useState<StatusServico | null>(null);

  const [processandoStatus, setProcessandoStatus] =
    useState(false);

  /* -------------------------------------------------------
     SELEÇÃO
     ------------------------------------------------------- */

  const [servicoSelecionado, setServicoSelecionado] =
    useState<Servico | null>(null);

  /* -------------------------------------------------------
     ESTADOS
     ------------------------------------------------------- */

  const [carregando, setCarregando] =
    useState(true);

  const [salvando, setSalvando] =
    useState(false);

  const [finalizando, setFinalizando] =
    useState(false);

  const [erro, setErro] = useState("");

  /* -------------------------------------------------------
     FORMULÁRIO
     ------------------------------------------------------- */

  const [clienteNome, setClienteNome] =
    useState("");

  const [clienteTelefone, setClienteTelefone] =
    useState("");

  const [aparelhoMarca, setAparelhoMarca] =
    useState("");

  const [aparelhoModelo, setAparelhoModelo] =
    useState("");

  const [aparelhoCor, setAparelhoCor] =
    useState("");

  const [aparelhoImei, setAparelhoImei] =
    useState("");

  const [defeitoRelatado, setDefeitoRelatado] =
    useState("");

  const [observacoesEntrada, setObservacoesEntrada] =
    useState("");

  const [tela, setTela] = useState("");

  const [carcaca, setCarcaca] =
    useState("");

  const [tampaTraseira, setTampaTraseira] =
    useState("");

  const [cameras, setCameras] =
    useState("");

  const [botoes, setBotoes] =
    useState("");

  const [conector, setConector] =
    useState("");

  const [outrosDanos, setOutrosDanos] =
    useState("");

  const [acessorios, setAcessorios] =
    useState<AcessorioServico[]>([]);

  /* =======================================================
     CARREGAR SERVIÇOS
     ======================================================= */

  async function carregarServicos() {
    try {
      setErro("");

      const resultado =
        await listarServicos();

      setServicos(resultado);
    } catch {
      setErro(
        "Não foi possível carregar os serviços."
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarServicos();
  }, []);

  async function carregarPecasEstoque() {
    try {
      const resultado = await listarPecas();
      setPecasEstoque(resultado);
    } catch {
      setErroPecas(
        "Não foi possível carregar as peças do estoque."
      );
    }
  }

  useEffect(() => {
    carregarPecasEstoque();
  }, []);

  /* =======================================================
     PEÇAS DO ESTOQUE
     ======================================================= */

  const pecasFiltradas =
    useMemo(() => {
      const termo = buscaPeca
        .trim()
        .toLowerCase();

      if (!termo) {
        return pecasEstoque;
      }

      return pecasEstoque.filter(
        (peca) =>
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
    }, [pecasEstoque, buscaPeca]);

  /* =======================================================
     BUSCA
     ======================================================= */

  const servicosFiltrados =
    useMemo(() => {
      const termo = busca
        .trim()
        .toLowerCase();

      if (!termo) {
        return servicos;
      }

      return servicos.filter(
        (servico) =>
          [
            servico.codigo,
            servico.clienteNome,
            servico.clienteTelefone,
            servico.aparelhoMarca,
            servico.aparelhoModelo,
            servico.aparelhoImei,
            servico.defeitoRelatado,
          ]
            .filter(Boolean)
            .some((valor) =>
              valor!
                .toLowerCase()
                .includes(termo)
            )
      );
    }, [servicos, busca]);

  /* =======================================================
     MÁSCARA DE CELULAR
     ======================================================= */
  function formatarCelular(valor: string) {
    const numeros = valor
      .replace(/\D/g, "")
      .slice(0, 11);

    if (!numeros) {
      return "";
    }

    if (numeros.length <= 2) {
      return `(${numeros}`;
    }

    if (numeros.length <= 7) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
    }

    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
  }

  /* =======================================================
     LIMPAR FORMULÁRIO
     ======================================================= */

  function limparFormulario() {
    setClienteNome("");
    setClienteTelefone("");

    setAparelhoMarca("");
    setAparelhoModelo("");
    setAparelhoCor("");
    setAparelhoImei("");

    setDefeitoRelatado("");
    setObservacoesEntrada("");

    setTela("");
    setCarcaca("");
    setTampaTraseira("");
    setCameras("");
    setBotoes("");
    setConector("");
    setOutrosDanos("");

    setAcessorios([]);
    setPecasUtilizadas([]);
    setServicoRealizado("");
    setObservacoesTecnicas("");

    setBuscaPeca("");
    setPecaParaAdicionar(null);
    setQuantidadePeca("1");
    setErroPecas("");

    setErro("");
  }

  /* =======================================================
     NOVA OS
     ======================================================= */

  function abrirNovaOS() {
    limparFormulario();

    setServicoSelecionado(null);

    setAbrirCadastro(true);
  }

  /* =======================================================
     PREPARAR EDIÇÃO
     ======================================================= */

  function prepararEdicao(
    servico: Servico
  ) {
    setServicoSelecionado(servico);

    setClienteNome(
      servico.clienteNome
    );

    setClienteTelefone(
      servico.clienteTelefone
    );

    setAparelhoMarca(
      servico.aparelhoMarca
    );

    setAparelhoModelo(
      servico.aparelhoModelo
    );

    setAparelhoCor(
      servico.aparelhoCor ?? ""
    );

    setAparelhoImei(
      servico.aparelhoImei ?? ""
    );

    setDefeitoRelatado(
      servico.defeitoRelatado
    );

    setObservacoesEntrada(
      servico.observacoesEntrada ??
        ""
    );

    setTela(
      servico.condicaoAparelho?.tela ??
        ""
    );

    setCarcaca(
      servico.condicaoAparelho?.carcaça ??
        ""
    );

    setTampaTraseira(
      servico.condicaoAparelho
        ?.tampaTraseira ?? ""
    );

    setCameras(
      servico.condicaoAparelho
        ?.cameras ?? ""
    );

    setBotoes(
      servico.condicaoAparelho?.botoes ??
        ""
    );

    setConector(
      servico.condicaoAparelho
        ?.conector ?? ""
    );

    setOutrosDanos(
      servico.condicaoAparelho
        ?.outros ?? ""
    );

    setAcessorios(
      servico.acessorios ?? []
    );

    setPecasUtilizadas(
      (servico.pecasUtilizadas ?? []).map((peca) => ({
        ...peca,
        utilizada:
          peca.utilizada === true ||
          (servico.estoquePecasAplicado === true && peca.utilizada !== false),
        estoqueBaixado:
          peca.estoqueBaixado === true ||
          (servico.estoquePecasAplicado === true && peca.estoqueBaixado !== false),
      }))
    );

    setServicoRealizado(
      servico.servicoRealizado ?? ""
    );

    setObservacoesTecnicas(
      servico.observacoesTecnicas ?? ""
    );

    setErro("");

    setAbrirEdicao(true);
  }

  /* =======================================================
     ALTERAR ACESSÓRIO
     ======================================================= */

  function alternarAcessorio(
    acessorio: AcessorioServico
  ) {
    setAcessorios((atual) => {
      if (atual.includes(acessorio)) {
        return atual.filter(
          (item) => item !== acessorio
        );
      }

      return [...atual, acessorio];
    });
  }

  /* =======================================================
     PEÇAS BLOQUEADAS APÓS A BAIXA
     ======================================================= */
  function pecasEstaoBloqueadas() {
    return Boolean(
      servicoSelecionado &&
        (
          servicoSelecionado.estoquePecasAplicado === true ||
          servicoSelecionado.status === "concluido" ||
          servicoSelecionado.status === "entregue"
        )
    );
  }

  /* =======================================================
     PEÇA UTILIZADA
     ======================================================= */

  function selecionarPeca(
    peca: Peca
  ) {
    setPecaParaAdicionar(peca);
    setQuantidadePeca("1");
    setErroPecas("");
  }

  function adicionarPecaUtilizada() {
    // Uma OS fechada não pode receber novas peças.
    if (pecasEstaoBloqueadas()) {
      setErroPecas(
        "Esta OS está fechada e as peças já foram baixadas do estoque."
      );
      return;
    }

    if (!pecaParaAdicionar) {
      setErroPecas(
        "Selecione uma peça do estoque."
      );
      return;
    }

    const quantidadeAdicionar =
      Number(quantidadePeca);

    if (
      !Number.isInteger(
        quantidadeAdicionar
      ) ||
      quantidadeAdicionar <= 0
    ) {
      setErroPecas(
        "Informe uma quantidade válida."
      );
      return;
    }

    const existente =
      pecasUtilizadas.find(
        (item) =>
          item.pecaId ===
          pecaParaAdicionar.id
      );

    const quantidadeJaUtilizada =
      existente?.quantidade ?? 0;

    const quantidadeFinal =
      quantidadeJaUtilizada +
      quantidadeAdicionar;

    if (
      quantidadeFinal >
      pecaParaAdicionar.quantidade
    ) {
      setErroPecas(
        `Estoque insuficiente. Disponível para esta OS: ${
          Math.max(
            0,
            pecaParaAdicionar.quantidade -
              quantidadeJaUtilizada
          )
        }.`
      );
      return;
    }

    const novaPeca: PecaServico = {
      pecaId: pecaParaAdicionar.id,
      codigoPeca:
        pecaParaAdicionar.codigo,
      nomePeca:
        pecaParaAdicionar.nome,
      quantidade:
        quantidadeFinal,
      custoUnitario:
        pecaParaAdicionar.custoUnitario,
      precoVenda:
        pecaParaAdicionar.precoVenda,
      utilizada: false,
      estoqueBaixado: false,
    };

    setPecasUtilizadas((atual) => {
      const existe = atual.some(
        (item) =>
          item.pecaId ===
          pecaParaAdicionar.id
      );

      if (!existe) {
        return [...atual, novaPeca];
      }

      return atual.map((item) =>
        item.pecaId ===
        pecaParaAdicionar.id
          ? novaPeca
          : item
      );
    });

    setPecaParaAdicionar(null);
    setQuantidadePeca("1");
    setErroPecas("");
  }

  function removerPecaUtilizada(
    pecaId: string
  ) {
    const peca = pecasUtilizadas.find((item) => item.pecaId === pecaId);

    if (!peca) return;

    if (peca.estoqueBaixado === true) {
      setErroPecas(
        "Esta peça já foi utilizada e baixada do estoque. Ela não pode ser removida."
      );
      return;
    }

    setPecasUtilizadas((atual) =>
      atual.filter((item) => item.pecaId !== pecaId)
    );
    setErroPecas("");
  }

  async function utilizarPeca(pecaId: string) {
    if (!servicoSelecionado) return;

    if (servicoSelecionado.status !== "em_andamento") {
      setErroPecas(
        "A peça só pode ser utilizada quando a OS estiver em andamento."
      );
      return;
    }

    const peca = pecasUtilizadas.find((item) => item.pecaId === pecaId);
    if (!peca) return;

    if (peca.estoqueBaixado === true) {
      setErroPecas("Esta peça já foi utilizada e baixada do estoque.");
      return;
    }

    try {
      setErroPecas("");
      await utilizarPecaNoEstoque(servicoSelecionado.id, pecaId);

      const atualizadas = pecasUtilizadas.map((item) =>
        item.pecaId === pecaId
          ? { ...item, utilizada: true, estoqueBaixado: true }
          : item
      );

      setPecasUtilizadas(atualizadas);
      setServicoSelecionado((atual) =>
        atual
          ? {
              ...atual,
              pecasUtilizadas: atualizadas,
              estoquePecasAplicado: atualizadas.every(
                (item) => item.utilizada === true && item.estoqueBaixado === true
              ),
            }
          : atual
      );

      await carregarPecasEstoque();
      await carregarServicos();
    } catch (error) {
      setErroPecas(
        error instanceof Error
          ? error.message
          : "Não foi possível utilizar a peça."
      );
    }
  }

  /* =======================================================
     MONTAR CONDIÇÃO
     ======================================================= */

  function montarCondicao(): CondicaoAparelho {
    return {
      tela: tela.trim() || undefined,
      carcaça:
        carcaca.trim() || undefined,
      tampaTraseira:
        tampaTraseira.trim() ||
        undefined,
      cameras:
        cameras.trim() || undefined,
      botoes:
        botoes.trim() || undefined,
      conector:
        conector.trim() || undefined,
      outros:
        outrosDanos.trim() || undefined,
    };
  }

  /* =======================================================
     CRIAR SERVIÇO
     ======================================================= */

  async function salvarServico(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErro("");

    if (
      !clienteNome.trim() ||
      !clienteTelefone.trim() ||
      !aparelhoMarca.trim() ||
      !aparelhoModelo.trim() ||
      !defeitoRelatado.trim()
    ) {
      setErro(
        "Preencha os campos obrigatórios."
      );

      return;
    }

    try {
      setSalvando(true);

      await criarServico({
        clienteNome:
          clienteNome.trim(),

        clienteTelefone:
          clienteTelefone.trim(),

        aparelhoMarca:
          aparelhoMarca.trim(),

        aparelhoModelo:
          aparelhoModelo.trim(),

        aparelhoCor:
          aparelhoCor.trim() ||
          undefined,

        aparelhoImei:
          aparelhoImei.trim() ||
          undefined,

        defeitoRelatado:
          defeitoRelatado.trim(),

        observacoesEntrada:
          observacoesEntrada.trim() ||
          undefined,

        condicaoAparelho:
          montarCondicao(),

        acessorios,

        pecasUtilizadas: [],
        servicoRealizado: undefined,
        observacoesTecnicas: undefined,

        status: "orcamento",
      });

      limparFormulario();

      setAbrirCadastro(false);

      await carregarServicos();
    } catch {
      setErro(
        "Não foi possível cadastrar a OS."
      );
    } finally {
      setSalvando(false);
    }
  }

  /* =======================================================
     ATUALIZAR SERVIÇO
     ======================================================= */

  async function salvarEdicao(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!servicoSelecionado) {
      return;
    }

    setErro("");

    if (
      !clienteNome.trim() ||
      !clienteTelefone.trim() ||
      !aparelhoMarca.trim() ||
      !aparelhoModelo.trim() ||
      !defeitoRelatado.trim()
    ) {
      setErro(
        "Preencha os campos obrigatórios."
      );

      return;
    }

    try {
      setSalvando(true);

      await atualizarServico(
        servicoSelecionado.id,
        {
          clienteNome:
            clienteNome.trim(),

          clienteTelefone:
            clienteTelefone.trim(),

          aparelhoMarca:
            aparelhoMarca.trim(),

          aparelhoModelo:
            aparelhoModelo.trim(),

          aparelhoCor:
            aparelhoCor.trim() ||
            undefined,

          aparelhoImei:
            aparelhoImei.trim() ||
            undefined,

          defeitoRelatado:
            defeitoRelatado.trim(),

          observacoesEntrada:
            observacoesEntrada.trim() ||
            undefined,

          condicaoAparelho:
            montarCondicao(),

          acessorios,

          // Em OS fechada, as peças ficam somente para consulta.
          // O histórico que gerou a baixa não será regravado.
          ...(pecasEstaoBloqueadas()
            ? {}
            : { pecasUtilizadas }),

          servicoRealizado:
            servicoRealizado.trim() ||
            undefined,
            observacoesTecnicas:
            observacoesTecnicas.trim() ||
            undefined,
        }
      );

      limparFormulario();

      setServicoSelecionado(null);

      setAbrirEdicao(false);

      await carregarServicos();
    } catch {
      setErro(
        "Não foi possível atualizar a OS."
      );
    } finally {
      setSalvando(false);
    }
  }

  /* =======================================================
     AÇÕES DE CICLO DA OS
     ======================================================= */

  function abrirAcao(
    servico: Servico,
    acao: "desativar" | "excluir" | "reabrir"
  ) {
    setServicoSelecionado(servico);
    setAcaoOS(acao);
    setErro("");
    setAbrirAcaoOS(true);
  }

  async function confirmarAcaoOS() {
    if (!servicoSelecionado || !acaoOS) {
      return;
    }

    setErro("");

    try {
      setProcessandoAcaoOS(true);

      if (acaoOS === "desativar") {
        await desativarServico(
          servicoSelecionado.id
        );
      } else if (acaoOS === "excluir") {
        await excluirServico(
          servicoSelecionado.id
        );
      } else {
        await reabrirServico(
          servicoSelecionado.id
        );
      }

      setAbrirAcaoOS(false);
      setAcaoOS(null);
      setServicoSelecionado(null);

      await carregarServicos();
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível realizar a ação."
      );
    } finally {
      setProcessandoAcaoOS(false);
    }
  }

  /* =======================================================
     FINALIZAR SERVIÇO COM BAIXA NO ESTOQUE
     ======================================================= */


  /* =======================================================
     TRANSIÇÃO DE STATUS
     ======================================================= */

  function solicitarStatus(
    status: StatusServico
  ) {
    if (!servicoSelecionado) {
      return;
    }

    setErro("");
    setStatusAlvo(status);
  }

  async function confirmarAlteracaoStatus() {
    if (
      !servicoSelecionado ||
      !statusAlvo
    ) {
      return;
    }

    setErro("");

    try {
      setProcessandoStatus(true);

      await alterarStatusServico(
        servicoSelecionado.id,
        statusAlvo
      );

      setStatusAlvo(null);
      setServicoSelecionado(null);
      setAbrirEdicao(false);

      limparFormulario();

      await carregarServicos();
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar o status da OS."
      );
    } finally {
      setProcessandoStatus(false);
    }
  }

  async function confirmarFinalizacao() {
    if (!servicoSelecionado) {
      return;
    }

    setErro("");
    setErroPecas("");

    try {
      setFinalizando(true);

      await finalizarServicoComEstoque(
        servicoSelecionado.id,
        {
          servicoRealizado:
            servicoRealizado.trim() ||
            undefined,

          observacoesTecnicas:
            observacoesTecnicas.trim() ||
            undefined,

          pecasUtilizadas,
        }
      );

      setAbrirFinalizacao(false);
      setAbrirEdicao(false);

      limparFormulario();
      setServicoSelecionado(null);

      await carregarServicos();
    } catch (error) {
      const mensagem =
        error instanceof Error
          ? error.message
          : "Não foi possível finalizar o serviço.";

      setErro(mensagem);
    } finally {
      setFinalizando(false);
    }
  }

  /* =======================================================
     FECHAR MODAIS
     ======================================================= */

  function fecharModais() {
    if (salvando || finalizando || processandoAcaoOS) {
      return;
    }

    setAbrirCadastro(false);
    setAbrirEdicao(false);
    setAbrirFinalizacao(false);
    setAbrirAcaoOS(false);
    setAcaoOS(null);
    setStatusAlvo(null);

    setServicoSelecionado(null);

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

            <div className="flex items-center justify-between gap-3">

              <div>

                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-orange-400">
                  TEIXA CELL
                </p>

                <h1 className="mt-1 text-xl font-black sm:text-2xl">
                  Serviços
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
                onClick={abrirNovaOS}
                className="flex h-11 shrink-0 items-center rounded-xl bg-orange-500 px-4 text-sm font-black text-black shadow-[0_8px_22px_rgba(249,115,22,0.16)] transition active:scale-95 hover:bg-orange-400"
              >
                + Nova OS
              </button>
              </div>

            </div>

          </header>

          {/* =================================================
              RESUMO
             ================================================= */}

          <section className="mb-4 grid grid-cols-2 gap-2 sm:gap-3">

            <div className="rounded-2xl border border-white/10 border-l-2 border-l-sky-400 bg-white/[0.045] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-[0_12px_30px_rgba(0,0,0,0.36)]">

              <p className="text-[11px] text-zinc-500">
                Total de OS
              </p>

              <p className="mt-1 text-xl font-bold">
                {servicos.length}
              </p>

            </div>

            <div className="rounded-2xl border border-orange-400/25 border-l-2 border-l-orange-400 bg-orange-500/[0.055] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-orange-500/[0.08] hover:shadow-[0_12px_30px_rgba(0,0,0,0.36)]">

              <p className="text-[11px] text-zinc-500">
                Em andamento
              </p>

              <p className="mt-1 text-xl font-bold text-orange-400">
                {
                  servicos.filter(
                    (item) =>
                      item.status ===
                      "em_andamento"
                  ).length
                }
              </p>

            </div>

          </section>

          {/* =================================================
              BUSCA
             ================================================= */}

          <div className="mb-5">

            <input
              type="search"
              value={busca}
              onChange={(event) =>
                setBusca(
                  event.target.value
                )
              }
              placeholder="Buscar cliente, aparelho ou OS..."
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-sm text-zinc-100 shadow-[0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur-xl outline-none transition focus:border-orange-400/60 focus:bg-white/[0.06] placeholder:text-zinc-600"
            />

          </div>

          {/* =================================================
              ERRO
             ================================================= */}

          {erro &&
            !abrirCadastro &&
            !abrirEdicao && (
              <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                {erro}
              </div>
            )}

          {/* =================================================
              LISTAGEM
             ================================================= */}

          {carregando ? (

            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-8 text-center text-sm text-zinc-500 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl">
              Carregando serviços...
            </div>

          ) : servicosFiltrados.length === 0 ? (

            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-6 py-12 text-center shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-xl">

              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-2xl">
                🔧
              </div>

              <p className="mt-4 font-semibold">
                Nenhuma OS encontrada
              </p>

              <p className="mt-2 text-sm text-zinc-500">
                Cadastre o primeiro aparelho para começar.
              </p>

            </div>

          ) : (

            <div className="space-y-3">

              {servicosFiltrados.map(
                (servico) => (

                  <article
                    key={servico.id}
                    className={`overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] shadow-[0_10px_28px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.06] hover:shadow-[0_14px_34px_rgba(0,0,0,0.38)] ${servico.status === "desativada" ? "border-l-2 border-l-zinc-500" : servico.status === "cancelado" ? "border-l-2 border-l-red-400" : servico.status === "concluido" || servico.status === "entregue" ? "border-l-2 border-l-emerald-400" : servico.status === "aguardando_peca" ? "border-l-2 border-l-purple-400" : "border-l-2 border-l-orange-400"}`}
                  >

                    <div className="p-3.5">

                      {/* -------------------------------
                          CABEÇALHO DA OS
                         ------------------------------- */}

                      <div className="flex items-start justify-between gap-3">

                        <div className="min-w-0">

                          <span className="inline-flex rounded-lg border border-orange-400/10 bg-orange-500/[0.10] px-2.5 py-1 text-[11px] font-bold text-orange-400 shadow-[0_4px_12px_rgba(0,0,0,0.16)]">
                            {servico.codigo}
                          </span>

                          <h2 className="mt-2 truncate text-base font-bold">
                            {servico.clienteNome}
                          </h2>

                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClass(
                            servico.status
                          )}`}
                        >
                          {
                            statusLabels[
                              servico.status
                            ]
                          }
                        </span>

                      </div>

                      {/* -------------------------------
                          APARELHO
                         ------------------------------- */}

                      <div className="mt-4 rounded-xl border border-white/[0.05] bg-black/30 p-3 shadow-[0_6px_18px_rgba(0,0,0,0.22)] backdrop-blur-md">

                        <p className="text-xs text-zinc-500">
                          Aparelho
                        </p>

                        <p className="mt-1 font-semibold">
                          {
                            servico.aparelhoMarca
                          }{" "}
                          {
                            servico.aparelhoModelo
                          }
                        </p>

                        {servico.aparelhoCor && (
                          <p className="mt-1 text-xs text-zinc-500">
                            Cor:{" "}
                            {
                              servico.aparelhoCor
                            }
                          </p>
                        )}

                      </div>

                      {/* -------------------------------
                          DEFEITO
                         ------------------------------- */}

                      <div className="mt-3">

                        <p className="text-[11px] text-zinc-500">
                          Defeito relatado
                        </p>

                        <p className="mt-1 line-clamp-2 text-sm text-zinc-300">
                          {
                            servico.defeitoRelatado
                          }
                        </p>

                      </div>

                    </div>

                    {/* -------------------------------
                        AÇÃO
                       ------------------------------- */}

                    <div className="grid border-t border-white/[0.08] bg-black/10 sm:grid-cols-3">

                      {servico.status !== "desativada" && (
                        <button
                          type="button"
                          onClick={() =>
                            prepararEdicao(servico)
                          }
                          className="border-b border-white/[0.08] py-3 text-xs font-semibold text-zinc-300 transition active:bg-white/[0.06] hover:bg-white/[0.04] sm:border-b-0 sm:border-r"
                        >
                          ✏️ Editar
                        </button>
                      )}

                      {servico.status === "desativada" ? (
                        <button
                          type="button"
                          onClick={() =>
                            abrirAcao(servico, "reabrir")
                          }
                          className="border-b border-white/[0.08] py-3 text-xs font-semibold text-emerald-400 transition active:bg-white/[0.06] hover:bg-white/[0.04] sm:border-b-0 sm:border-r"
                        >
                          ↻ Reabrir OS
                        </button>
                      ) : (
                        (servico.status === "orcamento" ||
                          servico.status === "aguardando_aprovacao") && (
                          <button
                            type="button"
                            onClick={() =>
                              abrirAcao(servico, "desativar")
                            }
                            className="border-b border-white/[0.08] py-3 text-xs font-semibold text-yellow-400 transition active:bg-white/[0.06] hover:bg-white/[0.04] sm:border-b-0 sm:border-r"
                          >
                            ⏸ Desativar
                          </button>
                        )
                      )}

                      {(servico.status === "orcamento" ||
                        servico.status === "aguardando_aprovacao") && (
                          <button
                            type="button"
                            onClick={() =>
                              abrirAcao(servico, "excluir")
                            }
                            className="py-3 text-xs font-semibold text-red-400 transition active:bg-white/[0.06] hover:bg-red-500/[0.05]"
                          >
                            🗑 Excluir
                          </button>
                        )}

                    </div>

                  </article>

                )
              )}

            </div>

          )}

        </div>

        {/* ===================================================
            MODAL — NOVA OS
           =================================================== */}

        {abrirCadastro && (

          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[2px]">

            <div className="mx-auto flex h-full w-full max-w-xl flex-col border-x border-white/[0.06] bg-zinc-950 shadow-[0_0_60px_rgba(0,0,0,0.55)]">

              {/* -------------------------------
                  CABEÇALHO
                 ------------------------------- */}

              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-4">

                <div>

                  <p className="text-[11px] font-bold uppercase tracking-wider text-orange-500">
                    NOVA ORDEM DE SERVIÇO
                  </p>

                  <h2 className="mt-1 text-xl font-bold">
                    Entrada do aparelho
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
                  id="form-nova-os"
                  onSubmit={salvarServico}
                  className="space-y-6"
                >

                  {/* =======================================
                      CLIENTE
                     ======================================= */}

                  <section>

                    <div className="mb-3">

                      <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                        01
                      </p>

                      <h3 className="text-base font-bold">
                        Cliente
                      </h3>

                    </div>

                    <div className="space-y-3">

                      <div>

                        <label className="mb-2 block text-sm font-medium">
                          Nome *
                        </label>

                        <input
                          value={clienteNome}
                          onChange={(event) =>
                            setClienteNome(
                              event.target.value
                            )
                          }
                          required
                          placeholder="Nome completo"
                          className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                        />

                      </div>

                      <div>

                        <label className="mb-2 block text-sm font-medium">
                          Telefone *
                        </label>

                        <input
                          type="tel"
                          value={clienteTelefone}
                          onChange={(event) =>
                            setClienteTelefone(
                              formatarCelular(
                                event.target.value
                              )
                            )
                          }
                          required
                          placeholder="(99) 99999-9999"
                          className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                        />

                      </div>

                    </div>

                  </section>

                  {/* =======================================
                      APARELHO
                     ======================================= */}

                  <section>

                    <div className="mb-3">

                      <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                        02
                      </p>

                      <h3 className="text-base font-bold">
                        Aparelho
                      </h3>

                    </div>

                    <div className="space-y-3">

                      <div className="grid grid-cols-2 gap-3">

                        <div>

                          <label className="mb-2 block text-sm font-medium">
                            Marca *
                          </label>

                          <input
                            value={aparelhoMarca}
                            onChange={(event) =>
                              setAparelhoMarca(
                                event.target.value
                              )
                            }
                            required
                            placeholder="Apple"
                            className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                          />

                        </div>

                        <div>

                          <label className="mb-2 block text-sm font-medium">
                            Modelo *
                          </label>

                          <input
                            value={aparelhoModelo}
                            onChange={(event) =>
                              setAparelhoModelo(
                                event.target.value
                              )
                            }
                            required
                            placeholder="iPhone 11"
                            className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                          />

                        </div>

                      </div>

                      <div className="grid grid-cols-2 gap-3">

                        <div>

                          <label className="mb-2 block text-sm font-medium">
                            Cor
                          </label>

                          <input
                            value={aparelhoCor}
                            onChange={(event) =>
                              setAparelhoCor(
                                event.target.value
                              )
                            }
                            placeholder="Preto"
                            className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                          />

                        </div>

                        <div>

                          <label className="mb-2 block text-sm font-medium">
                            IMEI / Serial
                          </label>

                          <input
                            value={aparelhoImei}
                            onChange={(event) =>
                              setAparelhoImei(
                                event.target.value
                              )
                            }
                            placeholder="Opcional"
                            className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                          />

                        </div>

                      </div>

                    </div>

                  </section>

                  {/* =======================================
                      DEFEITO
                     ======================================= */}

                  <section>

                    <div className="mb-3">

                      <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                        03
                      </p>

                      <h3 className="text-base font-bold">
                        Defeito relatado
                      </h3>

                    </div>

                    <textarea
                      value={defeitoRelatado}
                      onChange={(event) =>
                        setDefeitoRelatado(
                          event.target.value
                        )
                      }
                      required
                      rows={4}
                      placeholder="Descreva o problema informado pelo cliente..."
                      className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-orange-500"
                    />

                  </section>

                  {/* =======================================
                      CONDIÇÃO
                     ======================================= */}

                  <section>

                    <div className="mb-3">

                      <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                        04
                      </p>

                      <h3 className="text-base font-bold">
                        Estado do aparelho
                      </h3>

                      <p className="mt-1 text-xs text-zinc-500">
                        Registre danos ou condições existentes na entrada.
                      </p>

                    </div>

                    <div className="space-y-3">

                    {[
  {
    label: "Tela",
    valor: tela,
    setter: setTela,
    placeholder:
      "Ex.: trincada no canto superior",
  },
  {
    label: "Carcaça",
    valor: carcaca,
    setter: setCarcaca,
    placeholder:
      "Ex.: riscos na lateral",
  },
  {
    label: "Tampa traseira",
    valor: tampaTraseira,
    setter: setTampaTraseira,
    placeholder:
      "Ex.: sem danos",
  },
  {
    label: "Câmeras",
    valor: cameras,
    setter: setCameras,
    placeholder:
      "Ex.: lente riscada",
  },
  {
    label: "Botões",
    valor: botoes,
    setter: setBotoes,
    placeholder:
      "Ex.: botão volume OK",
  },
  {
    label: "Conector",
    valor: conector,
    setter: setConector,
    placeholder:
      "Ex.: folgado",
  },
].map(
  ({
    label,
    valor,
    setter,
    placeholder,
  }) => (
    <div key={label}>
      <label className="mb-2 block text-sm font-medium">
        {label}
      </label>

      <input
        value={valor}
        onChange={(event) =>
          setter(event.target.value)
        }
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
      />
    </div>
  )
)}

                      <div>

                        <label className="mb-2 block text-sm font-medium">
                          Outros danos
                        </label>

                        <textarea
                          value={outrosDanos}
                          onChange={(event) =>
                            setOutrosDanos(
                              event.target.value
                            )
                          }
                          rows={3}
                          placeholder="Outros detalhes importantes..."
                          className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-orange-500"
                        />

                      </div>

                    </div>

                  </section>

                  {/* =======================================
                      ACESSÓRIOS
                     ======================================= */}

                  <section>

                    <div className="mb-3">

                      <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                        05
                      </p>

                      <h3 className="text-base font-bold">
                        Acessórios deixados
                      </h3>

                    </div>

                    <div className="grid grid-cols-2 gap-2">

                      {(
                        Object.keys(
                          acessorioLabels
                        ) as AcessorioServico[]
                      ).map(
                        (acessorio) => {

                          const selecionado =
                            acessorios.includes(
                              acessorio
                            );

                          return (
                            <button
                              key={
                                acessorio
                              }
                              type="button"
                              onClick={() =>
                                alternarAcessorio(
                                  acessorio
                                )
                              }
                              className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
                                selecionado
                                  ? "border-orange-500 bg-orange-500/10 text-orange-400"
                                  : "border-zinc-800 bg-zinc-950 text-zinc-400"
                              }`}
                            >
                              <span className="mr-2">
                                {selecionado
                                  ? "✓"
                                  : "○"}
                              </span>

                              {
                                acessorioLabels[
                                  acessorio
                                ]
                              }
                            </button>
                          );
                        }
                      )}

                    </div>

                  </section>

                  {/* =======================================
                      OBSERVAÇÕES
                     ======================================= */}

                  <section>

                    <div className="mb-3">

                      <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                        06
                      </p>

                      <h3 className="text-base font-bold">
                        Observações
                      </h3>

                    </div>

                    <textarea
                      value={
                        observacoesEntrada
                      }
                      onChange={(event) =>
                        setObservacoesEntrada(
                          event.target.value
                        )
                      }
                      rows={4}
                      placeholder="Outras informações importantes sobre a entrada..."
                      className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-orange-500"
                    />

                  </section>

                </form>

              </div>

              {/* -------------------------------
                  RODAPÉ
                 ------------------------------- */}

              <div className="border-t border-zinc-800 p-4">

                <button
                  form="form-nova-os"
                  type="submit"
                  disabled={salvando}
                  className="h-12 w-full rounded-xl bg-orange-500 font-bold text-black active:scale-[0.99] disabled:opacity-60"
                >
                  {salvando
                    ? "Registrando..."
                    : "Registrar entrada"}
                </button>

              </div>

            </div>

          </div>
        )}

        {/* ===================================================
            MODAL — EDIÇÃO
           =================================================== */}

        {abrirEdicao &&
          servicoSelecionado && (

            <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[2px]">

              <div className="mx-auto flex h-full w-full max-w-xl flex-col border-x border-white/[0.06] bg-zinc-950 shadow-[0_0_60px_rgba(0,0,0,0.55)]">

                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-4">

                  <div>

                    <p className="text-[11px] font-bold uppercase tracking-wider text-orange-500">
                      {
                        servicoSelecionado.codigo
                      }
                    </p>

                    <h2 className="mt-1 text-xl font-bold">
                      Editar entrada
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
                    id="form-editar-os"
                    onSubmit={salvarEdicao}
                    className="space-y-6"
                  >

                    {/* CLIENTE */}

                    <section>

                      <div className="mb-3">

                        <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                          01
                        </p>

                        <h3 className="font-bold">
                          Cliente
                        </h3>

                      </div>

                      <div className="space-y-3">

                        <input
                          value={clienteNome}
                          onChange={(event) =>
                            setClienteNome(
                              event.target.value
                            )
                          }
                          required
                          placeholder="Nome"
                          className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                        />

                        <input
                          type="tel"
                          value={clienteTelefone}
                          onChange={(event) =>
                            setClienteTelefone(
                              formatarCelular(
                                event.target.value
                              )
                            )
                          }
                          maxLength={15}
                          inputMode="numeric"
                          required
                          placeholder="(99) 99999-9999"
                          className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                        />

                      </div>

                    </section>

                    {/* APARELHO */}

                    <section>

                      <div className="mb-3">

                        <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                          02
                        </p>

                        <h3 className="font-bold">
                          Aparelho
                        </h3>

                      </div>

                      <div className="space-y-3">

                        <div className="grid grid-cols-2 gap-3">

                          <input
                            value={
                              aparelhoMarca
                            }
                            onChange={(event) =>
                              setAparelhoMarca(
                                event.target.value
                              )
                            }
                            required
                            placeholder="Marca"
                            className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                          />

                          <input
                            value={
                              aparelhoModelo
                            }
                            onChange={(event) =>
                              setAparelhoModelo(
                                event.target.value
                              )
                            }
                            required
                            placeholder="Modelo"
                            className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                          />

                        </div>

                        <div className="grid grid-cols-2 gap-3">

                          <input
                            value={aparelhoCor}
                            onChange={(event) =>
                              setAparelhoCor(
                                event.target.value
                              )
                            }
                            placeholder="Cor"
                            className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                          />

                          <input
                            value={aparelhoImei}
                            onChange={(event) =>
                              setAparelhoImei(
                                event.target.value
                              )
                            }
                            placeholder="IMEI / Serial"
                            className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                          />

                        </div>

                      </div>

                    </section>

                    {/* DEFEITO */}

                    <section>

                      <div className="mb-3">

                        <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                          03
                        </p>

                        <h3 className="font-bold">
                          Defeito relatado
                        </h3>

                      </div>

                      <textarea
                        value={
                          defeitoRelatado
                        }
                        onChange={(event) =>
                          setDefeitoRelatado(
                            event.target.value
                          )
                        }
                        required
                        rows={4}
                        className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-orange-500"
                      />

                    </section>

                    {/* CONDIÇÃO */}

                    <section>

                      <div className="mb-3">

                        <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                          04
                        </p>

                        <h3 className="font-bold">
                          Estado do aparelho
                        </h3>

                      </div>

                      <div className="space-y-3">

                        <input
                          value={tela}
                          onChange={(event) =>
                            setTela(
                              event.target.value
                            )
                          }
                          placeholder="Tela"
                          className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                        />

                        <input
                          value={carcaca}
                          onChange={(event) =>
                            setCarcaca(
                              event.target.value
                            )
                          }
                          placeholder="Carcaça"
                          className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                        />

                        <input
                          value={
                            tampaTraseira
                          }
                          onChange={(event) =>
                            setTampaTraseira(
                              event.target.value
                            )
                          }
                          placeholder="Tampa traseira"
                          className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                        />

                        <input
                          value={cameras}
                          onChange={(event) =>
                            setCameras(
                              event.target.value
                            )
                          }
                          placeholder="Câmeras"
                          className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                        />

                        <input
                          value={botoes}
                          onChange={(event) =>
                            setBotoes(
                              event.target.value
                            )
                          }
                          placeholder="Botões"
                          className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                        />

                        <input
                          value={conector}
                          onChange={(event) =>
                            setConector(
                              event.target.value
                            )
                          }
                          placeholder="Conector"
                          className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                        />

                        <textarea
                          value={outrosDanos}
                          onChange={(event) =>
                            setOutrosDanos(
                              event.target.value
                            )
                          }
                          rows={3}
                          placeholder="Outros danos"
                          className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-orange-500"
                        />

                      </div>

                    </section>

                    {/* ACESSÓRIOS */}

                    <section>

                      <div className="mb-3">

                        <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                          05
                        </p>

                        <h3 className="font-bold">
                          Acessórios
                        </h3>

                      </div>

                      <div className="grid grid-cols-2 gap-2">

                        {(
                          Object.keys(
                            acessorioLabels
                          ) as AcessorioServico[]
                        ).map(
                          (acessorio) => {

                            const selecionado =
                              acessorios.includes(
                                acessorio
                              );

                            return (
                              <button
                                key={
                                  acessorio
                                }
                                type="button"
                                onClick={() =>
                                  alternarAcessorio(
                                    acessorio
                                  )
                                }
                                className={`rounded-xl border px-3 py-3 text-left text-sm ${
                                  selecionado
                                    ? "border-orange-500 bg-orange-500/10 text-orange-400"
                                    : "border-zinc-800 bg-zinc-950 text-zinc-400"
                                }`}
                              >
                                <span className="mr-2">
                                  {selecionado
                                    ? "✓"
                                    : "○"}
                                </span>

                                {
                                  acessorioLabels[
                                    acessorio
                                  ]
                                }
                              </button>
                            );
                          }
                        )}

                      </div>

                    </section>

                    {/* OBSERVAÇÕES */}

                    <section>

                      <div className="mb-3">

                        <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                          06
                        </p>

                        <h3 className="font-bold">
                          Observações
                        </h3>

                      </div>

                      <textarea
                        value={
                          observacoesEntrada
                        }
                        onChange={(event) =>
                          setObservacoesEntrada(
                            event.target.value
                          )
                        }
                        rows={4}
                        className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-orange-500"
                      />

                    </section>

                    {/* =======================================
                        PÓS-CONCERTO
                       ======================================= */}

                    <section>

                      <div className="mb-3">

                        <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                          07
                        </p>

                        <h3 className="font-bold">
                          Pós-conserto
                        </h3>

                        <p className="mt-1 text-xs text-zinc-500">
                          Registre o serviço realizado após o reparo.
                        </p>

                      </div>

                      <div className="space-y-4">

                        <div>

                          <label className="mb-2 block text-sm font-medium">
                            Serviço realizado
                          </label>

                          <textarea
                            value={servicoRealizado}
                            onChange={(event) =>
                              setServicoRealizado(
                                event.target.value
                              )
                            }
                            rows={4}
                            placeholder="Descreva o que foi realizado no aparelho..."
                            className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-orange-500"
                          />

                        </div>

                        <div>

                          <label className="mb-2 block text-sm font-medium">
                            Observações técnicas
                          </label>

                          <textarea
                            value={observacoesTecnicas}
                            onChange={(event) =>
                              setObservacoesTecnicas(
                                event.target.value
                              )
                            }
                            rows={4}
                            placeholder="Testes, observações ou informações técnicas..."
                            className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-orange-500"
                          />

                        </div>

                      </div>

                    </section>

                    {/* =======================================
                        PEÇAS UTILIZADAS
                       ======================================= */}

                    <section>

                      <div className="mb-3">

                        <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                          08
                        </p>

                        <h3 className="font-bold">
                          Peças do serviço
                        </h3>

                        <p className="mt-1 text-xs text-zinc-500">
                          Adicione peças previstas. A baixa só acontece quando você confirmar que a peça foi realmente utilizada.
                        </p>

                      </div>

                      <div className="space-y-3">

                        {pecasEstaoBloqueadas() && (
                          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
                            <p className="text-sm font-semibold text-yellow-400">
                              Peças bloqueadas
                            </p>
                            <p className="mt-1 text-xs leading-5 text-zinc-400">
                              Esta OS já foi fechada e a baixa do estoque foi registrada.
                              As peças utilizadas não podem mais ser adicionadas ou removidas.
                            </p>
                          </div>
                        )}

                        {!pecasEstaoBloqueadas() && (
                          <>

                        <input
                          value={buscaPeca}
                          onChange={(event) =>
                            setBuscaPeca(
                              event.target.value
                            )
                          }
                          placeholder="Buscar peça por código ou nome..."
                          className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm outline-none focus:border-orange-500"
                        />

                        {erroPecas && (
                          <div className="rounded-xl border border-red-400/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-300 shadow-[0_8px_22px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                            {erroPecas}
                          </div>
                        )}

                        {pecaParaAdicionar && (
                          <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-3">

                            <div className="flex items-start justify-between gap-3">

                              <div className="min-w-0">

                                <p className="text-[11px] font-bold text-orange-400">
                                  {pecaParaAdicionar.codigo}
                                </p>

                                <p className="mt-1 font-semibold">
                                  {pecaParaAdicionar.nome}
                                </p>

                                <p className="mt-1 text-xs text-zinc-500">
                                  Estoque disponível:{" "}
                                  {Math.max(
                                    0,
                                    pecaParaAdicionar.quantidade -
                                      (
                                        pecasUtilizadas.find(
                                          (item) =>
                                            item.pecaId ===
                                            pecaParaAdicionar.id
                                        )?.quantidade ?? 0
                                      )
                                  )}
                                </p>

                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  setPecaParaAdicionar(null)
                                }
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400"
                              >
                                ×
                              </button>

                            </div>

                            <div className="mt-3 flex gap-2">

                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={quantidadePeca}
                                onChange={(event) =>
                                  setQuantidadePeca(
                                    event.target.value
                                  )
                                }
                                className="h-11 w-24 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-center text-sm outline-none focus:border-orange-500"
                              />

                              <button
                                type="button"
                                onClick={adicionarPecaUtilizada}
                                className="h-11 flex-1 rounded-xl bg-orange-500 px-4 text-sm font-bold text-black active:scale-[0.99]"
                              >
                                Adicionar peça
                              </button>

                            </div>

                          </div>
                        )}

                        <div className="space-y-2">

                          {pecasFiltradas.length === 0 ? (

                            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-6 text-center text-sm text-zinc-500">
                              Nenhuma peça encontrada.
                            </div>

                          ) : (

                            pecasFiltradas.map(
                              (peca) => {

                                const utilizada =
                                  pecasUtilizadas.find(
                                    (item) =>
                                      item.pecaId ===
                                      peca.id
                                  );

                                const disponivel =
                                  Math.max(
                                    0,
                                    peca.quantidade -
                                      (
                                        utilizada?.quantidade ??
                                        0
                                      )
                                  );

                                return (
                                  <button
                                    key={peca.id}
                                    type="button"
                                    disabled={
                                      peca.quantidade <= 0 ||
                                      disponivel <= 0
                                    }
                                    onClick={() =>
                                      selecionarPeca(
                                        peca
                                      )
                                    }
                                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-left disabled:cursor-not-allowed disabled:opacity-40"
                                  >

                                    <div className="flex items-center justify-between gap-3">

                                      <div className="min-w-0">

                                        <p className="text-[11px] font-bold text-orange-400">
                                          {peca.codigo}
                                        </p>

                                        <p className="mt-1 truncate text-sm font-semibold">
                                          {peca.nome}
                                        </p>

                                      </div>

                                      <div className="shrink-0 text-right">

                                        <p className="text-[11px] text-zinc-500">
                                          Disponível
                                        </p>

                                        <p className="text-sm font-bold">
                                          {disponivel}
                                        </p>

                                      </div>

                                    </div>

                                  </button>
                                );
                              }
                            )

                          )}

                        </div>

                        </>
                        )}

                        {pecasUtilizadas.length > 0 && (

                          <div className="space-y-2 pt-2">

                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                              Nesta OS
                            </p>

                            {pecasUtilizadas.map(
                              (peca) => (

                                <div
                                  key={peca.pecaId}
                                  className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3"
                                >

                                  <div className="min-w-0">

                                    <p className="text-[11px] font-bold text-orange-400">
                                      {peca.codigoPeca}
                                    </p>

                                    <p className="mt-1 truncate text-sm font-semibold">
                                      {peca.nomePeca}
                                    </p>

                                  </div>

                                  <div className="flex shrink-0 items-center gap-3">

                                    <span className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-bold">
                                      {peca.quantidade}x
                                    </span>

                                    {peca.estoqueBaixado === true ? (
                                      <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
                                        Utilizada · estoque baixado
                                      </span>
                                    ) : (
                                      <>
                                        {servicoSelecionado?.status === "em_andamento" && !pecasEstaoBloqueadas() && (
                                          <button
                                            type="button"
                                            onClick={() => utilizarPeca(peca.pecaId)}
                                            className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-black text-black"
                                          >
                                            Utilizar
                                          </button>
                                        )}

                                        {!pecasEstaoBloqueadas() && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removerPecaUtilizada(
                                            peca.pecaId
                                          )
                                        }
                                        className="text-xs font-semibold text-red-400"
                                      >
                                        Remover
                                      </button>
                                        )}
                                      </>
                                    )}

                                  </div>

                                </div>

                              )
                            )}

                          </div>

                        )}

                      </div>

                    </section>

                  </form>

                </div>

                <div className="border-t border-zinc-800 p-4 space-y-3">

                  {/* =================================================
                      CONTROLE DO CICLO DA OS — COMPACTO
                     ================================================= */}

                  {servicoSelecionado.status !== "desativada" && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${statusClass(
                            servicoSelecionado.status
                          )}`}
                        >
                          {statusLabels[servicoSelecionado.status]}
                        </span>

                        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                          {/* Ação principal do status atual */}
                          {servicoSelecionado.status === "orcamento" && (
                            <button
                              type="button"
                              onClick={() =>
                                solicitarStatus(
                                  "aguardando_aprovacao"
                                )
                              }
                              disabled={
                                salvando ||
                                finalizando ||
                                processandoStatus
                              }
                              className="h-9 truncate rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 text-[11px] font-bold text-blue-400 disabled:opacity-50"
                            >
                              📤 Enviar aprovação
                            </button>
                          )}

                          {servicoSelecionado.status === "aguardando_aprovacao" && (
                            <button
                              type="button"
                              onClick={() =>
                                solicitarStatus(
                                  "em_andamento"
                                )
                              }
                              disabled={
                                salvando ||
                                finalizando ||
                                processandoStatus
                              }
                              className="h-9 truncate rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 text-[11px] font-bold text-orange-400 disabled:opacity-50"
                            >
                              🔧 Iniciar serviço
                            </button>
                          )}

                          {servicoSelecionado.status === "em_andamento" && (
                            <button
                              type="button"
                              onClick={() =>
                                solicitarStatus(
                                  "aguardando_peca"
                                )
                              }
                              disabled={
                                salvando ||
                                finalizando ||
                                processandoStatus
                              }
                              className="h-9 truncate rounded-lg border border-purple-500/30 bg-purple-500/10 px-2 text-[11px] font-bold text-purple-400 disabled:opacity-50"
                            >
                              📦 Aguardar peça
                            </button>
                          )}

                          {servicoSelecionado.status === "aguardando_peca" && (
                            <button
                              type="button"
                              onClick={() =>
                                solicitarStatus(
                                  "em_andamento"
                                )
                              }
                              disabled={
                                salvando ||
                                finalizando ||
                                processandoStatus
                              }
                              className="h-9 truncate rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 text-[11px] font-bold text-orange-400 disabled:opacity-50"
                            >
                              🔧 Retomar serviço
                            </button>
                          )}

                          {servicoSelecionado.status === "concluido" && (
                            <button
                              type="button"
                              onClick={() =>
                                solicitarStatus(
                                  "entregue"
                                )
                              }
                              disabled={
                                salvando ||
                                finalizando ||
                                processandoStatus
                              }
                              className="h-9 truncate rounded-lg border border-zinc-700 bg-zinc-800 px-2 text-[11px] font-bold text-zinc-200 disabled:opacity-50"
                            >
                              📱 Marcar entregue
                            </button>
                          )}

                          {(
                            servicoSelecionado.status === "orcamento" ||
                            servicoSelecionado.status === "aguardando_aprovacao" ||
                            servicoSelecionado.status === "em_andamento" ||
                            servicoSelecionado.status === "aguardando_peca"
                          ) && (
                            <button
                              type="button"
                              onClick={() =>
                                solicitarStatus(
                                  "cancelado"
                                )
                              }
                              disabled={
                                salvando ||
                                finalizando ||
                                processandoStatus
                              }
                              className="h-9 truncate rounded-lg border border-red-500/30 bg-red-500/5 px-2 text-[11px] font-bold text-red-400 disabled:opacity-50"
                            >
                              ✕ Cancelar
                            </button>
                          )}

                          {/* Ação secundária para voltar de etapa */}
                          {servicoSelecionado.status === "aguardando_aprovacao" && (
                            <button
                              type="button"
                              onClick={() =>
                                solicitarStatus(
                                  "orcamento"
                                )
                              }
                              disabled={
                                salvando ||
                                finalizando ||
                                processandoStatus
                              }
                              className="h-9 truncate rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-[11px] font-semibold text-zinc-300 disabled:opacity-50"
                            >
                              ↩ Orçamento
                            </button>
                          )}

                          {servicoSelecionado.status === "concluido" && (
                            <span className="flex h-9 items-center justify-center rounded-lg border border-zinc-800 px-2 text-[10px] text-zinc-500">
                              Pronto para entrega
                            </span>
                          )}

                          {servicoSelecionado.status === "entregue" && (
                            <span className="flex h-9 items-center justify-center rounded-lg border border-zinc-800 px-2 text-[10px] text-zinc-500">
                              Status final
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}


                  {servicoSelecionado.status === "em_andamento" && (
                    <button
                      type="button"
                      onClick={() => {
                        setErro("");
                        setAbrirFinalizacao(true);
                      }}
                      disabled={
                        salvando ||
                        finalizando ||
                        processandoStatus
                      }
                      className="h-9 w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-[11px] font-bold text-emerald-400 disabled:opacity-60"
                    >
                      ✓ Finalizar serviço
                    </button>
                  )}



                  <button
                    form="form-editar-os"
                    type="submit"
                    disabled={salvando || finalizando}
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
            MODAL — CONFIRMAR ALTERAÇÃO DE STATUS
           =================================================== */}

        {statusAlvo &&
          servicoSelecionado && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4">
              <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl">

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-xl text-orange-400">
                  🔄
                </div>

                <h2 className="mt-4 text-lg font-bold">
                  Alterar status da OS?
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {servicoSelecionado.codigo} —{" "}
                  {servicoSelecionado.clienteNome}
                </p>

                <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-zinc-500">
                      Status atual
                    </span>
                    <span className="font-semibold text-white">
                      {statusLabels[servicoSelecionado.status]}
                    </span>
                  </div>

                  <div className="my-3 h-px bg-zinc-800" />

                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-zinc-500">
                      Novo status
                    </span>
                    <span className="font-semibold text-orange-400">
                      {statusLabels[statusAlvo]}
                    </span>
                  </div>
                </div>

                {statusAlvo === "cancelado" && (
                  <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
                    Se houver pagamento ativo, será necessário
                    realizar o estorno no Financeiro antes do cancelamento.
                  </div>
                )}

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setStatusAlvo(null)
                    }
                    disabled={processandoStatus}
                    className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 font-bold text-zinc-300 disabled:opacity-50"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={confirmarAlteracaoStatus}
                    disabled={processandoStatus}
                    className="h-12 rounded-xl bg-orange-500 font-bold text-black disabled:opacity-50"
                  >
                    {processandoStatus
                      ? "Alterando..."
                      : "Confirmar"}
                  </button>
                </div>

              </div>
            </div>
          )}

        {/* ===================================================
            MODAL — AÇÃO DA OS
           =================================================== */}

        {abrirAcaoOS &&
          servicoSelecionado &&
          acaoOS && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4">
              <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl">

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-xl text-orange-400">
                  {acaoOS === "reabrir" ? "↻" : acaoOS === "desativar" ? "⏸" : "🗑"}
                </div>

                <h2 className="mt-4 text-lg font-bold">
                  {acaoOS === "reabrir"
                    ? "Reabrir OS?"
                    : acaoOS === "desativar"
                      ? "Desativar OS?"
                      : "Excluir OS?"}
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  OS{" "}
                  <span className="font-semibold text-white">
                    {servicoSelecionado.codigo}
                  </span>
                  {" — "}
                  {servicoSelecionado.clienteNome}
                </p>

                {acaoOS === "desativar" && (
                  <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3">
                    <p className="text-sm font-semibold text-yellow-400">
                      Prazo de retenção: 15 dias
                    </p>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">
                      A OS ficará desativada e poderá ser reaberta nesse período.
                      Depois do prazo, ela será removida automaticamente quando o sistema realizar a limpeza.
                    </p>
                  </div>
                )}

                {acaoOS === "reabrir" && (
                  <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <p className="text-sm font-semibold text-emerald-400">
                      A OS voltará para Orçamento
                    </p>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">
                      O prazo de exclusão será cancelado e a mesma OS continuará disponível para o cliente.
                    </p>
                  </div>
                )}

                {acaoOS === "excluir" && (
                  <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                    <p className="text-sm font-semibold text-red-400">
                      Esta ação é permanente
                    </p>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">
                      OS concluídas ou entregues não podem ser excluídas.
                    </p>
                  </div>
                )}

                {erro && (
                  <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                    {erro}
                  </div>
                )}

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAbrirAcaoOS(false);
                      setAcaoOS(null);
                    }}
                    disabled={processandoAcaoOS}
                    className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 text-sm font-semibold text-zinc-300 disabled:opacity-60"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={confirmarAcaoOS}
                    // Se a desativação foi recusada por existir
                    // pagamento ativo, não deixamos o botão continuar
                    // disponível para uma nova tentativa inútil.
                    disabled={
                      processandoAcaoOS ||
                      (acaoOS === "desativar" &&
                        erro.includes(
                          "Faça o estorno no Financeiro"
                        ))
                    }
                    className={`h-12 rounded-xl text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${
                      acaoOS === "reabrir"
                        ? "bg-emerald-500 text-black"
                        : acaoOS === "desativar"
                          ? "bg-yellow-500 text-black"
                          : "bg-red-500 text-white"
                    }`}
                  >
                    {processandoAcaoOS
                      ? "Processando..."
                      : acaoOS === "reabrir"
                        ? "Reabrir"
                        : acaoOS === "desativar" &&
                            erro.includes(
                              "Faça o estorno no Financeiro"
                            )
                          ? "Estorno necessário"
                          : acaoOS === "desativar"
                            ? "Desativar"
                            : "Excluir"}
                  </button>
                </div>

              </div>
            </div>
          )}

        {/* ===================================================
            MODAL — CONFIRMAR FINALIZAÇÃO
           =================================================== */}

        {abrirFinalizacao &&
          servicoSelecionado && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
              <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl">

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-xl text-emerald-400">
                  ✓
                </div>

                <h2 className="mt-4 text-lg font-bold">
                  Finalizar serviço?
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  A OS{" "}
                  <span className="font-semibold text-white">
                    {servicoSelecionado.codigo}
                  </span>{" "}
                  será marcada como concluída.
                </p>

                <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3">
                  <p className="text-sm font-semibold text-yellow-400">
                    Atenção
                  </p>

                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Somente peças marcadas como realmente utilizadas já terão
                    gerado baixa no estoque. A finalização não faz uma nova baixa.
                  </p>
                </div>

                <div className="mt-4 rounded-xl bg-zinc-950 p-3">
                  <p className="text-xs text-zinc-500">
                    Peças utilizadas
                  </p>

                  <p className="mt-1 text-base font-bold">
                    {pecasUtilizadas.reduce(
                      (total, peca) =>
                        total + peca.quantidade,
                      0
                    )}{" "}
                    unidade(s)
                  </p>

                  {pecasUtilizadas.length === 0 && (
                    <p className="mt-1 text-xs text-zinc-600">
                      Nenhuma peça foi adicionada.
                    </p>
                  )}
                </div>

                {erro && (
                  <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                    {erro}
                  </div>
                )}

                <div className="mt-5 grid grid-cols-2 gap-2">

                  <button
                    type="button"
                    onClick={() =>
                      setAbrirFinalizacao(false)
                    }
                    disabled={finalizando}
                    className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 text-sm font-semibold text-zinc-300 disabled:opacity-60"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={confirmarFinalizacao}
                    disabled={finalizando}
                    className="h-12 rounded-xl bg-emerald-500 text-sm font-bold text-black disabled:opacity-60"
                  >
                    {finalizando
                      ? "Finalizando..."
                      : "Confirmar"}
                  </button>

                </div>

              </div>
            </div>
          )}

      </main>
    </AuthGuard>
  );
}
