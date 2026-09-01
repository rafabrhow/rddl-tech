import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import type { Servico } from "@/lib/servicos";

export type StatusPagamento =
  | "pendente"
  | "parcial"
  | "pago"
  | "estornado";

export type FormaPagamento =
  | "dinheiro"
  | "pix"
  | "debito"
  | "credito"
  | "outro";

export type Pagamento = {
  id: string;
  osId: string;
  valor: number;
  forma: FormaPagamento;
  dataPagamento: any;
  observacao?: string;
  estornado?: boolean;
  valorEstornado?: number;
  dataEstorno?: any;
  motivoEstorno?: string;
  criadoEm?: any;
};

export type FinanceiroOS = {
  id: string;
  osId: string;
  valorServico: number;
  desconto: number;
  pagamentos: Pagamento[];
  criadoEm?: any;
  atualizadoEm?: any;
};

export type ResumoFinanceiroOS = {
  os: Servico;
  valorPecas: number;
  valorServico: number;
  desconto: number;
  total: number;
  totalPago: number;
  saldo: number;
  statusPagamento: StatusPagamento;
};

const financeiroRef = collection(db, "financeiroOS");
const pagamentosRef = collection(db, "pagamentosOS");

function numeroSeguro(valor: unknown) {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

export function calcularValorPecas(os: Servico) {
  return (os.pecasUtilizadas ?? []).reduce(
    (total, peca) =>
      total +
      numeroSeguro(peca.precoVenda) * numeroSeguro(peca.quantidade),
    0
  );
}

export function calcularStatusPagamento(
  total: number,
  totalPago: number
): StatusPagamento {
  if (totalPago <= 0) return "pendente";
  if (totalPago < total) return "parcial";
  return "pago";
}

function normalizarFinanceiro(
  id: string,
  dados: Record<string, unknown>
): FinanceiroOS {
  return {
    id,
    osId: id,
    valorServico: numeroSeguro(dados.valorServico),
    desconto: numeroSeguro(dados.desconto),
    pagamentos: Array.isArray(dados.pagamentos)
      ? (dados.pagamentos as Pagamento[])
      : [],
    criadoEm: dados.criadoEm,
    atualizadoEm: dados.atualizadoEm,
  };
}

function calcularTotalFinanceiro(
  os: Servico,
  financeiro: FinanceiroOS
) {
  return Math.max(
    0,
    financeiro.valorServico +
      calcularValorPecas(os) -
      financeiro.desconto
  );
}

function calcularTotalPago(
  pagamentos: Pagamento[]
) {
  return pagamentos.reduce(
    (total, pagamento) =>
      pagamento.estornado
        ? total
        : total + numeroSeguro(pagamento.valor),
    0
  );
}

export async function obterFinanceiroOS(
  osId: string
): Promise<FinanceiroOS | null> {
  const snapshot = await getDoc(doc(financeiroRef, osId));

  if (!snapshot.exists()) return null;

  return normalizarFinanceiro(
    snapshot.id,
    snapshot.data() as Record<string, unknown>
  );
}

export async function garantirFinanceiroOS(osId: string) {
  const referencia = doc(financeiroRef, osId);
  const existente = await getDoc(referencia);

  if (existente.exists()) return;

  await setDoc(referencia, {
    osId,
    valorServico: 0,
    desconto: 0,
    pagamentos: [],
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
}

export async function salvarValoresFinanceiro(
  osId: string,
  dados: {
    valorServico: number;
    desconto: number;
  }
) {
  const valorServico = Math.max(
    0,
    numeroSeguro(dados.valorServico)
  );

  const desconto = Math.max(
    0,
    numeroSeguro(dados.desconto)
  );

  const referencia = doc(financeiroRef, osId);

  await setDoc(
    referencia,
    {
      osId,
      valorServico,
      desconto,
      atualizadoEm: serverTimestamp(),
    },
    { merge: true }
  );
}

// =========================================================
// REGISTRO DE PAGAMENTO
// Grava o lançamento individual e atualiza o documento
// financeiro da OS dentro de uma transação do Firestore.
// Assim evitamos pagamento duplicado ou saldo inconsistente.
// =========================================================
export async function registrarPagamento(
  osId: string,
  dados: {
    valor: number;
    forma: FormaPagamento;
    dataPagamento: string;
    observacao?: string;
  }
) {
  const valor = Number(dados.valor);

  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error("Informe um valor de pagamento válido.");
  }

  if (!dados.forma) {
    throw new Error("Selecione a forma de pagamento.");
  }

  if (!dados.dataPagamento) {
    throw new Error("Informe a data do pagamento.");
  }

  const osRef = doc(db, "servicos", osId);
  const financeiroRefIndividual = doc(financeiroRef, osId);

  await runTransaction(db, async (transaction) => {
    const osSnapshot = await transaction.get(osRef);

    if (!osSnapshot.exists()) {
      throw new Error("OS não encontrada.");
    }

    const os = {
      id: osSnapshot.id,
      ...osSnapshot.data(),
    } as Servico;

    if (os.status === "desativada") {
      throw new Error(
        "Não é possível registrar pagamento em uma OS desativada."
      );
    }

    const financeiroSnapshot = await transaction.get(
      financeiroRefIndividual
    );

    const financeiro: FinanceiroOS = financeiroSnapshot.exists()
      ? normalizarFinanceiro(
          financeiroSnapshot.id,
          financeiroSnapshot.data() as Record<string, unknown>
        )
      : {
          id: osId,
          osId,
          valorServico: 0,
          desconto: 0,
          pagamentos: [],
        };

    const total = calcularTotalFinanceiro(os, financeiro);
    const totalPago = calcularTotalPago(financeiro.pagamentos);
    const saldo = Math.max(0, total - totalPago);

    if (saldo <= 0) {
      throw new Error("Esta OS já está totalmente paga.");
    }

    if (valor > saldo + 0.009) {
      throw new Error(
        `O pagamento não pode ultrapassar o saldo de ${saldo.toLocaleString(
          "pt-BR",
          {
            style: "currency",
            currency: "BRL",
          }
        )}.`
      );
    }

    const pagamentoRef = doc(pagamentosRef);

    // Montamos o pagamento sem criar nenhuma propriedade com
    // valor `undefined`, porque o Firestore rejeita esse tipo de valor.
    const pagamentoFirestore: Pagamento = {
      id: pagamentoRef.id,
      osId,
      valor: Math.round(valor * 100) / 100,
      forma: dados.forma,
      dataPagamento: dados.dataPagamento,
      estornado: false,
      criadoEm: new Date(),
      ...(dados.observacao?.trim()
        ? { observacao: dados.observacao.trim() }
        : {}),
    };

    // O mesmo objeto sanitizado é usado no documento financeiro.
    // Isso evita que `observacao: undefined` seja enviado dentro
    // do array de pagamentos.
    transaction.set(
      pagamentoRef,
      pagamentoFirestore
    );

    transaction.set(
      financeiroRefIndividual,
      {
        osId,
        valorServico: financeiro.valorServico,
        desconto: financeiro.desconto,
        pagamentos: [
          ...financeiro.pagamentos,
          pagamentoFirestore,
        ],
        atualizadoEm: serverTimestamp(),
        ...(financeiroSnapshot.exists()
          ? {}
          : { criadoEm: serverTimestamp() }),
      },
      { merge: true }
    );
  });
}

// =========================================================
// ESTORNO DE PAGAMENTO
// ---------------------------------------------------------
// O pagamento original NÃO é apagado.
// Ele permanece no histórico marcado como estornado.
// O valor deixa de contar como recebido e o saldo da OS
// é recalculado automaticamente pela função de leitura.
// =========================================================
export async function estornarPagamento(
  osId: string,
  pagamentoId: string,
  motivo?: string
) {
  const financeiroRefIndividual = doc(
    financeiroRef,
    osId
  );

  const pagamentoRef = doc(
    pagamentosRef,
    pagamentoId
  );

  await runTransaction(db, async (transaction) => {
    // Lemos primeiro todos os documentos necessários.
    const financeiroSnapshot =
      await transaction.get(
        financeiroRefIndividual
      );

    if (!financeiroSnapshot.exists()) {
      throw new Error(
        "Financeiro da OS não encontrado."
      );
    }

    const pagamentoSnapshot =
      await transaction.get(pagamentoRef);

    if (!pagamentoSnapshot.exists()) {
      throw new Error(
        "Pagamento não encontrado."
      );
    }

    const dadosPagamento =
      pagamentoSnapshot.data();

    // Impede que o mesmo pagamento seja estornado duas vezes.
    if (dadosPagamento.estornado === true) {
      throw new Error(
        "Este pagamento já foi estornado."
      );
    }

    const financeiro =
      normalizarFinanceiro(
        financeiroSnapshot.id,
        financeiroSnapshot.data() as Record<
          string,
          unknown
        >
      );

    const pagamentoExiste =
      financeiro.pagamentos.some(
        (pagamento) =>
          pagamento.id === pagamentoId
      );

    if (!pagamentoExiste) {
      throw new Error(
        "O pagamento não foi encontrado no histórico financeiro da OS."
      );
    }

    const agora = new Date();

    // Atualiza somente o pagamento correspondente,
    // preservando todos os demais lançamentos.
    const pagamentosAtualizados =
      financeiro.pagamentos.map(
        (pagamento) => {
          if (
            pagamento.id !== pagamentoId
          ) {
            return pagamento;
          }

          return {
            ...pagamento,
            estornado: true,
            valorEstornado:
              numeroSeguro(pagamento.valor),
            dataEstorno: agora,
            ...(motivo?.trim()
              ? {
                  motivoEstorno:
                    motivo.trim(),
                }
              : {}),
          };
        }
      );

    // Atualiza o lançamento individual.
    transaction.update(
      pagamentoRef,
      {
        estornado: true,
        valorEstornado:
          numeroSeguro(dadosPagamento.valor),
        dataEstorno: agora,
        ...(motivo?.trim()
          ? {
              motivoEstorno:
                motivo.trim(),
            }
          : {}),
      }
    );

    // Atualiza o histórico financeiro da OS.
    // O pagamento continua armazenado para auditoria.
    transaction.update(
      financeiroRefIndividual,
      {
        pagamentos:
          pagamentosAtualizados,
        atualizadoEm:
          serverTimestamp(),
      }
    );
  });
}

export async function listarFinanceiroAtivo(): Promise<
  ResumoFinanceiroOS[]
> {
  const [servicosSnapshot, financeiroSnapshot] =
    await Promise.all([
      getDocs(collection(db, "servicos")),
      getDocs(financeiroRef),
    ]);

  const financeiros = new Map<string, FinanceiroOS>();

  financeiroSnapshot.forEach((item) => {
    financeiros.set(
      item.id,
      normalizarFinanceiro(
        item.id,
        item.data() as Record<string, unknown>
      )
    );
  });

  const servicos = servicosSnapshot.docs
    .map((item) => ({
      id: item.id,
      ...item.data(),
    })) as Servico[];

  return servicos
    .filter((os) => os.status !== "desativada")
    .map((os) => {
      const financeiro = financeiros.get(os.id) ?? {
        id: os.id,
        osId: os.id,
        valorServico: 0,
        desconto: 0,
        pagamentos: [],
      };

      const valorServico = financeiro.valorServico;
      const desconto = financeiro.desconto;
      const valorPecas = calcularValorPecas(os);
      const total = calcularTotalFinanceiro(os, financeiro);
      const totalPago = calcularTotalPago(financeiro.pagamentos);
      const saldo = Math.max(0, total - totalPago);

      return {
        os,
        valorPecas,
        valorServico,
        desconto,
        total,
        totalPago,
        saldo,
        statusPagamento: calcularStatusPagamento(
          total,
          totalPago
        ),
      };
    })
    .sort((a, b) =>
      a.os.codigo.localeCompare(b.os.codigo)
    );
}

export { pagamentosRef };
