import { useRef, useState } from "react";
import {
  formatBrazilianDocument,
  isValidBrazilianDocument,
} from "@/product/brazilian-document";
import type { PropertyOwner } from "@/product/real-estate";
import { formatCep, formatInternationalPhone, phoneHint } from "@/product/registration-format";
import { lookupRegistrationCep, lookupRegistrationDocument } from "@/product/registrations";

const fieldClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

type OwnerDefaults = Partial<PropertyOwner>;

export function OwnerFields({
  prefix = "",
  defaults,
  nameRequired = true,
}: {
  prefix?: string;
  defaults?: OwnerDefaults;
  nameRequired?: boolean;
}) {
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "found" | "error">("idle");
  const abortRef = useRef<AbortController | null>(null);
  const address = defaults?.address_json ?? {};
  const name = (field: string) => `${prefix}${field}`;
  const addressValue = (field: string) => typeof address[field] === "string" ? String(address[field]) : "";

  async function lookupCep(input: HTMLInputElement) {
    const cep = input.value.replace(/\D/g, "");
    if (cep.length !== 8) {
      setCepStatus(cep.length ? "error" : "idle");
      return;
    }
    setCepStatus("loading");
    try {
      const { address: data } = await lookupRegistrationCep(input.value);
      const form = input.form;
      if (!form) return;
      setFormValue(form, name("street"), data.street ?? "");
      setFormValue(form, name("neighborhood"), data.neighborhood ?? "");
      setFormValue(form, name("city"), data.city ?? "");
      setFormValue(form, name("state"), data.state ?? "");
      setFormValue(form, name("country"), data.country ?? "Brasil");
      setCepStatus("found");
      const numberField = form.elements.namedItem(name("number"));
      if (numberField instanceof HTMLElement) numberField.focus();
    } catch {
      setCepStatus("error");
    }
  }

  async function lookupDocument(input: HTMLInputElement) {
    const digits = input.value.replace(/\D/g, "");
    if (![11, 14].includes(digits.length)) return;
    try {
      const result = await lookupRegistrationDocument(input.value);
      const form = input.form;
      if (!form) return;
      if (result.type === "cpf" && result.party) {
        setFormValue(form, name("name"), result.party.name);
      }
      if (result.type === "cnpj" && result.company) {
        setFormValue(form, name("name"), result.company.name);
        if (result.company.email) setFormValue(form, name("email"), result.company.email);
        if (result.company.phone) setFormValue(form, name("phone"), formatInternationalPhone(result.company.phone));
        for (const field of ["zip_code","street","number","complement","neighborhood","city","state","country"]) {
          const value = result.company.address[field];
          if (value) setFormValue(form, name(field), field === "zip_code" ? formatCep(value) : value);
        }
      }
    } catch {
      // lookup assistido: validação local continua sendo a fonte para permitir salvar.
    }
  }

  return (
    <>
      <OwnerSelect name={name("owner_type")} label="Pessoa" defaultValue={defaults?.owner_type ?? "individual"} options={[["individual", "Pessoa física"], ["company", "Pessoa jurídica"]]} />
      <OwnerSelect name={name("client_type")} label="Tipo de cliente" defaultValue={defaults?.client_type ?? "proprietario"} options={[["proprietario", "Proprietário"], ["comprador", "Comprador"], ["construtor", "Construtor"], ["investidor", "Investidor"], ["locatario", "Locatário"]]} />
      <OwnerField name={name("name")} label="Nome" required={nameRequired} defaultValue={defaults?.name ?? ""} />
      <OwnerField
        name={name("document")}
        label="CPF/CNPJ"
        defaultValue={defaults?.document ? formatBrazilianDocument(defaults.document) : ""}
        inputMode="numeric"
        onInput={(input) => {
          input.value = formatBrazilianDocument(input.value);
          const form = input.form;
          const ownerType = form?.elements.namedItem(name("owner_type")) instanceof HTMLSelectElement
            ? (form.elements.namedItem(name("owner_type")) as HTMLSelectElement).value as "individual" | "company"
            : undefined;
          input.setCustomValidity(isValidBrazilianDocument(input.value, ownerType) ? "" : "Informe um CPF ou CNPJ válido.");
        }}
        onBlur={(input) => void lookupDocument(input)}
      />
      <OwnerField name={name("email")} label="E-mail" type="email" defaultValue={defaults?.email ?? ""} />
      <OwnerField name={name("phone")} label="Telefone" inputMode="tel" defaultValue={defaults?.phone ?? ""} format="phone" />
      <OwnerField name={name("whatsapp")} label="WhatsApp" inputMode="tel" defaultValue={defaults?.whatsapp ?? ""} format="phone" />
      <OwnerField name={name("residential_phone")} label="Telefone residencial" inputMode="tel" defaultValue={defaults?.residential_phone ?? ""} format="phone" />
      <OwnerField name={name("commercial_phone")} label="Telefone comercial" inputMode="tel" defaultValue={defaults?.commercial_phone ?? ""} format="phone" />
      <label className="space-y-1 text-sm">
        <span className="font-medium">CEP</span>
        <input
          name={name("zip_code")}
          defaultValue={addressValue("zip_code")}
          inputMode="numeric"
          maxLength={9}
          onInput={(event) => {
            event.currentTarget.value = formatCep(event.currentTarget.value);
            if (event.currentTarget.value.replace(/\D/g, "").length === 8) void lookupCep(event.currentTarget);
          }}
          onBlur={(event) => void lookupCep(event.currentTarget)}
          className={fieldClass}
        />
        <span className={`block text-xs ${cepStatus === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {cepStatus === "loading" ? "Consultando CEP…" : cepStatus === "found" ? "Endereço encontrado. Confira e informe o número." : cepStatus === "error" ? "CEP não encontrado. Preencha o endereço manualmente." : "Preenchimento automático opcional."}
        </span>
      </label>
      <OwnerField name={name("street")} label="Logradouro" defaultValue={addressValue("street")} />
      <OwnerField name={name("number")} label="Número" defaultValue={addressValue("number")} />
      <OwnerField name={name("complement")} label="Complemento" defaultValue={addressValue("complement")} />
      <OwnerField name={name("neighborhood")} label="Bairro" defaultValue={addressValue("neighborhood")} />
      <OwnerField name={name("city")} label="Cidade" defaultValue={addressValue("city")} />
      <OwnerField name={name("state")} label="UF" maxLength={2} defaultValue={addressValue("state")} />
      <OwnerField name={name("country")} label="País" defaultValue={addressValue("country") || "Brasil"} />
      <label className="space-y-1 text-sm md:col-span-2 xl:col-span-3">
        <span className="font-medium">Observações</span>
        <textarea name={name("notes")} rows={3} defaultValue={defaults?.notes ?? ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </label>
    </>
  );
}

function OwnerSelect({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: string[][] }) {
  return <label className="space-y-1 text-sm"><span className="font-medium">{label}</span><select name={name} defaultValue={defaultValue} className={fieldClass}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
}

function OwnerField({ name, label, type = "text", required, defaultValue, inputMode, maxLength, format, onInput, onBlur }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; maxLength?: number; format?: "phone"; onInput?: (input: HTMLInputElement) => void; onBlur?: (input: HTMLInputElement) => void }) {
  const [hint, setHint] = useState("");
  return <label className="space-y-1 text-sm"><span className="font-medium">{label}</span><input name={name} type={type} required={required} defaultValue={defaultValue} inputMode={inputMode} maxLength={maxLength} onInput={(event) => { if (format === "phone") { event.currentTarget.value = formatInternationalPhone(event.currentTarget.value); setHint(phoneHint(event.currentTarget.value)); } onInput?.(event.currentTarget); }} onBlur={(event) => onBlur?.(event.currentTarget)} className={fieldClass} />{format === "phone" ? <span className="block min-h-4 text-xs text-muted-foreground">{hint || "Código do país + DDD + número"}</span> : null}</label>;
}

function setFormValue(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLInputElement) field.value = value;
}

