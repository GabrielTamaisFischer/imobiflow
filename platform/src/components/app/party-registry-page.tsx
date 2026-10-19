import { Loader2, Plus, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { formatBrazilianDocument, isValidBrazilianDocument } from "@/product/brazilian-document";
import { getModuleByKey } from "@/product/app-modules";
import { formatCep, formatCreci, formatInternationalPhone, normalizePhoneForStorage, phoneHint } from "@/product/registration-format";
import {
  createRegistration,
  listRegistrations,
  lookupRegistrationCep,
  lookupRegistrationDocument,
  uploadBrokerPhoto,
  type PartyRegistration,
  type RegistrationInput,
  type RegistrationRole,
} from "@/product/registrations";
import { useSessionGuard } from "@/product/use-session-guard";

type RegistryConfig = {
  role: RegistrationRole;
  moduleKey: "buyers" | "tenants" | "brokers";
  singular: string;
  plural: string;
  description: string;
  emptyDescription: string;
};

const fieldClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

export function PartyRegistryPage({ config }: { config: RegistryConfig }) {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey(config.moduleKey);
  const [items, setItems] = useState<PartyRegistration[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoadingItems(true);
    setError(null);
    try {
      const response = await listRegistrations(config.role);
      setItems(response.registrations);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Não foi possível carregar ${config.plural.toLowerCase()}.`);
    } finally {
      setLoadingItems(false);
    }
  }

  useEffect(() => {
    if (!isLoading && session) void refresh();
  }, [isLoading, session, config.role]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.party.name, item.party.document, item.party.email, item.party.phone, item.party.whatsapp, item.profile?.creci_number]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [items, search]);

  if (isLoading) return <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Validando acesso...</main>;

  return (
    <ModulePage session={session} module={module}>
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-semibold">Cadastro de {config.plural.toLowerCase()}</p><p className="text-sm text-muted-foreground">{config.description}</p></div>
        <button type="button" onClick={() => setShowForm((current) => !current)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"><Plus className="h-4 w-4" />Novo {config.singular.toLowerCase()}</button>
      </div>

      {showForm ? <RegistrationForm role={config.role} singular={config.singular} onCancel={() => setShowForm(false)} onCreated={(registration) => { setItems((current) => current.some((item) => item.id === registration.id) ? current.map((item) => item.id === registration.id ? registration : item) : [registration, ...current]); setShowForm(false); }} /> : null}

      {error ? <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div> : null}

      {items.length ? <div className="mb-4 rounded-lg border border-border bg-card p-4"><label className="relative block"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Pesquisar ${config.singular.toLowerCase()} por nome, documento, contato${config.role === "broker" ? " ou CRECI" : ""}`} className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label></div> : null}

      {loadingItems ? <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando {config.plural.toLowerCase()}...</section>
      : items.length === 0 ? <EmptyState icon={UserRound} title={`Nenhum ${config.singular.toLowerCase()} cadastrado`} description={config.emptyDescription} actionLabel={`Cadastrar ${config.singular.toLowerCase()}`} onAction={() => setShowForm(true)} />
      : filtered.length === 0 ? <EmptyState icon={UserRound} title="Nenhum cadastro encontrado" description="Ajuste a pesquisa para localizar o cadastro desejado." />
      : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((item) => <RegistrationCard key={item.id} item={item} />)}</section>}
    </ModulePage>
  );
}

