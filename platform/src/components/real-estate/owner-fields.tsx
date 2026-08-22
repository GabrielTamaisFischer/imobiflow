import { useRef, useState } from "react";
import {
  formatBrazilianDocument,
  isValidBrazilianDocument,
} from "@/product/brazilian-document";
import type { PropertyOwner } from "@/product/real-estate";

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

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 6000);
    setCepStatus("loading");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal });
      if (!response.ok) throw new Error("CEP indisponível");
      const data = await response.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (data.erro) throw new Error("CEP não encontrado");
      const form = input.form;
      if (!form) return;
      setFormValue(form, name("street"), data.logradouro ?? "");
      setFormValue(form, name("neighborhood"), data.bairro ?? "");
      setFormValue(form, name("city"), data.localidade ?? "");
      setFormValue(form, name("state"), data.uf ?? "");
      setFormValue(form, name("country"), "Brasil");
      setCepStatus("found");
      const numberField = form.elements.namedItem(name("number"));
      if (numberField instanceof HTMLElement) numberField.focus();
    } catch {
      if (!controller.signal.aborted) setCepStatus("error");
    } finally {
      window.clearTimeout(timeout);
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

function OwnerField({ name, label, type = "text", required, defaultValue, inputMode, maxLength, format, onInput }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; maxLength?: number; format?: "phone"; onInput?: (input: HTMLInputElement) => void }) {
  return <label className="space-y-1 text-sm"><span className="font-medium">{label}</span><input name={name} type={type} required={required} defaultValue={defaultValue} inputMode={inputMode} maxLength={maxLength} onInput={(event) => { if (format === "phone") event.currentTarget.value = formatPhone(event.currentTarget.value); onInput?.(event.currentTarget); }} className={fieldClass} /></label>;
}

function setFormValue(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLInputElement) field.value = value;
}

function formatCep(value: string) {
  return value.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits.length <= 10
    ? digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2")
    : digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}
