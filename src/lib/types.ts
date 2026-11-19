export type OSStatus = "Recebido" | "Em diagnóstico" | "Aguardando aprovação" | "Aguardando peça" | "Em conserto" | "Pronto" | "Entregue" | "Cancelado";
export type BudgetApproval = "Não enviado" | "Aguardando aprovação" | "Aprovado" | "Recusado";
export type BudgetItem = { id: string; description: string; quantity: number; unitPrice: number; stockItemId?: string };
export type OSHistoryEntry = { id: string; description: string; actor: string; createdAt: string; type?: string; reason?: string; reversalId?: string };
export type ServiceOrder = {
  id: string; customerId?: string; customer: string; phone: string; device: string; issue: string;
  status: OSStatus; value: number; createdAt: string; technician: string; photos?: DriveAttachment[];
  imei?: string; color?: string; physicalCondition?: string; accessories?: string; estimatedDelivery?: string;
  technicalDiagnosis?: string; identifiedDefect?: string; serviceRequired?: string; technicalNotes?: string;
  budgetItems?: BudgetItem[]; laborValue?: number; discountValue?: number; budgetApproval?: BudgetApproval;
  budgetDecisionAt?: string; budgetDecisionBy?: string; stockDeductedAt?: string; serviceCompleted?: string; finalTests?: string; deliveryNotes?: string; deliveredTo?: string; deliveredAt?: string; warrantyDays?: number; warrantyUntil?: string; financialReversedAt?: string; financialReversalReason?: string; financialReversedBy?: string; financialReversalLabor?: number; financialReversalPartsProfit?: number; history?: OSHistoryEntry[];
};
export type Customer = { id: string; name: string; phone: string; email?: string; createdAt: string };
export type StockItem = { id: string; name: string; category: string; quantity: number; min: number; cost: number; price: number };
export type StockMovement = { id: string; stockItemId: string; stockItemName: string; type: "entrada" | "ajuste" | "saida_os" | "saida_venda"; quantity: number; quantityBefore?: number; quantityAfter?: number; note?: string; orderId?: string; saleId?: string; customer?: string; technician?: string; createdAt: string };

export type DriveAttachment = {
  id: string;
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
};
