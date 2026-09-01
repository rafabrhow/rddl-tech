import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { obterFinanceiroOS } from "@/lib/financeiro";

/* =========================================================
   STATUS
   ========================================================= */

export type StatusServico =
  | "orcamento"
  | "aguardando_aprovacao"
  | "em_andamento"
  | "aguardando_peca"
  | "concluido"
  | "cancelado"
  | "entregue"
  | "desativada";

/* =========================================================
   ACESSÓRIOS
   ========================================================= */

export type AcessorioServico =
  | "carregador"
  | "cabo"
  | "capinha"
  | "chip"
  | "cartao_memoria"
  | "outros";

/* =========================================================
   CONDIÇÃO DO APARELHO
   ========================================================= */

export type CondicaoAparelho = {
  tela?: string;
  carcaça?: string;
  tampaTraseira?: string;
  cameras?: string;
  botoes?: string;
  conector?: string;
  outros?: string;
};

/* =========================================================
   PEÇA UTILIZADA NO SERVIÇO
   ========================================================= */

export type PecaServico = {
  pecaId: string;
  codigoPeca: string;
  nomePeca: string;
  quantidade: number;
  custoUnitario: number;
  precoVenda: number;
  adicionadaEm?: any;

  // Controle individual da peça dentro da OS.
  // A peça pode estar prevista sem ter sido utilizada.
  utilizada?: boolean;
  estoqueBaixado?: boolean;
  baixadaEm?: any;
};

/* =========================================================
   SERVIÇO
   ========================================================= */

export type Servico = {
  id: string;
  codigo: string;

  /* Cliente */
  clienteNome: string;
  clienteTelefone: string;

  /* Aparelho */
  aparelhoMarca: string;
  aparelhoModelo: string;
  aparelhoCor?: string;
  aparelhoImei?: string;

  /* Entrada */
  defeitoRelatado: string;
  observacoesEntrada?: string;
  condicaoAparelho?: CondicaoAparelho;
  acessorios?: AcessorioServico[];

  /* Pós-conserto */
  servicoRealizado?: string;
  observacoesTecnicas?: string;
  pecasUtilizadas?: PecaServico[];

  /*
   * Indica que as peças da OS já foram aplicadas
   * no estoque e as movimentações de saída foram
   * registradas.
   */
  estoquePecasAplicado?: boolean;

  /* Desativação temporária */
  desativadaEm?: any;
  excluirEm?: any;

  /* Controle */
  status: StatusServico;

  criadoEm?: any;
  atualizadoEm?: any;
};

/* =========================================================
   REFERÊNCIAS
   ========================================================= */

const servicosRef = collection(
  db,
  "servicos"
);

const pecasRef = collection(
  db,
  "pecas"
);

const movimentacoesRef = collection(
  db,
  "movimentacoesEstoque"
);

/* =========================================================
   GERAR CÓDIGO
   ========================================================= */

function gerarCodigoServico(
  numero: number
) {
  return `OS-${String(numero).padStart(6, "0")}`;
}

/* =========================================================
   PRÓXIMO CÓDIGO
   ========================================================= */

async function gerarProximoCodigo() {
  const snapshot =
    await getDocs(servicosRef);

  let maiorNumero = 0;

  snapshot.forEach((item) => {
    const dados = item.data();

    if (
      typeof dados.codigo !== "string"
    ) {
      return;
    }

    const correspondencia =
      dados.codigo.match(/^OS-(\d+)$/);

    if (!correspondencia) {
      return;
    }

    const numero = Number(
      correspondencia[1]
    );

    if (numero > maiorNumero) {
      maiorNumero = numero;
    }
  });

  return gerarCodigoServico(
    maiorNumero + 1
  );
}

/* =========================================================
   LISTAR SERVIÇOS
   ========================================================= */

export async function listarServicos(): Promise<
  Servico[]
