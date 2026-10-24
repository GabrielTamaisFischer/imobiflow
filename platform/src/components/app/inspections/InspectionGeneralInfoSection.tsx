import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import {
  getMysqlInspectionGeneralInfo,
  updateMysqlInspectionGeneralInfo,
  type MysqlInspection,
  type MysqlInspectionGeneralInfo,
} from "@/product/inspections";
import { getSafeApiErrorMessage } from "@/product/app-access";

const emptyInfo: MysqlInspectionGeneralInfo = {
  keys: {},
  cleaning: {},
  energy: {},
  gas: {},
  water: {},
  dependencies: {},
};

type Props = {
  inspection: MysqlInspection;
  editable: boolean;
  onInspectionChanged: (inspection: MysqlInspection) => void;
  onError: (message: string) => void;
};

function BooleanSelect({ value, onChange, disabled }: { value: boolean | null | undefined; onChange: (value: boolean | null) => void; disabled: boolean }) {
  return (
    <select value={value === true ? "yes" : value === false ? "no" : ""} onChange={(event) => onChange(event.target.value === "yes" ? true : event.target.value === "no" ? false : null)} disabled={disabled} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
      <option value="">Não informado</option>
      <option value="yes">Sim</option>
      <option value="no">Não</option>
    </select>
  );
}

function TextField({ label, value, onChange, disabled, type = "text" }: { label: string; value: string | number | null | undefined; onChange: (value: string) => void; disabled: boolean; type?: "text" | "number" }) {
  return (
    <label className="text-sm font-medium">{label}
      <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
    </label>
  );
}

export function InspectionGeneralInfoSection({ inspection, editable, onInspectionChanged, onError }: Props) {
  const [info, setInfo] = useState<MysqlInspectionGeneralInfo>(emptyInfo);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getMysqlInspectionGeneralInfo(inspection.id)
      .then((result) => { if (!cancelled) setInfo({ ...emptyInfo, ...result.general_info }); })
      .catch((error) => { if (!cancelled) onError(getSafeApiErrorMessage(error, "Não foi possível carregar as informações gerais.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [inspection.id]);

  async function save() {
    if (!editable || saving) return;
    setSaving(true);
    try {
      const result = await updateMysqlInspectionGeneralInfo(inspection.id, inspection.version, info);
      setInfo(result.general_info);
      onInspectionChanged(result.inspection);
    } catch (error) {
      onError(getSafeApiErrorMessage(error, "Não foi possível salvar as informações gerais."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="rounded-lg border border-border bg-card p-4"><p className="flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando informações gerais...</p></section>;

  return (
    <section className="space-y-5 rounded-lg border border-border bg-card p-4">
      <div><h2 className="text-lg font-semibold">Informações gerais</h2><p className="text-sm text-muted-foreground">Registre chaves, limpeza, abastecimentos, leituras e observações que farão parte do laudo.</p></div>

      <div className="space-y-3"><h3 className="font-semibold">Chaves</h3><div className="grid gap-3 md:grid-cols-3">
        <TextField label="Tipo" value={info.keys.type} disabled={!editable} onChange={(value) => setInfo((current) => ({ ...current, keys: { ...current.keys, type: value || null } }))} />
        <TextField label="Quantidade" type="number" value={info.keys.quantity} disabled={!editable} onChange={(value) => setInfo((current) => ({ ...current, keys: { ...current.keys, quantity: value === "" ? null : Number(value) } }))} />
        <TextField label="Local de entrada" value={info.keys.entry_location} disabled={!editable} onChange={(value) => setInfo((current) => ({ ...current, keys: { ...current.keys, entry_location: value || null } }))} />
      </div></div>

      <div className="space-y-2"><h3 className="font-semibold">Faxina</h3><textarea rows={3} value={info.cleaning.description ?? ""} onChange={(event) => setInfo((current) => ({ ...current, cleaning: { description: event.target.value || null } }))} disabled={!editable} placeholder="Ex.: imóvel faxinado, sem pintura recente..." className="w-full rounded-md border border-input bg-background p-3 text-sm" /></div>

      <div className="space-y-3"><h3 className="font-semibold">Medidores de energia</h3><div className="grid gap-3 md:grid-cols-4">
        <TextField label="Descrição do abastecimento" value={info.energy.supply_description} disabled={!editable} onChange={(value) => setInfo((current) => ({ ...current, energy: { ...current.energy, supply_description: value || null } }))} />
        <TextField label="Compartilhamento" value={info.energy.sharing} disabled={!editable} onChange={(value) => setInfo((current) => ({ ...current, energy: { ...current.energy, sharing: value || null } }))} />
        <label className="text-sm font-medium">Disjuntores ligados<BooleanSelect value={info.energy.breakers_on} disabled={!editable} onChange={(value) => setInfo((current) => ({ ...current, energy: { ...current.energy, breakers_on: value } }))} /></label>
        <TextField label="Leitura" value={info.energy.reading} disabled={!editable} onChange={(value) => setInfo((current) => ({ ...current, energy: { ...current.energy, reading: value || null } }))} />
      </div></div>

      <div className="space-y-3"><h3 className="font-semibold">Medidores de gás</h3><div className="grid gap-3 md:grid-cols-4">
        <label className="text-sm font-medium">Registros fechados<BooleanSelect value={info.gas.registers_closed} disabled={!editable} onChange={(value) => setInfo((current) => ({ ...current, gas: { ...current.gas, registers_closed: value } }))} /></label>
        <TextField label="Descrição do abastecimento" value={info.gas.supply_description} disabled={!editable} onChange={(value) => setInfo((current) => ({ ...current, gas: { ...current.gas, supply_description: value || null } }))} />
        <TextField label="Compartilhamento" value={info.gas.sharing} disabled={!editable} onChange={(value) => setInfo((current) => ({ ...current, gas: { ...current.gas, sharing: value || null } }))} />
        <TextField label="Leitura" value={info.gas.reading} disabled={!editable} onChange={(value) => setInfo((current) => ({ ...current, gas: { ...current.gas, reading: value || null } }))} />
      </div></div>

      <div className="space-y-3"><h3 className="font-semibold">Medidores de água</h3><div className="grid gap-3 md:grid-cols-4">
        <label className="text-sm font-medium">Registros fechados<BooleanSelect value={info.water.registers_closed} disabled={!editable} onChange={(value) => setInfo((current) => ({ ...current, water: { ...current.water, registers_closed: value } }))} /></label>
        <TextField label="Descrição do abastecimento" value={info.water.supply_description} disabled={!editable} onChange={(value) => setInfo((current) => ({ ...current, water: { ...current.water, supply_description: value || null } }))} />
        <TextField label="Compartilhamento" value={info.water.sharing} disabled={!editable} onChange={(value) => setInfo((current) => ({ ...current, water: { ...current.water, sharing: value || null } }))} />
        <TextField label="Leitura" value={info.water.reading} disabled={!editable} onChange={(value) => setInfo((current) => ({ ...current, water: { ...current.water, reading: value || null } }))} />
      </div></div>

      <div className="space-y-2"><h3 className="font-semibold">Dependências e observações gerais</h3><textarea rows={4} value={info.dependencies.notes ?? ""} onChange={(event) => setInfo((current) => ({ ...current, dependencies: { notes: event.target.value || null } }))} disabled={!editable} placeholder="Ex.: vistoria acompanhada pelo corretor; chaves retiradas e devolvidas no local..." className="w-full rounded-md border border-input bg-background p-3 text-sm" /></div>

      {editable ? <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar informações gerais</button> : null}
    </section>
  );
}
