import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import type { FinanceiroOS, Pagamento } from "@/lib/financeiro";
import type { Servico } from "@/lib/servicos";

/* =========================================================
   CONTROLE FINANCEIRO GERAL
   =========================================================
   Esta camada consolida:
   - dinheiro realmente recebido;
   - valores ainda a receber;
   - possível ganho das OS abertas;
   - custo das peças;
   - lucro;
   - dízimo;
   - gastos da loja;
   - retiradas pessoais;
   - saldo disponível.
   ========================================================= */

export type RetiradaPessoal = {
  id: string;
  valor: number;
  data: string;
  observacao: string;
  criadoEm?: any;
};

export type GastoFinanceiro = {
  id: string;
  valor: number;
  data: string;
  descricao: string;
  observacao?: string;
  criadoEm?: any;
};

export type ApuracaoMensal = {
  mes: string;
  receitaRecebida: number;

  aReceber: number;
  aReceberOSAbertas: number;
  aReceberOSFinalizadas: number;

  possivelGanho: number;

  custoPecas: number;
  lucro: number;
  dizimo: number;

  gastos: number;
  retiradas: number;
  saldoDisponivel: number;

  quantidadeOSAbertas: number;
  quantidadeOSFinalizadas: number;
};

const retiradasRef = collection(db, "retiradasPessoais");
const gastosRef = collection(db, "gastosFinanceiros");
const financeiroRef = collection(db, "financeiroOS");
const servicosRef = collection(db, "servicos");