> {
  const snapshot =
    await getDocs(servicosRef);

  const agora = Date.now();
  const expirados = snapshot.docs.filter((item) => {
    const dados = item.data();

    if (dados.status !== "desativada") {
      return false;
    }

    const excluirEm = dados.excluirEm;

    return (
      excluirEm instanceof Timestamp &&
      excluirEm.toMillis() <= agora
    );
  });

  if (expirados.length > 0) {
    await Promise.all(
      expirados.map((item) =>
        deleteDoc(item.ref)
      )
    );
  }

  return snapshot.docs
    .filter(
      (item) =>
        !expirados.some(
          (expirado) =>
            expirado.id === item.id
        )
    )
    .map((item) => ({
      id: item.id,
      ...item.data(),
    })) as Servico[];
}

/* =========================================================
   CRIAR SERVIÇO
   ========================================================= */

export async function criarServico(
  dados: Omit<
    Servico,
    "id" | "codigo" | "criadoEm" | "atualizadoEm"
  >
) {
  const codigo =
    await gerarProximoCodigo();

  const documento = await addDoc(
    servicosRef,
    {
      ...dados,
      codigo,

      pecasUtilizadas:
        dados.pecasUtilizadas ?? [],

      estoquePecasAplicado: false,

      criadoEm:
        serverTimestamp(),

      atualizadoEm:
        serverTimestamp(),
    }
  );

  return {
    id: documento.id,
    codigo,
  };
}

/* =========================================================
   ATUALIZAR SERVIÇO
   ========================================================= */

export async function atualizarServico(
  id: string,
  dados: Partial<
    Omit<
      Servico,
      "id" | "codigo" | "criadoEm" | "atualizadoEm"
    >
  >
) {
  const servicoRef = doc(
    db,
    "servicos",
    id
  );

  // ---------------------------------------------------------
  // PROTEÇÃO DAS PEÇAS APÓS A BAIXA
  // ---------------------------------------------------------
  // A OS continua podendo ser editada em outros campos, mas
  // a lista de peças que já gerou saída no estoque não pode
  // ser modificada.
  // ---------------------------------------------------------
  const snapshot = await getDoc(servicoRef);

  if (!snapshot.exists()) {
    throw new Error("OS não encontrada.");
  }

  const dadosAtuais =
    snapshot.data() as Partial<Servico>;

  if (
    dadosAtuais.estoquePecasAplicado === true &&
    dados.pecasUtilizadas !== undefined
  ) {
    const pecasAtuais =
      JSON.stringify(
        dadosAtuais.pecasUtilizadas ?? []
      );

    const novasPecas =
      JSON.stringify(
        dados.pecasUtilizadas ?? []
      );

    if (pecasAtuais !== novasPecas) {
      throw new Error(
        "As peças desta OS já foram baixadas do estoque e não podem ser alteradas."
      );
    }
  }

  await updateDoc(
    servicoRef,
    {
      ...dados,
      atualizadoEm:
        serverTimestamp(),
    }
  );
}

/* =========================================================
   ALTERAR STATUS DA OS
   =========================================================
   Controla somente as transições permitidas do ciclo da OS.

   Fluxo principal:
   Orçamento
      ↓
   Aguardando aprovação
      ↓
   Em andamento
      ↓
   Aguardando peça ↔ Em andamento
      ↓
   Concluído
      ↓
   Entregue

   IMPORTANTE:
   O status "concluido" NÃO é alterado por esta função.
   Ele continua sendo definido exclusivamente por
   finalizarServicoComEstoque(), que também faz a baixa
   das peças e registra a movimentação no estoque.

   A função também mantém a proteção financeira para
   cancelamento da OS.
   ========================================================= */
