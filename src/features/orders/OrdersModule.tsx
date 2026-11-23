"use client";

/**
 * Módulo de Ordens de Serviço.
 * Nesta etapa, a interface e os formulários foram isolados da página principal.
 * A persistência continua sob responsabilidade da página e permanece em localStorage.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { User } from "firebase/auth";
import { Download, Eye, Filter, Plus, Search, ClipboardList, X } from "lucide-react";
import type { BudgetApproval, BudgetItem, Customer, DriveAttachment, OSHistoryEntry, OSStatus, ServiceOrder, StockItem } from "@/lib/types";
import { drawCompanyPdfHeader } from "@/lib/pdf/pdf-template";
import { maskPhone } from "@/lib/input-masks";

const statuses: OSStatus[] = [
  "Recebido", "Em diagnóstico", "Aguardando aprovação", "Aguardando peça",
  "Em conserto", "Pronto", "Entregue", "Cancelado",
];

const statusStyle: Record<OSStatus, string> = {
  "Recebido": "bg-slate-100 text-slate-600",
  "Em diagnóstico": "bg-blue-50 text-blue-700",
  "Aguardando aprovação": "bg-amber-50 text-amber-700",
  "Aguardando peça": "bg-orange-50 text-orange-700",
  "Em conserto": "bg-violet-50 text-violet-700",
  "Pronto": "bg-emerald-50 text-emerald-700",
  "Entregue": "bg-green-100 text-green-800",
  "Cancelado": "bg-rose-50 text-rose-700",
};

type OrderForm = {
  customerId: string;
  customer: string;
  phone: string;
  device: string;
  issue: string;
  value: string;
  technician: string;
  imei: string;
  color: string;
  physicalCondition: string;
  accessories: string;
  estimatedDelivery: string;
};

interface OrdersModuleProps {
  stock: StockItem[];
  customers: Customer[];
  orders: ServiceOrder[];  user: User | null;
  showNewOS: boolean;
  setShowNewOS: (value: boolean) => void;
  form: OrderForm;
  setForm: (value: OrderForm) => void;
  addOrder: (event: React.FormEvent<HTMLFormElement>, photos?: DriveAttachment[]) => void;
  selectedOrder: ServiceOrder | null;
  setSelectedOrder: (order: ServiceOrder | null) => void;
  changeStatus: (id: string, status: OSStatus) => void;
  updateOrder: (order: ServiceOrder, description: string) => Promise<boolean>;
  consumeStock: (order: ServiceOrder) => void;
  onReverseOrder: (order: ServiceOrder) => void;
}


type CompanyDocumentData = {
  nomeFantasia?: string;
  telefone?: string;
  endereco?: string;
  logoUrl?: string;
  documento?: string;
  cnpj?: string;
  cpf?: string;
  logoDataUrl?: string;
};

function formatPdfMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function downloadDeliveryPdf(order: ServiceOrder, company: CompanyDocumentData) {
  const width = 1240;
  const height = 1754;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar o comprovante PDF.");

  // O canvas precisa começar totalmente branco: a exportação JPEG não preserva
  // transparência e pode converter áreas transparentes em preto.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const orange = "#ef741f";
  const dark = "#172033";
  const muted = "#64748b";
  const leftX = 78;
  const rightX = 646;
  const columnWidth = 516;
  const bodyTop = 430; // Mais respiro entre o número da OS e as informações em duas colunas.
  const footerTop = 1515;

  await drawCompanyPdfHeader(context, company, {
    width,
    margin: 78,
    topBandHeight: 18,
    dividerY: 260,
    logoSize: 150,
    textGap: 32,
  });

  context.textAlign = "center";
  context.fillStyle = dark;
  context.font = "700 38px Arial, sans-serif";
  context.fillText("COMPROVANTE DE ENTREGA", width / 2, 320);
  context.font = "700 23px Arial, sans-serif";
  context.fillStyle = muted;
  context.fillText(`ORDEM DE SERVIÇO ${order.id}`, width / 2, 357);
  context.textAlign = "left";

  const drawSection = (title: string, x: number, y: number) => {
    context.fillStyle = orange;
    context.font = "700 22px Arial, sans-serif";
    context.fillText(title.toUpperCase(), x, y);
    context.strokeStyle = "#e2e8f0";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, y + 13);
    context.lineTo(x + columnWidth, y + 13);
    context.stroke();
    return y + 48;
  };

  const drawField = (label: string, value: string | number | undefined, x: number, y: number, maxWidth = columnWidth) => {
    if (value === undefined || value === null || String(value).trim() === "") return y;
    context.fillStyle = muted;
    context.font = "700 17px Arial, sans-serif";
    context.fillText(label, x, y, maxWidth);
    y += 25;
    context.fillStyle = dark;
    context.font = "400 23px Arial, sans-serif";
    const words = String(value).split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (context.measureText(candidate).width > maxWidth && current) {
        context.fillText(current, x, y, maxWidth);
        y += 30;
        current = word;
      } else current = candidate;
    }
    if (current) {
      context.fillText(current, x, y, maxWidth);
      y += 39;
    }
    return y;
  };

  const drawValueRow = (label: string, value: string, x: number, y: number, total = false) => {
    context.font = `${total ? "700" : "400"} ${total ? 23 : 19}px Arial, sans-serif`;
    context.fillStyle = total ? dark : muted;
    context.fillText(label, x, y, columnWidth - 170);
    context.textAlign = "right";
    context.fillStyle = total ? orange : dark;
    context.fillText(value, x + columnWidth, y);
    context.textAlign = "left";
    return y + (total ? 42 : 32);
  };

  let leftY = bodyTop;
  leftY = drawSection("Dados do cliente", leftX, leftY);
  leftY = drawField("Cliente", order.customer, leftX, leftY);
  leftY = drawField("Telefone / WhatsApp", order.phone, leftX, leftY);

  leftY += 12;
  leftY = drawSection("Identificação do aparelho", leftX, leftY);
  leftY = drawField("Aparelho", order.device, leftX, leftY);
  leftY = drawField("IMEI / número de série", order.imei, leftX, leftY);
  leftY = drawField("Cor", order.color, leftX, leftY);
  leftY = drawField("Defeito relatado", order.issue, leftX, leftY);

  leftY += 12;
  leftY = drawSection("Diagnóstico e serviço", leftX, leftY);
  leftY = drawField("Diagnóstico técnico", order.technicalDiagnosis, leftX, leftY);
  leftY = drawField("Serviço executado", order.serviceCompleted, leftX, leftY);

  let rightY = bodyTop;
  rightY = drawSection("Testes e entrega", rightX, rightY);
  rightY = drawField("Testes finais do aparelho", order.finalTests, rightX, rightY);
  rightY = drawField("Observações na entrega", order.deliveryNotes, rightX, rightY);
  rightY = drawField("Entregue a", order.deliveredTo, rightX, rightY);
  rightY = drawField("Data da entrega", order.deliveredAt, rightX, rightY);

  rightY += 12;
  rightY = drawSection("Valores do serviço", rightX, rightY);
  for (const item of order.budgetItems || []) {
    rightY = drawValueRow(
      `${item.description} (${item.quantity} x ${formatPdfMoney(item.unitPrice)})`,
      formatPdfMoney(item.quantity * item.unitPrice),
      rightX,
      rightY
    );
  }
  rightY = drawValueRow("Mão de obra", formatPdfMoney(order.laborValue || 0), rightX, rightY);
  rightY = drawValueRow("Desconto", formatPdfMoney(order.discountValue || 0), rightX, rightY);
  rightY += 5;
  rightY = drawValueRow("TOTAL", formatPdfMoney(order.value), rightX, rightY, true);

  rightY += 12;
  rightY = drawSection("Garantia", rightX, rightY);
  rightY = drawField("Prazo", `${order.warrantyDays ?? 0} dias`, rightX, rightY);
  rightY = drawField("Válida até", order.warrantyUntil, rightX, rightY);

  // Rodapé em largura total, separado do conteúdo das duas colunas.
  const contentBottom = Math.max(leftY, rightY);
  const signaturesY = Math.min(Math.max(contentBottom + 85, footerTop), 1640);
  context.strokeStyle = "#cbd5e1";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(78, signaturesY);
  context.lineTo(width - 78, signaturesY);
  context.stroke();

  const signatureLineY = signaturesY + 82;
  context.strokeStyle = "#94a3b8";
  context.beginPath();
  context.moveTo(100, signatureLineY);
  context.lineTo(520, signatureLineY);
  context.moveTo(700, signatureLineY);
  context.lineTo(1120, signatureLineY);
  context.stroke();

  context.fillStyle = muted;
  context.font = "400 17px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText("Assinatura do cliente / responsável", 310, signatureLineY + 30);
  context.fillText(`Recebido por: ${order.deliveredTo || "____________________________"}`, 310, signatureLineY + 58);
  context.fillText("Assinatura do responsável pela assistência", 910, signatureLineY + 30);
  context.fillText(`Data da entrega: ${order.deliveredAt || "____/____/______"}`, 910, signatureLineY + 58);
  context.font = "400 16px Arial, sans-serif";
  context.fillText("Documento gerado pelo RDDL TECH", width / 2, 1710);
  context.textAlign = "left";

  const jpeg = canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
  const binary = atob(jpeg);
  const imageBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) imageBytes[i] = binary.charCodeAt(i);

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const push = (chunk: Uint8Array) => { chunks.push(chunk); length += chunk.length; };
  const offsets: number[] = [0];
  const add = (value: string) => push(encoder.encode(value));
  add("%PDF-1.4\n");
  const object = (id: number, body: string | Uint8Array) => {
    offsets[id] = length;
    add(`${id} 0 obj\n`);
    if (typeof body === "string") add(body);
    else push(body);
    add("\nendobj\n");
  };
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
  offsets[4] = length;
  add("4 0 obj\n");
  add(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
  push(imageBytes);
  add("\nendstream\nendobj\n");
  const content = "q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ";
  object(5, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  add("xref\n0 6\n0000000000 65535 f \n");
  for (let i = 1; i <= 5; i++) add(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const pdfBuffer = new ArrayBuffer(length);
  const pdfBytes = new Uint8Array(pdfBuffer);
  let pdfOffset = 0;
  for (const chunk of chunks) {
    pdfBytes.set(chunk, pdfOffset);
    pdfOffset += chunk.length;
  }
  const pdf = new Blob([pdfBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(pdf);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${order.id}-Comprovante-Entrega.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Exibe a lista, pesquisa, cadastro e detalhes das ordens de serviço. */
