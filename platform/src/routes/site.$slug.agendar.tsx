import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, Clock3, Loader2, MapPin } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPublicBooking, getPublicBooking, type PublicBookingResponse } from "@/product/public-booking";

export const Route = createFileRoute("/site/$slug/agendar")({ component: PublicBookingPage });

function PublicBookingPage() {
  const { slug } = Route.useParams();
  const [date, setDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [data, setData] = useState<PublicBookingResponse | null>(null);
  const [pageId, setPageId] = useState(() => new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("page") ?? "");
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [selectedSlot, setSelectedSlot] = useState<PublicBookingResponse["slots"][number] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("page") ?? "";
    setPageId(value);
  }, []);

  useEffect(() => {
    if (!pageId || !date) return;
    setLoading(true);
    setStatus(null);
    void getPublicBooking(slug, pageId, date)
      .then(setData)
      .catch((error) => setStatus(error instanceof Error ? error.message : "Página indisponível."))
      .finally(() => setLoading(false));
  }, [date, pageId, slug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !selectedSlot) return;
    setLoading(true);
    setStatus(null);
    try {
      await createPublicBooking(slug, data.page.id, { ...form, starts_at: selectedSlot.starts_at, ends_at: selectedSlot.ends_at });
      setStatus("Solicitação confirmada. A imobiliária entrará em contato para os próximos passos.");
      setSelectedSlot(null);
      setForm({ name: "", email: "", phone: "" });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível concluir a reserva.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-6">
      <section className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl sm:p-8">
        {loading && !data ? <p className="flex items-center gap-2 text-sm text-white/70"><Loader2 className="size-4 animate-spin" /> Carregando disponibilidade...</p> : null}
        {data ? (
          <>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-300">{data.site.name}</p>
            <h1 className="mt-2 text-2xl font-semibold">{data.page.title}</h1>
            {data.page.description ? <p className="mt-2 text-sm text-white/70">{data.page.description}</p> : null}
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/65">
              <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" /> {data.page.duration_minutes} min</span>
              {data.page.location_text ? <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {data.page.location_text}</span> : null}
              <span>Fuso: {data.page.timezone}</span>
            </div>
            <label className="mt-6 block text-sm">Escolha a data<Input className="mt-1 bg-white text-slate-950" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {data.slots.map((slot) => <Button key={slot.starts_at} type="button" variant={selectedSlot?.starts_at === slot.starts_at ? "default" : "outline"} className={selectedSlot?.starts_at === slot.starts_at ? "text-white" : "border-white/20 bg-transparent text-white hover:bg-white/10"} onClick={() => setSelectedSlot(slot)}>{new Date(slot.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Button>)}
            </div>
            {!data.slots.length ? <p className="mt-4 text-sm text-white/65">Nenhum horário disponível para esta data.</p> : null}
            {selectedSlot ? (
              <form onSubmit={submit} className="mt-6 space-y-3 border-t border-white/10 pt-5">
                <h2 className="flex items-center gap-2 font-medium"><CalendarCheck className="size-4 text-amber-300" /> Seus dados</h2>
                <Input required minLength={2} placeholder="Nome completo" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="bg-white text-slate-950" />
                <Input required type="email" placeholder="E-mail" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="bg-white text-slate-950" />
                <Input placeholder="Telefone (opcional)" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="bg-white text-slate-950" />
                <Button disabled={loading} type="submit">Confirmar solicitação</Button>
              </form>
            ) : null}
          </>
        ) : null}
        {status ? <p className="mt-5 rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{status}</p> : null}
      </section>
    </main>
  );
}