function RegistrationForm({ role, singular, onCancel, onCreated }: { role: RegistrationRole; singular: string; onCancel: () => void; onCreated: (registration: PartyRegistration) => void; }) {
  const [saving, setSaving] = useState(false);
  const [lookupStatus, setLookupStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function documentLookup(input: HTMLInputElement) {
    const digits = input.value.replace(/\D/g, "");
    if (![11,14].includes(digits.length)) return;
    const form = input.form; if (!form) return;
    const partyType = digits.length === 14 ? "company" : "individual";
    setFormValue(form, "party_type", partyType);
    if (!isValidBrazilianDocument(input.value, partyType)) return;
    setLookupStatus("Consultando documento...");
    try {
      const result = await lookupRegistrationDocument(input.value);
      if (result.type === "cpf" && result.party) {
        applyParty(form, result.party);
        setLookupStatus("CPF já cadastrado nesta imobiliária: dados reaproveitados.");
      } else if (result.type === "cnpj" && result.company) {
        setFormValue(form, "name", result.company.name);
        setFormValue(form, "email", result.company.email);
        if (result.company.phone) setFormValue(form, "phone", formatInternationalPhone(result.company.phone));
        applyAddress(form, result.company.address);
        setLookupStatus("Dados empresariais preenchidos pelo CNPJ. Confira antes de salvar.");
      } else {
        setLookupStatus("Documento válido. Nenhum cadastro existente encontrado nesta imobiliária.");
      }
    } catch (err) {
      setLookupStatus(err instanceof Error ? err.message : "Não foi possível consultar o documento.");
    }
  }

  async function cepLookup(input: HTMLInputElement) {
    const digits=input.value.replace(/\D/g,""); if(digits.length!==8) return;
    const form=input.form; if(!form) return;
    setLookupStatus("Consultando CEP...");
    try {
      const result=await lookupRegistrationCep(input.value);
      applyAddress(form,result.address);
      setLookupStatus(`CEP localizado${result.address.ddd ? ` · DDD ${result.address.ddd}` : ""}. Confira o endereço e informe número/complemento quando necessário.`);
    } catch(err){setLookupStatus(err instanceof Error?err.message:"Não foi possível consultar o CEP.");}
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const element=event.currentTarget; const form=new FormData(element);
    const input: RegistrationInput={
      name:String(form.get("name")??"").trim(),
      party_type:String(form.get("party_type")??"individual")==="company"?"company":"individual",
      document:String(form.get("document")??"").trim(),
      rg:String(form.get("rg")??"").trim(),
      nationality:String(form.get("nationality")??"").trim(),
      occupation:String(form.get("occupation")??"").trim(),
      email:String(form.get("email")??"").trim(),
      phone:normalizePhoneForStorage(String(form.get("phone")??"").trim()),
      whatsapp:normalizePhoneForStorage(String(form.get("whatsapp")??"").trim()),
      address_json:{zip_code:String(form.get("zip_code")??"").trim(),street:String(form.get("street")??"").trim(),number:String(form.get("number")??"").trim(),complement:String(form.get("complement")??"").trim(),neighborhood:String(form.get("neighborhood")??"").trim(),city:String(form.get("city")??"").trim(),state:String(form.get("state")??"").trim(),country:String(form.get("country")??"Brasil").trim()},
    };
    if(role==="broker"){input.creci_number=String(form.get("creci_number")??"").trim();input.job_title=String(form.get("job_title")??"").trim();input.bio_text=String(form.get("bio_text")??"").trim();input.access_email=String(form.get("access_email")??"").trim();input.access_password=String(form.get("access_password")??"");}
    try{
      const response=await createRegistration(role,input);
      const photo=form.get("photo");
      if(role==="broker" && photo instanceof File && photo.size>0){
        const uploaded=await uploadBrokerPhoto(response.registration.id,photo);
        response.registration.profile={...(response.registration.profile ?? {id:"",created_at:new Date().toISOString(),updated_at:new Date().toISOString()}),photo_url:uploaded.photo_url};
      }
      onCreated(response.registration); element.reset();
    }catch(err){setError(err instanceof Error?err.message:"Não foi possível salvar o cadastro.");}
    finally{setSaving(false);}
  }

  return <form onSubmit={submit} className="mb-4 rounded-lg border border-border bg-card p-4">
    <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Novo {singular.toLowerCase()}</h2><p className="text-sm text-muted-foreground">Dados civis padronizados e isolados por imobiliária.</p></div><button type="button" onClick={onCancel} className="h-9 rounded-md border border-border px-3 text-sm font-medium">Cancelar</button></div>

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {role==="broker"?<label className="space-y-1 text-sm md:col-span-2 xl:col-span-3"><span className="font-medium">Foto do corretor</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="block w-full rounded-md border border-input bg-background p-2 text-sm" /><span className="block text-xs text-muted-foreground">JPG, PNG, WebP ou AVIF, até 5 MB.</span></label>:null}
      <Field label="Nome / Razão social" name="name" required />
      <label className="space-y-1 text-sm"><span className="font-medium">Tipo de pessoa</span><select name="party_type" className={fieldClass}><option value="individual">Pessoa física</option><option value="company">Pessoa jurídica</option></select></label>
      <Field label="CPF / CNPJ" name="document" inputMode="numeric" onInput={(input)=>{input.value=formatBrazilianDocument(input.value);}} onBlur={documentLookup} />
      <Field label="RG" name="rg" />
      <Field label="Nacionalidade" name="nationality" defaultValue="Brasileira" />
      <Field label={role==="broker"?"Profissão / especialidade":"Profissão / ocupação atual"} name="occupation" />
      <Field label="E-mail pessoal" name="email" type="email" />
      <PhoneField label="Telefone" name="phone" />
      <PhoneField label="WhatsApp" name="whatsapp" />
      {role==="broker"?<>
        <Field label="CRECI" name="creci_number" onInput={(input)=>{input.value=formatCreci(input.value);}} />
        <Field label="Cargo" name="job_title" placeholder="Ex.: Corretor de imóveis" />
        <Field label="E-mail corporativo / acesso" name="access_email" type="email" />
        <Field label="Senha de acesso" name="access_password" type="password" placeholder="Mín. 12 caracteres, maiúscula, número e símbolo" />
        <label className="space-y-1 text-sm md:col-span-2 xl:col-span-3"><span className="font-medium">Bio profissional</span><textarea name="bio_text" rows={3} className="w-full rounded-md border border-input bg-background p-3 text-sm" /></label>
      </>:null}
      <Field label="CEP" name="zip_code" inputMode="numeric" onInput={(input)=>{input.value=formatCep(input.value);if(input.value.replace(/\D/g,"").length===8) void cepLookup(input);}} onBlur={cepLookup} />
      <Field label="Logradouro" name="street" />
      <Field label="Número" name="number" />
      <Field label="Complemento" name="complement" />
      <Field label="Bairro" name="neighborhood" />
      <Field label="Cidade" name="city" />
      <Field label="UF" name="state" maxLength={2} />
      <Field label="País" name="country" defaultValue="Brasil" />
    </div>

    {lookupStatus?<p className="mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">{lookupStatus}</p>:null}
    {error?<p className="mt-3 text-sm text-destructive">{error}</p>:null}
    <div className="mt-4 flex justify-end"><button type="submit" disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Plus className="h-4 w-4"/>}Salvar {singular.toLowerCase()}</button></div>
  </form>;
}

