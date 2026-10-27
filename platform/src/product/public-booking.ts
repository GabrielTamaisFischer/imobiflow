import { apiRequest } from "./api";

export type PublicBookingResponse = {
  site: { name: string };
  page: {
    id: string;
    title: string;
    description: string | null;
    service_type: string;
    location_text: string | null;
    duration_minutes: number;
    timezone: string;
    min_notice_minutes: number;
    max_advance_days: number;
  };
  date: string | null;
  slots: Array<{ starts_at: string; ends_at: string }>;
};

export function getPublicBooking(siteSlug: string, pageId: string, date?: string) {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiRequest<PublicBookingResponse>(`/public/booking/${encodeURIComponent(siteSlug)}/${encodeURIComponent(pageId)}${query}`);
}

export function createPublicBooking(siteSlug: string, pageId: string, input: { name: string; email: string; phone?: string; starts_at: string; ends_at: string }) {
  return apiRequest<{ reservation: { booking_id: string; appointment_id: string; starts_at: string; ends_at: string; status: string } }>(`/public/booking/${encodeURIComponent(siteSlug)}/${encodeURIComponent(pageId)}/reservations`, {
    method: "POST",
    headers: { "Idempotency-Key": `public-booking:${pageId}:${input.email}:${input.starts_at}` },
    body: JSON.stringify(input),
  });
}
