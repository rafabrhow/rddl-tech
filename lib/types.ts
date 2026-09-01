import type { Timestamp } from "firebase/firestore";

/* =========================================================
   USUÁRIO
   ========================================================= */

export type Usuario = {
  uid: string;
  nome: string;
  email: string;
  role: "admin";
  ativo: boolean;
  criadoEm: Timestamp;
};

/* =========================================================
   CLIENTE
   ========================================================= */

export type Cliente = {
  id: string;
  nome: string;
  telefone: string;
  email?: string;
  cpf?: string;
  endereco?: string;
  observacoes?: string;
  criadoEm: Timestamp;
  atualizadoEm: Timestamp;
};

/* =========================================================
   PEÇA / LOTE DE COMPRA
   ========================================================= */

export type Peca = {
  id: string;

  /**
   * Código gerado automaticamente pelo sistema.
   * Exemplo: PC-000001
   */
  codigo: string;

  /**
   * Identifica o produto.
   * Exemplo: Tela iPhone 11
   */
  nome: string;

  categoria?: string;
  fornecedor?: string;

  /**
   * Quantidade disponível deste lote.
   */
  quantidade: number;

  estoqueMinimo: number;

  /**
   * Valores pertencentes especificamente
   * a este lote/cadastro de compra.
   */
  custoUnitario: number;
  precoVenda: number;

  criadoEm: Timestamp;
  atualizadoEm: Timestamp;
};

/* =========================================================
   MOVIMENTAÇÃO DE ESTOQUE
   ========================================================= */

export type TipoMovimentacaoEstoque =
  | "entrada"
  | "saida";

export type OrigemMovimentacaoEstoque =
  | "compra"
  | "venda"
  | "servico"
  | "ajuste";

export type MovimentacaoEstoque = {
  id: string;

  pecaId: string;

  /**
   * Código do lote movimentado.
   */
  codigoPeca: string;

  tipo: TipoMovimentacaoEstoque;

  quantidade: number;

  custoUnitario?: number;

  origem: OrigemMovimentacaoEstoque;

  referenciaId?: string;

  observacao?: string;

  criadoEm: Timestamp;
};

/* =========================================================
   PEÇA UTILIZADA EM SERVIÇO
   ========================================================= */

export type PecaUtilizada = {
  pecaId: string;

  codigoPeca: string;

  nome: string;

  quantidade: number;

  custoUnitario: number;

  custoTotal: number;
};

/* =========================================================
   SERVIÇO
   ========================================================= */

export type StatusServico =
  | "orcamento"
  | "aguardando_peca"
  | "em_andamento"
  | "pronto"
  | "entregue"
  | "cancelado";

export type Servico = {
  id: string;

  clienteId: string;

  clienteNome: string;

  aparelho: string;

  modelo?: string;

  imei?: string;

  defeito: string;

  observacoes?: string;

  pecas: PecaUtilizada[];

  custoPecas: number;

  maoDeObra: number;

  valorTotal: number;

  lucro: number;

  status: StatusServico;

  criadoEm: Timestamp;

  atualizadoEm: Timestamp;

  concluidoEm?: Timestamp;

  entregueEm?: Timestamp;
};

/* =========================================================
   VENDA DE PEÇA
   ========================================================= */

export type ItemVendaPeca = {
  pecaId: string;

  codigoPeca: string;

  nome: string;

  quantidade: number;

  custoUnitario: number;

  precoVendaUnitario: number;

  custoTotal: number;

  valorTotal: number;

  lucro: number;
};

export type VendaPeca = {
  id: string;

  clienteId?: string;

  clienteNome?: string;

  itens: ItemVendaPeca[];

  custoTotal: number;

  valorTotal: number;

  lucro: number;

  formaPagamento:
    | "dinheiro"
    | "pix"
    | "cartao"
    | "transferencia"
    | "outro";

  criadoEm: Timestamp;
};

/* =========================================================
   ENTRADA EXTRA
   ========================================================= */

export type EntradaExtra = {
  id: string;

  descricao: string;

  valor: number;

  observacao?: string;

  criadoEm: Timestamp;
};

/* =========================================================
   SAÍDA
   ========================================================= */

export type CategoriaSaida =
  | "despesa"
  | "ferramenta"
  | "manutencao"
  | "conta"
  | "outro";

export type Saida = {
  id: string;

  descricao: string;

  categoria: CategoriaSaida;

  valor: number;

  observacao?: string;

  criadoEm: Timestamp;
};

/* =========================================================
   FECHAMENTO FINANCEIRO
   ========================================================= */

export type Fechamento = {
  id: string;

  ano: number;

  mes: number;

  receitaServicos: number;

  receitaVendasPecas: number;

  entradasExtras: number;

  custoPecas: number;

  lucroServicos: number;

  lucroVendasPecas: number;

  saidas: number;

  lucroOperacional: number;

  dizimo: number;

  lucroAposDizimo: number;

  fechadoEm: Timestamp;
};

/* =========================================================
   CONFIGURAÇÕES
   ========================================================= */

export type Configuracoes = {
  nomeEmpresa: string;

  percentualDizimo: number;

  atualizadoEm: Timestamp;
};