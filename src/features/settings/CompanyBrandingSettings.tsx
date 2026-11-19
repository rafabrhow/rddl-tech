"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { User } from "firebase/auth";
import { Building2, ImagePlus, Loader2, Palette, Save, Trash2, UploadCloud } from "lucide-react";
import { maskPhone, maskCpfCnpj } from "@/lib/input-masks";

type Props = { user: User | null };
type BrandingData = { proprietario: string; nomeFantasia: string; telefone: string; documento: string; endereco: string; corPrincipal: string; logoDataUrl: string; logoFileId?: string; logoName?: string };
const initialData: BrandingData = { proprietario: "", nomeFantasia: "", telefone: "", documento: "", endereco: "", corPrincipal: "#f47721", logoDataUrl: "" };
const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const allowedTypes = ["image/png", "image/jpeg", "image/webp"];

export function CompanyBrandingSettings({ user }: Props) {
  const [data, setData] = useState<BrandingData>(initialData);
  const [file, setFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user) { setError("Entre novamente para carregar as configurações da assistência."); setLoading(false); return; }
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/company/branding", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Não foi possível carregar as configurações.");
        if (active) setData({ ...initialData, ...(result.branding || {}), documento: maskCpfCnpj(result.branding?.documento || result.branding?.cnpj || result.branding?.cpf || ""), telefone: maskPhone(result.branding?.telefone || "") });
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Não foi possível carregar as configurações."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [user]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] || null; setError(""); setMessage(""); if (!selected) return;
    if (!allowedTypes.includes(selected.type)) { setError("Formato inválido. Envie uma imagem PNG, JPG ou WebP."); event.target.value = ""; return; }
    if (selected.size > MAX_LOGO_SIZE) { setError("A imagem deve ter no máximo 2 MB."); event.target.value = ""; return; }
    setFile(selected); setRemoveLogo(false);
  }

  async function handleSave() {
    if (!user) { setError("Sua sessão expirou. Entre novamente."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      const token = await user.getIdToken(true);
      const form = new FormData();
      form.set("proprietario", data.proprietario); form.set("nomeFantasia", data.nomeFantasia); form.set("telefone", data.telefone); form.set("documento", data.documento);
      form.set("endereco", data.endereco); form.set("corPrincipal", data.corPrincipal); form.set("removeLogo", String(removeLogo));
      if (file) form.set("logo", file);
      const response = await fetch("/api/company/branding", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a personalização.");
      setData({ ...initialData, ...result.branding }); setFile(null); setRemoveLogo(false); if (inputRef.current) inputRef.current.value = "";
      setMessage("Personalização salva com sucesso.");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar a personalização."); }
    finally { setSaving(false); }
  }

  const localPreview = file ? URL.createObjectURL(file) : "";
  const previewUrl = localPreview || (removeLogo ? "" : data.logoDataUrl);
  if (loading) return <div className="glass-card rounded-2xl p-8 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin"/>Carregando personalização...</div>;

  return <section className="space-y-5">
    <div><h2 className="text-xl font-bold text-slate-800">Personalização da assistência</h2><p className="mt-1 text-xs text-slate-500">Adicione a identidade visual da sua empresa. Essas configurações são exclusivas da sua assistência.</p></div>
    <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <div className="glass-card rounded-2xl border border-white/70 p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800"><Building2 size={18} className="text-orange-500"/> Dados comerciais</div>
        <div className="space-y-4">
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Proprietário</span><input value={data.proprietario} onChange={e=>setData({...data,proprietario:e.target.value})} placeholder="Nome do proprietário" maxLength={120} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-orange-400"/></label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Nome fantasia</span><input value={data.nomeFantasia} onChange={e=>setData({...data,nomeFantasia:e.target.value})} placeholder="Ex.: Teixa Cell" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-orange-400"/></label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Telefone / WhatsApp</span><input inputMode="tel" value={data.telefone} onChange={e=>setData({...data,telefone:maskPhone(e.target.value)})} placeholder="(00) 00000-0000" maxLength={15} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-orange-400"/></label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">CPF / CNPJ</span><input inputMode="numeric" value={data.documento} onChange={e=>setData({...data,documento:maskCpfCnpj(e.target.value)})} placeholder="000.000.000-00 ou 00.000.000/0000-00" maxLength={18} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-orange-400"/></label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Endereço</span><input value={data.endereco} onChange={e=>setData({...data,endereco:e.target.value})} placeholder="Rua, número, bairro e cidade" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-orange-400"/></label>
        </div>
      </div>
      <div className="glass-card rounded-2xl border border-white/70 p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800"><ImagePlus size={18} className="text-orange-500"/> Logo da assistência</div>
        <div className="flex min-h-40 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-4">{previewUrl ? <img src={previewUrl} alt="Pré-visualização da logo da assistência" className="max-h-36 max-w-full object-contain"/> : <div className="text-center text-slate-400"><UploadCloud size={30} className="mx-auto mb-2"/><p className="text-xs">Nenhuma logo selecionada</p></div>}</div>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} className="hidden"/>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>inputRef.current?.click()} className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-orange-600">Escolher imagem</button>{(data.logoDataUrl || file) && <button type="button" onClick={()=>{setFile(null);setRemoveLogo(true);if(inputRef.current)inputRef.current.value="";}} className="rounded-xl border border-rose-200 px-4 py-2.5 text-xs font-semibold text-rose-600"><Trash2 size={14} className="mr-1 inline"/>Remover logo</button>}</div>
        <p className="mt-2 text-[11px] text-slate-400">PNG, JPG ou WebP. Tamanho máximo: 2 MB. Armazenamento privado no Google Drive.</p>
      </div>
      <div className="glass-card rounded-2xl border border-white/70 p-5 shadow-soft xl:col-span-2"><div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800"><Palette size={18} className="text-orange-500"/> Cor principal</div><div className="flex flex-wrap items-center gap-4"><input type="color" aria-label="Escolher cor principal" value={data.corPrincipal} onChange={e=>setData({...data,corPrincipal:e.target.value})} className="h-11 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"/><span className="text-xs text-slate-500">{data.corPrincipal.toUpperCase()}</span><div className="ml-auto rounded-xl px-5 py-3 text-xs font-bold text-white" style={{backgroundColor:data.corPrincipal}}>Prévia da cor</div></div><p className="mt-2 text-[11px] text-slate-400">A cor é salva para aplicação progressiva na identidade visual da assistência.</p></div>
    </div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}{message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{message}</div>}
    <div className="flex justify-end"><button type="button" disabled={saving || !data.nomeFantasia.trim()} onClick={handleSave} className="flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-orange-100 disabled:cursor-not-allowed disabled:opacity-50"><Save size={15}/>{saving ? "Salvando..." : "Salvar personalização"}</button></div>
  </section>;
}