export async function alterarStatusServico(
  id: string,
  novoStatus: StatusServico
) {
  const servicoRef = doc(
    db,
    "servicos",
    id
  );

  const snapshot =
    await getDoc(servicoRef);

  if (!snapshot.exists()) {
    throw new Error("OS não encontrada.");
  }

  const atual =
    snapshot.data() as Servico;

  const statusAtual =
    atual.status;

  // ---------------------------------------------------------
  // ESTADOS FINAIS / ESPECIAIS
  // ---------------------------------------------------------
  if (statusAtual === "desativada") {
    throw new Error(
      "OS desativada deve ser reaberta antes de alterar o status."
    );
  }

  if (statusAtual === "entregue") {
    throw new Error(
      "OS entregue não pode ter o status alterado."
    );
  }

  if (statusAtual === "cancelado") {
    throw new Error(
      "OS cancelada não pode ter o status alterado."
    );
  }

  // Concluído só pode acontecer através da finalização
  // com baixa de estoque.
  if (novoStatus === "concluido") {
    throw new Error(
      "Para concluir a OS, utilize a opção Finalizar serviço."
    );
  }

  // ---------------------------------------------------------
  // TRANSIÇÕES PERMITIDAS
  // ---------------------------------------------------------
  const transicoes: Record<
    StatusServico,
    StatusServico[]
  > = {
    orcamento: [
      "aguardando_aprovacao",
      "cancelado",
    ],

    aguardando_aprovacao: [
      "orcamento",
      "em_andamento",
      "cancelado",
    ],

    em_andamento: [
      "aguardando_peca",
      "cancelado",
    ],

    aguardando_peca: [
      "em_andamento",
      "cancelado",
    ],

    concluido: [
      "entregue",
    ],

    entregue: [],

    cancelado: [],

    desativada: [],
  };

  const permitidos =
    transicoes[statusAtual] ?? [];

  if (!permitidos.includes(novoStatus)) {
    throw new Error(
      `Não é possível alterar a OS de "${statusAtual}" para "${novoStatus}".`
    );
  }

  // ---------------------------------------------------------
  // PROTEÇÃO FINANCEIRA DO CANCELAMENTO
  // ---------------------------------------------------------
  // Se houver pagamento ativo, primeiro é necessário
  // realizar o estorno no Financeiro.
  // ---------------------------------------------------------
  if (novoStatus === "cancelado") {
    const financeiro =
      await obterFinanceiroOS(id);

    if (financeiro) {
      const totalRecebido =
        financeiro.pagamentos.reduce(
          (total, pagamento) =>
            pagamento.estornado
              ? total
              : total +
                Number(
                  pagamento.valor ?? 0
                ),
          0
        );

      if (totalRecebido > 0) {
        throw new Error(
          `Esta OS possui ${totalRecebido.toLocaleString(
            "pt-BR",
            {
              style: "currency",
              currency: "BRL",
            }
          )} recebido. Faça o estorno no Financeiro antes de cancelar a OS.`
        );
      }
    }
  }

  await updateDoc(
    servicoRef,
    {
      status: novoStatus,
      atualizadoEm:
        serverTimestamp(),
    }
  );
}


/* =========================================================
   DESATIVAR SERVIÇO
   ========================================================= */

const PRAZO_DESATIVACAO_DIAS = 15;

export async function desativarServico(
  id: string
) {
  const servicoRef = doc(
    db,
    "servicos",
    id
  );

  const snapshot = await getDoc(servicoRef);

  if (!snapshot.exists()) {
    throw new Error("OS não encontrada.");
  }

  const dados = snapshot.data();

  if (
    dados.status === "concluido" ||
    dados.status === "entregue"
  ) {
    throw new Error(
      "OS concluída ou entregue não pode ser desativada."
    );
  }

  if (dados.estoquePecasAplicado === true) {
    throw new Error(
      "Esta OS já possui baixa de estoque e não pode ser desativada."
    );
  }

  // ---------------------------------------------------------
  // PROTEÇÃO FINANCEIRA
  // ---------------------------------------------------------
  // Uma OS com dinheiro recebido não pode ser desativada.
  // Primeiro é necessário estornar o valor no Financeiro.
  // Pagamentos já estornados não entram nesta validação.
  // ---------------------------------------------------------
  const financeiro = await obterFinanceiroOS(id);

  if (financeiro) {
    const totalRecebido = financeiro.pagamentos.reduce(
      (total, pagamento) =>
        pagamento.estornado
          ? total
          : total + Number(pagamento.valor ?? 0),
      0
    );

    if (totalRecebido > 0) {
      throw new Error(
        `Esta OS possui ${totalRecebido.toLocaleString(
          "pt-BR",
          {
            style: "currency",
            currency: "BRL",
          }
        )} recebido. Faça o estorno no Financeiro antes de desativar a OS.`
      );
    }
  }

  const excluirEm = new Date(
    Date.now() +
      PRAZO_DESATIVACAO_DIAS *
        24 *
        60 *
        60 *
        1000
  );

  await updateDoc(
    servicoRef,
    {
      status: "desativada",
      desativadaEm: serverTimestamp(),
      excluirEm: Timestamp.fromDate(excluirEm),
      atualizadoEm: serverTimestamp(),
    }
  );
}

