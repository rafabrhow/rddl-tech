"use client";

/**
 * Painéis separados por responsabilidade:
 * - SuperAdminDashboard: administração da plataforma RDDL TECH.
 * - Dashboard: visão geral operacional de uma assistência.
 */
import { useEffect, useState, type FormEvent } from "react";
import { auth } from "@/lib/firebase";
import {
  Activity, AlertCircle, ArrowRight, ArrowUpRight, BarChart3, Check,
  ChevronRight, CircleDollarSign, ClipboardList, Clock3, LayoutDashboard,
  LogOut, Package, Plus, Settings, Smartphone, Users, Wallet, Wrench, CreditCard, Save, CheckCircle2, ExternalLink, History
} from "lucide-react";
import type { OSStatus, ServiceOrder } from "@/lib/types";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { maskPhone, maskPixKey, normalizePixKey } from "@/lib/input-masks";

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

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type SuperAdminSection = "Visão geral" | "Assistências" | "Assinaturas" | "Administradores" | "Financeiro da plataforma" | "Histórico de atividades" | "Configurações";

/** Área exclusiva de gestão da plataforma RDDL TECH.
 * Os indicadores ficam zerados até a integração das coleções administrativas.
 */
export function SuperAdminDashboard({ email, onLogout }: { email: string; onLogout: () => void | Promise<void> }) {
  const confirm = useConfirm();
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveSetupBusy, setDriveSetupBusy] = useState(false);
  const [driveError, setDriveError] = useState("");
  const [driveMessage, setDriveMessage] = useState("");
  const [driveStatus, setDriveStatus] = useState<any>(null);
  const [driveStatusBusy, setDriveStatusBusy] = useState(false);
  const [platformConfig, setPlatformConfig] = useState({ nome: "RDDL TECH", emailSuporte: "", telefoneSuporte: "", site: "", descricao: "" });
  const [platformSaving, setPlatformSaving] = useState(false);
  const [platformError, setPlatformError] = useState("");
  const [platformMessage, setPlatformMessage] = useState("");
  const [companyBusy, setCompanyBusy] = useState(false);
  const [companyError, setCompanyError] = useState("");
  const [companyMessage, setCompanyMessage] = useState("");
  const [companyForm, setCompanyForm] = useState({ nome: "", telefone: "", adminNome: "", adminEmail: "", senha: "" });
  const [active, setActive] = useState<SuperAdminSection>("Visão geral");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [billingMessage, setBillingMessage] = useState("");
  const [billingConfig, setBillingConfig] = useState({ valorMensal: "30,00", pixTipo: "telefone", pixChave: "99984936958", pixTitular: "" });
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [rejectingPaymentId, setRejectingPaymentId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionError, setRejectionError] = useState("");
  useEffect(() => {
    if (!rejectingPaymentId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !billingBusy) setRejectingPaymentId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rejectingPaymentId, billingBusy]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [companiesBusy, setCompaniesBusy] = useState(false);
  const [companiesError, setCompaniesError] = useState("");
  const [companyActionBusy, setCompanyActionBusy] = useState("");
  const [editingCompany, setEditingCompany] = useState<any | null>(null);
  const [companyEditForm, setCompanyEditForm] = useState({ nome: "", telefone: "" });
  const [adminChangeForm, setAdminChangeForm] = useState({ adminNome: "", adminEmail: "", senha: "" });
  const [changingAdminFor, setChangingAdminFor] = useState<string | null>(null);
  const [renewingTrialFor, setRenewingTrialFor] = useState<string | null>(null);
  const [renewTrialDays, setRenewTrialDays] = useState("2");
  const [auditItems, setAuditItems] = useState<any[]>([]);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditCompanyFilter, setAuditCompanyFilter] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");


  async function loadAudit() {
    if (!auth?.currentUser) return;
    setAuditBusy(true); setAuditError("");
    try {
      const token = await auth.currentUser.getIdToken(true);
      const params = new URLSearchParams();
      if (auditCompanyFilter) params.set("empresaId", auditCompanyFilter);
      if (auditActionFilter) params.set("acao", auditActionFilter);
      const response = await fetch(`/api/superadmin/auditoria?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o histórico.");
      setAuditItems(Array.isArray(result.items) ? result.items : []);
    } catch (error) { setAuditError(error instanceof Error ? error.message : "Falha ao carregar o histórico."); }
    finally { setAuditBusy(false); }
  }

  useEffect(() => { if (active === "Histórico de atividades") void loadAudit(); }, [active, auditCompanyFilter, auditActionFilter]);

  async function loadCompanies() {
    if (!auth?.currentUser) return;
    setCompaniesBusy(true); setCompaniesError("");
    try {
      const token = await auth.currentUser.getIdToken(true);
      const response = await fetch("/api/superadmin/empresas", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar as assistências.");
      setCompanies(Array.isArray(result.empresas) ? result.empresas : []);
    } catch (error) { setCompaniesError(error instanceof Error ? error.message : "Falha ao carregar assistências."); }
    finally { setCompaniesBusy(false); }
  }

  async function updateCompanyAction(empresaId: string, action: string, values: Record<string, string> = {}) {
    if (!auth?.currentUser) return;
    setCompanyActionBusy(empresaId); setCompaniesError("");
    try {
      const token = await auth.currentUser.getIdToken(true);
      const response = await fetch("/api/superadmin/empresas", {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId, action, ...values }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar a assistência.");
      setChangingAdminFor(null); setEditingCompany(null);
      setAdminChangeForm({ adminNome: "", adminEmail: "", senha: "" });
      await loadCompanies();
      setRenewingTrialFor(null);
      setCompanyMessage(action === "renew-trial" ? `Período de teste renovado por ${values.days} dias.` : action === "suspend" ? "Acesso da assistência suspenso." : action === "reactivate" ? "Acesso da assistência reativado." : action === "change-admin" ? "Administrador substituído. O acesso anterior foi desativado." : "Dados da assistência atualizados.");
    } catch (error) { setCompaniesError(error instanceof Error ? error.message : "Falha na operação."); }
    finally { setCompanyActionBusy(""); }
  }

  useEffect(() => {
    if (["Visão geral", "Assistências", "Assinaturas", "Administradores", "Histórico de atividades"].includes(active)) void loadCompanies();
  }, [active]);

  async function loadBilling() {
    if (!auth?.currentUser) return;
    setBillingBusy(true); setBillingError("");
    try {
      const token = await auth.currentUser.getIdToken(true);
      const response = await fetch("/api/superadmin/financeiro", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o financeiro.");
      setBillingConfig({
        valorMensal: (Number(result.valorMensalCentavos || 3000) / 100).toFixed(2).replace(".", ","),
        pixTipo: result.pixTipo || "telefone", pixChave: maskPixKey(result.pixTipo || "telefone", result.pixChave || ""), pixTitular: result.pixTitular || "",
      });
      setPaymentRequests(Array.isArray(result.pagamentos) ? result.pagamentos : []);
    } catch (error) { setBillingError(error instanceof Error ? error.message : "Falha ao carregar o financeiro."); }
    finally { setBillingBusy(false); }
  }
  useEffect(() => { if (active === "Visão geral" || active === "Financeiro da plataforma" || active === "Configurações") void loadBilling(); }, [active]);
  useEffect(() => { if (active === "Configurações") { void loadPlatformConfig(); void loadDriveStatus(); } }, [active]);
  async function saveBilling() {
    if (!auth?.currentUser) return;
    setBillingSaving(true); setBillingError(""); setBillingMessage("");
    try {
      const parsed = Number(billingConfig.valorMensal.replace(/\./g, "").replace(",", "."));
      const token = await auth.currentUser.getIdToken(true);
      const response = await fetch("/api/superadmin/financeiro", {
        method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ valorMensalCentavos: Math.round(parsed * 100), pixTipo: billingConfig.pixTipo, pixChave: billingConfig.pixChave, pixTitular: billingConfig.pixTitular }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar as configurações.");
      setBillingMessage("Preço e dados do PIX salvos com sucesso.");
      await loadBilling();
    } catch (error) { setBillingError(error instanceof Error ? error.message : "Falha ao salvar."); }
    finally { setBillingSaving(false); }
  }
  async function viewPaymentProof(id: string) {
    if (!auth?.currentUser) return;
    const tab = window.open("about:blank", "_blank");
    try {
      const token = await auth.currentUser.getIdToken(true);
      const response = await fetch(`/api/superadmin/pagamentos/${id}/confirmar`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || "Não foi possível abrir o comprovante."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { if (tab) tab.close(); setBillingError(error instanceof Error ? error.message : "Falha ao abrir comprovante."); }
  }
  async function confirmPayment(id: string) {
    if (!auth?.currentUser) return;
    const confirmed = await confirm({
      title: "Confirmar recebimento do PIX?",
      message: "Confirma que o pagamento foi recebido?",
      description: "A assinatura da assistência será ativada por 30 dias.",
      confirmText: "Sim, confirmar pagamento",
      cancelText: "Voltar",
      variant: "warning",
    });
    if (!confirmed) return;
    setBillingBusy(true); setBillingError(""); setBillingMessage("");
    try {
      const token = await auth.currentUser.getIdToken(true);
      const response = await fetch(`/api/superadmin/pagamentos/${id}/confirmar`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível confirmar o pagamento.");
      setBillingMessage(result.message || "Pagamento confirmado.");
      await loadBilling();
    } catch (error) { setBillingError(error instanceof Error ? error.message : "Falha ao confirmar pagamento."); }
    finally { setBillingBusy(false); }
  }

  function openRejectPayment(id: string) {
    setRejectionReason("");
    setRejectionError("");
    setRejectingPaymentId(id);
  }

  async function rejectPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth?.currentUser || !rejectingPaymentId) return;
    const motivo = rejectionReason.trim();
    if (motivo.length < 5) {
      setRejectionError("Descreva o motivo com pelo menos 5 caracteres.");
      return;
    }
    const confirmed = await confirm({
      title: "Confirmar recusa do pagamento?",
      message: "A solicitação será recusada e a assistência poderá enviar um novo comprovante.",
      description: `Motivo: ${motivo}`,
      confirmText: "Sim, recusar pagamento",
      cancelText: "Voltar",
      variant: "danger",
    });
    if (!confirmed) return;
    setBillingBusy(true); setBillingError(""); setBillingMessage("");
    try {
      const token = await auth.currentUser.getIdToken(true);
      const response = await fetch(`/api/superadmin/pagamentos/${rejectingPaymentId}/recusar`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível recusar o pagamento.");
      setBillingMessage(result.message || "Pagamento recusado.");
      setRejectingPaymentId(null);
      setRejectionReason("");
      await loadBilling();
    } catch (error) { setBillingError(error instanceof Error ? error.message : "Falha ao recusar pagamento."); }
    finally { setBillingBusy(false); }
  }

  async function loadPlatformConfig() {
    if (!auth?.currentUser) return;
    setPlatformError("");
    try {
      const token = await auth.currentUser.getIdToken(true);
      const response = await fetch("/api/superadmin/configuracoes", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar os dados institucionais.");
      setPlatformConfig({ nome: result.nome || "RDDL TECH", emailSuporte: result.emailSuporte || "", telefoneSuporte: maskPhone(result.telefoneSuporte || ""), site: result.site || "", descricao: result.descricao || "" });
    } catch (error) { setPlatformError(error instanceof Error ? error.message : "Falha ao carregar dados institucionais."); }
  }

  async function savePlatformConfig() {
    if (!auth?.currentUser) return;
    setPlatformSaving(true); setPlatformError(""); setPlatformMessage("");
    try {
      const token = await auth.currentUser.getIdToken(true);
      const response = await fetch("/api/superadmin/configuracoes", { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(platformConfig) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar os dados institucionais.");
      setPlatformMessage("Dados institucionais salvos com sucesso.");
      await loadPlatformConfig();
    } catch (error) { setPlatformError(error instanceof Error ? error.message : "Falha ao salvar os dados institucionais."); }
    finally { setPlatformSaving(false); }
  }

  async function loadDriveStatus(testConnection = false) {
    if (!auth?.currentUser) return;
    setDriveStatusBusy(true); setDriveError("");
    try {
      const token = await auth.currentUser.getIdToken(true);
      const response = await fetch(`/api/drive/status${testConnection ? "?test=1" : ""}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível consultar o Google Drive.");
      setDriveStatus(result);
      if (testConnection) setDriveMessage(result.connectionOk ? "Conexão com o Google Drive testada com sucesso." : "A conexão precisa ser refeita.");
    } catch (error) { setDriveError(error instanceof Error ? error.message : "Falha ao consultar o Google Drive."); }
    finally { setDriveStatusBusy(false); }
  }

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth?.currentUser) { setCompanyError("Sua sessão expirou. Entre novamente."); return; }
    setCompanyBusy(true); setCompanyError(""); setCompanyMessage("");
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const response = await fetch("/api/superadmin/empresas", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(companyForm),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível cadastrar a assistência.");
      setCompanyMessage(`Assistência ${result.empresa.nome} cadastrada. Teste gratuito até ${new Date(result.empresa.trialEndsAt).toLocaleString("pt-BR")}.`);
      setCompanyForm({ nome: "", telefone: "", adminNome: "", adminEmail: "", senha: "" });
    } catch (error) {
      setCompanyError(error instanceof Error ? error.message : "Falha ao cadastrar a assistência.");
    } finally { setCompanyBusy(false); }
  }
  async function connectGoogleDrive() {
    if (!auth?.currentUser) {
      setDriveError("Sua sessão expirou. Entre novamente para conectar o Google Drive.");
      return;
    }
    setDriveBusy(true);
    setDriveError("");
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const response = await fetch("/api/drive/oauth/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const result = await response.json();
      if (!response.ok || typeof result.authorizationUrl !== "string") {
        throw new Error(result.error || "Não foi possível iniciar a conexão com o Google Drive.");
      }
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setDriveError(error instanceof Error ? error.message : "Falha ao iniciar a conexão com o Google Drive.");
      setDriveBusy(false);
    }
  }
  async function setupGoogleDriveFolders() {
    if (!auth?.currentUser) { setDriveError("Sua sessão expirou. Entre novamente."); return; }
    setDriveSetupBusy(true); setDriveError(""); setDriveMessage("");
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const response = await fetch("/api/drive/setup", { method: "POST", headers: { Authorization: `Bearer ${idToken}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível criar as pastas.");
      setDriveMessage(result.message || "Pastas configuradas com sucesso.");
      await loadDriveStatus();
    } catch (error) {
      setDriveError(error instanceof Error ? error.message : "Falha ao configurar as pastas do Drive.");
    } finally { setDriveSetupBusy(false); }
  }
  const items: { name: SuperAdminSection; icon: any }[] = [
    { name: "Visão geral", icon: LayoutDashboard },
    { name: "Assistências", icon: Smartphone },
    { name: "Assinaturas", icon: ClipboardList },
    { name: "Administradores", icon: Users },
    { name: "Financeiro da plataforma", icon: Wallet },
    { name: "Histórico de atividades", icon: History },
    { name: "Configurações", icon: Settings },
  ];
  const descriptions: Record<SuperAdminSection, string> = {
    "Visão geral": "Acompanhe a operação comercial da plataforma RDDL TECH.",
    "Assistências": "Cadastre e gerencie as empresas que utilizam a RDDL TECH.",
    "Assinaturas": "Consulte o plano de cada empresa, o período de teste e os vencimentos.",
    "Administradores": "Consulte e substitua os responsáveis pelas assistências, preservando o histórico.",
    "Financeiro da plataforma": "Acompanhe receitas de assinaturas e pagamentos da plataforma.",
    "Histórico de atividades": "Consulte as operações administrativas e seus responsáveis.",
    "Configurações": "Ajuste as configurações gerais da plataforma RDDL TECH.",
  };
  return <div className="min-h-screen">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[250px] glass-sidebar text-white lg:block">
      <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-orange-500 text-xs font-black text-white">RD</div>
        <div><div className="text-[18px] font-extrabold tracking-wide">RDDL<span className="text-orange-400"> TECH</span></div><div className="text-[10px] uppercase tracking-[.18em] text-white/45">Administração da plataforma</div></div>
      </div>
      <div className="px-4 pt-7 pb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-white/35">Gestão da plataforma</div>
      <nav className="space-y-1 px-3">{items.map(item => { const Icon = item.icon; return <button key={item.name} onClick={() => setActive(item.name)} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[13px] transition ${active === item.name ? "bg-brand-500 text-white shadow-lg shadow-violet-950/30" : "text-white/65 hover:bg-white/10 hover:text-white"}`}><Icon size={18}/><span>{item.name}</span></button>; })}</nav>
      <div className="absolute bottom-5 left-4 right-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><Activity size={15} className="text-violet-300"/> Área do superadministrador</div>
        <p className="text-[11px] leading-relaxed text-white/50">Este ambiente administra a plataforma, não os dados operacionais das assistências.</p>
      </div>
    </aside>
    <main className="min-h-screen lg:ml-[250px]">
      <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between glass-header border-b border-white/50 px-4 md:px-8">
        <div><div className="text-[10px] font-medium uppercase tracking-[.16em] text-slate-400">Painel do superadministrador</div><h1 className="text-[17px] font-bold text-slate-800">{active}</h1></div>
        <div className="flex items-center gap-3"><div className="hidden text-right sm:block"><div className="text-xs font-semibold text-slate-700">Superadministrador</div><div className="text-[10px] text-slate-400">{email}</div></div><div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">SA</div><button type="button" onClick={onLogout} title="Sair da plataforma" className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><LogOut size={17}/></button></div>
      </header>
      <div className="mx-auto max-w-[1500px] p-4 md:p-8">
        <div className="mb-6"><h2 className="text-xl font-bold text-slate-800">{active === "Visão geral" ? "Bem-vindo à administração RDDL TECH" : active}</h2><p className="mt-1 text-xs text-slate-400">{descriptions[active]}</p></div>
        {active === "Visão geral" ? <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              {label:"Assistências cadastradas",value:String(companies.length),icon:<Smartphone size={19}/>},
              {label:"Assinaturas pagas ativas",value:String(companies.filter(item=>item.status==="ativa").length),icon:<Check size={19}/>},
              {label:"Empresas em teste",value:String(companies.filter(item=>item.status==="em_teste").length),icon:<Clock3 size={19}/>},
              {label:"Próximas do vencimento",value:String(companies.filter(item=>{const data=item.status==="em_teste"?item.trialEndsAt:item.assinaturaVenceEm;const vencimento=data?new Date(data).getTime():NaN;return ["ativa","em_teste"].includes(item.status)&&Number.isFinite(vencimento)&&vencimento>=Date.now()&&vencimento-Date.now()<=5*86400000;}).length),icon:<Clock3 size={19}/>},
              {label:"Assinaturas suspensas",value:String(companies.filter(item=>["suspensa","suspended"].includes(item.status)).length),icon:<AlertCircle size={19}/>},
              {label:"Receita confirmada no mês",value:money(paymentRequests.filter((item:any)=>item.status==="confirmado"&&item.confirmadoEm&&new Date(item.confirmadoEm).getMonth()===new Date().getMonth()&&new Date(item.confirmadoEm).getFullYear()===new Date().getFullYear()).reduce((sum:number,item:any)=>sum+Number(item.valorCentavos||0),0)/100),icon:<Wallet size={19}/>},
            ].map(card => <div key={card.label} className="glass-card rounded-2xl border border-white/70 p-5 shadow-soft"><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">{card.label}</span><span className="rounded-xl bg-violet-50 p-2.5 text-violet-600">{card.icon}</span></div><div className="mt-4 text-2xl font-bold text-slate-800">{companiesBusy||(card.label==="Receita confirmada no mês"&&billingBusy)?"…":card.value}</div><div className="mt-1 text-[10px] text-slate-400">Dados atuais do cadastro</div></div>)}
          </div>
          <div className="glass-card rounded-2xl border border-white/70 p-6 shadow-soft"><div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Activity size={18} className="text-violet-600"/> Operação da plataforma</div><p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500">Acompanhe empresas, responsáveis, assinaturas e pagamentos em um único painel. Os dados são carregados diretamente do Firestore.</p>{companiesError&&<p role="alert" className="mt-3 text-xs text-rose-600">{companiesError}</p>}<div className="mt-5 flex flex-wrap gap-2"><button onClick={() => setActive("Assistências")} className="rounded-xl bg-brand-600 px-4 py-3 text-xs font-bold text-white">Gerenciar assistências</button><button onClick={() => setActive("Assinaturas")} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-600">Ver assinaturas</button></div></div>
        </div> : active === "Financeiro da plataforma" ? <div className="space-y-5">
          <div className="glass-card rounded-2xl border border-white/70 p-6 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-800">Comprovantes aguardando confirmação</h3><p className="mt-1 text-xs text-slate-500">Confira o recebimento do PIX antes de ativar a assinatura.</p></div><button onClick={() => void loadBilling()} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Atualizar lista</button></div>
            {billingError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{billingError}</p>}
            {billingMessage && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{billingMessage}</p>}
            {billingBusy ? <p className="py-8 text-center text-xs text-slate-400">Carregando...</p> : paymentRequests.filter((item:any) => item.status === "pendente").length === 0 ? <p className="py-8 text-center text-xs text-slate-400">Nenhum comprovante aguardando análise.</p> :
              <div className="mt-4 space-y-3">{paymentRequests.filter((item:any) => item.status === "pendente").map((item:any) => <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-bold text-slate-800">{item.empresaNome || "Assistência"}</div><div className="mt-1 text-xs text-slate-500">{item.adminEmail} · {money((item.valorCentavos || 3000)/100)}</div><div className="mt-1 text-[10px] text-slate-400">Enviado em: {item.criadoEm ? new Date(item.criadoEm).toLocaleString("pt-BR") : "Data não disponível"} · {item.arquivoNome}</div><p className="mt-1 text-[10px] text-slate-400">Comprovante armazenado no Google Drive privado.</p><button onClick={() => void viewPaymentProof(item.id)} className="mt-2 text-[11px] font-bold text-violet-700 underline"><ExternalLink size={12} className="mr-1 inline"/> Abrir comprovante</button></div><div className="flex shrink-0 flex-wrap gap-2"><button disabled={billingBusy} onClick={() => openRejectPayment(item.id)} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 disabled:opacity-50">Recusar pagamento</button><button disabled={billingBusy} onClick={() => void confirmPayment(item.id)} className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 size={14} className="mr-1 inline"/> Confirmar recebimento</button></div></div>)}</div>}
          </div>
          <div className="glass-card rounded-2xl border border-white/70 p-6 shadow-soft">
            <h3 className="text-sm font-bold text-slate-800">Histórico de pagamentos</h3>
            <p className="mt-1 text-xs text-slate-500">Solicitações pendentes e pagamentos já analisados.</p>
            <div className="mt-4 space-y-2">{paymentRequests.length === 0 ? <p className="py-5 text-center text-xs text-slate-400">Nenhum pagamento registrado.</p> : paymentRequests.map((item:any) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div><div className="text-xs font-bold text-slate-700">{item.empresaNome || "Assistência"}</div><div className="mt-1 text-[11px] text-slate-500">{item.adminEmail} · {money((item.valorCentavos || 3000)/100)}</div><div className="text-[10px] text-slate-400">{item.criadoEm ? new Date(item.criadoEm).toLocaleString("pt-BR") : "Data não disponível"}{item.recusadoEm ? ` · Recusado em ${new Date(item.recusadoEm).toLocaleString("pt-BR")}` : ""}</div>{item.motivoRecusa && <div className="mt-1 text-[11px] text-rose-700">Motivo da recusa: {item.motivoRecusa}</div>}</div><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${item.status === "confirmado" ? "bg-emerald-50 text-emerald-700" : item.status === "pendente" ? "bg-amber-50 text-amber-700" : item.status === "recusado" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{item.status === "confirmado" ? "Confirmado" : item.status === "pendente" ? "Pendente" : item.status === "recusado" ? "Recusado" : item.status}</span></div>)}</div>
          </div>
        </div> : active === "Histórico de atividades" ? <div className="glass-card rounded-2xl border border-white/70 p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-800">Histórico de atividades</h3><p className="mt-1 text-xs text-slate-500">Registro das operações administrativas realizadas após a implantação da auditoria.</p></div><button onClick={()=>void loadAudit()} className="rounded-xl border border-slate-200 px-3 py-2 text-xs">Atualizar</button></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2"><select value={auditCompanyFilter} onChange={e=>setAuditCompanyFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"><option value="">Todas as assistências</option>{companies.map((company:any)=><option key={company.id} value={company.id}>{company.nome}</option>)}</select><select value={auditActionFilter} onChange={e=>setAuditActionFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"><option value="">Todas as operações</option><option value="empresa_cadastrada">Cadastro</option><option value="empresa_atualizada">Alteração de dados</option><option value="administrador_substituido">Troca de administrador</option><option value="acesso_suspenso">Suspensão</option><option value="acesso_reativado">Reativação</option><option value="pagamento_confirmado">Pagamento confirmado</option><option value="pagamento_recusado">Pagamento recusado</option><option value="configuracao_financeira_alterada">Configuração financeira</option><option value="dados_institucionais_alterados">Dados institucionais</option></select></div>
      {auditError&&<p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{auditError}</p>}
      {auditBusy?<p className="py-10 text-center text-xs text-slate-400">Carregando histórico...</p>:auditItems.length===0?<p className="py-10 text-center text-xs text-slate-400">Nenhuma atividade registrada para os filtros selecionados.</p>:<div className="mt-4 space-y-2">{auditItems.map((item:any)=><div key={item.id} className="rounded-xl border border-slate-100 bg-white/60 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="text-xs font-bold text-slate-800">{item.descricao}</div><div className="mt-1 text-[11px] text-slate-500">{item.empresaNome}{item.alvoNome?` · ${item.alvoNome}`:""}</div></div><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-700">{item.acao.replaceAll("_"," ")}</span></div><div className="mt-2 text-[10px] text-slate-400">Responsável: {item.responsavelEmail||item.responsavelUid} · {item.criadoEm?new Date(item.criadoEm).toLocaleString("pt-BR"):"Data indisponível"}</div>{item.alvoEmail&&<div className="mt-1 text-[10px] text-slate-400">Conta relacionada: {item.alvoEmail}</div>}{item.detalhes?.motivo&&<div className="mt-2 rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700">Motivo: {item.detalhes.motivo}</div>}</div>)}</div>}
    </div> : active === "Configurações" ? <div className="space-y-5">
          <div className="glass-card rounded-2xl border border-white/70 p-6 shadow-soft">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Settings size={18} className="text-violet-600"/> Dados institucionais da plataforma</div>
            <p className="mt-2 text-xs text-slate-500">Informações oficiais da RDDL TECH para identificação e contato. Essas informações não alteram os dados individuais das assistências.</p>
            {platformError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{platformError}</p>}
            {platformMessage && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{platformMessage}</p>}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">Nome da plataforma<input maxLength={100} value={platformConfig.nome} onChange={e=>setPlatformConfig({...platformConfig,nome:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"/></label>
              <label className="text-xs font-semibold text-slate-600">E-mail de suporte<input type="email" maxLength={160} value={platformConfig.emailSuporte} onChange={e=>setPlatformConfig({...platformConfig,emailSuporte:e.target.value})} placeholder="suporte@seudominio.com" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"/></label>
              <label className="text-xs font-semibold text-slate-600">
              Telefone / WhatsApp
              <input
                value={platformConfig.telefoneSuporte}
                onChange={e => setPlatformConfig({
                  ...platformConfig,
                  telefoneSuporte: maskPhone(e.target.value)
                })}
                inputMode="tel"
                maxLength={15}
                placeholder="(00) 00000-0000"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
              />
            </label>
              <label className="text-xs font-semibold text-slate-600">Site (opcional)<input maxLength={200} value={platformConfig.site} onChange={e=>setPlatformConfig({...platformConfig,site:e.target.value})} placeholder="https://..." className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"/></label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Descrição institucional<textarea maxLength={500} rows={3} value={platformConfig.descricao} onChange={e=>setPlatformConfig({...platformConfig,descricao:e.target.value})} placeholder="Gestão inteligente para assistências técnicas." className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"/></label>
            </div>
            <button onClick={() => void savePlatformConfig()} disabled={platformSaving || !platformConfig.nome.trim()} className="mt-4 rounded-xl bg-brand-600 px-5 py-3 text-xs font-bold text-white disabled:opacity-50"><Save size={14} className="mr-1 inline"/>{platformSaving ? "Salvando..." : "Salvar dados institucionais"}</button>
          </div>
          <div className="glass-card rounded-2xl border border-white/70 p-6 shadow-soft">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><CreditCard size={18} className="text-violet-600"/> Plano mensal e recebimento PIX</div>
            <p className="mt-2 text-xs text-slate-500">Defina o preço cobrado e a chave PIX que será exibida às assistências na contratação. O teste grátis permanece com duração de 5 dias.</p>
            {billingError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{billingError}</p>}
            {billingMessage && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{billingMessage}</p>}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">Preço mensal (R$)<input inputMode="decimal" value={billingConfig.valorMensal} onChange={e=>setBillingConfig({...billingConfig,valorMensal:e.target.value})} placeholder="30,00" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"/></label>
              <label className="text-xs font-semibold text-slate-600">Tipo da chave PIX<select value={billingConfig.pixTipo} onChange={e=>setBillingConfig({...billingConfig,pixTipo:e.target.value,pixChave:maskPixKey(e.target.value,billingConfig.pixChave)})} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="telefone">Telefone</option><option value="aleatoria">Aleatória</option></select></label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Chave PIX<input inputMode={["cpf","cnpj","telefone"].includes(billingConfig.pixTipo)?"numeric":"text"} maxLength={billingConfig.pixTipo==="cpf"?14:billingConfig.pixTipo==="cnpj"?18:billingConfig.pixTipo==="telefone"?19:150} value={billingConfig.pixChave} onChange={e=>setBillingConfig({...billingConfig,pixChave:maskPixKey(billingConfig.pixTipo,e.target.value)})} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"/></label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Nome do titular (opcional)<input value={billingConfig.pixTitular} onChange={e=>setBillingConfig({...billingConfig,pixTitular:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"/></label>
            </div>
            <button onClick={() => void saveBilling()} disabled={billingSaving} className="mt-4 rounded-xl bg-brand-600 px-5 py-3 text-xs font-bold text-white disabled:opacity-50"><Save size={14} className="mr-1 inline"/>{billingSaving ? "Salvando..." : "Salvar preço e PIX"}</button>
          </div>
          <div className="glass-card rounded-2xl border border-white/70 p-6 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Activity size={18} className="text-violet-600"/> Armazenamento da plataforma — Google Drive</div><p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500">Conecte a conta Google proprietária dos arquivos da RDDL TECH. O token de renovação é armazenado criptografado no servidor.</p></div>
              <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${driveStatus?.connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{driveStatusBusy ? "Verificando..." : driveStatus?.connected ? "Conta conectada" : "Não conectado"}</span>
            </div>
            {driveStatus && <div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-slate-100 bg-white/60 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Autorização</div><div className="mt-1 text-xs font-semibold text-slate-700">{driveStatus.connected ? "Token armazenado e disponível" : "Autorização pendente"}</div><div className="mt-1 text-[10px] text-slate-400">{driveStatus.connectedAt ? `Conectado em ${new Date(driveStatus.connectedAt).toLocaleString("pt-BR")}` : "Nenhuma conexão registrada"}</div></div><div className="rounded-xl border border-slate-100 bg-white/60 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Estrutura de pastas</div><div className="mt-1 text-xs font-semibold text-slate-700">{driveStatus.foldersConfigured ? "Pastas principais configuradas" : "Estrutura ainda não configurada"}</div><div className="mt-1 text-[10px] text-slate-400">{driveStatus.configuredAt ? `Verificada em ${new Date(driveStatus.configuredAt).toLocaleString("pt-BR")}` : "Crie a estrutura após conectar"}</div></div></div>}
            {driveStatus?.folderNames?.length > 0 && <p className="mt-3 text-[11px] text-slate-500">Pastas: {driveStatus.folderNames.join(" · ")}</p>}
            {driveError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{driveError}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={connectGoogleDrive} disabled={driveBusy || driveSetupBusy} className="rounded-xl bg-brand-600 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-violet-200 disabled:cursor-not-allowed disabled:opacity-60">{driveBusy ? "Preparando conexão..." : driveStatus?.connected ? "Reconectar Google Drive" : "Conectar Google Drive"}</button>
              <button type="button" onClick={setupGoogleDriveFolders} disabled={driveBusy || driveSetupBusy || !driveStatus?.connected} className="rounded-xl border border-violet-200 bg-white px-4 py-3 text-xs font-bold text-violet-700 disabled:cursor-not-allowed disabled:opacity-60">{driveSetupBusy ? "Criando pastas..." : "Criar / verificar pastas"}</button>
              <button type="button" onClick={() => void loadDriveStatus(true)} disabled={driveStatusBusy || driveBusy || driveSetupBusy} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 disabled:opacity-60">{driveStatusBusy ? "Testando..." : "Testar conexão"}</button>
            </div>
            {driveMessage && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{driveMessage}</p>}
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">Conta proprietária configurada anteriormente: rafabrhow@gmail.com. O teste consulta o acesso ao Drive sem alterar ou excluir arquivos.</p>
          </div>
        </div> : active === "Assistências" ? <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
          <form onSubmit={createCompany} className="glass-card space-y-4 rounded-2xl border border-white/70 p-6 shadow-soft">
            <div><h3 className="text-sm font-bold text-slate-800">Cadastrar assistência e administrador</h3><p className="mt-1 text-xs text-slate-500">O administrador receberá acesso vinculado exclusivamente à nova empresa.</p></div>
            {companyError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{companyError}</p>}
            {companyMessage && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{companyMessage}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Nome da assistência<input required maxLength={120} value={companyForm.nome} onChange={e=>setCompanyForm({...companyForm,nome:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-sm outline-none focus:border-violet-400" placeholder="Ex.: TEIXACELL" /></label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Telefone / WhatsApp (opcional)<input value={companyForm.telefone} onChange={e=>setCompanyForm({...companyForm,telefone:maskPhone(e.target.value)})} inputMode="tel" maxLength={15} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-sm outline-none focus:border-violet-400" placeholder="(99) 99999-9999" /></label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Nome do administrador<input required maxLength={120} value={companyForm.adminNome} onChange={e=>setCompanyForm({...companyForm,adminNome:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-sm outline-none focus:border-violet-400" /></label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">E-mail de acesso<input required type="email" value={companyForm.adminEmail} onChange={e=>setCompanyForm({...companyForm,adminEmail:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-sm outline-none focus:border-violet-400" /></label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Senha inicial (mínimo 8 caracteres)<input required minLength={8} type="password" value={companyForm.senha} onChange={e=>setCompanyForm({...companyForm,senha:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-sm outline-none focus:border-violet-400" /></label>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="text-xs font-bold text-amber-800">Plano inicial: Teste grátis — 5 dias</div><p className="mt-1 text-[11px] text-amber-700">Após o teste, será necessário contratar o plano mensal de R$ 30,00 para continuar usando o sistema.</p></div>
            <button disabled={companyBusy} type="submit" className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-violet-200 disabled:opacity-60">{companyBusy ? "Cadastrando..." : "Cadastrar assistência"}<ArrowRight size={15}/></button>
          </form>
          <div className="glass-card h-fit rounded-2xl border border-white/70 p-6 shadow-soft"><div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Clock3 size={18} className="text-amber-600"/> Como funciona o teste</div><ol className="mt-4 space-y-3 text-xs leading-relaxed text-slate-500"><li>1. A assistência e o usuário administrador são criados.</li><li>2. O período de teste começa no momento do cadastro e dura 5 dias.</li><li>3. O painel do administrador exibirá um aviso explícito de período de teste.</li><li>4. O plano mensal é configurável pelo superadministrador.</li></ol><p className="mt-4 text-[11px] text-amber-700">O histórico de empresas e usuários é preservado mesmo após suspensão ou troca de administrador.</p></div>
          <div className="glass-card rounded-2xl border border-white/70 p-6 shadow-soft xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-800">Assistências cadastradas</h3><p className="mt-1 text-xs text-slate-500">Consulte, edite, suspenda, reative ou troque o administrador responsável.</p></div><button onClick={()=>void loadCompanies()} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Atualizar</button></div>
            {companiesError&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{companiesError}</p>}
            {companyMessage&&<p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{companyMessage}</p>}
            {companiesBusy?<p className="py-8 text-center text-xs text-slate-400">Carregando assistências...</p>:companies.length===0?<p className="py-8 text-center text-xs text-slate-400">Nenhuma assistência cadastrada.</p>:<div className="mt-4 space-y-3">{companies.map((company:any)=><div key={company.id} className="rounded-xl border border-slate-100 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-bold text-slate-800">{company.nome}</div><div className="mt-1 text-xs text-slate-500">{company.adminNome} · {company.adminEmail}</div><div className="mt-1 text-[11px] text-slate-400">{company.telefone||"Sem telefone"} · Cadastro: {company.createdAt?new Date(company.createdAt).toLocaleDateString("pt-BR"):"—"}</div></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${company.status==="ativa"?"bg-emerald-50 text-emerald-700":company.status==="em_teste"?"bg-violet-50 text-violet-700":"bg-amber-50 text-amber-700"}`}>{company.status==="ativa"?"Ativa":company.status==="em_teste"?"Em teste":company.status==="suspensa"?"Suspensa":company.status}</span></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><button onClick={()=>{setEditingCompany(company);setCompanyEditForm({nome:company.nome,telefone:maskPhone(company.telefone||"")});}} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600">Editar dados</button><button onClick={()=>{setChangingAdminFor(company.id);setAdminChangeForm({adminNome:"",adminEmail:"",senha:""});}} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600">Trocar administrador</button>{company.status==="suspensa"?<button disabled={companyActionBusy===company.id} onClick={()=>void updateCompanyAction(company.id,"reactivate")} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">Reativar acesso</button>:<button disabled={companyActionBusy===company.id} onClick={async()=>{const ok=await confirm({title:"Suspender assistência?",message:`Suspender o acesso de ${company.nome}?`,description:"Os dados e o histórico serão preservados. O administrador perderá o acesso.",confirmText:"Suspender",cancelText:"Voltar",variant:"danger"});if(ok)void updateCompanyAction(company.id,"suspend");}} className="rounded-lg bg-rose-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">Suspender acesso</button>}<button onClick={()=>setActive("Assinaturas")} className="rounded-lg border border-violet-200 px-3 py-2 text-[11px] font-semibold text-violet-700">Ver assinatura</button></div>
              {editingCompany?.id===company.id&&<form onSubmit={e=>{e.preventDefault();void updateCompanyAction(company.id,"update",companyEditForm);}} className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2"><input value={companyEditForm.nome} onChange={e=>setCompanyEditForm({...companyEditForm,nome:e.target.value})} placeholder="Nome da assistência" className="rounded-lg border border-slate-200 px-3 py-2 text-xs"/><input value={companyEditForm.telefone} onChange={e=>setCompanyEditForm({...companyEditForm,telefone:maskPhone(e.target.value)})} inputMode="tel" maxLength={15} placeholder="Telefone" className="rounded-lg border border-slate-200 px-3 py-2 text-xs"/><div className="flex gap-2 sm:col-span-2"><button disabled={companyActionBusy===company.id} className="rounded-lg bg-brand-600 px-3 py-2 text-[11px] font-bold text-white">Salvar dados</button><button type="button" onClick={()=>setEditingCompany(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px]">Cancelar</button></div></form>}
              {changingAdminFor===company.id&&<form onSubmit={e=>{e.preventDefault();void updateCompanyAction(company.id,"change-admin",adminChangeForm);}} className="mt-3 grid gap-2 rounded-xl bg-amber-50 p-3 sm:grid-cols-3"><input required value={adminChangeForm.adminNome} onChange={e=>setAdminChangeForm({...adminChangeForm,adminNome:e.target.value})} placeholder="Nome do novo administrador" className="rounded-lg border border-slate-200 px-3 py-2 text-xs"/><input required type="email" value={adminChangeForm.adminEmail} onChange={e=>setAdminChangeForm({...adminChangeForm,adminEmail:e.target.value})} placeholder="E-mail novo administrador" className="rounded-lg border border-slate-200 px-3 py-2 text-xs"/><input required minLength={8} type="password" value={adminChangeForm.senha} onChange={e=>setAdminChangeForm({...adminChangeForm,senha:e.target.value})} placeholder="Senha inicial (mín. 8)" className="rounded-lg border border-slate-200 px-3 py-2 text-xs"/><div className="flex gap-2 sm:col-span-3"><button disabled={companyActionBusy===company.id} className="rounded-lg bg-amber-600 px-3 py-2 text-[11px] font-bold text-white">Confirmar troca</button><button type="button" onClick={()=>setChangingAdminFor(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px]">Cancelar</button></div></form>}
            </div>)}</div>}
          </div>
        </div> : active === "Assinaturas" ? <div className="glass-card rounded-2xl border border-white/70 p-6 shadow-soft"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-800">Assinaturas por assistência</h3><p className="mt-1 text-xs text-slate-500">Planos, ciclos, vencimentos e situação de acesso.</p></div><button onClick={()=>void loadCompanies()} className="rounded-xl border border-slate-200 px-3 py-2 text-xs">Atualizar</button></div>{companiesBusy?<p className="py-8 text-center text-xs text-slate-400">Carregando...</p>:<div className="mt-4 space-y-2">{companies.map((company:any)=><div key={company.id} className="rounded-xl border border-slate-100 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-bold text-slate-800">{company.nome}</div><div className="mt-1 text-xs text-slate-500">{company.planoAtual?.nome||"Sem plano"} · {company.adminEmail}</div><div className="mt-1 text-[11px] text-slate-400">Início: {company.assinaturaAtivadaEm?new Date(company.assinaturaAtivadaEm).toLocaleDateString("pt-BR"):company.trialStartedAt?new Date(company.trialStartedAt).toLocaleDateString("pt-BR"):"—"} · Vencimento: {company.assinaturaVenceEm?new Date(company.assinaturaVenceEm).toLocaleDateString("pt-BR"):company.trialEndsAt?new Date(company.trialEndsAt).toLocaleDateString("pt-BR"):"—"}</div></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">{company.status==="ativa"?"Ativa":company.status==="em_teste"?"Em teste":company.status==="suspensa"?"Suspensa":company.status}</span>{company.status==="em_teste"&&<button type="button" onClick={()=>{setRenewingTrialFor(renewingTrialFor===company.id?null:company.id);setRenewTrialDays("2");}} className="rounded-lg border border-violet-200 px-3 py-2 text-[11px] font-semibold text-violet-700 hover:bg-violet-50">Renovar teste</button>}</div></div>{renewingTrialFor===company.id&&<div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-violet-50/70 p-3"><label className="text-[11px] font-semibold text-slate-600">Adicionar ao teste<select value={renewTrialDays} onChange={e=>setRenewTrialDays(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="2">2 dias</option><option value="3">3 dias</option><option value="5">5 dias</option></select></label><button type="button" disabled={companyActionBusy===company.id} onClick={()=>void updateCompanyAction(company.id,"renew-trial",{days:renewTrialDays})} className="rounded-lg bg-violet-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">{companyActionBusy===company.id?"Renovando...":"Confirmar renovação"}</button><button type="button" onClick={()=>setRenewingTrialFor(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px]">Cancelar</button><p className="basis-full text-[10px] text-slate-500">Os dias serão acrescentados ao vencimento atual. Se o teste já venceu, a contagem começa hoje.</p></div>}</div>)}</div>}</div> : active === "Administradores" ? <div className="glass-card rounded-2xl border border-white/70 p-6 shadow-soft"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold text-slate-800">Administradores das assistências</h3><p className="mt-1 text-xs text-slate-500">Responsáveis e vínculo empresarial de cada conta.</p></div><button onClick={()=>void loadCompanies()} className="rounded-xl border border-slate-200 px-3 py-2 text-xs">Atualizar</button></div>{companiesBusy?<p className="py-8 text-center text-xs text-slate-400">Carregando...</p>:<div className="mt-4 space-y-2">{companies.map((company:any)=><div key={company.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-4"><div><div className="text-sm font-bold text-slate-800">{company.adminNome||"Sem administrador"}</div><div className="mt-1 text-xs text-slate-500">{company.adminEmail}</div><div className="mt-1 text-[11px] text-slate-400">Assistência: {company.nome} · ID: {company.adminUid||"—"}</div></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${company.status==="suspensa"?"bg-rose-50 text-rose-700":"bg-emerald-50 text-emerald-700"}`}>{company.status==="suspensa"?"Acesso suspenso":"Acesso ativo"}</span></div>)}</div>}</div> : <div className="glass-card rounded-2xl border border-white/70 p-8 text-center shadow-soft"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><Settings size={25}/></div><h3 className="text-sm font-bold text-slate-800">Módulo ainda não conectado</h3><p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-500">A tela de {String(active).toLowerCase()} está reservada nesta área administrativa. Vamos implementar a integração com o Firestore antes de habilitar operações reais.</p><span className="mt-4 inline-flex rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-700">Em desenvolvimento</span></div>}
      </div>
    </main>
    {rejectingPaymentId && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget && !billingBusy) setRejectingPaymentId(null); }}>
      <form onSubmit={rejectPayment} role="dialog" aria-modal="true" aria-labelledby="reject-payment-title" className="w-full max-w-lg rounded-2xl border border-white/70 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><AlertCircle size={20}/></div><h3 id="reject-payment-title" className="mt-3 text-base font-bold text-slate-800">Recusar pagamento</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">Informe o motivo para que a assistência saiba o que precisa corrigir antes de enviar outro comprovante.</p></div>
          <button type="button" disabled={billingBusy} onClick={() => setRejectingPaymentId(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" aria-label="Fechar">×</button>
        </div>
        <label className="mt-5 block text-xs font-semibold text-slate-700">Motivo da recusa<textarea autoFocus required minLength={5} maxLength={500} rows={4} value={rejectionReason} onChange={e => { setRejectionReason(e.target.value); setRejectionError(""); }} placeholder="Ex.: valor recebido diferente do valor contratado." className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none transition focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"/></label>
        <div className="mt-1 flex items-center justify-between"><span className="text-[11px] text-slate-400">Mínimo de 5 caracteres.</span><span className="text-[11px] text-slate-400">{rejectionReason.length}/500</span></div>
        {rejectionError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{rejectionError}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={billingBusy} onClick={() => setRejectingPaymentId(null)} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-600 disabled:opacity-50">Cancelar</button><button type="submit" disabled={billingBusy || rejectionReason.trim().length < 5} className="rounded-xl bg-rose-600 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-rose-100 disabled:cursor-not-allowed disabled:opacity-50">{billingBusy ? "Processando..." : "Continuar para recusa"}</button></div>
      </form>
    </div>}
  </div>;
}


export function Dashboard({userRole,orders,openOrders,ready,lowStock,setSection,onOpenOrder,financeData}:any){
 const [proprietario,setProprietario]=useState("");
 useEffect(()=>{let active=true;(async()=>{try{if(!auth?.currentUser)return;const token=await auth.currentUser.getIdToken();const response=await fetch("/api/company/branding",{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});if(!response.ok)return;const result=await response.json();if(active)setProprietario(String(result.branding?.proprietario||""));}catch{}})();return()=>{active=false;};},[]);
 const monthDate=new Date();
 const monthKey=`${monthDate.getFullYear()}-${String(monthDate.getMonth()+1).padStart(2,"0")}`;
 const monthOf=(value:any)=>{
  if(!value)return "";
  if(typeof value==="string"){
   const iso=value.match(/^(\d{4})-(\d{2})/);
   if(iso)return `${iso[1]}-${iso[2]}`;
   const br=value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
   return br?`${br[3]}-${br[2]}`:"";
  }
  const date=value?.toDate?.();
  return date instanceof Date&&!Number.isNaN(date.getTime())?`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`:"";
 };
 const sales=(financeData?.sales||[]).filter((sale:any)=>monthOf(sale.createdAtServer||sale.createdAt)===monthKey);
 const monthOrders=(orders||[]).filter((order:any)=>order.status==="Entregue"&&monthOf(order.deliveredAt||order.createdAt)===monthKey);
 const pdvProfit=sales.reduce((sum:number,sale:any)=>sum+Number(sale.profit||0),0);
 const laborProfit=monthOrders.reduce((sum:number,order:any)=>sum+Number(order.laborProfit??order.laborValue??0),0);
 const partsProfit=monthOrders.reduce((sum:number,order:any)=>sum+Number(order.partsProfit||0),0);
 const monthlyGains=pdvProfit+laborProfit+partsProfit;
 const recentOrders=(orders||[]).slice(0,5);
 const monthLabel=monthDate.toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
 return <div className="space-y-5">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-bold text-slate-800">Olá, {userRole === "superadmin" ? "superadministrador" : (proprietario || "bem-vindo")}! <span>👋</span></h2><p className="mt-1 text-xs text-slate-400">Aqui está o que precisa da sua atenção.</p></div></div>
  <div className="grid gap-3 md:grid-cols-3">
   <button onClick={()=>setSection("Ordens de serviço")} className="glass-card rounded-2xl border border-white/70 p-5 text-left shadow-soft transition hover:-translate-y-0.5"><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">Ordens em andamento</span><span className="rounded-xl bg-violet-50 p-2.5 text-violet-600"><ClipboardList size={19}/></span></div><div className="mt-3 text-2xl font-bold tracking-tight text-slate-800">{openOrders}</div><div className="mt-1 text-[10px] text-slate-400">Aparelhos na assistência</div></button>
   <button onClick={()=>setSection("Ordens de serviço")} className="glass-card rounded-2xl border border-white/70 p-5 text-left shadow-soft transition hover:-translate-y-0.5"><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">Prontos para retirada</span><span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600"><Smartphone size={19}/></span></div><div className="mt-3 text-2xl font-bold tracking-tight text-slate-800">{ready}</div><div className="mt-1 text-[10px] text-slate-400">Aguardando o cliente</div></button>
   <button onClick={()=>setSection("Financeiro")} className="glass-card rounded-2xl border border-white/70 p-5 text-left shadow-soft transition hover:-translate-y-0.5"><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">Ganhos do mês</span><span className="rounded-xl bg-violet-50 p-2.5 text-violet-600"><CircleDollarSign size={19}/></span></div><div className="mt-3 text-2xl font-bold tracking-tight text-violet-700">{money(monthlyGains)}</div><div className="mt-1 text-[10px] text-slate-400">Mão de obra + lucro das peças e PDV · {monthLabel}</div></button>
  </div>
  <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
   <div className="glass-card overflow-hidden rounded-2xl border border-white/70 shadow-soft"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h3 className="text-sm font-bold">Ordens recentes</h3><p className="mt-1 text-[10px] text-slate-400">Últimos aparelhos recebidos na assistência.</p></div><button onClick={()=>setSection("Ordens de serviço")} className="text-[11px] font-bold text-brand-600">Ver todas <ArrowRight size={13} className="ml-1 inline"/></button></div><div className="divide-y divide-slate-100">{recentOrders.length?recentOrders.map((o:ServiceOrder)=><button type="button" key={o.id} onClick={()=>onOpenOrder(o)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Smartphone size={17}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-slate-700">{o.customer}</span><span className="text-[10px] text-slate-400">{o.id}</span></div><div className="mt-1 truncate text-[11px] text-slate-400">{o.device} · {o.issue}</div></div><span className={`hidden rounded-full px-2.5 py-1.5 text-[10px] font-semibold sm:inline-block ${statusStyle[o.status]}`}>{o.status}</span><ChevronRight size={15} className="text-slate-300"/></button>):<div className="px-5 py-10 text-center text-xs text-slate-400">Nenhuma ordem cadastrada ainda.</div>}</div></div>
   <div className="glass-card rounded-2xl border border-white/70 p-5 shadow-soft"><div className="flex items-center gap-2"><Package size={18} className="text-orange-600"/><h3 className="text-sm font-bold">Atenção ao estoque</h3></div>{Number(lowStock)>0?<><p className="mt-3 text-2xl font-bold text-orange-600">{lowStock} {Number(lowStock)===1?"produto":"produtos"}</p><p className="mt-1 text-xs text-slate-500">Atingiram o limite mínimo e precisam de reposição.</p><button onClick={()=>setSection("Estoque")} className="mt-4 text-[11px] font-bold text-brand-600">Ver estoque <ArrowRight size={13} className="ml-1 inline"/></button></>:<div className="mt-4 rounded-xl bg-emerald-50/80 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={17}/> Tudo certo!</div><p className="mt-1 text-xs text-emerald-700/80">Nenhum produto está abaixo do estoque mínimo.</p></div>}<button onClick={()=>setSection("Estoque")} className="mt-4 block text-[11px] font-semibold text-slate-400 hover:text-brand-600">Abrir controle de estoque <ArrowRight size={12} className="ml-1 inline"/></button></div>
  </div>
 </div>;
}
