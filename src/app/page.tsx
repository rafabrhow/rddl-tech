"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3,
  Bell, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign,
  ClipboardList, Clock3, Command, Download, FileText, Filter, LayoutDashboard,
  LogOut, Menu, Package, Plus, Search, Settings, Smartphone,
  Users, Wallet, Wrench, X, CalendarDays, Eye, Pencil, Trash2
} from "lucide-react";
import type { Customer, DriveAttachment, OSStatus, ServiceOrder, StockItem, StockMovement } from "@/lib/types";
import { isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/features/auth/useAuth";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { SuperAdminDashboard, Dashboard } from "@/components/dashboards";
import { OrdersModule } from "@/features/orders/OrdersModule";
import { CompanyBrandingSettings } from "@/features/settings/CompanyBrandingSettings";
import { drawCompanyPdfHeader } from "@/lib/pdf/pdf-template";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { maskPhone } from "@/lib/input-masks";

const initialStock: StockItem[] = [
  {id:"P-001",name:"Tela iPhone 11",category:"Telas",quantity:3,min:2,cost:180,price:320},
  {id:"P-002",name:"Bateria Samsung A54",category:"Baterias",quantity:1,min:2,cost:75,price:140},
  {id:"P-003",name:"Conector de carga Tipo-C",category:"Conectores",quantity:12,min:4,cost:18,price:45},
  {id:"P-004",name:"Película 3D universal",category:"Acessórios",quantity:25,min:8,cost:5,price:20},
];

const money = (n:number) => n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const pixField = (id:string, value:string) => `${id}${String(value.length).padStart(2,"0")}${value}`;
function buildPixPayload(pixKey:string, amountCentavos:number) {
  const amount = (Math.max(0, amountCentavos) / 100).toFixed(2);
  const account = pixField("00","br.gov.bcb.pix") + pixField("01",pixKey.trim());
  const additional = pixField("05","***");
  const payload = pixField("00","01") + pixField("01","11") + pixField("26",account) +
    pixField("52","0000") + pixField("53","986") + pixField("54",amount) +
    pixField("58","BR") + pixField("59","RDDL TECH") + pixField("60","CODO") +
    pixField("62",additional) + "6304";
  let crc = 0xffff;
  for (let i=0;i<payload.length;i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit=0;bit<8;bit++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    crc &= 0xffff;
  }
  return payload + crc.toString(16).toUpperCase().padStart(4,"0");
}

type Section = "Visão geral" | "Ordens de serviço" | "Clientes" | "Estoque" | "PDV" | "Financeiro" | "Relatórios" | "Configurações";

export default function Home() {
  const confirm = useConfirm();
  // A autenticação fica centralizada no hook para manter esta página focada nos módulos.
  const {
    authLoading, authenticatedUser, accessAllowed, userRole,
    subscriptionAccess, subscriptionLoading,
    loginEmail, setLoginEmail, loginPassword, setLoginPassword,
    loginError, loginMessage, loginBusy, showPassword, setShowPassword,
    handleLogin, handlePasswordReset, handleLogout,
  } = useAuth();

  const [section,setSection] = useState<Section>("Visão geral");
  const [mobileMenu,setMobileMenu] = useState(false);
  const [showNotifications,setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showNotifications) return;

    const handleClickOutside = (event: PointerEvent) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false);
      }
    };

    document.addEventListener("pointerdown", handleClickOutside);

    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  }, [showNotifications]);
  const [readNotificationIds,setReadNotificationIds] = useState<string[]>([]);
  const notificationStorageKey = `rddl-notifications-read:${authenticatedUser?.uid || authenticatedUser?.email || "local"}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(notificationStorageKey);
      setReadNotificationIds(saved ? JSON.parse(saved) : []);
    } catch {
      setReadNotificationIds([]);
    }
  }, [notificationStorageKey]);
  useEffect(() => {
    try {
      localStorage.setItem(notificationStorageKey, JSON.stringify(readNotificationIds));
    } catch {}
  }, [notificationStorageKey, readNotificationIds]);
  const markNotificationAsRead = (id: string) => {
    setReadNotificationIds(current => current.includes(id) ? current : [...current, id]);
  };

  const [orders,setOrders] = useState<ServiceOrder[]>([]);
  const [customers,setCustomers] = useState<Customer[]>([]);
  const [stock,setStock] = useState<StockItem[]>([]);
  const [cart,setCart] = useState<{stockItemId:string;quantity:number}[]>([]);
  const [pdvProduct,setPdvProduct] = useState("");
  const [pdvSearch,setPdvSearch] = useState("");
  const [showPdvProducts,setShowPdvProducts] = useState(false);
  const [pdvPayment,setPdvPayment] = useState("PIX");
  const [pdvBusy,setPdvBusy] = useState(false);
  const [showPdvHistory,setShowPdvHistory] = useState(false);
  const [stockMovements,setStockMovements] = useState<StockMovement[]>([]);
  const [financeData,setFinanceData] = useState<any>({sales:[],expenses:[],orders:[],tithe:{},closings:[]});
  const [financeMonth,setFinanceMonth] = useState(new Date().toISOString().slice(0,7));
  const [reportTab,setReportTab] = useState("PDV");
  const [reportStart,setReportStart] = useState(new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10));
  const [reportEnd,setReportEnd] = useState(new Date().toISOString().slice(0,10));
  const [reportPayment,setReportPayment] = useState("Todos");
  const [reportProduct,setReportProduct] = useState("");
  const [reportSaleSearch,setReportSaleSearch] = useState("");
  const [expenseForm,setExpenseForm] = useState({description:"",category:"Operacional",amount:"",date:new Date().toISOString().slice(0,10)});
  const [showExpense,setShowExpense] = useState(false);
  const [editingExpense,setEditingExpense] = useState<any|null>(null);
  const [viewingExpenseHistory,setViewingExpenseHistory] = useState<any|null>(null);
  const [financeBusy,setFinanceBusy] = useState(false);
  const [search,setSearch] = useState("");
  const [showNewOS,setShowNewOS] = useState(false);
  const [showNewCustomer,setShowNewCustomer] = useState(false);
  const [showNewStock,setShowNewStock] = useState(false);
  const [editingStock,setEditingStock] = useState<StockItem|null>(null);
  const [stockMovementItem,setStockMovementItem] = useState<StockItem|null>(null);
  const [stockMovementForm,setStockMovementForm] = useState({type:"entrada",quantity:"1",newQuantity:"0",note:""});
  const [stockBusy,setStockBusy] = useState(false);
  const [selectedOrder,setSelectedOrder] = useState<ServiceOrder|null>(null);
  const [selectedCustomer,setSelectedCustomer] = useState<Customer|null>(null);
  const [editingCustomer,setEditingCustomer] = useState<Customer|null>(null);
  const [dataLoading,setDataLoading] = useState(false);
  const [toast,setToast] = useState("");
  const [form,setForm] = useState({customerId:"",customer:"",phone:"",device:"",issue:"",value:"",technician:"Luiz",imei:"",color:"",physicalCondition:"",accessories:"",estimatedDelivery:""});
  const [customerForm,setCustomerForm] = useState({name:"",phone:"",email:""});
  const [stockForm,setStockForm] = useState({name:"",category:"Peças",quantity:"0",min:"1",cost:"0",price:"0"});
  const [billingInfo,setBillingInfo] = useState<{valorMensalCentavos:number;pixTipo:string;pixChave:string;pixTitular:string}|null>(null);
  const [paymentFile,setPaymentFile] = useState<File|null>(null);
  const [paymentBusy,setPaymentBusy] = useState(false);
  const [paymentError,setPaymentError] = useState("");
  const [paymentMessage,setPaymentMessage] = useState("");
  const [showPaymentModal,setShowPaymentModal] = useState(false);
  const [paymentHistory,setPaymentHistory] = useState<Array<{id:string;status:string;motivoRecusa?:string;recusadoEm?:string;criadoEm?:string;arquivoNome?:string}>>([]);
  const [paymentHistoryBusy,setPaymentHistoryBusy] = useState(false);

  async function loadPaymentHistory() {
    if (!authenticatedUser || userRole !== "admin") return;
    setPaymentHistoryBusy(true);
    try {
      const token = await authenticatedUser.getIdToken();
      const response = await fetch("/api/assinatura/solicitacoes", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o histórico de pagamentos.");
      setPaymentHistory(Array.isArray(result.items) ? result.items : []);
    } catch (error) {
      console.error("Falha ao carregar histórico de pagamentos:", error);
    } finally {
      setPaymentHistoryBusy(false);
    }
  }

  useEffect(() => {
    if (userRole !== "admin" || !authenticatedUser) return;
    void loadPaymentHistory();
    const refresh = window.setInterval(() => void loadPaymentHistory(), 60000);
    return () => window.clearInterval(refresh);
  }, [userRole, authenticatedUser?.uid]);
  const [reversalTarget,setReversalTarget] = useState<{type:"pdv"|"os";id:string;label:string}|null>(null);
  const [reversalReason,setReversalReason] = useState("");
  const [reversalBusy,setReversalBusy] = useState(false);
  useEffect(() => {
    if (userRole !== "admin" || !["trial", "expired"].includes(subscriptionAccess?.status || "") || !authenticatedUser) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await authenticatedUser.getIdToken(true);
        const response = await fetch("/api/assinatura/configuracao", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Não foi possível carregar os dados do PIX.");
        if (!cancelled) setBillingInfo(result);
      } catch (error) {
        if (!cancelled) setPaymentError(error instanceof Error ? error.message : "Falha ao carregar os dados de pagamento.");
      }
    })();
    return () => { cancelled = true; };
  }, [userRole, subscriptionAccess?.status, authenticatedUser]);
  async function submitPaymentProof(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authenticatedUser || !paymentFile) { setPaymentError("Selecione o comprovante do PIX."); return; }
    setPaymentBusy(true); setPaymentError(""); setPaymentMessage("");
    try {
      const token = await authenticatedUser.getIdToken(true);
      const data = new FormData(); data.append("comprovante", paymentFile);
      const response = await fetch("/api/assinatura/solicitar", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar o comprovante.");
      setPaymentMessage(result.message || "Comprovante enviado para análise.");
      setPaymentFile(null);
      await loadPaymentHistory();
    } catch (error) { setPaymentError(error instanceof Error ? error.message : "Falha ao enviar o comprovante."); }
    finally { setPaymentBusy(false); }
  }
  const pixPayload = useMemo(() => billingInfo?.pixChave
    ? buildPixPayload(billingInfo.pixChave, billingInfo.valorMensalCentavos ?? 3000)
    : "", [billingInfo?.pixChave, billingInfo?.valorMensalCentavos]);
  const pixQrImageUrl = pixPayload
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(pixPayload)}`
    : "";
  async function copyPixPayload() {
    if (!pixPayload) return;
    try { await navigator.clipboard.writeText(pixPayload); setPaymentMessage("Código Pix copia e cola copiado."); }
    catch { setPaymentError("Não foi possível copiar o código Pix automaticamente."); }
  }
  async function copyPixKey() {
    if (!billingInfo?.pixChave) return;
    try { await navigator.clipboard.writeText(billingInfo.pixChave); setPaymentMessage("Chave PIX copiada."); }
    catch { setPaymentError("Não foi possível copiar automaticamente. Selecione e copie a chave PIX."); }
  }


  useEffect(() => {
    if (!accessAllowed || !authenticatedUser) return;
    let cancelled = false;
    (async () => {
      setDataLoading(true);
      try {
        const token = await authenticatedUser.getIdToken(true);
        const headers = { Authorization: `Bearer ${token}` };
        const [customersResponse, ordersResponse, stockResponse, financeResponse] = await Promise.all([
          fetch("/api/operacional/clientes", { headers, cache: "no-store" }),
          fetch("/api/operacional/ordens", { headers, cache: "no-store" }),
          fetch("/api/operacional/estoque", { headers, cache: "no-store" }),
          fetch("/api/operacional/financeiro", { headers, cache: "no-store" }),
        ]);
        let [customersData, ordersData, stockData, financeDataResult] = await Promise.all([customersResponse.json(), ordersResponse.json(), stockResponse.json(), financeResponse.json()]);
        if (!financeResponse.ok) throw new Error(financeDataResult.error || "Falha ao carregar financeiro.");
        if (!cancelled) setFinanceData(financeDataResult);
        if (!cancelled) setFinanceData(financeDataResult);
        if (!stockResponse.ok) throw new Error(stockData.error || "Falha ao carregar estoque.");
        if (!customersResponse.ok) throw new Error(customersData.error || "Falha ao carregar clientes.");
        if (!ordersResponse.ok) throw new Error(ordersData.error || "Falha ao carregar ordens de serviço.");
        // Migra uma única vez os cadastros locais antigos quando a empresa ainda não possui registros no Firestore.
        const legacyCustomers = !customersData.customers?.length ? JSON.parse(localStorage.getItem("teixacell-customers") || "[]") : [];
        const legacyOrders = !ordersData.orders?.length ? JSON.parse(localStorage.getItem("teixacell-os") || "[]") : [];
        if (legacyCustomers.length) {
          const migration = await fetch("/api/operacional/clientes", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ import: legacyCustomers }) });
          if (!migration.ok) throw new Error("Não foi possível migrar os clientes antigos para o banco.");
        }
        if (legacyOrders.length) {
          const migration = await fetch("/api/operacional/ordens", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ import: legacyOrders }) });
          if (!migration.ok) throw new Error("Não foi possível migrar as OS antigas para o banco.");
        }
        if (legacyCustomers.length || legacyOrders.length) {
          const refreshed = await Promise.all([
            fetch("/api/operacional/clientes", { headers, cache: "no-store" }).then(response => response.json()),
            fetch("/api/operacional/ordens", { headers, cache: "no-store" }).then(response => response.json()),
          ]);
          customersData = refreshed[0]; ordersData = refreshed[1];
          if (customersData.customers?.length || ordersData.orders?.length) {
            localStorage.removeItem("teixacell-customers");
            localStorage.removeItem("teixacell-os");
          }
        }
        if (cancelled) return;
        setCustomers(Array.isArray(customersData.customers) ? customersData.customers : []);
        setOrders(Array.isArray(ordersData.orders) ? ordersData.orders : []);
        setStock(Array.isArray(stockData.items) ? stockData.items : []);
        setStockMovements(Array.isArray(stockData.movements) ? stockData.movements : []);
      } catch (error) {
        if (!cancelled) setToast(error instanceof Error ? error.message : "Não foi possível carregar os dados do banco.");
      } finally { if (!cancelled) setDataLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [accessAllowed, authenticatedUser]);
  useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(""),2800);return()=>clearTimeout(t);}},[toast]);

  const filteredCustomers=useMemo(()=>customers.filter(c=>[c.name,c.phone,c.email||""].join(" ").toLowerCase().includes(search.toLowerCase())),[customers,search]);
  const revenue=orders.filter(o=>o.status==="Entregue"&&!o.financialReversedAt).reduce((s,o)=>s+o.value,0);
  const openOrders=orders.filter(o=>!["Entregue","Cancelado"].includes(o.status)).length;
  const ready=orders.filter(o=>o.status==="Pronto").length;
  const lowStock=stock.filter(p=>p.quantity<=p.min).length;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const currentDateLabel = today.toLocaleDateString("pt-BR", { day:"numeric", month:"long", year:"numeric" });
  const overdueOrders = orders.filter(order => {
    if (!order.estimatedDelivery || ["Entregue", "Cancelado"].includes(order.status)) return false;
    return order.estimatedDelivery < todayKey;
  });
  const notifications = [
    ...(lowStock > 0 ? [{id:`stock-${lowStock}`,title:"Estoque baixo",detail:`${lowStock} ${lowStock===1?"produto precisa":"produtos precisam"} de reposição.`,section:"Estoque" as Section,level:"warning"}] : []),
    ...(overdueOrders.length > 0 ? [{id:`overdue-${overdueOrders.map(order=>order.id).sort().join("-")}`,title:"Ordens atrasadas",detail:`${overdueOrders.length} ${overdueOrders.length===1?"OS está":"OS estão"} com prazo de entrega vencido.`,section:"Ordens de serviço" as Section,level:"warning"}] : []),
    ...(userRole === "admin" && subscriptionAccess?.status === "trial" && subscriptionAccess.daysRemaining <= 3 ? [{id:"trial",title:"Período de teste",detail:subscriptionAccess.daysRemaining===0?"Seu período de teste termina hoje.":`Seu período de teste termina em ${subscriptionAccess.daysRemaining} ${subscriptionAccess.daysRemaining===1?"dia":"dias"}.`,section:"Configurações" as Section,level:"billing"}] : []),
    ...(userRole === "admin" && subscriptionAccess?.status === "active" && typeof subscriptionAccess.daysUntilRenewal === "number" && subscriptionAccess.daysUntilRenewal <= 5 ? [{id:"subscription",title:"Assinatura próxima do vencimento",detail:subscriptionAccess.daysUntilRenewal<=0?"Sua assinatura vence hoje.":`Sua assinatura vence em ${subscriptionAccess.daysUntilRenewal} ${subscriptionAccess.daysUntilRenewal===1?"dia":"dias"}.`,section:"Configurações" as Section,level:"billing"}] : []),
    ...(userRole === "admin" && paymentHistory.find(item=>item.status==="recusado") ? (()=>{const rejected=paymentHistory.find(item=>item.status==="recusado")!;return [{id:`payment-rejected-${rejected.id}`,title:"Pagamento recusado",detail:`Motivo: ${rejected.motivoRecusa || "Consulte o histórico e envie um novo comprovante."}`,section:"Visão geral" as Section,level:"billing",paymentRejected:true}];})() : []),
  ];

  async function addOrder(e:React.FormEvent, photos: DriveAttachment[] = []){
    e.preventDefault();
    if (!authenticatedUser) { setToast("Faça login novamente para salvar a OS."); return; }
    try {
      const token = await authenticatedUser.getIdToken();
      let linkedCustomer = customers.find(customer => customer.id === form.customerId)
        || customers.find(customer => customer.phone.replace(/\D/g, "") === form.phone.replace(/\D/g, "") && customer.phone.replace(/\D/g, ""));
      if (!linkedCustomer) {
        const customerResponse = await fetch("/api/operacional/clientes", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: form.customer, phone: form.phone }) });
        const customerResult = await customerResponse.json();
        if (!customerResponse.ok) throw new Error(customerResult.error || "Não foi possível cadastrar o cliente.");
        linkedCustomer = customerResult.customer as Customer;
        setCustomers(current => [linkedCustomer!, ...current]);
      }
      const payload: ServiceOrder = { id: "", customerId: linkedCustomer.id, customer: linkedCustomer.name, phone: linkedCustomer.phone, device:form.device, issue:form.issue, status:"Recebido", value:Number(form.value)||0, createdAt:new Date().toLocaleDateString("pt-BR"), technician:form.technician, photos, imei:form.imei,color:form.color,physicalCondition:form.physicalCondition,accessories:form.accessories,estimatedDelivery:form.estimatedDelivery };
      const response = await fetch("/api/operacional/ordens", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a ordem de serviço.");
      const savedOrder = result.order as ServiceOrder;
      savedOrder.id = result.order.orderNumber || savedOrder.id;
      setOrders(current => [savedOrder, ...current]);
      setShowNewOS(false); setForm({customerId:"",customer:"",phone:"",device:"",issue:"",value:"",technician:"Luiz",imei:"",color:"",physicalCondition:"",accessories:"",estimatedDelivery:""});
      setSection("Ordens de serviço"); setToast("Ordem de serviço salva no banco de dados!");
    } catch (error) { setToast(error instanceof Error ? error.message : "Falha ao salvar a OS."); }
  }
  async function updateOrder(updated: ServiceOrder, description: string) {
    try {
      if (!authenticatedUser) throw new Error("Faça login novamente.");
      const token = await authenticatedUser.getIdToken();
      const response = await fetch("/api/operacional/ordens", { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(updated) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao atualizar a OS.");
      setOrders(current => current.map(order => order.id === updated.id ? updated : order));
      setSelectedOrder(updated); setToast(description);
    } catch (error) { setToast(error instanceof Error ? error.message : "Falha ao salvar alterações da OS."); }
  }
  async function consumeStockForOrder(order: ServiceOrder) {
    if (!authenticatedUser) { setToast("Faça login novamente para registrar a baixa."); return; }
    if (order.stockDeductedAt) { setToast("As peças desta OS já foram baixadas do estoque."); return; }
    if (order.budgetApproval !== "Aprovado") { setToast("O orçamento precisa estar aprovado antes da baixa."); return; }
    if (!(order.budgetItems || []).some(item => item.stockItemId)) { setToast("Esta OS não possui peças vinculadas ao estoque."); return; }

    try {
      const token = await authenticatedUser.getIdToken();
      const response = await fetch("/api/operacional/estoque", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "consume", orderId: order.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível baixar as peças do estoque.");

      const updated = {
        ...order,
        stockDeductedAt: result.stockDeductedAt,
        consumedParts: result.consumedParts,
        partsRevenue: result.partsRevenue,
        partsCost: result.partsCost,
        partsProfit: result.partsProfit,
        laborProfit: result.laborProfit,
        history: [...(order.history || []), result.historyEntry],
      };
      setOrders(current => current.map(item => item.id === order.id ? updated : item));
      setSelectedOrder(updated);
      setStock(Array.isArray(result.items) ? result.items : []);
      setStockMovements(Array.isArray(result.movements) ? result.movements : []);
      setToast("Saída das peças registrada no Firestore e vinculada à ordem de serviço!");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Falha ao registrar a baixa das peças.");
    }
  }
  async function addCustomer(e:React.FormEvent){
    e.preventDefault();
    try {
      if (!authenticatedUser) throw new Error("Faça login novamente.");
      const token = await authenticatedUser.getIdToken();
      const response = await fetch("/api/operacional/clientes", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(customerForm) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao cadastrar cliente.");
      setCustomers(current => [result.customer, ...current]); setShowNewCustomer(false);
      setCustomerForm({name:"",phone:"",email:""}); setToast("Cliente cadastrado no banco de dados!");
    } catch (error) { setToast(error instanceof Error ? error.message : "Falha ao cadastrar cliente."); }
  }
  async function saveCustomer(e:React.FormEvent) {
    e.preventDefault();
    if (!editingCustomer || !authenticatedUser) return;
    try {
      const token = await authenticatedUser.getIdToken();
      const response = await fetch("/api/operacional/clientes", { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: editingCustomer.id, ...customerForm }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao atualizar cliente.");
      const updated = result.customer as Customer;
      setCustomers(current => current.map(customer => customer.id === updated.id ? updated : customer));
      const linkedOrders = orders.filter(order => order.customerId === updated.id);
      for (const order of linkedOrders) {
        const synced = { ...order, customer: updated.name, phone: updated.phone };
        const orderResponse = await fetch("/api/operacional/ordens", { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(synced) });
        if (!orderResponse.ok) throw new Error("Cliente atualizado, mas não foi possível atualizar os dados nas OS vinculadas.");
        setOrders(current => current.map(item => item.id === synced.id ? synced : item));
      }
      setSelectedCustomer(current => current?.id === updated.id ? updated : current);
      setEditingCustomer(null); setToast("Dados do cliente atualizados!");
    } catch (error) { setToast(error instanceof Error ? error.message : "Falha ao atualizar cliente."); }
  }
  async function submitReversal(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!authenticatedUser||!reversalTarget||reversalReason.trim().length<3||reversalBusy)return;
    setReversalBusy(true);
    try{
      const token=await authenticatedUser.getIdToken(true);
      const response=await fetch("/api/operacional/estornos",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({type:reversalTarget.type,recordId:reversalTarget.id,reason:reversalReason.trim()})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Não foi possível registrar o estorno.");
      const reversalRecord={...result.reversal,createdAtServer:result.reversal.createdAt||new Date().toISOString()};
      setFinanceData((current:any)=>({...current,reversals:[reversalRecord,...(current.reversals||[]).filter((item:any)=>item.id!==reversalRecord.id)]}));
      if(reversalTarget.type==="pdv"){
        setFinanceData((current:any)=>({...current,sales:(current.sales||[]).map((sale:any)=>sale.id===reversalTarget.id?{...sale,status:"estornada",refundedAt:new Date().toISOString(),refundReason:reversalReason.trim(),refundId:result.reversal.id}:sale)}));
        const stockResponse=await fetch("/api/operacional/estoque",{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
        const stockResult=await stockResponse.json();
        if(stockResponse.ok){setStock(stockResult.items||[]);setStockMovements(stockResult.movements||[]);}
      }else{
        const reversedAt=new Date().toISOString();
        const actorName=result.reversal.createdByName||authenticatedUser.displayName||authenticatedUser.email||authenticatedUser.uid;
        const historyEntry={id:result.reversal.id,description:`Financeiro da OS revertido · Motivo: ${reversalReason.trim()}`,actor:actorName,createdAt:new Date(reversedAt).toLocaleString("pt-BR"),type:"financial_reversal",reason:reversalReason.trim()};
        setOrders(current=>current.map(order=>order.id===reversalTarget.id?{...order,financialReversedAt:reversedAt,financialReversalReason:reversalReason.trim(),financialReversedBy:authenticatedUser.uid,financialReversedByName:actorName,financialReversalLabor:result.reversal.laborReversed,financialReversalPartsProfit:result.reversal.partsProfitReversed,history:[...(order.history||[]),historyEntry]}:order));
        setSelectedOrder(current=>current?.id===reversalTarget.id?{...current,financialReversedAt:reversedAt,financialReversalReason:reversalReason.trim(),financialReversedBy:authenticatedUser.uid,financialReversedByName:actorName,financialReversalLabor:result.reversal.laborReversed,financialReversalPartsProfit:result.reversal.partsProfitReversed,history:[...(current.history||[]),historyEntry]}:current);
      }
      setReversalTarget(null);setReversalReason("");setToast("Estorno registrado com sucesso. O histórico original foi preservado.");
    }catch(error){setToast(error instanceof Error?error.message:"Falha ao registrar estorno.");}
    finally{setReversalBusy(false);}
  }

  async function addStock(e:React.FormEvent){
    e.preventDefault();
    try {
      if (!authenticatedUser) throw new Error("Faça login novamente.");
      const token = await authenticatedUser.getIdToken();
      const response = await fetch("/api/operacional/estoque", { method:"POST", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" }, body:JSON.stringify({ action:"create", ...stockForm, quantity:Number(stockForm.quantity), min:Number(stockForm.min), cost:Number(stockForm.cost), price:Number(stockForm.price) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Falha ao cadastrar produto.");
      setStock(current => [result.item, ...current]); setShowNewStock(false); setStockForm({name:"",category:"Peças",quantity:"0",min:"1",cost:"0",price:"0"}); setToast("Produto salvo no Firestore!");
    } catch(error) { setToast(error instanceof Error ? error.message : "Falha ao cadastrar produto."); }
  }
  async function saveStockEdit(e:React.FormEvent){
    e.preventDefault(); if(!editingStock||!authenticatedUser||stockBusy)return; setStockBusy(true);
    try { const token=await authenticatedUser.getIdToken(); const response=await fetch("/api/operacional/estoque",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({action:"update",id:editingStock.id,name:stockForm.name,category:stockForm.category,min:Number(stockForm.min),cost:Number(stockForm.cost),price:Number(stockForm.price)})}); const result=await response.json(); if(!response.ok)throw new Error(result.error||"Falha ao atualizar produto."); setStock(current=>current.map(item=>item.id===result.item.id?{...item,...result.item}:item)); setEditingStock(null); setToast("Produto atualizado!"); }
    catch(error){setToast(error instanceof Error?error.message:"Falha ao atualizar produto.");} finally{setStockBusy(false);}
  }
  async function saveStockMovement(e:React.FormEvent){
    e.preventDefault(); if(!stockMovementItem||!authenticatedUser||stockBusy)return; setStockBusy(true);
    try { const token=await authenticatedUser.getIdToken(); const response=await fetch("/api/operacional/estoque",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({action:"movement",stockItemId:stockMovementItem.id,type:stockMovementForm.type,quantity:Number(stockMovementForm.quantity),newQuantity:Number(stockMovementForm.newQuantity),note:stockMovementForm.note})}); const result=await response.json(); if(!response.ok)throw new Error(result.error||"Falha ao registrar movimentação."); setStock(current=>current.map(item=>item.id===result.item.id?{...item,...result.item}:item)); setStockMovements(current=>[result.movement,...current.filter(item=>item.id!==result.movement.id)]); setStockMovementItem(null); setStockMovementForm({type:"entrada",quantity:"1",newQuantity:"0",note:""}); setToast("Movimentação registrada e estoque atualizado!"); }
    catch(error){setToast(error instanceof Error?error.message:"Falha ao registrar movimentação.");} finally{setStockBusy(false);}
  }
  const cartTotal = cart.reduce((sum: number,line: any) => { const item=stock.find(p=>p.id===line.stockItemId); return sum+(item?.price||0)*line.quantity; },0);
  async function finalizeSale() {
    if (!authenticatedUser || !cart.length || pdvBusy) return;
    setPdvBusy(true);
    try {
      const token=await authenticatedUser.getIdToken();
      const response=await fetch("/api/operacional/estoque",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({action:"sale",paymentMethod:pdvPayment,items:cart})});
      const result=await response.json(); if(!response.ok) throw new Error(result.error||"Não foi possível concluir a venda.");
      setStock(result.items||[]); setStockMovements(result.movements||[]); if(result.sale) setFinanceData((current:any)=>({...current,sales:[result.sale,...(current.sales||[]).filter((sale:any)=>sale.id!==result.sale.id)]})); setCart([]); setToast(`Venda registrada! Total: ${money(result.sale.total)} · Lucro: ${money(result.sale.profit)}`);
    } catch(error) { setToast(error instanceof Error?error.message:"Falha ao registrar venda."); }
    finally { setPdvBusy(false); }
  }
  async function addExpense(e:React.FormEvent) {
    e.preventDefault(); if (!authenticatedUser || financeBusy) return;
    setFinanceBusy(true);
    try {
      const token=await authenticatedUser.getIdToken();
      const response=await fetch("/api/operacional/financeiro",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({action:"expense",...expenseForm,amount:Number(expenseForm.amount)})});
      const result=await response.json(); if(!response.ok) throw new Error(result.error||"Não foi possível registrar a despesa.");
      setFinanceData((current:any)=>({...current,expenses:[result.expense,...(current.expenses||[])]}));
      setExpenseForm({description:"",category:"Operacional",amount:"",date:new Date().toISOString().slice(0,10)});
      setShowExpense(false); setToast("Despesa registrada no Firestore!");
    } catch(error){setToast(error instanceof Error?error.message:"Falha ao registrar despesa.");}
    finally{setFinanceBusy(false);}
  }
  async function saveExpenseEdit(e:React.FormEvent) {
    e.preventDefault();
    if(!authenticatedUser||!editingExpense||financeBusy)return;
    setFinanceBusy(true);
    try {
      const token=await authenticatedUser.getIdToken();
      const response=await fetch("/api/operacional/financeiro",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({action:"expense-update",id:editingExpense.id,...expenseForm,amount:Number(expenseForm.amount)})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Não foi possível atualizar a despesa.");
      setFinanceData((current:any)=>({...current,expenses:(current.expenses||[]).map((item:any)=>item.id===result.expense.id?result.expense:item)}));
      setEditingExpense(null);setToast("Despesa atualizada e histórico preservado.");
    } catch(error){setToast(error instanceof Error?error.message:"Falha ao atualizar despesa.");}
    finally{setFinanceBusy(false);}
  }
  async function cancelExpense(item:any) {
    if(!authenticatedUser||financeBusy)return;
    const confirmed = await confirm({
      title: "Cancelar despesa?",
      message: `Deseja cancelar a despesa "${item.description}" de ${money(Number(item.amount||0))}?`,
      description: "O registro será preservado no histórico e deixará de compor os totais financeiros.",
      confirmText: "Sim, cancelar",
      cancelText: "Voltar",
      variant: "danger",
    });
    if (!confirmed) return;
    setFinanceBusy(true);
    try {
      const token=await authenticatedUser.getIdToken();
      const response=await fetch("/api/operacional/financeiro",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({action:"expense-cancel",id:item.id})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Não foi possível cancelar a despesa.");
      setFinanceData((current:any)=>({...current,expenses:(current.expenses||[]).map((expense:any)=>expense.id===result.expense.id?result.expense:expense)}));
      setToast("Despesa cancelada. O histórico foi preservado e os totais foram atualizados.");
    } catch(error){setToast(error instanceof Error?error.message:"Falha ao cancelar despesa.");}
    finally{setFinanceBusy(false);}
  }
  async function updateTitheStatus(month:string,status:"reserved"|"paid",amount:number) {
    if(!authenticatedUser)return;
    try {
      const token=await authenticatedUser.getIdToken();
      const response=await fetch("/api/operacional/financeiro",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({action:"tithe-status",month,status,amount})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"Falha ao atualizar dízimo.");
      setFinanceData((current:any)=>({...current,tithe:{...(current.tithe||{}),[month]:{...(current.tithe?.[month]||{}),...(result.record||{}),...(status==="paid"?{paid:true,paidAt:new Date().toISOString(),paidAmount:amount}:{reserved:true,reservedAt:new Date().toISOString()})}}}));
      setToast(status==="paid"?"Pagamento do dízimo registrado.":"Dízimo marcado como separado.");
    } catch(error){setToast(error instanceof Error?error.message:"Falha ao atualizar dízimo.");}
  }
async function closeFinancialMonth(month:string,amount:number){
    if(!authenticatedUser)return;
    const confirmed=await confirm({
      title:"Fechar competência financeira?",
      message:`Confirma o fechamento de ${month}?`,
      description:"O sistema consolidará os ganhos, estornos, despesas e o dízimo. O valor do dízimo ficará pendente para pagamento. O fechamento não poderá ser repetido.",
      confirmText:"Fechar competência",
      cancelText:"Voltar",
      variant:"danger",
    });
    if(!confirmed)return;
    try{
      const token=await authenticatedUser.getIdToken();
      const response=await fetch("/api/operacional/financeiro",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({action:"close-month",month})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Não foi possível fechar a competência.");
      setFinanceData((current:any)=>({...current,closings:[result.closing,...(current.closings||[]).filter((item:any)=>item.month!==month)],tithe:{...(current.tithe||{}),[month]:{...(current.tithe?.[month]||{}),closed:true,closedAt:result.closing.closedAt,closedBy:result.closing.closedBy,dueAmount:result.closing.totals.titheAmount,status:"pending",paid:false,previousPayment:result.closing.previousPayment||null}}}));
      setToast(`Competência fechada. Dízimo pendente: ${money(amount)}.`);
    }catch(error){setToast(error instanceof Error?error.message:"Falha ao fechar competência.");}
  }
    async function changeStatus(id:string,status:OSStatus){
    const order = orders.find(item => item.id === id);
    if (!order) return;
    await updateOrder({ ...order, status }, "Status da ordem atualizado e salvo!");
    setSelectedOrder(null);
  }

  const nav: {name:Section;icon:any}[]=[
    {name:"Visão geral",icon:LayoutDashboard},{name:"Ordens de serviço",icon:ClipboardList},
    {name:"Clientes",icon:Users},{name:"Estoque",icon:Package},{name:"PDV",icon:CircleDollarSign},{name:"Financeiro",icon:Wallet},
    {name:"Relatórios",icon:BarChart3},{name:"Configurações",icon:Settings}
  ];
  const title=section==="Visão geral"?"Visão geral":section;

  // Evita exibir o painel enquanto a sessão e as permissões são verificadas.
  if (authLoading || (userRole === "admin" && subscriptionLoading)) {
    return <main className="flex min-h-screen items-center justify-center p-6"><div className="glass-card rounded-3xl p-8 text-center shadow-soft"><div className="phone-vibrate mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Smartphone size={38} strokeWidth={1.8}/></div><p className="text-base font-extrabold tracking-wide text-slate-800">RDDL TECH</p><p className="mt-2 text-sm font-semibold text-slate-600">Verificando acesso...</p><p className="mt-1 text-xs text-slate-400">Gestão inteligente para assistência técnica</p></div></main>;
  }

  if (!isFirebaseConfigured) {
    return <main className="flex min-h-screen items-center justify-center p-6"><div className="glass-card w-full max-w-md rounded-3xl p-8 shadow-soft"><div className="mb-5 flex justify-center"><img src="/teixacell-logo.jpeg" alt="Logomarca da assistência" className="h-40 w-40 rounded-xl bg-black object-contain"/></div><h2 className="text-base font-bold text-slate-800">Firebase não configurado</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">Configure as variáveis NEXT_PUBLIC_FIREBASE_* no arquivo .env.local e reinicie o servidor de desenvolvimento.</p></div></main>;
  }

  if (!authenticatedUser || !accessAllowed) {
    return <LoginScreen
      authenticatedUser={authenticatedUser}
      loginEmail={loginEmail}
      setLoginEmail={setLoginEmail}
      loginPassword={loginPassword}
      setLoginPassword={setLoginPassword}
      loginError={loginError}
      loginMessage={loginMessage}
      loginBusy={loginBusy}
      showPassword={showPassword}
      setShowPassword={setShowPassword}
      onLogin={handleLogin}
      onPasswordReset={handlePasswordReset}
      onLogout={handleLogout}
    />;
  }

  if (userRole === "admin" && subscriptionAccess?.status === "error") {
    return <main className="flex min-h-screen items-center justify-center p-6"><div className="glass-card w-full max-w-lg rounded-3xl p-8 text-center shadow-soft"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><AlertCircle size={26}/></div><h2 className="text-lg font-bold text-slate-800">Não foi possível verificar sua assinatura</h2><p className="mt-2 text-sm leading-relaxed text-slate-500">{subscriptionAccess.message || "Atualize a página para tentar novamente."}</p><button onClick={()=>window.location.reload()} className="mt-5 rounded-xl bg-brand-600 px-5 py-3 text-xs font-bold text-white">Tentar novamente</button><button onClick={handleLogout} className="ml-2 rounded-xl border border-slate-200 px-5 py-3 text-xs font-bold text-slate-600">Sair</button></div></main>;
  }

  if (userRole === "admin" && (subscriptionAccess?.status === "expired" || subscriptionAccess?.status === "suspended")) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="glass-card w-full max-w-xl rounded-3xl border border-amber-100 p-8 text-center shadow-soft"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><Clock3 size={30}/></div><div className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-700">Acesso temporariamente bloqueado</div><h2 className="mt-2 text-2xl font-extrabold text-slate-800">{subscriptionAccess.status === "expired" ? (subscriptionAccess.trialEndsAt ? "Seu período de teste terminou" : "Sua assinatura venceu") : "Acesso à assistência suspenso"}</h2><p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-500">{subscriptionAccess.status === "expired" ? (subscriptionAccess.trialEndsAt ? "Os 5 dias de avaliação gratuita foram concluídos. Para continuar utilizando o RDDL TECH, será necessário contratar um plano. Os dados da sua assistência permanecem preservados." : "O período da assinatura mensal terminou. Envie o comprovante do novo pagamento para análise e reativação. Os dados da sua assistência permanecem preservados.") : "O acesso desta assistência está suspenso. Entre em contato com o responsável pela plataforma para regularizar a assinatura. Os dados permanecem preservados."}</p><div className="mx-auto mt-6 max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-left">
        <div className="text-xs font-semibold text-slate-500">Plano mensal</div>
        <div className="mt-1 text-3xl font-extrabold text-slate-800">{money((billingInfo?.valorMensalCentavos ?? 3000) / 100)}<span className="text-sm font-medium text-slate-400">/mês</span></div>
        <div className="mt-4 rounded-xl bg-violet-50 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Pagamento via PIX</div><div className="mt-2 text-xs text-slate-500">Tipo: {billingInfo?.pixTipo || "Telefone"}</div><div className="mt-1 break-all text-sm font-bold text-slate-800">{billingInfo?.pixChave || "Carregando chave PIX..."}</div>{billingInfo?.pixTitular && <div className="mt-1 text-[11px] text-slate-500">Titular: {billingInfo.pixTitular}</div>}<button type="button" onClick={copyPixKey} disabled={!billingInfo?.pixChave} className="mt-3 rounded-lg border border-violet-200 bg-white px-3 py-2 text-[11px] font-bold text-violet-700">Copiar chave PIX</button></div>
        <form onSubmit={submitPaymentProof} className="mt-4 space-y-3"><label className="block text-xs font-semibold text-slate-600">Anexar comprovante (PDF, JPG, PNG ou WebP — até 8 MB)<input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={e=>setPaymentFile(e.target.files?.[0] || null)} className="mt-2 block w-full text-xs text-slate-500"/></label>{paymentError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{paymentError}</p>}{paymentMessage && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{paymentMessage}</p>}<button disabled={paymentBusy || !paymentFile} type="submit" className="w-full rounded-xl bg-brand-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{paymentBusy ? "Enviando comprovante..." : "Enviar comprovante para análise"}</button></form>
        <p className="mt-3 text-[10px] leading-relaxed text-slate-400">O acesso será liberado após o superadministrador conferir o recebimento do PIX. A assinatura será ativada por 30 dias a partir da confirmação.</p>
      </div><button onClick={handleLogout} className="mt-6 rounded-xl border border-slate-200 px-5 py-3 text-xs font-bold text-slate-600">Sair do sistema</button></div></main>;
  }

  // O superadministrador utiliza uma área própria da plataforma.
  // Ele não deve visualizar nem acessar os módulos operacionais das assistências.
  if (userRole === "superadmin") {
    return <SuperAdminDashboard email={authenticatedUser.email || ""} onLogout={handleLogout} />;
  }

  return <div className="min-h-screen">
    <aside className={`fixed inset-y-0 left-0 z-40 w-[250px] glass-sidebar text-white transition-transform lg:translate-x-0 ${mobileMenu?"translate-x-0":"-translate-x-full"}`}>
      <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-5">
        <img src="/teixacell-logo.jpeg" alt="TEIXACELL" className="h-12 w-12 rounded-lg bg-black object-contain"/>
        <div><div className="text-[16px] font-bold tracking-wide">TEIXA<span className="text-orange-400">CELL</span></div><div className="text-[10px] uppercase tracking-[.18em] text-white/45">Gestão de assistência</div></div>
        <button className="ml-auto lg:hidden" onClick={()=>setMobileMenu(false)}><X size={20}/></button>
      </div>
      <div className="px-4 pt-7 pb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-white/35">Menu principal</div>
      <nav className="space-y-1 px-3">{nav.map(item=>{const Icon=item.icon;return <button key={item.name} onClick={()=>{setSection(item.name);setSearch("");setMobileMenu(false);}} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[13px] transition ${section===item.name?"bg-brand-500 text-white shadow-lg shadow-violet-950/30":"text-white/65 hover:bg-white/8 hover:text-white"}`}><Icon size={18}/><span>{item.name}</span>{item.name==="Ordens de serviço"&&<span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[10px]">{openOrders}</span>}</button>})}</nav>
    </aside>
    {mobileMenu&&<button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={()=>setMobileMenu(false)}/>}
    <main className="min-h-screen lg:ml-[250px]">
      <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between glass-header border-b border-white/50 px-4 md:px-8">
        <div className="flex items-center gap-3">
          <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={()=>setMobileMenu(true)}><Menu size={21}/></button>
          <div><div className="text-[10px] font-medium uppercase tracking-[.16em] text-slate-400">Painel de controle</div><h1 className="text-[17px] font-bold text-slate-800">{title}</h1></div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <div className="hidden items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 sm:flex"><CalendarDays size={14}/> {currentDateLabel}</div>
          <div ref={notificationRef} className="relative">
            <button type="button" aria-label="Notificações" aria-expanded={showNotifications} onClick={()=>setShowNotifications(value=>!value)} className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-100">
              <Bell size={19}/>{notifications.some(item=>!readNotificationIds.includes(item.id))&&<><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white"/><span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white">{notifications.filter(item=>!readNotificationIds.includes(item.id)).length}</span></>}
            </button>
            {showNotifications&&<div className="absolute right-0 top-full z-50 mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="text-sm font-bold text-slate-800">Notificações</div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">{notifications.filter(item=>!readNotificationIds.includes(item.id)).length} não lido(s)</span>
                  {notifications.some(item=>!readNotificationIds.includes(item.id))&&<button type="button" onClick={()=>setReadNotificationIds(current=>Array.from(new Set([...current,...notifications.map(item=>item.id)])))} className="text-[10px] font-semibold text-violet-600 hover:text-violet-800">Marcar todas como lidas</button>}
                </div>
              </div>
              {notifications.length===0?<div className="px-4 py-6 text-center"><div className="text-xs font-semibold text-slate-600">Tudo em dia!</div><p className="mt-1 text-[11px] text-slate-400">Nenhum aviso de estoque, OS ou assinatura.</p></div>:<div className="max-h-80 overflow-y-auto">{notifications.map(item=>{
                const isRead=readNotificationIds.includes(item.id);
                return <div key={item.id} className={`flex items-start gap-2 border-b border-slate-50 px-3 py-3 ${isRead?"bg-white opacity-60":"bg-violet-50/30"}`}>
                  <button type="button" onClick={()=>{setSection(item.section);setShowNotifications(false);setSearch("");markNotificationAsRead(item.id);if(item.id.startsWith("payment-rejected-")){setPaymentError("");setPaymentMessage("");setShowPaymentModal(true);}}} className="flex min-w-0 flex-1 gap-3 text-left hover:opacity-80">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${isRead?"bg-slate-300":item.level==="billing"?"bg-violet-500":"bg-orange-500"}`}/>
                    <span className="min-w-0"><span className="block text-xs font-bold text-slate-700">{item.title}</span><span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{item.detail}</span></span>
                    <ArrowRight size={14} className="ml-auto mt-1 shrink-0 text-slate-300"/>
                  </button>
                  {!isRead&&<button type="button" onClick={()=>markNotificationAsRead(item.id)} className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold text-violet-600 hover:bg-violet-100">Marcar como lido</button>}
                  {isRead&&<span className="shrink-0 pt-1 text-[10px] text-slate-400">Lido</span>}
                </div>;
              })}</div>}
            </div>}
          </div>
          <div className="flex items-center gap-2 border-l border-slate-200 pl-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{(authenticatedUser?.email || "AD").slice(0,2).toUpperCase()}</div><div className="hidden sm:block"><div className="text-xs font-semibold text-slate-700">Administrador</div><div className="text-[10px] text-slate-400">{authenticatedUser?.email}</div></div><button type="button" onClick={handleLogout} title="Sair do sistema" className="ml-1 rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><LogOut size={17}/></button></div>
        </div>
      </header>
      <div className="mx-auto max-w-[1500px] p-4 md:p-8">
        {section === "Visão geral" && subscriptionAccess?.status === "trial" && <div role="status" className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="rounded-xl bg-amber-100 p-2 text-amber-700"><Clock3 size={19}/></div><div><div className="text-sm font-extrabold text-amber-900">PERÍODO DE TESTE GRATUITO</div><p className="mt-1 text-xs leading-relaxed text-amber-800">Sua assistência está utilizando o RDDL TECH em período de teste. Restam <strong>{subscriptionAccess.daysRemaining} {subscriptionAccess.daysRemaining === 1 ? "dia" : "dias"}</strong> para escolher um plano e continuar usando o sistema.</p><p className="mt-1 text-[11px] text-amber-700">Plano mensal disponível para contratação antecipada.</p></div></div><div className="flex shrink-0 items-center gap-2 self-end sm:self-center"><span className="rounded-full bg-white/80 px-3 py-1.5 text-[10px] font-bold text-amber-800">Teste ativo</span><button type="button" onClick={()=>{setPaymentError("");setPaymentMessage("");setShowPaymentModal(true);}} className="rounded-xl bg-brand-600 px-4 py-2.5 text-[11px] font-bold text-white shadow-md hover:bg-brand-700">Assinar agora</button></div></div>}
        {showPaymentModal && section === "Visão geral" && ["trial","expired"].includes(subscriptionAccess?.status || "") && <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={()=>setShowPaymentModal(false)}><div role="dialog" aria-modal="true" aria-labelledby="trial-payment-title" className="my-6 w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-600">RDDL TECH</div><h2 id="trial-payment-title" className="mt-1 text-lg font-extrabold text-slate-800">Assinar plano mensal</h2><p className="mt-1 text-xs text-slate-500">Você pode contratar antes do fim do teste gratuito.</p></div><button type="button" onClick={()=>setShowPaymentModal(false)} aria-label="Fechar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div><div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="text-xs font-semibold text-violet-700">Plano mensal</div><div className="mt-1 text-3xl font-extrabold text-slate-800">{money((billingInfo?.valorMensalCentavos ?? 3000)/100)}<span className="text-sm font-medium text-slate-400">/mês</span></div><div className="mt-4 rounded-xl bg-white p-4"><div className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-center"><div className="mx-auto w-full max-w-[180px] rounded-xl border border-violet-100 bg-white p-2 text-center">{pixQrImageUrl ? <img src={pixQrImageUrl} alt="QR Code Pix com valor do plano mensal" className="h-auto w-full" /> : <div className="flex aspect-square items-center justify-center text-xs text-slate-400">Carregando QR Code...</div>}<div className="mt-1 text-[10px] font-bold text-violet-700">ESCANEIE PARA PAGAR</div></div><div><div className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Pagamento via PIX</div><div className="mt-2 text-xs text-slate-500">Valor exato: <strong className="text-slate-800">{money((billingInfo?.valorMensalCentavos ?? 3000)/100)}</strong></div><div className="mt-2 text-xs text-slate-500">Tipo: {billingInfo?.pixTipo || "Telefone"}</div><div className="mt-1 break-all text-sm font-bold text-slate-800">{billingInfo?.pixChave || "Carregando chave PIX..."}</div>{billingInfo?.pixTitular && <div className="mt-1 text-[11px] text-slate-500">Titular: {billingInfo.pixTitular}</div>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={copyPixKey} disabled={!billingInfo?.pixChave} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-[11px] font-bold text-violet-700 disabled:opacity-50">Copiar chave PIX</button><button type="button" onClick={copyPixPayload} disabled={!pixPayload} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-[11px] font-bold text-violet-700 disabled:opacity-50">Copiar Pix copia e cola</button></div></div></div></div></div><form onSubmit={submitPaymentProof} className="mt-4 space-y-3"><label className="block text-xs font-semibold text-slate-600">Anexar comprovante (PDF, JPG, PNG ou WebP — até 8 MB)<input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={e=>setPaymentFile(e.target.files?.[0] || null)} className="mt-2 block w-full text-xs text-slate-500"/></label>{paymentError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{paymentError}</p>}{paymentMessage && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{paymentMessage}</p>}<button disabled={paymentBusy || !paymentFile} type="submit" className="w-full rounded-xl bg-brand-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{paymentBusy ? "Enviando comprovante..." : "Enviar comprovante para análise"}</button></form><div className="mt-5 border-t border-slate-100 pt-4"><div className="flex items-center justify-between"><h3 className="text-xs font-bold text-slate-700">Histórico de comprovantes</h3><button type="button" onClick={()=>void loadPaymentHistory()} className="text-[10px] font-semibold text-violet-600">Atualizar</button></div>{paymentHistoryBusy?<p className="mt-2 text-[11px] text-slate-400">Carregando histórico...</p>:paymentHistory.length===0?<p className="mt-2 text-[11px] text-slate-400">Nenhum comprovante enviado.</p>:<div className="mt-2 max-h-36 space-y-2 overflow-y-auto">{paymentHistory.map(item=><div key={item.id} className="rounded-xl border border-slate-100 p-3"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-slate-700">{item.arquivoNome || "Comprovante PIX"}</span><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${item.status==="recusado"?"bg-rose-50 text-rose-700":item.status==="confirmado"?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>{item.status==="recusado"?"Recusado":item.status==="confirmado"?"Confirmado":"Aguardando análise"}</span></div>{item.status==="recusado"&&<p className="mt-1 text-[10px] text-rose-700">Motivo: {item.motivoRecusa || "Não informado"}</p>}<p className="mt-1 text-[9px] text-slate-400">{item.recusadoEm?`Analisado em ${new Date(item.recusadoEm).toLocaleString("pt-BR")}`:item.criadoEm?`Enviado em ${new Date(item.criadoEm).toLocaleString("pt-BR")}`:""}</p></div>)}</div>}</div><p className="mt-3 text-[10px] leading-relaxed text-slate-400">A assinatura será ativada por 30 dias a partir da confirmação manual do pagamento pelo superadministrador. Seu teste permanece ativo enquanto o pagamento aguarda análise.</p></div></div>}
        {section==="Visão geral"&&<Dashboard userRole={userRole} orders={orders} openOrders={openOrders} ready={ready} lowStock={lowStock} setSection={setSection} setSelectedOrder={setSelectedOrder} financeData={financeData}/>}
        {section==="Ordens de serviço"&&<OrdersModule
          stock={stock}
          customers={customers}
          user={authenticatedUser}
          orders={orders}
          showNewOS={showNewOS}
          setShowNewOS={setShowNewOS}
          form={form}
          setForm={setForm}
          addOrder={addOrder}
          selectedOrder={selectedOrder}
          setSelectedOrder={setSelectedOrder}
          changeStatus={changeStatus}
          updateOrder={updateOrder}
          consumeStock={consumeStockForOrder}
          onReverseOrder={(order:ServiceOrder)=>setReversalTarget({type:"os",id:order.id,label:`OS ${order.id} · ${order.customer}`})}
        />}
        {section==="Clientes"&&<div>{dataLoading&&<p className="mb-3 text-xs text-slate-500">Carregando clientes e ordens do banco de dados...</p>}<PageHeading title="Clientes" subtitle="Cadastre clientes e consulte o histórico de serviços." action={()=>setShowNewCustomer(true)} actionText="Novo cliente"/><SearchBar value={search} onChange={setSearch} placeholder="Buscar cliente por nome ou telefone..."/><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filteredCustomers.map(c=><div key={c.id} className="glass-card rounded-2xl border border-white/70 p-5 shadow-soft"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 font-bold text-violet-600">{c.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</div><div className="min-w-0"><div className="truncate text-sm font-bold">{c.name}</div></div><button type="button" title="Editar cliente" onClick={()=>{setEditingCustomer(c);setCustomerForm({name:c.name,phone:c.phone,email:c.email||""});}} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-violet-50 hover:text-violet-600"><Pencil size={16}/></button></div><div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500"><div>{c.phone}</div><div>{c.email||"E-mail não informado"}</div></div><div className="mt-4 flex items-center justify-between text-[10px] text-slate-400"><span>Cliente desde {c.createdAt}</span><button type="button" onClick={()=>setSelectedCustomer(c)} className="font-semibold text-brand-600 hover:underline">Ver histórico →</button></div></div>)}</div>{filteredCustomers.length===0&&<Empty text="Nenhum cliente encontrado."/>}</div>}
        {section==="Estoque"&&<div><PageHeading title="Estoque de peças" subtitle="Controle peças, acessórios e níveis mínimos." action={()=>setShowNewStock(true)} actionText="Adicionar item"/><div className="mb-5 grid gap-3 sm:grid-cols-3"><MiniStat label="Itens cadastrados" value={String(stock.length)} icon={<Package size={18}/>} /><MiniStat label="Estoque baixo" value={String(lowStock)} icon={<AlertCircle size={18}/>} danger={lowStock>0}/><MiniStat label="Unidades disponíveis" value={String(stock.reduce((s,p)=>s+p.quantity,0))} icon={<Activity size={18}/>} /></div><div className="glass-card overflow-hidden rounded-2xl border border-white/70 shadow-soft"><div className="border-b border-slate-100 p-4"><SearchBar value={search} onChange={setSearch} placeholder="Buscar peça ou acessório..."/></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Produto</th><th className="px-5 py-3">Categoria</th><th className="px-5 py-3">Quantidade</th><th className="px-5 py-3">Custo</th><th className="px-5 py-3">Preço de venda</th><th className="px-5 py-3">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">{stock.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())).map(p=><tr key={p.id}><td className="px-5 py-4 text-xs font-semibold">{p.name}</td><td className="px-5 py-4 text-xs text-slate-500">{p.category}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${p.quantity<=p.min?"bg-rose-50 text-rose-600":"bg-emerald-50 text-emerald-700"}`}>{p.quantity} un.</span></td><td className="px-5 py-4 text-xs text-slate-500">{money(p.cost)}</td><td className="px-5 py-4 text-xs font-bold">{money(p.price)}</td><td className="px-5 py-4"><div className="flex items-center gap-1"><button type="button" title="Registrar entrada ou ajuste" onClick={()=>{setStockMovementItem(p);setStockMovementForm({type:"entrada",quantity:"1",newQuantity:String(p.quantity),note:""});}} className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"><Plus size={15}/></button><button type="button" title="Editar produto" onClick={()=>{setEditingStock(p);setStockForm({name:p.name,category:p.category,quantity:String(p.quantity),min:String(p.min),cost:String(p.cost),price:String(p.price)});}} className="rounded-lg p-2 text-slate-500 hover:bg-violet-50 hover:text-violet-600"><Pencil size={15}/></button></div></td></tr>)}</tbody></table></div></div><div className="mt-5 glass-card rounded-2xl border border-white/70 p-5 shadow-soft"><h3 className="text-sm font-bold">Últimas movimentações</h3>{stockMovements.length ? <div className="mt-3 space-y-3">{stockMovements.slice(0,10).map(movement=>{const isEntry=movement.type==="entrada",isAdjustment=movement.type==="ajuste",isOut=movement.type==="saida_os"||movement.type==="saida_venda";const label=isEntry?"Entrada":isAdjustment?"Ajuste de inventário":movement.type==="saida_os"?"Saída por ordem de serviço":"Saída por venda";return <div key={movement.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0"><div><div className="text-xs font-semibold">{label} · {movement.stockItemName}</div><div className="mt-1 text-[10px] text-slate-500">{movement.note|| (movement.orderId?`OS ${movement.orderId} · ${movement.customer||""}`:movement.saleId?`Venda ${movement.saleId}`:"Movimentação de estoque")}</div><div className="mt-1 text-[10px] text-slate-400">{movement.createdAt}</div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isOut?"bg-rose-50 text-rose-600":movement.quantity>=0?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>{movement.quantity>0?"+":""}{movement.quantity} un.</span></div>})}</div> : <p className="mt-3 text-xs text-slate-400">Nenhuma movimentação registrada.</p>}</div></div>}
        {section==="PDV"&&<div><PageHeading title="Mini PDV" subtitle="Venda capas, carregadores e acessórios com baixa automática no estoque."/><div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]"><div className="glass-card rounded-2xl border border-white/70 p-5 shadow-soft"><h3 className="text-sm font-bold">Adicionar produto à venda</h3><div className="mt-4 flex flex-col gap-3 sm:flex-row"><div className="relative min-w-0 flex-1"><input type="text" value={pdvSearch} onChange={e=>{setPdvSearch(e.target.value);setPdvProduct("");}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();const matches=stock.filter(p=>p.quantity>0&&(`${p.name} ${p.category||""} ${p.id}`).toLowerCase().includes(pdvSearch.trim().toLowerCase()));if(matches.length===1){setPdvProduct(matches[0].id);setPdvSearch(matches[0].name);}}}} placeholder="Digite o nome ou código do produto..." autoComplete="off" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"/>{pdvSearch.trim()&&!pdvProduct&&!showPdvProducts&&<div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">{stock.filter(p=>p.quantity>0&&(`${p.name} ${p.category||""} ${p.id}`).toLowerCase().includes(pdvSearch.trim().toLowerCase())).slice(0,8).map(p=><button key={p.id} type="button" onClick={()=>{setPdvProduct(p.id);setPdvSearch(p.name);}} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-0 hover:bg-violet-50"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-700">{p.name}</span><span className="text-xs text-slate-400">{p.quantity} un. disponíveis</span></span><span className="shrink-0 text-sm font-bold text-slate-700">{money(p.price)}</span></button>)}{!stock.some(p=>p.quantity>0&&(`${p.name} ${p.category||""} ${p.id}`).toLowerCase().includes(pdvSearch.trim().toLowerCase()))&&<p className="px-3 py-3 text-xs text-slate-400">Nenhum produto encontrado com estoque disponível.</p>}</div>}</div><button type="button" onClick={()=>{if(!pdvProduct){setToast("Digite e selecione um produto da lista.");return;}const selected=stock.find(p=>p.id===pdvProduct);if(!selected||selected.quantity<=0){setToast("Produto sem estoque disponível.");return;}setCart(current=>{const found=current.find(x=>x.stockItemId===pdvProduct);if(found&&found.quantity>=selected.quantity){setToast("Quantidade maior que o estoque disponível.");return current;}return found?current.map(x=>x.stockItemId===pdvProduct?{...x,quantity:x.quantity+1}:x):[...current,{stockItemId:pdvProduct,quantity:1}];});setPdvProduct("");setPdvSearch("");}} className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white">Adicionar</button></div><div className="mt-3 flex justify-end"><button type="button" onClick={()=>setShowPdvProducts(value=>!value)} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100">{showPdvProducts?"Ocultar produtos":"Exibir todos os produtos"} ({stock.length})</button></div>{showPdvProducts&&<div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white"><div className="sticky top-0 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">Produtos cadastrados no estoque</div>{stock.length?stock.map(p=><button key={p.id} type="button" disabled={p.quantity<=0} onClick={()=>{setPdvProduct(p.id);setPdvSearch(p.name);setShowPdvProducts(false);}} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-0 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-700">{p.name}</span><span className="text-xs text-slate-400">{p.category||"Sem categoria"} · {p.quantity>0?`${p.quantity} un. disponíveis`:"Sem estoque"}</span></span><span className="shrink-0 text-sm font-bold text-slate-700">{money(p.price)}</span></button>):<p className="px-3 py-5 text-center text-xs text-slate-400">Nenhum produto cadastrado.</p>}</div>}<div className="mt-5 divide-y divide-slate-100">{cart.length?cart.map(line=>{const product=stock.find(p=>p.id===line.stockItemId);return <div key={line.stockItemId} className="flex items-center justify-between gap-3 py-3"><div><div className="text-sm font-semibold">{product?.name||"Produto"}</div><div className="text-xs text-slate-400">{money(product?.price||0)} cada</div></div><div className="flex items-center gap-2"><button type="button" onClick={()=>setCart(current=>current.map(x=>x.stockItemId===line.stockItemId?{...x,quantity:Math.max(1,x.quantity-1)}:x))} className="h-8 w-8 rounded-lg border">−</button><span className="w-6 text-center text-sm font-bold">{line.quantity}</span><button type="button" onClick={()=>setCart(current=>current.map(x=>x.stockItemId===line.stockItemId?{...x,quantity:Math.min(product?.quantity||1,x.quantity+1)}:x))} className="h-8 w-8 rounded-lg border">+</button><button type="button" onClick={()=>setCart(current=>current.filter(x=>x.stockItemId!==line.stockItemId))} className="ml-2 text-xs text-rose-500">Remover</button></div></div>}) : <p className="py-8 text-center text-sm text-slate-400">Nenhum produto adicionado à venda.</p>}</div></div><div className="glass-card h-fit rounded-2xl border border-white/70 p-5 shadow-soft"><h3 className="text-sm font-bold">Fechamento da venda</h3><label className="mt-4 block text-xs font-medium text-slate-500">Forma de pagamento</label><select value={pdvPayment} onChange={e=>setPdvPayment(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option>PIX</option><option>Dinheiro</option><option>Cartão</option></select><div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-sm text-slate-500">Total</span><strong className="text-2xl">{money(cartTotal)}</strong></div><button type="button" disabled={!cart.length||pdvBusy} onClick={finalizeSale} className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{pdvBusy?"Registrando...":"Finalizar venda"}</button><p className="mt-3 text-[11px] leading-relaxed text-slate-400">A venda será registrada no Firestore e o estoque será atualizado em uma única operação segura.</p></div></div><div className="glass-card mt-5 rounded-2xl border border-white/70 p-5 shadow-soft"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold">Histórico de vendas</h3><p className="mt-1 text-[11px] text-slate-400">Consulte as vendas recentes ou acesse o relatório completo.</p></div><button type="button" onClick={()=>setShowPdvHistory(true)} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs font-bold text-violet-700 hover:bg-violet-100">Histórico · últimas 10</button></div></div></div>}
        {section==="Financeiro"&&<div>{(() => {
          const monthOf=(value:any)=>{if(!value)return "";const raw=typeof value==="string"?value:value?.toDate?.()?.toISOString?.()||"";const iso=raw.match(/^(\d{4})-(\d{2})/);if(iso)return `${iso[1]}-${iso[2]}`;const br=raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);return br?`${br[3]}-${br[2]}`:"";};
          const monthlySales=(financeData.sales||[]).filter((sale:any)=>monthOf(sale.createdAtServer||sale.createdAt)===financeMonth);
          const monthlyOrdersAll=(orders||[]).filter(order=>order.status==="Entregue"&&monthOf(order.deliveredAt||order.createdAt)===financeMonth);
          const monthlyOrders=monthlyOrdersAll;
          // Os ganhos originais pertencem ao mês da venda/entrega; o estorno é lançado como ajuste negativo no mês em que ocorreu.
          const monthlyReversals=(financeData.reversals||[]).filter((item:any)=>monthOf(item.createdAtServer||item.createdAt)===financeMonth);
          const monthlyReversedOrders=monthlyReversals.filter((item:any)=>item.type==="os");
          const monthlyReversedSales=monthlyReversals.filter((item:any)=>item.type==="pdv");
          const monthlyExpenses=(financeData.expenses||[]).filter((expense:any)=>expense.status!=="cancelled"&&monthOf(expense.date)===financeMonth);
          const monthlyExpensesAll=(financeData.expenses||[]).filter((expense:any)=>monthOf(expense.date)===financeMonth);
          const calculatedLabor=monthlyOrders.reduce((sum,order:any)=>sum+Number(order.laborProfit??order.laborValue??0),0);
          const calculatedParts=monthlyOrders.reduce((sum,order:any)=>sum+Number(order.partsProfit||0),0);
          const calculatedReversedLabor=monthlyReversedOrders.reduce((sum:number,item:any)=>sum+Number(item.laborReversed||0),0);
          const calculatedReversedParts=monthlyReversedOrders.reduce((sum:number,item:any)=>sum+Number(item.partsProfitReversed||0),0);
          const calculatedRetail=monthlySales.reduce((sum:any,sale:any)=>sum+Number(sale.profit||0),0);
          const calculatedReversedPdv=monthlyReversedSales.reduce((sum:number,item:any)=>sum+Number(item.profitReversed||0),0);
          const calculatedExpenses=monthlyExpenses.reduce((sum:any,item:any)=>sum+Number(item.amount||0),0);
          const titheRecord=financeData.tithe?.[financeMonth]||{};
          const closingRecord=(financeData.closings||[]).find((item:any)=>item.month===financeMonth);
          // Após o fechamento, os totais oficiais vêm do snapshot imutável salvo no Firestore.
          const frozen=closingRecord?.totals;
          const serviceLabor=Number(frozen?.laborGross??calculatedLabor);
          const serviceParts=Number(frozen?.partsGross??calculatedParts);
          const reversedLabor=Number(frozen?.laborReversed??calculatedReversedLabor);
          const reversedParts=Number(frozen?.partsReversed??calculatedReversedParts);
          const retailProfit=Number(frozen?.pdvGross??calculatedRetail);
          const reversedPdvProfit=Number(frozen?.pdvReversed??calculatedReversedPdv);
          const earnings=Number(frozen?.net??(serviceLabor+serviceParts+retailProfit-reversedLabor-reversedParts-reversedPdvProfit));
          const tithe=Number(frozen?.titheAmount??Math.max(0,earnings*0.10));
          const expenses=Number(frozen?.expenses??calculatedExpenses);
          const remaining=Number(frozen?.balance??(earnings-tithe-expenses));
          const closed=Boolean(titheRecord.closed||closingRecord);
          const monthEnded=financeMonth<new Date().toISOString().slice(0,7);
          const reserved=closed;
          const paid=Boolean(titheRecord.paid);
          const expenseGroups=monthlyExpenses.reduce((groups:any,item:any)=>{const key=item.category||"Geral";groups[key]=(groups[key]||0)+Number(item.amount||0);return groups;},{});
          const exportMonthlyReport=async()=>{
            if(!authenticatedUser){setToast("Sessão não encontrada. Entre novamente.");return;}
            try {
              const token=await authenticatedUser.getIdToken();
              const response=await fetch("/api/company/branding",{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
              const brandingResult=await response.json();
              if(!response.ok) throw new Error(brandingResult.error||"Não foi possível carregar os dados da empresa.");
              const company=brandingResult.branding||{};
              const canvas=document.createElement("canvas");
              const width=1240, height=1800;
              canvas.width=width; canvas.height=height;
              const context=canvas.getContext("2d");
              if(!context) throw new Error("Não foi possível preparar o PDF.");
              // Garante fundo branco em toda a página antes de desenhar o cabeçalho compartilhado.
              // O cabeçalho pinta somente sua própria área; o restante do canvas também precisa ser opaco.
              context.fillStyle="#ffffff";
              context.fillRect(0,0,width,height);
              const purple="#e87924",dark="#263244",muted="#64748b",line="#e2e8f0";
              const text=(value:any,x:number,y:number,size=22,color=dark,bold=false)=>{context.fillStyle=color;context.font=`${bold?"700":"400"} ${size}px Arial`;context.textAlign="left";context.fillText(String(value??""),x,y);};
              const right=(value:any,x:number,y:number,size=22,color=dark,bold=false)=>{context.fillStyle=color;context.font=`${bold?"700":"400"} ${size}px Arial`;context.textAlign="right";context.fillText(String(value??""),x,y);};
              const rule=(y:number)=>{context.strokeStyle=line;context.lineWidth=2;context.beginPath();context.moveTo(70,y);context.lineTo(width-70,y);context.stroke();};
              const monthLabel=new Date(`${financeMonth}-02T12:00:00`).toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
              const headerBottom=await drawCompanyPdfHeader(context,company,{width,margin:78,dividerY:260});
              const companyName=company.nomeFantasia||company.razaoSocial||"Assistência técnica";
              let y=headerBottom;
              text("RELATÓRIO FINANCEIRO MENSAL",70,y+55,30,purple,true);
              text(monthLabel.charAt(0).toUpperCase()+monthLabel.slice(1),70,y+88,22,muted);
              right(`Gerado em ${new Date().toLocaleString("pt-BR")}`,width-70,y+88,17,muted);
              y+=135;
              const cards=[["GANHOS CONSIDERADOS",money(earnings)],["DÍZIMO · 10%",money(tithe)],["SALDO FINAL",money(remaining)]];
              const cardW=350;
              cards.forEach((card,index)=>{const x=70+index*(cardW+20);context.fillStyle="#fff7ed";context.fillRect(x,y,cardW,126);context.strokeStyle="#fed7aa";context.lineWidth=2;context.strokeRect(x,y,cardW,126);context.fillStyle="#e87924";context.fillRect(x,y,cardW,7);text(card[0],x+20,y+40,18,muted,true);text(card[1],x+20,y+88,34,dark,true);});
              y+=175;
              text("RESUMO DO MÊS",70,y,23,dark,true);y+=38;
              const summary=[["Mão de obra das OS (bruta)",money(serviceLabor)],["Lucro das peças nas OS (bruto)",money(serviceParts)],["Lucro das vendas no PDV (bruto)",money(retailProfit)],["(-) Estornos de mão de obra",money(reversedLabor)],["(-) Estornos de lucro das peças",money(reversedParts)],["(-) Estornos de lucro do PDV",money(reversedPdvProfit)],["Ganhos líquidos considerados",money(earnings)],["(-) Dízimo de 10%",money(tithe)],["(-) Despesas operacionais",money(expenses)],["Saldo após dízimo e despesas",money(remaining)]];
              summary.forEach((item,index)=>{text(item[0],80,y,19,index===5?dark:muted,index===5);right(item[1],width-80,y,19,index===5?"#059669":dark,true);y+=34;});
              y+=12;rule(y);y+=36;
              const section=(title:string,headers:string[],rows:string[][],widths:number[])=>{
                text(title,70,y,22,"#e87924",true);y+=30;
                context.fillStyle="#fff7ed";context.fillRect(70,y,width-140,34);
                let x=82;headers.forEach((h,i)=>{text(h,x,y+23,14,"#c65d13",true);x+=widths[i];});y+=42;
                if(!rows.length){text("Nenhum registro neste mês.",82,y+3,16,muted);y+=32;return;}
                rows.forEach(row=>{let xx=82;row.forEach((cell,i)=>{text(cell,xx,y+3,14,dark);xx+=widths[i];});y+=29;});
                y+=18;
              };
              section("ORDENS DE SERVIÇO ENTREGUES",["OS","DATA","CLIENTE","MÃO DE OBRA","LUCRO PEÇAS"],monthlyOrders.map((item:any)=>[`OS ${item.id}`,String(item.deliveredAt||item.createdAt||"").slice(0,16),String(item.customer||"").slice(0,24),money(Number(item.laborProfit??item.laborValue??0)),money(Number(item.partsProfit||0))]),[105,170,290,210,200]);
              section("ESTORNOS DE ORDENS DE SERVIÇO",["OS","DATA","MOTIVO","RESPONSÁVEL","MÃO DE OBRA","LUCRO PEÇAS"],monthlyReversedOrders.map((item:any)=>[String(item.recordId),new Date(item.createdAtServer||item.createdAt).toLocaleString("pt-BR"),String(item.reason||"").slice(0,24),String(item.createdByName||item.createdByEmail||item.createdBy||"Não informado").slice(0,24),money(Number(item.laborReversed||0)),money(Number(item.partsProfitReversed||0))]),[100,170,190,220,150,150]);
              section("ESTORNOS DE VENDAS DO PDV",["VENDA","DATA","MOTIVO","RESPONSÁVEL","LUCRO REVERTIDO"],monthlyReversedSales.map((item:any)=>[String(item.recordId),new Date(item.createdAtServer||item.createdAt).toLocaleString("pt-BR"),String(item.reason||"").slice(0,24),String(item.createdByName||item.createdByEmail||item.createdBy||"Não informado").slice(0,24),money(Number(item.profitReversed||0))]),[150,190,220,240,180]);
              section("VENDAS DO PDV",["DATA","PAGAMENTO","TOTAL","LUCRO"],monthlySales.map((item:any)=>[String(item.createdAtServer||item.createdAt||"").slice(0,16),String(item.paymentMethod||""),money(Number(item.total||0)),money(Number(item.profit||0))]),[260,260,220,220]);
              section("DESPESAS OPERACIONAIS",["DESCRIÇÃO","DATA","CATEGORIA","VALOR"],monthlyExpenses.map((item:any)=>[String(item.description||"").slice(0,28),String(item.date||""),String(item.category||"Geral"),money(Number(item.amount||0))]),[330,180,260,190]);
              const titheStatus=paid?`Pagamento registrado em ${titheRecord.paidAt?new Date(titheRecord.paidAt).toLocaleDateString("pt-BR"):""}. Valor: ${money(Number(titheRecord.paidAmount||tithe))}`:reserved?`Dízimo separado em ${titheRecord.reservedAt?new Date(titheRecord.reservedAt).toLocaleDateString("pt-BR"):""}, aguardando pagamento.`:"Dízimo ainda não separado.";
              text(`DÍZIMO: ${titheStatus}`,70,Math.min(y+10,height-75),15,muted);
              text(`Documento financeiro · ${companyName}`,70,height-35,13,muted);
              const jpeg=canvas.toDataURL("image/jpeg",0.92).split(",")[1];
              const binary=atob(jpeg);const imageBytes=new Uint8Array(binary.length);
              for(let i=0;i<binary.length;i++) imageBytes[i]=binary.charCodeAt(i);
              const encoder=new TextEncoder();const chunks:Uint8Array[]=[];let length=0;const push=(chunk:Uint8Array)=>{chunks.push(chunk);length+=chunk.length;};const offsets:number[]=[0];const add=(value:string)=>push(encoder.encode(value));
              add("%PDF-1.4\n");
              const object=(id:number,body:string|Uint8Array)=>{offsets[id]=length;add(`${id} 0 obj\n`);if(typeof body==="string")add(body);else push(body);add("\nendobj\n");};
              object(1,"<< /Type /Catalog /Pages 2 0 R >>");
              object(2,"<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
              object(3,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
              offsets[4]=length;add("4 0 obj\n");add(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);push(imageBytes);add("\nendstream\nendobj\n");
              const content="q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ";object(5,`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
              const xref=length;add("xref\n0 6\n0000000000 65535 f \n");for(let i=1;i<=5;i++)add(`${String(offsets[i]).padStart(10,"0")} 00000 n \n`);add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
              const pdfBuffer=new ArrayBuffer(length);const pdfBytes=new Uint8Array(pdfBuffer);let offset=0;for(const chunk of chunks){pdfBytes.set(chunk,offset);offset+=chunk.length;}
              const blob=new Blob([pdfBuffer],{type:"application/pdf"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=`relatorio-financeiro-${financeMonth}.pdf`;document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
              setToast("Relatório PDF exportado com os dados da empresa.");
            } catch(error) { setToast(error instanceof Error?error.message:"Não foi possível exportar o relatório PDF."); }
          };
          return <>
            <PageHeading title="Fluxo de caixa" subtitle="Ganhos, dízimo e despesas organizados por mês." action={()=>setShowExpense(true)} actionText="Lançar despesa"/>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><label className="text-xs font-semibold text-slate-500">Mês de referência <input type="month" value={financeMonth} onChange={e=>setFinanceMonth(e.target.value)} className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"/></label><div className="flex items-center gap-3"><span className="text-[10px] text-slate-400">Dízimo calculado antes das despesas</span><button type="button" onClick={exportMonthlyReport} className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-sm">Exportar relatório PDF</button></div></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <FinanceCard title="Mão de obra das OS" value={money(serviceLabor)} note="OS entregues no mês" icon={<Wrench/>}/>
              <FinanceCard title="Lucro das peças nas OS" value={money(serviceParts)} note="Preço cobrado menos custo registrado na baixa" icon={<Package/>}/>
              <FinanceCard title="Lucro das vendas no PDV" value={money(retailProfit)} note="Vendas com custo histórico" icon={<CircleDollarSign/>}/>
              <FinanceCard title="Ganhos considerados" value={money(earnings)} note="Base de cálculo do dízimo" icon={<ArrowUpRight/>}/>
              <FinanceCard title="Dízimo · 10%" value={money(tithe)} note={paid?"Marcado como separado/pago":"Valor a separar"} icon={<Wallet/>}/>
              <FinanceCard title="Despesas operacionais" value={money(expenses)} note="Lançamentos do mês" icon={<ArrowDownRight/>}/>
            </div>
            {(monthlyReversedOrders.length>0||monthlyReversedSales.length>0)&&<div className="glass-card mt-5 rounded-2xl border border-rose-100 p-5 shadow-soft"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold text-slate-800">Estornos realizados no mês</h3><p className="mt-1 text-[11px] text-slate-400">Registros agrupados pela data efetiva do estorno, com motivo e responsável.</p></div><span className="rounded-full bg-rose-50 px-3 py-1 text-[10px] font-bold text-rose-600">{monthlyReversals.length} estorno(s)</span></div>
              {monthlyReversedOrders.length>0&&<><h4 className="mt-4 text-xs font-bold text-slate-700">Ordens de serviço</h4><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[780px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wide text-slate-400"><tr><th className="py-2">Ordem</th><th>Data do estorno</th><th>Motivo</th><th>Responsável</th><th>Mão de obra</th><th>Lucro peças</th></tr></thead><tbody>{monthlyReversedOrders.map((item:any)=><tr key={item.id} className="border-t border-rose-100"><td className="py-3 font-bold">{item.recordId}</td><td>{new Date(item.createdAtServer||item.createdAt).toLocaleString("pt-BR")}</td><td>{item.reason||"Não informado"}</td><td>{item.createdByName||item.createdByEmail||item.createdBy||"Não informado"}</td><td className="text-rose-600">− {money(Number(item.laborReversed||0))}</td><td className="text-rose-600">− {money(Number(item.partsProfitReversed||0))}</td></tr>)}</tbody></table></div></>}
              {monthlyReversedSales.length>0&&<><h4 className="mt-5 text-xs font-bold text-slate-700">Vendas do PDV</h4><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wide text-slate-400"><tr><th className="py-2">Venda</th><th>Data do estorno</th><th>Motivo</th><th>Responsável</th><th>Lucro revertido</th></tr></thead><tbody>{monthlyReversedSales.map((item:any)=><tr key={item.id} className="border-t border-rose-100"><td className="py-3 font-bold">{item.recordId}</td><td>{new Date(item.createdAtServer||item.createdAt).toLocaleString("pt-BR")}</td><td>{item.reason||"Não informado"}</td><td>{item.createdByName||item.createdByEmail||item.createdBy||"Não informado"}</td><td className="text-rose-600">− {money(Number(item.profitReversed||0))}</td></tr>)}</tbody></table></div></>}
              <div className="mt-4 flex flex-wrap justify-end gap-5 border-t border-rose-100 pt-3 text-xs"><span>Mão de obra revertida: <b className="text-rose-600">{money(reversedLabor)}</b></span><span>Lucro das peças revertido: <b className="text-rose-600">{money(reversedParts)}</b></span><span>Lucro PDV revertido: <b className="text-rose-600">{money(reversedPdvProfit)}</b></span><span>Total revertido: <b className="text-rose-600">{money(reversedLabor+reversedParts+reversedPdvProfit)}</b></span></div></div>}
            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_.8fr]">
              <div className="glass-card rounded-2xl border border-white/70 p-5 shadow-soft"><h3 className="font-bold">Resumo do mês</h3><div className="mt-4 space-y-3 text-xs"><div className="flex justify-between"><span>Ganhos brutos da assistência</span><b>{money(serviceLabor+serviceParts+retailProfit)}</b></div>{(reversedLabor+reversedParts+reversedPdvProfit)>0&&<><div className="flex justify-between text-rose-600"><span>(−) Estornos de OS</span><b>{money(reversedLabor+reversedParts)}</b></div><div className="flex justify-between text-rose-600"><span>(−) Estornos do PDV</span><b>{money(reversedPdvProfit)}</b></div></>}<div className="flex justify-between"><span>Ganhos líquidos considerados</span><b>{money(earnings)}</b></div><div className="flex justify-between text-emerald-700"><span>(−) Dízimo de 10%</span><b>{money(tithe)}</b></div><div className="flex justify-between text-rose-600"><span>(−) Despesas</span><b>{money(expenses)}</b></div><div className="border-t pt-3 flex justify-between text-sm"><b>Saldo após dízimo e despesas</b><strong className={remaining>=0?"text-emerald-700":"text-rose-600"}>{money(remaining)}</strong></div></div><div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" onClick={()=>closeFinancialMonth(financeMonth,tithe)} disabled={closed||!monthEnded} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs font-bold text-violet-700 disabled:opacity-50">{closed?"Competência fechada":monthEnded?"Fechar mês e apurar dízimo":"Disponível após o fim do mês"}</button><button type="button" onClick={()=>updateTitheStatus(financeMonth,"paid",Number(titheRecord.dueAmount??tithe))} disabled={!closed||paid||Number(titheRecord.dueAmount??tithe)<=0} className="rounded-xl bg-violet-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{paid?"Pagamento registrado":"Registrar pagamento do dízimo"}</button></div><div className="mt-3 text-[10px] text-slate-400">{closed?`Competência fechada em ${titheRecord.closedAt?new Date(titheRecord.closedAt).toLocaleDateString("pt-BR"):"data registrada"}. Dízimo pendente: ${money(Number(titheRecord.dueAmount??tithe))}.` :monthEnded?"O dízimo será apurado e ficará pendente somente após o fechamento mensal.":"O fechamento estará disponível após o último dia desta competência."}{paid&&titheRecord.paidAt?` Pago em ${new Date(titheRecord.paidAt).toLocaleDateString("pt-BR")} · Valor: ${money(Number(titheRecord.paidAmount||0))}`:""}{titheRecord.previousPayment?.legacy?` Pagamento anterior preservado no histórico: ${money(Number(titheRecord.previousPayment.paidAmount||0))} em ${titheRecord.previousPayment.paidAt?new Date(titheRecord.previousPayment.paidAt).toLocaleDateString("pt-BR"):"data não informada"}.`:""}</div></div>
              <div className="glass-card rounded-2xl border border-white/70 p-5 shadow-soft"><h3 className="font-bold">Despesas do mês</h3>{monthlyExpenses.length>0&&<div className="mt-3 space-y-2 border-b border-slate-100 pb-3">{Object.entries(expenseGroups).map(([category,value]:any)=><div key={category} className="flex justify-between text-xs"><span className="text-slate-500">{category}</span><b>{money(Number(value))}</b></div>)}</div>}{monthlyExpensesAll.length?<div className="mt-3 max-h-72 space-y-3 overflow-y-auto hide-scrollbar">{monthlyExpensesAll.map((item:any)=>{const cancelled=item.status==="cancelled";return <div key={item.id} className={`flex items-start justify-between gap-3 border-b border-slate-100 pb-3 text-xs ${cancelled?"opacity-60":""}`}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className={cancelled?"line-through":""}>{item.description}</b>{cancelled&&<span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-600">Cancelada</span>}</div><div className="text-[10px] text-slate-400">{item.category} · {item.date}</div>{cancelled&&<div className="mt-1 text-[10px] text-rose-500">{item.cancellationReason||"Registro cancelado"}</div>}</div><div className="flex shrink-0 items-center gap-1"><strong className={`mr-1 ${cancelled?"line-through text-slate-400":""}`}>{money(Number(item.amount))}</strong><button type="button" title="Ver histórico" onClick={()=>setViewingExpenseHistory(item)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><FileText size={14}/></button>{!cancelled&&<><button type="button" title="Editar despesa" disabled={financeBusy} onClick={()=>{setEditingExpense(item);setExpenseForm({description:item.description||"",category:item.category||"Operacional",amount:String(item.amount??""),date:item.date||new Date().toISOString().slice(0,10)});}} className="rounded-lg p-1.5 text-slate-500 hover:bg-violet-50 hover:text-violet-600"><Pencil size={14}/></button><button type="button" title="Cancelar despesa" disabled={financeBusy} onClick={()=>cancelExpense(item)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 size={14}/></button></>}</div></div>})}</div>:<p className="mt-3 text-xs text-slate-400">Nenhuma despesa lançada neste mês.</p>}</div>
            </div>
          </>;
        })()}</div>}
        {section==="Relatórios"&&<div>
          <PageHeading title="Relatórios" subtitle="Consulte o desempenho da assistência com filtros por período e exportação dos resultados."/>
          {(() => {
            const dateKey=(value:any)=>{
              if(!value)return "";
              if(typeof value==="string"){
                const iso=value.match(/^(\d{4})-(\d{2})-(\d{2})/); if(iso)return `${iso[1]}-${iso[2]}-${iso[3]}`;
                const br=value.match(/(\d{2})\/(\d{2})\/(\d{4})/); if(br)return `${br[3]}-${br[2]}-${br[1]}`;
              }
              const date=value?.toDate?.() || (value instanceof Date?value:null);
              return date instanceof Date&&!Number.isNaN(date.getTime())?date.toISOString().slice(0,10):"";
            };
            const inRange=(value:any)=>{const key=dateKey(value);return !!key&&(!reportStart||key>=reportStart)&&(!reportEnd||key<=reportEnd);};
            const sales=(financeData?.sales||[]).filter((sale:any)=>sale.status!=="estornada"&&!sale.refundedAt&&inRange(sale.createdAtServer||sale.createdAt));
            const matchingSales=sales.filter((sale:any)=>reportTab!=="PDV"||reportPayment==="Todos"||sale.paymentMethod===reportPayment).filter((sale:any)=>reportTab!=="PDV"||!reportSaleSearch||String(sale.id||"").toLocaleLowerCase("pt-BR").includes(reportSaleSearch.toLocaleLowerCase("pt-BR"))).filter((sale:any)=>reportTab!=="PDV"||!reportProduct||((sale.items||[]).some((item:any)=>String(item.name||"").toLocaleLowerCase("pt-BR").includes(reportProduct.toLocaleLowerCase("pt-BR")))));
            const saleCount=matchingSales.length;
            const selectedLines=matchingSales.flatMap((sale:any)=>(sale.items||[]).filter((item:any)=>!reportProduct||String(item.name||"").toLocaleLowerCase("pt-BR").includes(reportProduct.toLocaleLowerCase("pt-BR"))).map((item:any)=>({...item,saleId:sale.id,saleDate:sale.createdAtServer||sale.createdAt,paymentMethod:sale.paymentMethod})));
            const lineRevenue=(item:any)=>Number(item.lineTotal??(Number(item.unitPrice||0)*Number(item.quantity||0)));
            const lineCost=(item:any)=>Number(item.unitCost||0)*Number(item.quantity||0);
            const lineProfit=(item:any)=>Number(item.lineProfit??(lineRevenue(item)-lineCost(item)));
            const saleRevenue=selectedLines.reduce((sum:number,item:any)=>sum+lineRevenue(item),0);
            const saleCost=selectedLines.reduce((sum:number,item:any)=>sum+lineCost(item),0);
            const saleProfit=selectedLines.reduce((sum:number,item:any)=>sum+lineProfit(item),0);
            const units=selectedLines.reduce((sum:number,item:any)=>sum+Number(item.quantity||0),0);
            const averageTicket=saleCount?saleRevenue/saleCount:0;
            const productMap=new Map<string,{quantity:number;revenue:number;cost:number;profit:number}>();
            selectedLines.forEach((item:any)=>{const name=String(item.name||"Produto");const current=productMap.get(name)||{quantity:0,revenue:0,cost:0,profit:0};const qty=Number(item.quantity||0),revenue=lineRevenue(item),cost=lineCost(item);current.quantity+=qty;current.revenue+=revenue;current.cost+=cost;current.profit+=lineProfit(item);productMap.set(name,current);});
            const topProducts=Array.from(productMap.entries()).sort((a,b)=>b[1].quantity-a[1].quantity);
            const paymentGroups=["Dinheiro","PIX","Cartão"].map(method=>({method,total:selectedLines.filter((item:any)=>item.paymentMethod===method).reduce((sum:number,item:any)=>sum+lineRevenue(item),0),count:matchingSales.filter((sale:any)=>sale.paymentMethod===method).length}));
            const periodOrders=orders.filter(order=>inRange(order.createdAt));
            const delivered=orders.filter(order=>order.status==="Entregue"&&!order.financialReversedAt&&inRange(order.deliveredAt||order.createdAt));
            const periodCustomers=customers.filter(customer=>inRange(customer.createdAt));
            const periodExpenses=(financeData?.expenses||[]).filter((item:any)=>item.status!=="cancelled"&&inRange(item.date||item.createdAtServer));
            const periodMovements=(stockMovements||[]).filter((item:any)=>inRange(item.createdAtServer||item.createdAt));
            const exportPdf=async()=>{
              try {
                const token=await authenticatedUser?.getIdToken();
                const response=await fetch("/api/company/branding",{headers:token?{Authorization:`Bearer ${token}`}:{},cache:"no-store"});
                const brandingResult=await response.json();
                if(!response.ok) throw new Error(brandingResult.error||"Não foi possível carregar os dados da empresa.");
                const company=brandingResult.branding||{};
                let headers:string[]=[]; let rows:string[][]=[]; let title="";
                if(reportTab==="PDV"){
                  title="RELATÓRIO DE VENDAS DO PDV";
                  headers=["DATA","VENDA","PAGAMENTO","PRODUTOS","QTD.","FATURAMENTO","CUSTO","LUCRO"];
                  rows=matchingSales.map((sale:any)=>{const lines=(sale.items||[]).filter((item:any)=>!reportProduct||String(item.name||"").toLocaleLowerCase("pt-BR").includes(reportProduct.toLocaleLowerCase("pt-BR")));return [dateKey(sale.createdAtServer||sale.createdAt).split("-").reverse().join("/"),String(sale.id||"").slice(-8),String(sale.paymentMethod||""),lines.map((item:any)=>item.name).join(", "),String(lines.reduce((n:number,item:any)=>n+Number(item.quantity||0),0)),money(lines.reduce((n:number,item:any)=>n+lineRevenue(item),0)),money(lines.reduce((n:number,item:any)=>n+lineCost(item),0)),money(lines.reduce((n:number,item:any)=>n+lineProfit(item),0))];});
                } else if(reportTab==="Ordens"){
                  title="RELATÓRIO DE ORDENS DE SERVIÇO";headers=["DATA","OS","CLIENTE","APARELHO","STATUS","VALOR"];
                  rows=periodOrders.map((o:any)=>[dateKey(o.createdAt).split("-").reverse().join("/"),String(o.id||""),String(o.customer||""),String(o.device||""),String(o.status||""),money(Number(o.value||0))]);
                } else if(reportTab==="Clientes"){
                  title="RELATÓRIO DE CLIENTES";headers=["CADASTRO","CLIENTE","TELEFONE","E-MAIL","ORDENS NO PERÍODO"];
                  rows=periodCustomers.map((c:any)=>[dateKey(c.createdAt).split("-").reverse().join("/"),String(c.name||""),String(c.phone||""),String(c.email||""),String(periodOrders.filter((o:any)=>o.customerId===c.id).length)]);
                } else if(reportTab==="Estoque"){
                  title="RELATÓRIO DE MOVIMENTAÇÕES DE ESTOQUE";headers=["DATA","MOVIMENTO","PRODUTO","QUANTIDADE","OS / VENDA"];
                  rows=periodMovements.map((m:any)=>[dateKey(m.createdAtServer||m.createdAt).split("-").reverse().join("/"),String(m.type||""),String(m.stockItemName||""),String(m.quantity||0),String(m.orderId||m.saleId||"")]);
                } else {
                  title="RELATÓRIO FINANCEIRO";headers=["DATA","DESCRIÇÃO","CATEGORIA","VALOR"];
                  rows=periodExpenses.map((e:any)=>[dateKey(e.date||e.createdAtServer).split("-").reverse().join("/"),String(e.description||""),String(e.category||""),money(Number(e.amount||0))]);
                }
                // Cabeçalho oficial compartilhado com o comprovante de entrega.
                const width=1240, margin=78;
                const visibleRows=rows;
                const height=Math.max(1754, 800 + rows.length * 42 + 180);
                const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
                const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Não foi possível preparar o PDF.");
                const dark="#263244",muted="#718096",orange="#ef741f",line="#dfe4ea",soft="#f7f8fa";
                const draw=(value:any,x:number,y:number,size=18,color=dark,bold=false,align:CanvasTextAlign="left")=>{ctx.fillStyle=color;ctx.font=`${bold?"700":"400"} ${size}px Arial`;ctx.textAlign=align;ctx.fillText(String(value??""),x,y);};
                const section=(label:string,y:number)=>{draw(label.toLocaleUpperCase("pt-BR"),margin,y,19,orange,true);ctx.strokeStyle=line;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(margin,y+14);ctx.lineTo(width-margin,y+14);ctx.stroke();};
                await drawCompanyPdfHeader(ctx,company,{width,margin,dividerY:260});
                const companyName=company.nomeFantasia||company.razaoSocial||"Assistência técnica";
                // Título e período
                draw(title, width/2, 316, 30, dark, true, "center");
                draw(`Gerado em ${new Date().toLocaleString("pt-BR")}`,width/2,350,15,muted,false,"center");
                draw(`Período: ${reportStart?reportStart.split("-").reverse().join("/"):"Todo o período"} até ${reportEnd?reportEnd.split("-").reverse().join("/"):"Hoje"}`,margin,400,18,muted);
                // Indicadores resumidos, organizados como blocos de leitura
                let summary:string[]=[];
                if(reportTab==="PDV") summary=[`Faturamento: ${money(saleRevenue)}`,`Lucro: ${money(saleProfit)}`,`Custo: ${money(saleCost)}`,`Vendas: ${saleCount}`,`Unidades: ${units}`,`Ticket médio: ${money(averageTicket)}`];
                else if(reportTab==="Ordens") summary=[`Ordens: ${periodOrders.length}`,`Entregues: ${delivered.length}`,`Em andamento: ${periodOrders.filter((o:any)=>!['Entregue','Cancelado'].includes(o.status)).length}`,`Valor: ${money(periodOrders.reduce((sum:number,o:any)=>sum+Number(o.value||0),0))}`];
                else if(reportTab==="Clientes") summary=[`Novos clientes: ${periodCustomers.length}`,`Atendimentos: ${periodOrders.length}`];
                else if(reportTab==="Estoque") summary=[`Itens cadastrados: ${stock.length}`,`Estoque baixo: ${stock.filter((item:any)=>item.quantity<=item.min).length}`,`Movimentações: ${periodMovements.length}`];
                else summary=[`Lucro do PDV: ${money(saleProfit)}`,`Despesas: ${money(periodExpenses.reduce((sum:number,item:any)=>sum+Number(item.amount||0),0))}`,`Ordens entregues: ${delivered.length}`];
                let sy=454;const summaryCols=3, boxW=(width-margin*2-24*(summaryCols-1))/summaryCols;
                summary.forEach((item,i)=>{const col=i%summaryCols,row=Math.floor(i/summaryCols),x=margin+col*(boxW+24),y=sy+row*68;ctx.fillStyle=soft;ctx.fillRect(x,y,boxW,52);draw(item,x+16,y+33,17,dark,true);});
                const summaryRows=Math.ceil(summary.length/summaryCols);let tableY=sy+summaryRows*68+34;
                section("DETALHAMENTO DO RELATÓRIO",tableY);tableY+=48;
                // Tabela com cabeçalho discreto e linhas alternadas
                const tableWidth=width-margin*2;
                const rowHeight=42;
                const rowFontSize=13;
                const rawWidths=reportTab==="PDV"?[105,95,105,250,65,145,125,125]:reportTab==="Ordens"?[110,95,190,220,150,115]:reportTab==="Clientes"?[110,190,150,230,160]:reportTab==="Estoque"?[110,150,270,130,220]:[110,330,210,150];
                const totalRaw=rawWidths.reduce((a,b)=>a+b,0);const colWidths=rawWidths.map(v=>v*tableWidth/totalRaw);
                ctx.fillStyle="#fff4eb";ctx.fillRect(margin,tableY,tableWidth,42);
                let x=margin+12;headers.forEach((h,i)=>{draw(h,x,tableY+27,13,orange,true);x+=colWidths[i];});tableY+=42;
                if(!rows.length){draw("Nenhum registro encontrado com os filtros selecionados.",margin+12,tableY+30,17,muted);tableY+=48;}
                visibleRows.forEach((row,index)=>{if(index%2===1){ctx.fillStyle="#fafbfc";ctx.fillRect(margin,tableY,tableWidth,rowHeight);}let xx=margin+12;row.forEach((cell,i)=>{const maxChars=Math.max(7,Math.floor((colWidths[i]-20)/8));const textValue=String(cell??"");draw(textValue.length>maxChars?textValue.slice(0,maxChars-1)+"…":textValue,xx,tableY+Math.min(26,rowHeight-7),rowFontSize,dark);xx+=colWidths[i];});tableY+=rowHeight;});
                draw(`Total de registros: ${rows.length}`,margin,Math.min(tableY+32,height-110),15,muted);
                // Rodapé padronizado
                ctx.strokeStyle=line;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(margin,height-92);ctx.lineTo(width-margin,height-92);ctx.stroke();
                draw(`Documento gerado para ${companyName}`,width/2,height-48,13,muted,false,"center");
                // Divide o relatório em páginas A4, repetindo cabeçalho comercial e cabeçalho da tabela.
                const pageHeight=1754, repeatHeaderHeight=390, tableHeaderHeight=42, footerHeight=110;
                const tableHeaderY=tableY-48;
                const firstPageCapacity=pageHeight;
                const nextPageCapacity=pageHeight-repeatHeaderHeight-tableHeaderHeight-footerHeight;
                const bodyStart=tableY+42;
                const remainingBody=Math.max(0,height-bodyStart-footerHeight);
                const pageCount=Math.max(1,1+Math.ceil(Math.max(0,remainingBody-(firstPageCapacity-bodyStart-footerHeight))/nextPageCapacity));
                const pageCanvases:HTMLCanvasElement[]=[];
                for(let pageIndex=0;pageIndex<pageCount;pageIndex++){
                  const pageCanvas=document.createElement("canvas");pageCanvas.width=width;pageCanvas.height=pageHeight;
                  const pageCtx=pageCanvas.getContext("2d");if(!pageCtx)throw new Error("Não foi possível montar as páginas do PDF.");
                  pageCtx.fillStyle="#ffffff";pageCtx.fillRect(0,0,width,pageHeight);
                  if(pageIndex===0){pageCtx.drawImage(canvas,0,0,width,pageHeight,0,0,width,pageHeight);}
                  else{
                    pageCtx.drawImage(canvas,0,0,width,repeatHeaderHeight,0,0,width,repeatHeaderHeight);
                    pageCtx.drawImage(canvas,0,tableHeaderY,width,tableHeaderHeight,0,repeatHeaderHeight,width,tableHeaderHeight);
                    const sourceY=bodyStart+(pageIndex-1)*nextPageCapacity;
                    const available=Math.max(0,Math.min(nextPageCapacity,height-footerHeight-sourceY));
                    if(available>0)pageCtx.drawImage(canvas,0,sourceY,width,available,0,repeatHeaderHeight+tableHeaderHeight,width,available);
                  }
                  pageCtx.strokeStyle=line;pageCtx.lineWidth=2;pageCtx.beginPath();pageCtx.moveTo(margin,pageHeight-92);pageCtx.lineTo(width-margin,pageHeight-92);pageCtx.stroke();
                  pageCtx.fillStyle=muted;pageCtx.font="13px Arial";pageCtx.textAlign="right";pageCtx.fillText(`Página ${pageIndex+1} de ${pageCount}`,width-margin,pageHeight-48);
                  pageCanvases.push(pageCanvas);
                }
                const encoder=new TextEncoder();const chunks:Uint8Array[]=[];let length=0;const push=(chunk:Uint8Array)=>{chunks.push(chunk);length+=chunk.length;};const add=(value:string)=>push(encoder.encode(value));
                const offsets:number[]=[0];let nextObject=1;const pageRefs:number[]=[];const imageRefs:number[]=[];const contentRefs:number[]=[];
                const imageData=pageCanvases.map(pageCanvas=>{const jpeg=pageCanvas.toDataURL("image/jpeg",0.92).split(",")[1];const binary=atob(jpeg);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;});
                add("%PDF-1.4\n");
                const object=(id:number,body:string|Uint8Array)=>{offsets[id]=length;add(`${id} 0 obj\n`);if(typeof body==="string")add(body);else push(body);add("\nendobj\n");};
                const catalogId=nextObject++,pagesId=nextObject++;
                for(let i=0;i<pageCanvases.length;i++){pageRefs.push(nextObject++);imageRefs.push(nextObject++);contentRefs.push(nextObject++);}
                object(catalogId,`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
                object(pagesId,`<< /Type /Pages /Kids [${pageRefs.map(id=>`${id} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`);
                for(let i=0;i<pageCanvases.length;i++){
                  object(pageRefs[i],`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im${i} ${imageRefs[i]} 0 R >> >> /Contents ${contentRefs[i]} 0 R >>`);
                  offsets[imageRefs[i]]=length;add(`${imageRefs[i]} 0 obj\n`);add(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${pageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageData[i].length} >>\nstream\n`);push(imageData[i]);add("\nendstream\nendobj\n");
                  const content=`q\n595 0 0 842 0 0 cm\n/Im${i} Do\nQ`;object(contentRefs[i],`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
                }
                const xref=length;add(`xref\n0 ${nextObject}\n0000000000 65535 f \n`);for(let i=1;i<nextObject;i++)add(`${String(offsets[i]).padStart(10,"0")} 00000 n \n`);add(`trailer\n<< /Size ${nextObject} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`);
                const pdfBuffer=new ArrayBuffer(length);const pdfBytes=new Uint8Array(pdfBuffer);let offset=0;for(const chunk of chunks){pdfBytes.set(chunk,offset);offset+=chunk.length;}
                const blob=new Blob([pdfBuffer],{type:"application/pdf"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=`relatorio-${reportTab.toLocaleLowerCase("pt-BR")}-${reportStart||"inicio"}-${reportEnd||"hoje"}.pdf`;document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);setToast("Relatório PDF exportado com os dados da empresa.");
              } catch(error) {setToast(error instanceof Error?error.message:"Não foi possível exportar o relatório PDF.");}
            };
            const quickPeriod=(kind:string)=>{const today=new Date();const end=today.toISOString().slice(0,10);const start=kind==="hoje"?end:kind==="30dias"?new Date(today.getTime()-29*86400000).toISOString().slice(0,10):new Date(today.getFullYear(),today.getMonth(),1).toISOString().slice(0,10);setReportStart(start);setReportEnd(end);};
            const tabs=["PDV","Ordens","Clientes","Estoque","Financeiro"];
            return <>
              <div className="mb-4 flex flex-wrap gap-2">{tabs.map(tab=><button key={tab} type="button" onClick={()=>setReportTab(tab)} className={`rounded-xl px-4 py-2.5 text-xs font-bold transition ${reportTab===tab?"bg-violet-600 text-white shadow-sm":"border border-white/80 bg-white/60 text-slate-600 hover:bg-white"}`}>{tab}</button>)}</div>
              <div className="glass-card mb-5 rounded-2xl border border-white/70 p-4 shadow-soft">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-bold"><Filter size={16}/> Filtros do relatório</div><div className="flex flex-wrap gap-2"><button onClick={()=>quickPeriod("hoje")} className="rounded-lg border px-3 py-2 text-[11px]">Hoje</button><button onClick={()=>quickPeriod("mes")} className="rounded-lg border px-3 py-2 text-[11px]">Este mês</button><button onClick={()=>quickPeriod("30dias")} className="rounded-lg border px-3 py-2 text-[11px]">Últimos 30 dias</button><button onClick={()=>{setReportStart("");setReportEnd("");}} className="rounded-lg border px-3 py-2 text-[11px]">Todo o período</button></div></div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-[11px] font-semibold text-slate-500">Data inicial<input type="date" value={reportStart} onChange={e=>setReportStart(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700"/></label><label className="text-[11px] font-semibold text-slate-500">Data final<input type="date" value={reportEnd} onChange={e=>setReportEnd(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700"/></label>
                  {reportTab==="PDV"&&<><label className="text-[11px] font-semibold text-slate-500">Forma de pagamento<select value={reportPayment} onChange={e=>setReportPayment(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"><option>Todos</option><option>Dinheiro</option><option>PIX</option><option>Cartão</option></select></label><label className="text-[11px] font-semibold text-slate-500">Produto<input value={reportProduct} onChange={e=>setReportProduct(e.target.value)} placeholder="Buscar produto..." className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"/></label><label className="text-[11px] font-semibold text-slate-500">Código da venda<input value={reportSaleSearch} onChange={e=>setReportSaleSearch(e.target.value)} placeholder="Localizar venda..." className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"/></label></>}
                </div>
                <div className="mt-3 flex justify-end"><button type="button" onClick={exportPdf} className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white"><Download size={14}/> Exportar PDF</button></div>
              </div>
              {reportTab==="PDV"&&<>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><FinanceCard title="Faturamento" value={money(saleRevenue)} note="Total das vendas filtradas" icon={<CircleDollarSign/>}/><FinanceCard title="Lucro" value={money(saleProfit)} note="Faturamento menos custo" icon={<ArrowUpRight/>}/><FinanceCard title="Custo dos produtos" value={money(saleCost)} note="Custo histórico das vendas" icon={<Package/>}/><FinanceCard title="Vendas realizadas" value={String(saleCount)} note={`${units} unidades vendidas`} icon={<ClipboardList/>}/><FinanceCard title="Ticket médio" value={money(averageTicket)} note="Faturamento por venda" icon={<Wallet/>}/></div>
                <div className="mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><div className="glass-card rounded-2xl border border-white/70 p-5 shadow-soft"><h3 className="font-bold">Vendas por pagamento</h3><div className="mt-4 space-y-3">{paymentGroups.map(group=><div key={group.method} className="flex items-center justify-between border-b border-slate-100 pb-3 text-xs"><div><b>{group.method}</b><div className="text-[10px] text-slate-400">{group.count} venda(s)</div></div><strong>{money(group.total)}</strong></div>)}</div></div><div className="glass-card rounded-2xl border border-white/70 p-5 shadow-soft"><h3 className="font-bold">Produtos vendidos no período</h3>{topProducts.length?<div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-400"><tr><th className="py-2">Produto</th><th className="py-2">Qtd.</th><th className="py-2">Faturamento</th><th className="py-2">Lucro</th></tr></thead><tbody>{topProducts.map(([name,data])=><tr key={name} className="border-t border-slate-100"><td className="py-3 font-semibold">{name}</td><td>{data.quantity}</td><td>{money(data.revenue)}</td><td className="font-bold text-emerald-700">{money(data.profit)}</td></tr>)}</tbody></table></div>:<p className="mt-4 text-xs text-slate-400">Nenhuma venda encontrada com esses filtros.</p>}</div></div>
                <div className="glass-card mt-5 rounded-2xl border border-white/70 p-5 shadow-soft"><h3 className="font-bold">Histórico detalhado de vendas</h3>{matchingSales.length?<div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="text-slate-400"><tr><th className="py-3">Data</th><th>Venda / produtos</th><th>Pagamento</th><th>Qtd.</th><th>Faturamento</th><th>Custo</th><th>Lucro</th></tr></thead><tbody>{matchingSales.map((sale:any)=><tr key={sale.id} className="border-t border-slate-100"><td className="py-3">{dateKey(sale.createdAtServer||sale.createdAt).split("-").reverse().join("/")}</td><td><b>{String(sale.id||"").slice(-7)}</b><div className="mt-1 text-[10px] text-slate-400">{(sale.items||[]).filter((item:any)=>!reportProduct||String(item.name||"").toLocaleLowerCase("pt-BR").includes(reportProduct.toLocaleLowerCase("pt-BR"))).map((item:any)=>`${item.quantity}x ${item.name}`).join(", ")}</div></td><td>{sale.paymentMethod}</td><td>{(sale.items||[]).filter((item:any)=>!reportProduct||String(item.name||"").toLocaleLowerCase("pt-BR").includes(reportProduct.toLocaleLowerCase("pt-BR"))).reduce((n:number,item:any)=>n+Number(item.quantity||0),0)}</td><td>{money((sale.items||[]).filter((item:any)=>!reportProduct||String(item.name||"").toLocaleLowerCase("pt-BR").includes(reportProduct.toLocaleLowerCase("pt-BR"))).reduce((n:number,item:any)=>n+lineRevenue(item),0))}</td><td>{money((sale.items||[]).filter((item:any)=>!reportProduct||String(item.name||"").toLocaleLowerCase("pt-BR").includes(reportProduct.toLocaleLowerCase("pt-BR"))).reduce((n:number,item:any)=>n+lineCost(item),0))}</td><td className="font-bold text-emerald-700">{money((sale.items||[]).filter((item:any)=>!reportProduct||String(item.name||"").toLocaleLowerCase("pt-BR").includes(reportProduct.toLocaleLowerCase("pt-BR"))).reduce((n:number,item:any)=>n+lineProfit(item),0))}</td></tr>)}</tbody></table></div>:<p className="mt-4 text-xs text-slate-400">Nenhuma venda encontrada neste período.</p>}</div>
              </>}
              {reportTab==="Ordens"&&<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FinanceCard title="Ordens recebidas" value={String(periodOrders.length)} note="Criadas no período" icon={<ClipboardList/>}/><FinanceCard title="Entregues" value={String(delivered.length)} note="Entregues no período" icon={<Check/>}/><FinanceCard title="Em andamento" value={String(periodOrders.filter(o=>!['Entregue','Cancelado'].includes(o.status)).length)} note="Ordens criadas no período" icon={<Wrench/>}/><FinanceCard title="Valor das ordens" value={money(periodOrders.reduce((sum: number,o: any)=>sum+Number(o.value||0),0))} note="Valores cadastrados" icon={<CircleDollarSign/>}/></div>}
              {reportTab==="Clientes"&&<div className="grid gap-3 sm:grid-cols-2"><FinanceCard title="Novos clientes" value={String(periodCustomers.length)} note="Cadastros no período" icon={<Users/>}/><FinanceCard title="Atendimentos" value={String(periodOrders.length)} note="Ordens abertas no período" icon={<ClipboardList/>}/></div>}
              {reportTab==="Estoque"&&<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FinanceCard title="Itens cadastrados" value={String(stock.length)} note="Posição atual" icon={<Package/>}/><FinanceCard title="Valor em estoque" value={money(stock.reduce((sum: number,item: any)=>sum+item.quantity*item.cost,0))} note="Custo atual estimado" icon={<Wallet/>}/><FinanceCard title="Movimentações" value={String(periodMovements.length)} note="No período selecionado" icon={<Activity/>}/><FinanceCard title="Unidades movimentadas" value={String(periodMovements.reduce((sum: number,item: any)=>sum+Number(item.quantity||0),0))} note="Entradas/saídas registradas" icon={<ArrowDownRight/>}/></div>}
              {reportTab==="Financeiro"&&<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FinanceCard title="Lucro do PDV" value={money(saleProfit)} note="Lucro das vendas no período" icon={<CircleDollarSign/>}/><FinanceCard title="Despesas" value={money(periodExpenses.reduce((sum:number,item:any)=>sum+Number(item.amount||0),0))} note="Lançadas no período" icon={<ArrowDownRight/>}/><FinanceCard title="Mão de obra entregue" value={money(delivered.reduce((sum:any,order:any)=>sum+Number(order.laborValue??order.value??0),0))} note="OS entregues no período" icon={<Wrench/>}/><FinanceCard title="Saldo parcial" value={money(saleProfit+delivered.reduce((sum:any,order:any)=>sum+Number(order.laborValue??order.value??0),0)-periodExpenses.reduce((sum:number,item:any)=>sum+Number(item.amount||0),0))} note="Lucros + mão de obra − despesas" icon={<Wallet/>}/></div>}
            </>;
          })()}
        </div>}
        {section==="Configurações"&&<CompanyBrandingSettings user={authenticatedUser} />}
      </div>
    </main>

    {showNewCustomer&&<Modal title="Novo cliente" subtitle="Cadastre os dados de contato." onClose={()=>setShowNewCustomer(false)}><form onSubmit={addCustomer} className="space-y-3"><Field label="Nome completo" value={customerForm.name} onChange={v=>setCustomerForm({...customerForm,name:v})} required/><Field label="Telefone / WhatsApp" value={customerForm.phone} onChange={v=>setCustomerForm({...customerForm,phone:maskPhone(v)})} required/><Field label="E-mail (opcional)" value={customerForm.email} onChange={v=>setCustomerForm({...customerForm,email:v})}/><ModalButtons onCancel={()=>setShowNewCustomer(false)} submit="Salvar cliente"/></form></Modal>}
    {editingCustomer&&<Modal title="Editar cliente" subtitle="Atualize os dados cadastrais." onClose={()=>setEditingCustomer(null)}><form onSubmit={saveCustomer} className="space-y-3"><Field label="Nome completo" value={customerForm.name} onChange={v=>setCustomerForm({...customerForm,name:v})} required/><Field label="Telefone / WhatsApp" value={customerForm.phone} onChange={v=>setCustomerForm({...customerForm,phone:maskPhone(v)})} required/><Field label="E-mail (opcional)" value={customerForm.email} onChange={v=>setCustomerForm({...customerForm,email:v})}/><ModalButtons onCancel={()=>setEditingCustomer(null)} submit="Salvar alterações"/></form></Modal>}
    {selectedCustomer&&<Modal title={`Histórico de ${selectedCustomer.name}`} subtitle="Ordens de serviço e situação das garantias deste cliente." onClose={()=>setSelectedCustomer(null)}>
      {(() => {
        const normalizePhone = (value: string) => value.replace(/\D/g, "");
        const customerOrders = orders.filter(order =>
          order.customerId === selectedCustomer.id ||
          (normalizePhone(order.phone) && normalizePhone(order.phone) === normalizePhone(selectedCustomer.phone)) ||
          order.customer.trim().toLocaleLowerCase("pt-BR") === selectedCustomer.name.trim().toLocaleLowerCase("pt-BR")
        ).sort((a,b) => {
          const parseDate = (value: string) => {
            const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
            return match ? new Date(Number(match[3]), Number(match[2])-1, Number(match[1])).getTime() : 0;
          };
          return parseDate(b.createdAt)-parseDate(a.createdAt);
        });
        const parseWarrantyDate = (value?: string) => {
          if (!value) return null;
          const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
          return match ? new Date(Number(match[3]), Number(match[2])-1, Number(match[1])) : null;
        };
        return <>
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
            <div><div className="text-[10px] text-slate-400">Telefone</div><div className="mt-1 text-xs font-semibold text-slate-700">{selectedCustomer.phone}</div></div>
            <div><div className="text-[10px] text-slate-400">Ordens encontradas</div><div className="mt-1 text-xs font-semibold text-slate-700">{customerOrders.length}</div></div>
          </div>
          {customerOrders.length ? <div className="max-h-[55vh] space-y-3 overflow-y-auto hide-scrollbar">
            {customerOrders.map(order => {
              const warrantyDate = parseWarrantyDate(order.warrantyUntil);
              const warrantyActive = order.status === "Entregue" && warrantyDate !== null && warrantyDate >= new Date(new Date().setHours(0,0,0,0));
              const warrantyExpired = order.status === "Entregue" && warrantyDate !== null && !warrantyActive;
              return <div key={order.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><div className="text-xs font-bold text-brand-600">{order.id}</div><div className="mt-1 text-[10px] text-slate-400">{order.createdAt} · {order.device}</div></div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${order.status==="Entregue"?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600"}`}>{order.status}</span>
                </div>
                <div className="mt-3 text-xs text-slate-700">{order.issue}</div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold">{money(order.value)}</span>
                  {order.warrantyUntil ? <span className={`rounded-full px-2 py-1 font-semibold ${warrantyActive?"bg-emerald-50 text-emerald-700":warrantyExpired?"bg-rose-50 text-rose-700":"bg-slate-100 text-slate-500"}`}>{warrantyActive?`Garantia até ${order.warrantyUntil}`:warrantyExpired?`Garantia vencida em ${order.warrantyUntil}`:`Garantia: ${order.warrantyDays ?? 0} dias`}</span> : <span className="text-slate-400">Garantia não registrada</span>}
                </div>
                {order.serviceCompleted && <p className="mt-2 text-[11px] text-slate-500">Serviço: {order.serviceCompleted}</p>}
              </div>;
            })}
          </div> : <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">Ainda não há ordens de serviço vinculadas a este cliente. As próximas ordens serão associadas automaticamente ao cadastro selecionado.</div>}
          <button type="button" onClick={()=>setSelectedCustomer(null)} className="mt-4 w-full rounded-xl bg-slate-100 py-3 text-xs font-bold text-slate-600">Fechar histórico</button>
        </>;
      })()}
    </Modal>}
    {viewingExpenseHistory&&<Modal title="Histórico da despesa" subtitle={`${viewingExpenseHistory.description} · ${money(Number(viewingExpenseHistory.amount||0))}`} onClose={()=>setViewingExpenseHistory(null)}><div className="space-y-3">{(viewingExpenseHistory.history||[]).length?(viewingExpenseHistory.history||[]).map((entry:any,index:number)=><div key={`${entry.at||index}-${index}`} className="border-l-2 border-violet-200 pl-3"><div className="text-xs font-bold text-slate-700">{entry.summary||({created:"Despesa registrada",updated:"Despesa editada",cancelled:"Despesa cancelada"} as any)[entry.action]||"Alteração"}</div><div className="mt-1 text-[10px] text-slate-400">{entry.at?new Date(entry.at).toLocaleString("pt-BR"):"Data não disponível"}</div>{entry.reason&&<p className="mt-1 text-[11px] text-rose-600">Motivo: {entry.reason}</p>}{entry.before&&entry.after&&<div className="mt-2 rounded-lg bg-slate-50 p-2 text-[10px] text-slate-500">Antes: {entry.before.description} · {money(Number(entry.before.amount||0))}<br/>Depois: {entry.after.description} · {money(Number(entry.after.amount||0))}</div>}</div>):<p className="text-xs text-slate-400">Este lançamento antigo ainda não possui histórico detalhado de alterações.</p>}</div><button type="button" onClick={()=>setViewingExpenseHistory(null)} className="mt-5 w-full rounded-xl bg-slate-100 py-3 text-xs font-bold text-slate-600">Fechar</button></Modal>}
    {editingExpense&&<Modal title="Editar despesa" subtitle="Atualize os dados. A alteração ficará registrada no histórico." onClose={()=>setEditingExpense(null)}><form onSubmit={saveExpenseEdit} className="space-y-3"><Field label="Descrição" value={expenseForm.description} onChange={v=>setExpenseForm({...expenseForm,description:v})} required/><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Categoria</span><select value={expenseForm.category} onChange={e=>setExpenseForm({...expenseForm,category:e.target.value})} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"><option>Operacional</option><option>Aluguel</option><option>Energia</option><option>Internet</option><option>Fornecedor</option><option>Manutenção</option><option>Outros</option></select></label><Field label="Valor (R$)" type="number" value={expenseForm.amount} onChange={v=>setExpenseForm({...expenseForm,amount:v})} required/><Field label="Data" type="date" value={expenseForm.date} onChange={v=>setExpenseForm({...expenseForm,date:v})} required/><ModalButtons onCancel={()=>setEditingExpense(null)} submit={financeBusy?"Salvando...":"Salvar alterações"}/></form></Modal>}
    {showPdvHistory&&<Modal title="Últimas 10 vendas" subtitle="O histórico completo permanece disponível em Relatórios → PDV." onClose={()=>setShowPdvHistory(false)}><div className="divide-y divide-slate-100">{(financeData.sales||[]).slice(0,10).length?(financeData.sales||[]).slice(0,10).map((sale:any)=><div key={sale.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><div className="text-xs font-bold text-slate-700">Venda {sale.id}</div><div className="mt-1 text-[10px] text-slate-400">{sale.createdAtServer||sale.createdAt||"Data não informada"} · {sale.paymentMethod||"Pagamento não informado"}</div><div className="mt-1 text-xs text-slate-600">{(sale.items||[]).map((item:any)=>`${item.name} × ${item.quantity}`).join(" · ")}</div></div><div className="flex items-center gap-3"><div className="text-right"><div className="text-sm font-bold">{money(Number(sale.total||0))}</div><span className={`text-[10px] font-semibold ${sale.status==="estornada"||sale.refundedAt?"text-rose-600":"text-emerald-600"}`}>{sale.status==="estornada"||sale.refundedAt?"Estornada":"Concluída"}</span></div>{sale.status!=="estornada"&&!sale.refundedAt&&<button type="button" onClick={()=>{setShowPdvHistory(false);setReversalTarget({type:"pdv",id:sale.id,label:`Venda ${sale.id}`});}} className="rounded-lg border border-rose-200 px-3 py-2 text-[10px] font-bold text-rose-600 hover:bg-rose-50">Estornar</button>}</div></div>):<p className="py-6 text-center text-xs text-slate-400">Nenhuma venda registrada ainda.</p>}</div><button type="button" onClick={()=>{setShowPdvHistory(false);setSection("Relatórios");setReportTab("PDV");}} className="mt-4 w-full rounded-xl bg-violet-50 py-3 text-xs font-bold text-violet-700 hover:bg-violet-100">Abrir relatório completo de vendas</button></Modal>}
    {showExpense&&<Modal title="Lançar despesa" subtitle="Registre uma despesa da assistência. O dízimo é calculado antes deste desconto." onClose={()=>setShowExpense(false)}><form onSubmit={addExpense} className="space-y-3"><Field label="Descrição" value={expenseForm.description} onChange={v=>setExpenseForm({...expenseForm,description:v})} required/><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Categoria</span><select value={expenseForm.category} onChange={e=>setExpenseForm({...expenseForm,category:e.target.value})} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"><option>Operacional</option><option>Aluguel</option><option>Energia</option><option>Internet</option><option>Fornecedor</option><option>Manutenção</option><option>Outros</option></select></label><Field label="Valor (R$)" type="number" value={expenseForm.amount} onChange={v=>setExpenseForm({...expenseForm,amount:v})} required/><Field label="Data" type="date" value={expenseForm.date} onChange={v=>setExpenseForm({...expenseForm,date:v})} required/><ModalButtons onCancel={()=>setShowExpense(false)} submit={financeBusy?"Salvando...":"Salvar despesa"}/></form></Modal>}
    {editingStock&&<Modal title="Editar produto" subtitle="Atualize os dados comerciais e o estoque mínimo. A quantidade atual é preservada." onClose={()=>setEditingStock(null)}><form onSubmit={saveStockEdit} className="space-y-3"><Field label="Nome do produto" value={stockForm.name} onChange={v=>setStockForm({...stockForm,name:v})} required/><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Categoria</span><select value={stockForm.category} onChange={e=>setStockForm({...stockForm,category:e.target.value})} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="Peças">Peças para conserto</option><option value="Capas">Capas</option><option value="Películas">Películas</option><option value="Carregadores">Carregadores</option><option value="Cabos">Cabos</option><option value="Fones">Fones de ouvido</option><option value="Acessórios">Outros acessórios</option><option value="Outros">Outros produtos</option></select></label><div className="grid grid-cols-2 gap-3"><Field label="Estoque mínimo" type="number" value={stockForm.min} onChange={v=>setStockForm({...stockForm,min:v})}/><Field label="Custo unitário (R$)" type="number" value={stockForm.cost} onChange={v=>setStockForm({...stockForm,cost:v})}/><Field label="Preço de venda (R$)" type="number" value={stockForm.price} onChange={v=>setStockForm({...stockForm,price:v})}/></div><ModalButtons onCancel={()=>setEditingStock(null)} submit={stockBusy?"Salvando...":"Salvar alterações"}/></form></Modal>}
    {stockMovementItem&&<Modal title="Movimentar estoque" subtitle={`${stockMovementItem.name} · Saldo atual: ${stockMovementItem.quantity} unidades`} onClose={()=>setStockMovementItem(null)}><form onSubmit={saveStockMovement} className="space-y-3"><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Tipo de movimentação</span><select value={stockMovementForm.type} onChange={e=>setStockMovementForm({...stockMovementForm,type:e.target.value})} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="entrada">Entrada / reposição</option><option value="ajuste">Ajuste de inventário</option></select></label>{stockMovementForm.type==="entrada"?<Field label="Quantidade recebida" type="number" value={stockMovementForm.quantity} onChange={v=>setStockMovementForm({...stockMovementForm,quantity:v})} required/>:<Field label="Quantidade física contada" type="number" value={stockMovementForm.newQuantity} onChange={v=>setStockMovementForm({...stockMovementForm,newQuantity:v})} required/>}<Field label="Observação (opcional)" value={stockMovementForm.note} onChange={v=>setStockMovementForm({...stockMovementForm,note:v})}/><p className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500">{stockMovementForm.type==="entrada"?`O saldo passará de ${stockMovementItem.quantity} para ${stockMovementItem.quantity+Math.max(0,Number(stockMovementForm.quantity)||0)} unidades.`:`O saldo será atualizado para ${Math.max(0,Number(stockMovementForm.newQuantity)||0)} unidades. A diferença ficará registrada no histórico.`}</p><ModalButtons onCancel={()=>setStockMovementItem(null)} submit={stockBusy?"Registrando...":"Registrar movimentação"}/></form></Modal>}
    {showNewStock&&<Modal title="Adicionar item ao estoque" subtitle="Cadastre uma peça ou acessório." onClose={()=>setShowNewStock(false)}><form onSubmit={addStock} className="space-y-3"><Field label="Nome do produto" value={stockForm.name} onChange={v=>setStockForm({...stockForm,name:v})} required/><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Categoria</span><select value={stockForm.category} onChange={e=>setStockForm({...stockForm,category:e.target.value})} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-violet-100"><option value="Peças">Peças para conserto</option><option value="Capas">Capas</option><option value="Películas">Películas</option><option value="Carregadores">Carregadores</option><option value="Cabos">Cabos</option><option value="Fones">Fones de ouvido</option><option value="Acessórios">Outros acessórios</option><option value="Outros">Outros produtos</option></select></label><div className="grid grid-cols-2 gap-3"><Field label="Quantidade" type="number" value={stockForm.quantity} onChange={v=>setStockForm({...stockForm,quantity:v})}/><Field label="Estoque mínimo" type="number" value={stockForm.min} onChange={v=>setStockForm({...stockForm,min:v})}/><Field label="Custo (R$)" type="number" value={stockForm.cost} onChange={v=>setStockForm({...stockForm,cost:v})}/><Field label="Preço (R$)" type="number" value={stockForm.price} onChange={v=>setStockForm({...stockForm,price:v})}/></div><ModalButtons onCancel={()=>setShowNewStock(false)} submit="Adicionar item"/></form></Modal>}
    {reversalTarget&&<Modal title={reversalTarget.type==="pdv"?"Estornar venda":"Reverter financeiro da OS"} subtitle={`${reversalTarget.label}. Esta operação será registrada no histórico e não poderá ser desfeita.`} onClose={()=>{if(!reversalBusy){setReversalTarget(null);setReversalReason("");}}}><form onSubmit={submitReversal} className="space-y-3"><div className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs leading-relaxed text-rose-800">{reversalTarget.type==="pdv"?"Os produtos desta venda serão devolvidos automaticamente ao estoque e o lucro será retirado do financeiro.":"Os ganhos financeiros desta OS serão revertidos. As peças não retornarão automaticamente ao estoque."}</div><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Motivo obrigatório</span><textarea value={reversalReason} onChange={e=>setReversalReason(e.target.value)} minLength={3} maxLength={240} required rows={3} placeholder="Descreva o motivo do estorno..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-rose-400"/></label><div className="flex gap-2 pt-2"><button type="button" disabled={reversalBusy} onClick={()=>{setReversalTarget(null);setReversalReason("");}} className="flex-1 rounded-xl border border-slate-200 py-3 text-xs font-bold text-slate-600">Voltar</button><button type="submit" disabled={reversalBusy||reversalReason.trim().length<3} className="flex-1 rounded-xl bg-rose-600 py-3 text-xs font-bold text-white disabled:opacity-50">{reversalBusy?"Registrando...":"Confirmar estorno"}</button></div></form></Modal>}
    {toast&&<div className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-xl"><Check size={16} className="text-emerald-400"/>{toast}</div>}
  </div>;
}

function PageHeading({title,subtitle,action,actionText}:any){return <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-bold text-slate-800">{title}</h2><p className="mt-1 text-xs text-slate-400">{subtitle}</p></div>{action&&<button onClick={action} className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-xs font-bold text-white"><Plus size={15}/>{actionText}</button>}</div>}
// Exibe uma mensagem quando uma listagem não possui registros.
function Empty({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
      <p className="text-sm font-medium text-slate-500">{text}</p>
    </div>
  );
}
function SearchBar({value,onChange,placeholder}:any){return <div className="relative max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-xs outline-none focus:border-brand-500"/></div>}
function MiniStat({label,value,icon,danger}:any){return <div className="flex items-center justify-between glass-card rounded-2xl border border-white/70 p-4 shadow-soft"><div><div className="text-[11px] text-slate-400">{label}</div><div className={`mt-1 text-xl font-bold ${danger?"text-rose-600":"text-slate-800"}`}>{value}</div></div><div className={`rounded-xl p-3 ${danger?"bg-rose-50 text-rose-500":"bg-violet-50 text-violet-600"}`}>{icon}</div></div>}
function FinanceCard({title,value,note,icon}:any){return <div className="glass-card rounded-2xl border border-white/70 p-5 shadow-soft"><div className="flex items-center justify-between"><div className="text-xs text-slate-500">{title}</div><div className="rounded-xl bg-violet-50 p-2.5 text-violet-600">{icon}</div></div><div className="mt-4 text-2xl font-bold text-slate-800">{value}</div><div className="mt-1 text-[10px] text-slate-400">{note}</div></div>}
type FieldProps = {
  label: string;
  value?: string | number;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
};
function Field({label,value,onChange,placeholder,type="text",required}:FieldProps){return <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">{label}</span><input type={type} value={value??""} onChange={e=>onChange?.(e.target.value)} placeholder={placeholder} required={required} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-violet-100"/></label>}
const modalEscapeStack: Array<() => void> = [];
const handleModalEscape = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || !modalEscapeStack.length) return;
  event.preventDefault();
  event.stopPropagation();
  modalEscapeStack[modalEscapeStack.length - 1]?.();
};
function Modal({title,subtitle,onClose,children}:any){
  useEffect(()=>{
    modalEscapeStack.push(onClose);
    if(modalEscapeStack.length===1) window.addEventListener("keydown",handleModalEscape);
    return ()=>{
      const index=modalEscapeStack.lastIndexOf(onClose);
      if(index>=0) modalEscapeStack.splice(index,1);
      if(!modalEscapeStack.length) window.removeEventListener("keydown",handleModalEscape);
    };
  },[onClose]);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"><div role="dialog" aria-modal="true" className="max-h-[92vh] w-full overflow-y-auto glass-modal rounded-t-3xl p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-6"><div className="mb-5 flex items-start justify-between"><div><h3 className="text-lg font-bold text-slate-800">{title}</h3><p className="mt-1 text-xs text-slate-400">{subtitle}</p></div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>{children}</div></div>}

function ModalButtons({onCancel,submit}:any){return <div className="flex gap-2 pt-3"><button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 py-3 text-xs font-bold text-slate-600">Cancelar</button><button className="flex-1 rounded-xl bg-brand-600 py-3 text-xs font-bold text-white">{submit}</button></div>}
function InfoLine({label,value,ok}:any){return <div className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0"><span className="text-xs text-slate-500">{label}</span><span className={`flex items-center gap-1.5 text-[11px] font-semibold ${ok?"text-emerald-600":"text-amber-600"}`}><span className={`h-1.5 w-1.5 rounded-full ${ok?"bg-emerald-500":"bg-amber-500"}`}/>{value}</span></div>}