/* =========================================================
   REABRIR SERVIÇO
   ========================================================= */

export async function reabrirServico(
  id: string
) {
  const servicoRef = doc(
    db,
    "servicos",
    id
  );

  await updateDoc(
    servicoRef,
    {
      status: "orcamento",
      desativadaEm: deleteField(),
      excluirEm: deleteField(),
      atualizadoEm: serverTimestamp(),
    }
  );
}

/* =========================================================
   EXCLUIR SERVIÇO
   ========================================================= */

export async function excluirServico(
  id: string
) {
  const servicoRef = doc(
    db,
    "servicos",
    id
  );

  const snapshot = await getDoc(servicoRef);

  if (!snapshot.exists()) {
    throw new Error("OS não encontrada.");
  }

  const dados = snapshot.data();

  if (
    dados.status === "concluido" ||
    dados.status === "entregue"
  ) {
    throw new Error(
      "OS concluída ou entregue não pode ser excluída."
    );
  }

  if (dados.estoquePecasAplicado === true) {
    throw new Error(
      "Esta OS já possui baixa de estoque e não pode ser excluída."
    );
  }

  // ---------------------------------------------------------
  // PROTEÇÃO FINANCEIRA DA EXCLUSÃO
  // ---------------------------------------------------------
  // Também não permitimos apagar uma OS que possui valor
  // recebido e ainda não estornado.
  // ---------------------------------------------------------
  const financeiro = await obterFinanceiroOS(id);

  if (financeiro) {
    const totalRecebido = financeiro.pagamentos.reduce(
      (total, pagamento) =>
        pagamento.estornado
          ? total
          : total + Number(pagamento.valor ?? 0),
      0
    );

    if (totalRecebido > 0) {
      throw new Error(
        `Esta OS possui ${totalRecebido.toLocaleString(
          "pt-BR",
          {
            style: "currency",
            currency: "BRL",
          }
        )} recebido. Faça o estorno no Financeiro antes de excluir a OS.`
      );
    }
  }

  await deleteDoc(servicoRef);
}

/* =========================================================
   UTILIZAR PEÇA NO ESTOQUE
   =========================================================
   A peça só sai do estoque quando o técnico confirma que
   realmente a utilizou durante o serviço.

   Esta operação é individual e transacional. Assim:
   - peça apenas prevista não altera estoque;
   - uma peça já baixada não pode ser baixada novamente;
   - estoque negativo é bloqueado;
   - a movimentação de saída fica registrada.
   ========================================================= */