function numeroSeguro(valor: unknown) {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

function arredondar(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function mesDaData(valor: unknown): string | null {
  if (!valor) return null;

  if (typeof valor === "string") {
    return /^(\d{4}-\d{2})/.exec(valor)?.[1] ?? null;
  }

  if (
    typeof valor === "object" &&
    valor !== null &&
    "toDate" in valor &&
    typeof (valor as { toDate?: unknown }).toDate === "function"
  ) {
    const data = (valor as { toDate: () => Date }).toDate();

    if (Number.isNaN(data.getTime())) return null;

    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
  }

  return null;
}

function valorPecas(os: Servico) {
  return (os.pecasUtilizadas ?? []).reduce(
    (total, peca) =>
      total +
      numeroSeguro(peca.precoVenda) * numeroSeguro(peca.quantidade),
    0
  );
}

function custoPecasOS(os: Servico) {
  return (os.pecasUtilizadas ?? []).reduce(
    (total, peca) =>
      total +
      numeroSeguro(peca.custoUnitario) * numeroSeguro(peca.quantidade),
    0
  );
}

function totalOS(os: Servico, financeiro: FinanceiroOS) {
  return Math.max(
    0,
    numeroSeguro(financeiro.valorServico) +
      valorPecas(os) -
      numeroSeguro(financeiro.desconto)
  );
}

function totalPago(pagamentos: Pagamento[]) {
  return pagamentos.reduce(
    (total, pagamento) =>
      pagamento.estornado
        ? total
        : total + numeroSeguro(pagamento.valor),
    0
  );
}

export async function listarRetiradasPessoais(
  mes: string
): Promise<RetiradaPessoal[]> {
  const snapshot = await getDocs(retiradasRef);

  return snapshot.docs
    .map((item) => {
      const dados = item.data() as Record<string, unknown>;

      return {
        id: item.id,
        valor: numeroSeguro(dados.valor),
        data: typeof dados.data === "string" ? dados.data : "",
        observacao:
          typeof dados.observacao === "string"
            ? dados.observacao
            : "",
        criadoEm: dados.criadoEm,
      };
    })
    .filter((item) => item.data.slice(0, 7) === mes)
    .sort((a, b) => b.data.localeCompare(a.data));
}

export async function listarGastosFinanceiros(
  mes: string
): Promise<GastoFinanceiro[]> {
  const snapshot = await getDocs(gastosRef);

  return snapshot.docs
    .map((item) => {
      const dados = item.data() as Record<string, unknown>;

      return {
        id: item.id,
        valor: numeroSeguro(dados.valor),
        data: typeof dados.data === "string" ? dados.data : "",
        descricao:
          typeof dados.descricao === "string"
            ? dados.descricao
            : "",
        observacao:
          typeof dados.observacao === "string"
            ? dados.observacao
            : undefined,
        criadoEm: dados.criadoEm,
      };
    })
    .filter((item) => item.data.slice(0, 7) === mes)
    .sort((a, b) => b.data.localeCompare(a.data));
}

export async function criarGastoFinanceiro(dados: {
  valor: number;
  data: string;
  descricao: string;
  observacao?: string;
}) {
  const valor = arredondar(numeroSeguro(dados.valor));
  const descricao = dados.descricao.trim();
  const observacao = dados.observacao?.trim();

  if (valor <= 0) throw new Error("Informe um valor de gasto válido.");
  if (!dados.data) throw new Error("Informe a data do gasto.");
  if (!descricao) throw new Error("Informe a descrição do gasto.");

  await addDoc(gastosRef, {
    valor,
    data: dados.data,
    descricao,
    ...(observacao ? { observacao } : {}),
    criadoEm: serverTimestamp(),
  });
}

export async function criarRetiradaPessoal(dados: {
  valor: number;
  data: string;
  observacao: string;
}) {
  const valor = arredondar(numeroSeguro(dados.valor));
  const observacao = dados.observacao.trim();

  if (valor <= 0) throw new Error("Informe um valor de retirada válido.");
  if (!dados.data) throw new Error("Informe a data da retirada.");
  if (!observacao) throw new Error("Informe o objetivo da retirada.");

  const mes = dados.data.slice(0, 7);

  const apuracao = await obterApuracaoMensal(mes);

  if (valor > apuracao.saldoDisponivel) {
    throw new Error(
      `Saldo disponível insuficiente. Disponível para retirada: ${apuracao.saldoDisponivel.toLocaleString(
        "pt-BR",
        { style: "currency", currency: "BRL" }
      )}.`
    );
  }

  await addDoc(retiradasRef, {
    valor,
    data: dados.data,
    observacao,
    criadoEm: serverTimestamp(),
  });
}

export async function obterApuracaoMensal(
  mes: string
): Promise<ApuracaoMensal> {
  const [servicosSnapshot, financeirosSnapshot, retiradas, gastos] =
    await Promise.all([
      getDocs(servicosRef),
      getDocs(financeiroRef),
      listarRetiradasPessoais(mes),
      listarGastosFinanceiros(mes),
    ]);

  const financeiros = new Map<string, FinanceiroOS>();

  financeirosSnapshot.forEach((item) => {
    const dados = item.data() as Record<string, unknown>;

    financeiros.set(item.id, {
      id: item.id,
      osId: typeof dados.osId === "string" ? dados.osId : item.id,
      valorServico: numeroSeguro(dados.valorServico),
      desconto: numeroSeguro(dados.desconto),
      pagamentos: Array.isArray(dados.pagamentos)
        ? (dados.pagamentos as Pagamento[])
        : [],
      criadoEm: dados.criadoEm,
      atualizadoEm: dados.atualizadoEm,
    });
  });

  let receitaRecebida = 0;
  let custoPecas = 0;
  let aReceberOSAbertas = 0;
  let aReceberOSFinalizadas = 0;
  let possivelGanho = 0;
  let quantidadeOSAbertas = 0;
  let quantidadeOSFinalizadas = 0;

  servicosSnapshot.forEach((docServico) => {
    const os = {
      id: docServico.id,
      ...docServico.data(),
    } as Servico;

    if (os.status === "desativada" || os.status === "cancelado") return;

    const financeiro = financeiros.get(os.id);
    if (!financeiro) return;

    const pagamentosAtivos = financeiro.pagamentos.filter(
      (pagamento) => pagamento.estornado !== true
    );

    const pago = totalPago(pagamentosAtivos);
    const total = totalOS(os, financeiro);
    const saldo = Math.max(0, total - pago);

    const finalizada =
      os.status === "concluido" || os.status === "entregue";

    if (finalizada) {
      quantidadeOSFinalizadas++;
      aReceberOSFinalizadas += saldo;
    } else {
      quantidadeOSAbertas++;
      aReceberOSAbertas += saldo;
      possivelGanho += saldo;
    }

    if (pagamentosAtivos.length === 0) return;

    pagamentosAtivos.forEach((pagamento) => {
      if (mesDaData(pagamento.dataPagamento) !== mes) return;

      const valor = numeroSeguro(pagamento.valor);
      if (valor <= 0) return;

      receitaRecebida += valor;

      /*
       * O custo das peças acompanha proporcionalmente os pagamentos.
       * Assim, pagamentos parciais não jogam todo o custo em um único mês.
       */
      if (finalizada && pago > 0) {
        custoPecas +=
          custoPecasOS(os) * (valor / pago);
      }
    });
  });

  const totalGastos = arredondar(
    gastos.reduce((total, item) => total + numeroSeguro(item.valor), 0)
  );

  const totalRetiradas = arredondar(
    retiradas.reduce(
      (total, item) => total + numeroSeguro(item.valor),
      0
    )
  );

  receitaRecebida = arredondar(receitaRecebida);
  custoPecas = arredondar(custoPecas);
  aReceberOSAbertas = arredondar(aReceberOSAbertas);
  aReceberOSFinalizadas = arredondar(aReceberOSFinalizadas);
  possivelGanho = arredondar(possivelGanho);

  const aReceber = arredondar(
    aReceberOSAbertas + aReceberOSFinalizadas
  );

  /*
   * Mantém o comportamento financeiro atual:
   * prejuízo não vira lucro positivo.
   */
  const lucro = arredondar(
    Math.max(0, receitaRecebida - custoPecas)
  );

  const dizimo = arredondar(lucro * 0.1);

  const saldoDisponivel = arredondar(
    Math.max(
      0,
      lucro -
        dizimo -
        totalGastos -
        totalRetiradas
    )
  );

  return {
    mes,
    receitaRecebida,
    aReceber,
    aReceberOSAbertas,
    aReceberOSFinalizadas,
    possivelGanho,
    custoPecas,
    lucro,
    dizimo,
    gastos: totalGastos,
    retiradas: totalRetiradas,
    saldoDisponivel,
    quantidadeOSAbertas,
    quantidadeOSFinalizadas,
  };
}
