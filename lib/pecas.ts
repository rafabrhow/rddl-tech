import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import type {
  MovimentacaoEstoque,
  Peca,
} from "@/lib/types";

const pecasRef = collection(db, "pecas");

const movimentacoesRef = collection(
  db,
  "movimentacoesEstoque"
);

/* =========================================================
   CÓDIGO AUTOMÁTICO
   ========================================================= */

function gerarCodigoPeca(numero: number) {
  return `PC-${String(numero).padStart(6, "0")}`;
}

async function gerarProximoCodigo() {
  const snapshot = await getDocs(pecasRef);

  let maiorNumero = 0;

  snapshot.forEach((item) => {
    const dados = item.data();

    if (typeof dados.codigo !== "string") {
      return;
    }

    const correspondencia =
      dados.codigo.match(/^PC-(\d+)$/);

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

  return gerarCodigoPeca(
    maiorNumero + 1
  );
}

/* =========================================================
   LISTAR PEÇAS
   ========================================================= */

export async function listarPecas(): Promise<Peca[]> {
  const snapshot = await getDocs(pecasRef);

  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  })) as Peca[];
}

/* =========================================================
   CRIAR NOVA COMPRA / LOTE
   ========================================================= */

export async function criarPeca(
  dados: Omit<
    Peca,
    "id" | "codigo" | "criadoEm" | "atualizadoEm"
  >
) {
  const codigo =
    await gerarProximoCodigo();

  const batch = writeBatch(db);

  const pecaRef = doc(pecasRef);

  batch.set(pecaRef, {
    ...dados,
    codigo,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });

  if (dados.quantidade > 0) {
    const movimentacaoRef =
      doc(movimentacoesRef);

    batch.set(movimentacaoRef, {
      pecaId: pecaRef.id,
      codigoPeca: codigo,
      tipo: "entrada",
      quantidade: dados.quantidade,
      custoUnitario:
        dados.custoUnitario,
      origem: "compra",
      referenciaId: pecaRef.id,
      observacao:
        "Estoque inicial da compra.",
      criadoEm: serverTimestamp(),
    });
  }

  await batch.commit();

  return {
    id: pecaRef.id,
    codigo,
  };
}

/* =========================================================
   ATUALIZAR LOTE
   ========================================================= */

export async function atualizarPeca(
  id: string,
  dados: Partial<
    Omit<
      Peca,
      "id" | "codigo" | "criadoEm" | "atualizadoEm"
    >
  >
) {
  await updateDoc(
    doc(db, "pecas", id),
    {
      ...dados,
      atualizadoEm:
        serverTimestamp(),
    }
  );
}

/* =========================================================
   HISTÓRICO DE MOVIMENTAÇÕES
   ========================================================= */

export async function listarMovimentacoesPeca(
  pecaId: string
): Promise<MovimentacaoEstoque[]> {
  const consulta = query(
    movimentacoesRef,
    where("pecaId", "==", pecaId)
  );

  const snapshot = await getDocs(consulta);

  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  })) as MovimentacaoEstoque[];
}

/* =========================================================
   EXCLUIR LOTE
   ========================================================= */

export async function excluirPeca(
  pecaId: string
) {
  const pecaRef = doc(
    db,
    "pecas",
    pecaId
  );

  const movimentacoes = query(
    movimentacoesRef,
    where("pecaId", "==", pecaId)
  );

  const movimentacoesSnapshot =
    await getDocs(movimentacoes);

  const batch = writeBatch(db);

  for (const movimentacao of movimentacoesSnapshot.docs) {
    batch.delete(movimentacao.ref);
  }

  batch.delete(pecaRef);

  await batch.commit();
}