function Field({label,name,type="text",required,placeholder,inputMode,maxLength,defaultValue,onInput,onBlur}:{label:string;name:string;type?:string;required?:boolean;placeholder?:string;inputMode?:React.HTMLAttributes<HTMLInputElement>["inputMode"];maxLength?:number;defaultValue?:string;onInput?:(input:HTMLInputElement)=>void;onBlur?:(input:HTMLInputElement)=>void}){
 return <label className="space-y-1 text-sm"><span className="font-medium">{label}</span><input name={name} type={type} required={required} placeholder={placeholder} inputMode={inputMode} maxLength={maxLength} defaultValue={defaultValue} onInput={(e)=>onInput?.(e.currentTarget)} onBlur={(e)=>void onBlur?.(e.currentTarget)} className={fieldClass}/></label>;
}
function PhoneField({label,name}:{label:string;name:string}){
 const [hint,setHint]=useState("");
 return <label className="space-y-1 text-sm"><span className="font-medium">{label}</span><input name={name} type="tel" inputMode="tel" placeholder="(11) 99999-9999" onInput={(e)=>{e.currentTarget.value=formatInternationalPhone(e.currentTarget.value);setHint(phoneHint(e.currentTarget.value));}} className={fieldClass}/><span className="block min-h-4 text-xs text-muted-foreground">{hint||"Digite DDD + número"}</span></label>;
}
function setFormValue(form:HTMLFormElement,name:string,value:string){const field=form.elements.namedItem(name);if(field instanceof HTMLInputElement||field instanceof HTMLSelectElement||field instanceof HTMLTextAreaElement){field.value=value;field.dispatchEvent(new Event("input",{bubbles:true}));}}
function applyAddress(form:HTMLFormElement,address:Record<string,string>){for(const field of ["zip_code","street","number","complement","neighborhood","city","state","country"]) if(address[field]) setFormValue(form,field,field==="zip_code"?formatCep(address[field]):address[field]);}
function applyParty(form:HTMLFormElement,party:PartyRegistration["party"]){setFormValue(form,"name",party.name);setFormValue(form,"party_type",party.party_type);setFormValue(form,"rg",party.rg??"");setFormValue(form,"nationality",party.nationality??"");setFormValue(form,"occupation",party.occupation??"");setFormValue(form,"email",party.email??"");setFormValue(form,"phone",party.phone?formatInternationalPhone(party.phone):"");setFormValue(form,"whatsapp",party.whatsapp?formatInternationalPhone(party.whatsapp):"");applyAddress(form,Object.fromEntries(Object.entries(party.address_json??{}).filter(([,v])=>typeof v==="string")) as Record<string,string>);}
function RegistrationCard({item}:{item:PartyRegistration}){const {party,profile,role,linked_users:linkedUsers}=item;const roleLabel=role==="buyer"?"Comprador":role==="tenant"?"Inquilino":"Corretor";return <article className="rounded-lg border border-border bg-card p-4"><div className="flex items-start gap-3">{profile?.photo_url?<img src={profile.photo_url} alt="" className="h-12 w-12 rounded-full object-cover"/>:<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><UserRound className="h-5 w-5"/></div>}<div className="min-w-0"><h2 className="truncate text-sm font-semibold">{party.name}</h2><p className="mt-1 text-xs text-muted-foreground">{roleLabel} · {party.party_type==="company"?"Pessoa jurídica":"Pessoa física"}</p></div></div><div className="mt-4 space-y-1 text-sm text-muted-foreground">{party.document?<p className="truncate">Documento: {formatBrazilianDocument(party.document)}</p>:null}{party.whatsapp||party.phone?<p className="truncate">Contato: {formatInternationalPhone(party.whatsapp||party.phone||"")}</p>:null}{party.email?<p className="truncate">E-mail: {party.email}</p>:null}{profile?.creci_number?<p className="truncate">CRECI: {formatCreci(profile.creci_number)}</p>:null}{profile?.job_title?<p className="truncate">Cargo: {profile.job_title}</p>:null}</div>{role==="broker"?<div className="mt-4 rounded-md border border-border bg-background p-3"><p className="text-xs font-semibold">Acesso à plataforma</p><p className="mt-1 text-xs text-muted-foreground">{linkedUsers.length?linkedUsers.map((u)=>`${u.email} · ${u.status}`).join(" | "):"Sem usuário de acesso vinculado."}</p></div>:null}</article>;}