export function OrdersModule(props: OrdersModuleProps) {
  const {
    orders, user, stock, customers, showNewOS, setShowNewOS, form, setForm, addOrder,
    selectedOrder, setSelectedOrder, changeStatus, updateOrder, consumeStock, onReverseOrder,
  } = props;
  const [search, setSearch] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [diagnosis, setDiagnosis] = useState({ identifiedDefect: "", technicalDiagnosis: "", serviceRequired: "", technicalNotes: "" });
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [laborValue, setLaborValue] = useState("0");
  const [discountValue, setDiscountValue] = useState("0");
  const [approval, setApproval] = useState<BudgetApproval>("Não enviado");
  const [serviceCompleted, setServiceCompleted] = useState("");
  const [finalTests, setFinalTests] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [deliveredTo, setDeliveredTo] = useState("");
  const [warrantyDays, setWarrantyDays] = useState("90");
  const [companyDocument, setCompanyDocument] = useState<CompanyDocumentData>({});
  const [pdfLoading, setPdfLoading] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [pdfError, setPdfError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadCompanyDocument() {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/company/branding", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Não foi possível carregar a identificação da assistência.");
        if (active) setCompanyDocument((result.branding || {}) as CompanyDocumentData);
      } catch (error) {
        console.warn("Identificação da assistência indisponível para o comprovante.", error);
      }
    }
    void loadCompanyDocument();
    return () => { active = false; };
  }, [user]);
  useEffect(() => {
    if (!selectedOrder) return;
    setDiagnosis({ identifiedDefect: selectedOrder.identifiedDefect || "", technicalDiagnosis: selectedOrder.technicalDiagnosis || "", serviceRequired: selectedOrder.serviceRequired || "", technicalNotes: selectedOrder.technicalNotes || "" });
    setBudgetItems(selectedOrder.budgetItems || []);
    setLaborValue(String(selectedOrder.laborValue || 0));
    setDiscountValue(String(selectedOrder.discountValue || 0));
    setApproval(selectedOrder.budgetApproval || "Não enviado");
    setServiceCompleted(selectedOrder.serviceCompleted || "");
    setFinalTests(selectedOrder.finalTests || "");
    setDeliveryNotes(selectedOrder.deliveryNotes || "");
    setDeliveredTo(selectedOrder.deliveredTo || ""); 
    setWarrantyDays(String(selectedOrder.warrantyDays ?? 90));
  }, [selectedOrder?.id]);
  const budgetTotal = Math.max(0, budgetItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) + Number(laborValue || 0) - Number(discountValue || 0));
  async function saveTechnicalAndBudget(sendForApproval = false) {
    if (!selectedOrder || savingBudget) return;
    setSavingBudget(true);
    try {
      const now = new Date().toLocaleString("pt-BR");
      const nextApproval: BudgetApproval = sendForApproval ? "Aguardando aprovação" : approval;
      const entry: OSHistoryEntry = { id: String(Date.now()), description: sendForApproval ? "Orçamento enviado para aprovação do cliente" : "Diagnóstico e orçamento atualizados", actor: selectedOrder.technician || "Técnico", createdAt: now };
      const saved = await updateOrder({ ...selectedOrder, ...diagnosis, budgetItems, laborValue: Number(laborValue) || 0, discountValue: Number(discountValue) || 0, value: budgetTotal, budgetApproval: nextApproval, status: sendForApproval ? "Aguardando aprovação" : selectedOrder.status, history: [...(selectedOrder.history || []), entry] }, entry.description);
      if (saved) setApproval(nextApproval);
    } finally {
      setSavingBudget(false);
    }
  }

  async function decideBudget(decision: "Aprovado" | "Recusado") {
    if (!selectedOrder || savingBudget) return;
    setSavingBudget(true);
    try {
      const now = new Date().toLocaleString("pt-BR");
      const entry: OSHistoryEntry = { id: String(Date.now()), description: `Orçamento ${decision.toLowerCase()}`, actor: selectedOrder.technician || "Técnico", createdAt: now };
      const saved = await updateOrder({ ...selectedOrder, budgetApproval: decision, budgetDecisionAt: now, budgetDecisionBy: "Registrado pela assistência", status: decision === "Aprovado" ? "Em conserto" : "Cancelado", history: [...(selectedOrder.history || []), entry] }, entry.description);
      if (saved) setApproval(decision);
    } finally {
      setSavingBudget(false);
    }
  }


  function handlePhotosChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setUploadError("");
    if (selected.length > 5) {
      setUploadError("Selecione no máximo 5 fotos por ordem de serviço.");
      event.target.value = "";
      return;
    }
    const invalid = selected.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024);
    if (invalid) {
      setUploadError("Use fotos JPG, PNG ou WebP com até 10 MB cada.");
      event.target.value = "";
      return;
    }
    setPhotos(selected);
  }

  async function handleOrderSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError("");
    if (photos.length && !user) {
      setUploadError("Sua sessão expirou. Entre novamente para enviar fotos.");
      return;
    }
    setUploadingPhotos(true);
    try {
      const uploaded: DriveAttachment[] = [];
      if (photos.length) {
        const idToken = await user!.getIdToken();
        const orderId = `OS-${1049 + orders.length}`;
        for (const photo of photos) {
          const data = new FormData();
          data.append("file", photo);
          data.append("orderId", orderId);
          const response = await fetch("/api/drive/files/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${idToken}` },
            body: data,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Falha ao enviar uma das fotos.");
          uploaded.push(result.attachment as DriveAttachment);
        }
      }
      addOrder(event, uploaded);
      setPhotos([]);
      if (photoInputRef.current) photoInputRef.current.value = "";
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Não foi possível enviar as fotos.");
    } finally {
      setUploadingPhotos(false);
    }
  }

  const filteredOrders = useMemo(
    () => orders.filter((order) =>
      [order.id, order.customer, order.device, order.issue, order.status]
        .join(" ").toLowerCase().includes(search.toLowerCase())
    ),
    [orders, search]
  );

  const money = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <>
      <div>
        <PageHeading
          title="Ordens de serviço"
          subtitle="Acompanhe os aparelhos desde a entrada até a entrega."
          action={() => setShowNewOS(true)}
          actionText="Nova ordem de serviço"
        />

        <div className="mb-5 flex flex-col gap-3 glass-card rounded-2xl border border-white/70 p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por OS, cliente, aparelho..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500" />
          </div>
          <button type="button" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600">
            <Filter size={15} /> Filtros
          </button>
        </div>

        <div className="glass-card overflow-hidden rounded-2xl border border-white/70 shadow-soft">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="text-sm font-bold text-slate-800">
              Todas as ordens <span className="ml-1 rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-500">{filteredOrders.length}</span>
            </div>
            <button type="button" className="text-xs font-semibold text-brand-600"><Download size={14} className="mr-1 inline" /> Exportar</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3">Ordem</th><th className="px-5 py-3">Cliente / aparelho</th>
                  <th className="px-5 py-3">Serviço</th><th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Valor</th><th className="px-5 py-3">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="cursor-pointer transition-colors hover:bg-violet-50/60"
                    title={`Abrir ordem ${order.id}`}
                  >
                    <td className="px-5 py-4"><div className="text-xs font-bold text-brand-600">{order.id}</div><div className="mt-1 text-[10px] text-slate-400">{order.createdAt}</div></td>
                    <td className="px-5 py-4"><div className="text-xs font-semibold text-slate-700">{order.customer}</div><div className="mt-1 text-[11px] text-slate-400">{order.device}</div></td>
                    <td className="px-5 py-4 text-xs text-slate-600">{order.issue}</td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1.5 text-[10px] font-semibold ${statusStyle[order.status]}`}>{order.status}</span></td>
                    <td className="px-5 py-4 text-xs font-bold text-slate-700">{money(order.value)}</td>
                    <td className="px-5 py-4"><button type="button" aria-label={`Ver ordem ${order.id}`} onClick={(event) => { event.stopPropagation(); setSelectedOrder(order); }} className="rounded-lg p-2 text-slate-400 hover:bg-violet-50 hover:text-brand-600"><Eye size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredOrders.length === 0 && <Empty text="Nenhuma ordem encontrada." />}
          </div>
        </div>
      </div>

      {showNewOS && (
        <Modal title="Nova ordem de serviço" subtitle="Preencha os dados para registrar a entrada do aparelho." onClose={() => setShowNewOS(false)}>
          <form onSubmit={handleOrderSubmit} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Cliente</span>
              <select
                value={form.customerId || "novo"}
                onChange={(event) => {
                  const selected = customers.find((customer) => customer.id === event.target.value);
                  setForm({ ...form, customerId: selected?.id || "", customer: selected?.name || "", phone: selected?.phone || "" });
                }}
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-violet-100"
              >
                <option value="novo">Cadastrar novo cliente nesta OS</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}
              </select>
              <span className="mt-1 block text-[10px] text-slate-400">Selecione um cliente cadastrado para vincular esta OS ao histórico.</span>
            </label>
            <Field label="Nome do cliente" value={form.customer} onChange={(value) => setForm({ ...form, customer: value })} placeholder="Nome completo" required />
            <Field label="Telefone / WhatsApp" value={form.phone} onChange={(value) => setForm({ ...form, phone: maskPhone(value) })} placeholder="(00) 00000-0000" required />
            <Field label="Aparelho / marca e modelo" value={form.device} onChange={(value) => setForm({ ...form, device: value })} placeholder="Ex.: Samsung Galaxy A54 128 GB" required />
            <div className="grid grid-cols-2 gap-3">
              <Field label="IMEI / número de série" value={form.imei} onChange={(value) => setForm({ ...form, imei: value })} placeholder="Opcional" />
              <Field label="Cor do aparelho" value={form.color} onChange={(value) => setForm({ ...form, color: value })} placeholder="Ex.: preto" />
            </div>
            <Field label="Problema relatado pelo cliente" value={form.issue} onChange={(value) => setForm({ ...form, issue: value })} placeholder="Ex.: tela quebrada, não liga..." required />
            <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Estado físico na entrada</span><textarea value={form.physicalCondition} onChange={(event) => setForm({ ...form, physicalCondition: event.target.value })} rows={2} placeholder="Descreva riscos, trincas, amassados ou outros detalhes visíveis." className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-violet-100" /></label>
            <Field label="Acessórios entregues" value={form.accessories} onChange={(value) => setForm({ ...form, accessories: value })} placeholder="Ex.: carregador, capinha, chip ou nenhum" />
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <div className="text-xs font-bold text-slate-700">Fotos do aparelho</div>
              <p className="mt-1 text-[11px] text-slate-500">Até 5 fotos por ordem. JPG, PNG ou WebP, máximo de 10 MB cada.</p>
              <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handlePhotosChange} className="mt-3 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-2 file:text-xs file:font-bold file:text-violet-700"/>
              {photos.length > 0 && <p className="mt-2 text-[11px] text-slate-600">{photos.length} foto(s) selecionada(s): {photos.map((photo) => photo.name).join(", ")}</p>}
              {uploadError && <p role="alert" className="mt-2 text-[11px] text-rose-600">{uploadError}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Previsão de entrega" type="date" value={form.estimatedDelivery} onChange={(value) => setForm({ ...form, estimatedDelivery: value })} />
              <Field label="Valor previsto (R$)" type="number" value={form.value} onChange={(value) => setForm({ ...form, value })} placeholder="0,00" />
              <Field label="Técnico responsável" value={form.technician} onChange={(value) => setForm({ ...form, technician: value })} placeholder="Nome" />
            </div>
            <div className="flex gap-2 pt-3">
              <button type="button" disabled={uploadingPhotos} onClick={() => setShowNewOS(false)} className="flex-1 rounded-xl border border-slate-200 py-3 text-xs font-bold text-slate-600 disabled:opacity-50">Cancelar</button>
              <button disabled={uploadingPhotos} className="flex-1 rounded-xl bg-brand-600 py-3 text-xs font-bold text-white disabled:opacity-60">{uploadingPhotos ? "Enviando fotos..." : "Criar ordem"}</button>
            </div>
          </form>
        </Modal>
      )}

      {selectedOrder && (
        <Modal title={`Ordem ${selectedOrder.id}`} subtitle={`${selectedOrder.customer} · ${selectedOrder.device}`} onClose={() => setSelectedOrder(null)}>
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-xs text-slate-400">Problema relatado</div>
              <div className="mt-1 text-sm font-semibold">{selectedOrder.issue}</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><div className="text-[10px] text-slate-400">Telefone</div><div className="text-xs font-semibold">{selectedOrder.phone}</div></div>
                <div><div className="text-[10px] text-slate-400">Valor previsto</div><div className="text-xs font-semibold">{money(selectedOrder.value)}</div></div>
                {selectedOrder.imei && <div><div className="text-[10px] text-slate-400">IMEI / série</div><div className="text-xs font-semibold">{selectedOrder.imei}</div></div>}
                {selectedOrder.color && <div><div className="text-[10px] text-slate-400">Cor</div><div className="text-xs font-semibold">{selectedOrder.color}</div></div>}
                {selectedOrder.estimatedDelivery && <div><div className="text-[10px] text-slate-400">Previsão de entrega</div><div className="text-xs font-semibold">{new Date(`${selectedOrder.estimatedDelivery}T12:00:00`).toLocaleDateString("pt-BR")}</div></div>}
              </div>
            </div>
            {(selectedOrder.physicalCondition || selectedOrder.accessories) && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><div className="text-[10px] text-slate-400">Estado físico na entrada</div><div className="mt-1 text-xs">{selectedOrder.physicalCondition || "Não informado"}</div></div><div><div className="text-[10px] text-slate-400">Acessórios entregues</div><div className="mt-1 text-xs">{selectedOrder.accessories || "Não informado"}</div></div></div>}
            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h4 className="text-sm font-bold text-slate-800">Diagnóstico técnico</h4>
              <Field label="Defeito identificado" value={diagnosis.identifiedDefect} onChange={v => setDiagnosis(d => ({...d, identifiedDefect:v}))} placeholder="Ex.: conector de carga danificado" />
              <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Diagnóstico realizado</span><textarea value={diagnosis.technicalDiagnosis} onChange={e => setDiagnosis(d => ({...d, technicalDiagnosis:e.target.value}))} rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs" placeholder="Descreva os testes e a avaliação técnica."/></label>
              <Field label="Serviço necessário" value={diagnosis.serviceRequired} onChange={v => setDiagnosis(d => ({...d, serviceRequired:v}))} placeholder="Ex.: substituição do conector" />
              <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Observações técnicas</span><textarea value={diagnosis.technicalNotes} onChange={e => setDiagnosis(d => ({...d, technicalNotes:e.target.value}))} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"/></label>
            </section>
            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between"><h4 className="text-sm font-bold text-slate-800">Orçamento</h4><button type="button" disabled={savingBudget} onClick={() => setBudgetItems(items => [...items, {id:String(Date.now()),description:"",quantity:1,unitPrice:0}])} className="rounded-lg bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700">+ Adicionar peça</button></div>
              {stock.length === 0 && <p className="text-xs text-amber-700">Nenhuma peça cadastrada no estoque. Cadastre peças no módulo Estoque para selecioná-las aqui.</p>}
              {budgetItems.map(item => <div key={item.id} className="grid grid-cols-12 gap-2 rounded-lg bg-slate-50 p-2">
                <div className="col-span-6">
                  <select className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs" value={item.stockItemId || ""} onChange={e => {
                    const selected = stock.find(part => part.id === e.target.value);
                    setBudgetItems(items => items.map(x => x.id === item.id ? {
                      ...x, stockItemId: selected?.id, description: selected?.name || "", unitPrice: selected?.price || 0
                    } : x));
                  }}>
                    <option value="">Selecione uma peça do estoque</option>
                    {stock.map(part => <option key={part.id} value={part.id}>{part.name} — {part.quantity} em estoque</option>)}
                  </select>
                  {item.stockItemId && <p className="mt-1 text-[10px] text-slate-500">{stock.find(part => part.id === item.stockItemId)?.quantity ?? 0} unidade(s) disponível(is)</p>}
                </div>
                <input className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-xs" type="number" min="1" value={item.quantity} aria-label="Quantidade" onChange={e => setBudgetItems(items => items.map(x => x.id===item.id?{...x,quantity:Math.max(1,Number(e.target.value))}:x))}/>
                <div className="col-span-3 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs">
                  <span className="block text-[9px] text-slate-400">Valor unitário</span>
                  <strong>{money(item.unitPrice)}</strong>
                </div>
                <button type="button" className="col-span-1 text-rose-500" aria-label="Remover peça" onClick={() => setBudgetItems(items => items.filter(x => x.id!==item.id))}>×</button>
                {item.stockItemId && item.quantity > (stock.find(part => part.id === item.stockItemId)?.quantity ?? 0) && <p className="col-span-12 text-[10px] font-semibold text-amber-700">Quantidade acima do estoque disponível. Será necessário repor ou ajustar antes de utilizar a peça.</p>}
              </div>)}
              <div className="grid grid-cols-2 gap-3"><Field label="Mão de obra (R$)" type="number" value={laborValue} onChange={setLaborValue}/><Field label="Desconto (R$)" type="number" value={discountValue} onChange={setDiscountValue}/></div>
              <div className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm"><span className="font-semibold">Total do orçamento</span><strong>{money(budgetTotal)}</strong></div>
              <div className="text-xs text-slate-500">Situação: <strong>{approval}</strong></div>
              <div className="flex flex-wrap gap-2">
                {approval === "Aprovado" ? (
                  <button type="button" onClick={() => void saveTechnicalAndBudget(false)} disabled={savingBudget} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white disabled:opacity-50">{savingBudget ? "Salvando..." : "Salvar alterações"}</button>
                ) : approval === "Aguardando aprovação" ? (
                  <>
                    <button type="button" onClick={() => void saveTechnicalAndBudget(false)} disabled={savingBudget} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-bold disabled:opacity-50">{savingBudget ? "Salvando..." : "Salvar alterações"}</button>
                    <button type="button" onClick={() => void saveTechnicalAndBudget(true)} disabled={savingBudget} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white disabled:opacity-50">{savingBudget ? "Salvando..." : "Reenviar para aprovação"}</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => void saveTechnicalAndBudget(false)} disabled={savingBudget} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-bold disabled:opacity-50">{savingBudget ? "Salvando..." : "Salvar diagnóstico/orçamento"}</button>
                    <button type="button" onClick={() => void saveTechnicalAndBudget(true)} disabled={savingBudget} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white disabled:opacity-50">{savingBudget ? "Salvando..." : "Enviar para aprovação"}</button>
                  </>
                )}
              </div>
              {approval === "Aguardando aprovação" && <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => void decideBudget("Aprovado")} disabled={savingBudget} className="rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white disabled:opacity-50">Registrar aprovação</button><button type="button" onClick={() => void decideBudget("Recusado")} disabled={savingBudget} className="rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white disabled:opacity-50">Registrar recusa</button></div>}
            </section>
            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-bold">Movimentação de peças</h4><p className="mt-1 text-[11px] text-slate-500">A baixa acontece somente quando o técnico confirmar a utilização.</p></div></div>
              {selectedOrder.stockDeductedAt ? <div className="rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">Peças baixadas do estoque em {selectedOrder.stockDeductedAt}.</div> : <><div className="space-y-1 text-xs text-slate-600">{(selectedOrder.budgetItems || []).filter(item => item.stockItemId).map(item => <div key={item.id} className="flex justify-between gap-2"><span>{item.description} × {item.quantity}</span><span>{stock.find(part => part.id === item.stockItemId)?.quantity ?? 0} disponível(is)</span></div>)}{!(selectedOrder.budgetItems || []).some(item => item.stockItemId) && <p>Nenhuma peça do estoque vinculada a esta OS.</p>}</div><button type="button" disabled={selectedOrder.budgetApproval !== "Aprovado" || !(selectedOrder.budgetItems || []).some(item => item.stockItemId)} onClick={() => consumeStock(selectedOrder)} className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Confirmar utilização e baixar estoque</button>{selectedOrder.budgetApproval !== "Aprovado" && <p className="text-[10px] text-amber-700">Aguarde a aprovação do orçamento para registrar a saída das peças.</p>}</>}
            </section>
            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <div><h4 className="text-sm font-bold text-slate-800">Finalização e entrega</h4><p className="mt-1 text-[11px] text-slate-500">Registre os testes finais e os dados de quem recebeu o aparelho.</p></div>
                {selectedOrder.status === "Entregue" && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">Entregue</span>}
              </div>
              <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Serviço executado</span><textarea value={serviceCompleted} onChange={e => setServiceCompleted(e.target.value)} rows={2} placeholder="Descreva o reparo realizado." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"/></label>
              <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Testes finais do aparelho</span><textarea value={finalTests} onChange={e => setFinalTests(e.target.value)} rows={2} placeholder="Ex.: tela, áudio, câmeras e carregamento testados." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"/></label>
              <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Observações na entrega</span><textarea value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} rows={2} placeholder="Orientações ou ressalvas informadas ao cliente." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"/></label>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quem recebeu o aparelho" value={deliveredTo} onChange={setDeliveredTo} placeholder="Nome do cliente ou responsável"/>
                <Field label="Garantia (dias)" type="number" value={warrantyDays} onChange={setWarrantyDays} placeholder="90"/>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => {
                  if (!selectedOrder) return;
                  const now = new Date().toLocaleString("pt-BR");
                  const entry: OSHistoryEntry = { id: String(Date.now()), description: "Dados de finalização atualizados", actor: selectedOrder.technician || "Técnico", createdAt: now };
                  updateOrder({ ...selectedOrder, serviceCompleted, finalTests, deliveryNotes, deliveredTo, warrantyDays: Math.max(0, Number(warrantyDays) || 0), history: [...(selectedOrder.history || []), entry] }, entry.description);
                }} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-bold">Salvar finalização</button>
                <button type="button" disabled={!serviceCompleted.trim() || !finalTests.trim() || !deliveredTo.trim()} onClick={() => {
                  if (!selectedOrder) return;
                  const nowDate = new Date();
                  const now = nowDate.toLocaleString("pt-BR");
                  const days = Math.max(0, Number(warrantyDays) || 0);
                  const until = new Date(nowDate.getTime() + days * 86400000).toLocaleDateString("pt-BR");
                  const entry: OSHistoryEntry = { id: String(Date.now()), description: "Aparelho finalizado e entregue ao responsável", actor: deliveredTo, createdAt: now };
                  updateOrder({ ...selectedOrder, serviceCompleted, finalTests, deliveryNotes, deliveredTo, deliveredAt: now, warrantyDays: days, warrantyUntil: until, status: "Entregue", history: [...(selectedOrder.history || []), entry] }, entry.description);
                }} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white disabled:opacity-40">Finalizar e registrar entrega</button>
              </div>
              {selectedOrder.deliveredAt && <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">Entregue em {selectedOrder.deliveredAt} para {selectedOrder.deliveredTo}. Garantia de {selectedOrder.warrantyDays ?? 0} dias, até {selectedOrder.warrantyUntil || "não informada"}.</div>}
              {selectedOrder.status === "Entregue" && <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">{selectedOrder.financialReversedAt ? <><div className="text-xs font-bold text-rose-700">Financeiro desta OS revertido</div><p className="mt-1 text-[11px] text-rose-600">Motivo: {selectedOrder.financialReversalReason || "Não informado"}</p></> : <><p className="text-[11px] text-rose-700">A reversão retira os ganhos desta OS do financeiro, sem devolver peças automaticamente ao estoque.</p><button type="button" onClick={() => onReverseOrder(selectedOrder)} className="mt-2 rounded-lg bg-rose-600 px-3 py-2 text-[11px] font-bold text-white">Reverter financeiro da OS</button></>}</div>}
              <button type="button" disabled={!selectedOrder.deliveredAt || pdfLoading} onClick={async () => {
                if (!selectedOrder) return;
                setPdfLoading(true);
                setPdfError("");
                try {
                  // Busca a identidade visual novamente no momento do download para
                  // evitar gerar o PDF com dados ainda não carregados no estado do componente.
                  if (!user) throw new Error("Sua sessão expirou. Entre novamente para gerar o comprovante.");
                  const token = await user.getIdToken();
                  const brandingResponse = await fetch("/api/company/branding", {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: "no-store",
                  });
                  const brandingResult = await brandingResponse.json();
                  if (!brandingResponse.ok) {
                    throw new Error(brandingResult.error || "Não foi possível carregar os dados da assistência.");
                  }
                  const latestBranding = (brandingResult.branding || {}) as CompanyDocumentData;
                  setCompanyDocument(latestBranding);
                  await downloadDeliveryPdf(selectedOrder, latestBranding);
                } catch (error) {
                  setPdfError(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
                } finally {
                  setPdfLoading(false);
                }
              }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50"><Download size={14}/> {pdfLoading ? "Gerando comprovante..." : "Baixar comprovante PDF"}</button>
              {pdfError && <p className="text-xs text-rose-600">{pdfError}</p>}
            </section>
            <section className="rounded-xl border border-slate-200 p-4"><h4 className="mb-3 text-sm font-bold">Histórico da OS</h4>{(selectedOrder.history || []).length ? <div className="space-y-3">{[...(selectedOrder.history || [])].reverse().map(entry => <div key={entry.id} className="border-l-2 border-violet-200 pl-3"><div className="text-xs font-semibold">{entry.description}</div><div className="mt-1 text-[10px] text-slate-400">{entry.actor} · {entry.createdAt}</div></div>)}</div> : <p className="text-xs text-slate-400">Nenhuma atualização registrada nesta etapa.</p>}</section>
            <div>
              <label className="mb-2 block text-xs font-bold">Atualizar status</label>
              <select value={selectedOrder.status} onChange={(event) => changeStatus(selectedOrder.id, event.target.value as OSStatus)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-brand-500">
                {statuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </div>
            <div className="text-[11px] text-slate-400">Técnico responsável: {selectedOrder.technician}</div>
            <button type="button" onClick={() => setSelectedOrder(null)} className="w-full rounded-xl bg-slate-100 py-3 text-xs font-bold text-slate-600">Fechar</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function PageHeading({ title, subtitle, action, actionText }: { title: string; subtitle: string; action?: () => void; actionText?: string }) {
  return <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-bold text-slate-800">{title}</h2><p className="mt-1 text-xs text-slate-400">{subtitle}</p></div>{action && <button type="button" onClick={action} className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-xs font-bold text-white"><Plus size={15} />{actionText}</button>}</div>;
}

function Field({ label, value, onChange, placeholder, type = "text", required }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-violet-100" /></label>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"><div className="max-h-[92vh] w-full overflow-y-auto hide-scrollbar glass-modal rounded-t-3xl p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-6"><div className="mb-5 flex items-start justify-between"><div><h3 className="text-lg font-bold text-slate-800">{title}</h3><p className="mt-1 text-xs text-slate-400">{subtitle}</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>{children}</div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="p-12 text-center text-xs text-slate-400"><ClipboardList size={30} className="mx-auto mb-3 opacity-40" />{text}</div>;
}