export async function utilizarPecaNoEstoque(
  servicoId: string,
  pecaId: string
) {
  const servicoRef = doc(db, "servicos", servicoId);

  await runTransaction(db, async (transaction) => {
    const servicoSnapshot = await transaction.get(servicoRef);

    if (!servicoSnapshot.exists()) {
      throw new Error("OS não encontrada.");
    }

    const servico = servicoSnapshot.data() as Servico;

    if (servico.status !== "em_andamento") {
      throw new Error(
        "A peça só pode ser utilizada quando a OS estiver em andamento."
      );
    }

    const pecas = [...(servico.pecasUtilizadas ?? [])];
    const indice = pecas.findIndex(
      (peca) => peca.pecaId === pecaId
    );

    if (indice < 0) {
      throw new Error("Peça não encontrada nesta OS.");
    }

    const peca = pecas[indice];

    if (peca.estoqueBaixado === true) {
      throw new Error(
        `A peça ${peca.codigoPeca} já foi baixada do estoque.`
      );
    }

    if (peca.utilizada === true) {
      throw new Error(
        `A peça ${peca.codigoPeca} já foi marcada como utilizada.`
      );
    }

    const pecaRef = doc(db, "pecas", peca.pecaId);
    const estoqueSnapshot = await transaction.get(pecaRef);

    if (!estoqueSnapshot.exists()) {
      throw new Error(
        `A peça ${peca.codigoPeca} não existe mais no estoque.`
      );
    }

    const dadosEstoque = estoqueSnapshot.data();
    const estoqueAtual = Number(dadosEstoque.quantidade ?? 0);

    if (!Number.isFinite(estoqueAtual) || estoqueAtual < 0) {
      throw new Error(
        `Estoque inválido para ${peca.codigoPeca}.`
      );
    }

    if (peca.quantidade > estoqueAtual) {
      throw new Error(
        `Estoque insuficiente para ${peca.codigoPeca}. Disponível: ${estoqueAtual}.`
      );
    }

    const agora = serverTimestamp();

    transaction.update(pecaRef, {
      quantidade: estoqueAtual - peca.quantidade,
      atualizadoEm: agora,
    });

    const movimentacaoRef = doc(movimentacoesRef);

    transaction.set(movimentacaoRef, {
      pecaId: peca.pecaId,
      codigoPeca: peca.codigoPeca,
      tipo: "saida",
      quantidade: peca.quantidade,
      custoUnitario: peca.custoUnitario,
      origem: "servico",
      referenciaId: servicoId,
      observacao: `Peça utilizada na OS ${servico.codigo ?? servicoId}.`,
      criadoEm: agora,
    });

    pecas[indice] = {
      ...peca,
      utilizada: true,
      estoqueBaixado: true,
      baixadaEm: agora,
    };

    transaction.update(servicoRef, {
      pecasUtilizadas: pecas,
      atualizadoEm: agora,
    });
  });
}

/* =========================================================
   FINALIZAR SERVIÇO COM BAIXA DE ESTOQUE
   =========================================================

   Esta função deve ser chamada somente quando a OS
   realmente entrar em "concluido".

   A operação usa uma transação do Firestore para:

   1. Ler a OS.
   2. Ler todos os lotes envolvidos.
   3. Conferir o estoque real.
   4. Impedir estoque negativo.
   5. Baixar as peças.
   6. Registrar as movimentações.
   7. Marcar a OS como concluída.

   Tudo acontece em uma única transação.
   Se qualquer etapa falhar, nenhuma alteração é
   aplicada.
   ========================================================= */

export async function finalizarServicoComEstoque(
  id: string,
  dados: {
    servicoRealizado?: string;
    observacoesTecnicas?: string;
    pecasUtilizadas: PecaServico[];
  }
) {
  const servicoRef = doc(
    db,
    "servicos",
    id
  );

  await runTransaction(
    db,
    async (transaction) => {
      /* -----------------------------------------------
         LER A OS
         ----------------------------------------------- */

      const servicoSnapshot =
        await transaction.get(
          servicoRef
        );

      if (!servicoSnapshot.exists()) {
        throw new Error(
          "OS não encontrada."
        );
      }

      const servicoAtual =
        servicoSnapshot.data() as Partial<Servico>;

      /* -----------------------------------------------
         NÃO REPETIR BAIXA
         ----------------------------------------------- */

      if (
        servicoAtual.estoquePecasAplicado ===
        true
      ) {
        throw new Error(
          "As peças desta OS já foram baixadas do estoque."
        );
      }

      /* -----------------------------------------------
         VALIDAR PEÇAS
         ----------------------------------------------- */

      const pecasDesejadas =
        dados.pecasUtilizadas ?? [];

      for (const peca of pecasDesejadas) {
        if (
          !peca.pecaId ||
          !peca.codigoPeca ||
          !peca.nomePeca
        ) {
          throw new Error(
            "Existe uma peça inválida na OS."
          );
        }

        if (
          !Number.isInteger(
            peca.quantidade
          ) ||
          peca.quantidade <= 0
        ) {
          throw new Error(
            `Quantidade inválida para ${peca.nomePeca}.`
          );
        }
      }

      /* -----------------------------------------------
         EVITAR PEÇA REPETIDA
         ----------------------------------------------- */

      const ids = new Set<string>();

      for (const peca of pecasDesejadas) {
        if (ids.has(peca.pecaId)) {
          throw new Error(
            `A peça ${peca.codigoPeca} foi adicionada mais de uma vez.`
          );
        }

        ids.add(peca.pecaId);
      }

      /* -----------------------------------------------
         LER OS LOTES
         ----------------------------------------------- */

      type SnapshotPeca = {
        exists: () => boolean;
        data: () =>
          | Record<string, unknown>
          | undefined;
      };

      const snapshotsPecas =
        new Map<string, SnapshotPeca>();

      for (const peca of pecasDesejadas) {
        const pecaRef = doc(
          pecasRef,
          peca.pecaId
        );

        const snapshot =
          await transaction.get(
            pecaRef
          );

        snapshotsPecas.set(
          peca.pecaId,
          snapshot
        );
      }

      /* -----------------------------------------------
         VALIDAR E PREPARAR BAIXAS
         ----------------------------------------------- */

      const agora =
        serverTimestamp();

      for (const peca of pecasDesejadas) {
        const snapshot =
          snapshotsPecas.get(
            peca.pecaId
          );

        if (!snapshot?.exists()) {
          throw new Error(
            `A peça ${peca.codigoPeca} não existe mais no estoque.`
          );
        }

        const dadosPeca =
          snapshot.data();

        if (!dadosPeca) {
          throw new Error(
            `Não foi possível ler os dados da peça ${peca.codigoPeca}.`
          );
        }

        const estoqueAtual =
          Number(
            dadosPeca.quantidade ?? 0
          );

        if (
          !Number.isFinite(
            estoqueAtual
          ) ||
          estoqueAtual < 0
        ) {
          throw new Error(
            `Estoque inválido para ${peca.codigoPeca}.`
          );
        }

        if (
          peca.quantidade >
          estoqueAtual
        ) {
          throw new Error(
            `Estoque insuficiente para ${peca.codigoPeca}. Disponível: ${estoqueAtual}.`
          );
        }
      }

      /* -----------------------------------------------
         ESCREVER BAIXAS E MOVIMENTAÇÕES
         ----------------------------------------------- */

      for (const peca of pecasDesejadas) {
        const pecaRef = doc(
          pecasRef,
          peca.pecaId
        );

        const snapshot =
          snapshotsPecas.get(
            peca.pecaId
          )!;

        const dadosPeca =
          snapshot.data();

        if (!dadosPeca) {
          throw new Error(
            `Não foi possível ler os dados da peça ${peca.codigoPeca}.`
          );
        }

        const estoqueAtual =
          Number(
            dadosPeca.quantidade ?? 0
          );

        const novoEstoque =
          estoqueAtual -
          peca.quantidade;

        transaction.update(
          pecaRef,
          {
            quantidade:
              novoEstoque,
            atualizadoEm:
              agora,
          }
        );

        const movimentacaoRef =
          doc(movimentacoesRef);

        transaction.set(
          movimentacaoRef,
          {
            pecaId:
              peca.pecaId,

            codigoPeca:
              peca.codigoPeca,

            tipo: "saida",

            quantidade:
              peca.quantidade,

            custoUnitario:
              peca.custoUnitario,

            origem: "servico",

            referenciaId: id,

            observacao:
              `Peça utilizada na OS ${servicoAtual.codigo ?? id}.`,

            criadoEm:
              agora,
          }
        );
      }

      /* -----------------------------------------------
         ATUALIZAR A OS
         ----------------------------------------------- */

      transaction.update(
        servicoRef,
        {
          servicoRealizado:
            dados.servicoRealizado
              ?.trim() ||
            undefined,

          observacoesTecnicas:
            dados.observacoesTecnicas
              ?.trim() ||
            undefined,

          pecasUtilizadas:
            pecasDesejadas,

          estoquePecasAplicado:
            true,

          status:
            "concluido",

          atualizadoEm:
            agora,
        }
      );
    }
  );
}
