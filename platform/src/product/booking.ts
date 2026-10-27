import { apiRequest } from "./api";
import { getStoredToken } from "./auth";

export type BookingPage = {
  id: string;
  title: string;
  description: string | null;
  service_type: string;
  location_text: string | null;
  color: string | null;
  owner_user_id: string;
  property_id: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  min_notice_minutes: number;
  max_advance_days: number;
  max_bookings_per_day: number | null;
  timezone: string;
  guests_can_invite: boolean;
  guests_can_see_guest_list: boolean;
  status: "active" | "inactive" | "archived";
  version: number;
  weekly_availability: Array<{
    id: string;
    weekday: number;
    startMinute: number;
    endMinute: number;
  }>;
  exceptions: Array<{
    id: string;
    date: string;
    is_available: boolean;
    start_minute: number | null;
    end_minute: number | null;
    reason: string | null;
  }>;
  owner?: { id: string; name: string; email: string } | null;
  property?: { id: string; title: string; code: string | null } | null;
};

const auth = () => ({ token: getStoredToken() ?? undefined });
export function listBookingPages() {
  return apiRequest<{ pages: BookingPage[] }>("/real-estate/agenda/booking-pages", auth());
}
export function getBookingPage(id: string) {
  return apiRequest<{ page: BookingPage }>(
    `/real-estate/agenda/booking-pages/${encodeURIComponent(id)}`,
    auth(),
  );
}
export function createBookingPage(input: Record<string, unknown>) {
  return apiRequest<{ page: BookingPage }>("/real-estate/agenda/booking-pages", {
    ...auth(),
    method: "POST",
    body: JSON.stringify(input),
  });
}
export function updateBookingPage(id: string, input: Record<string, unknown>) {
  return apiRequest<{ page: BookingPage }>(
    `/real-estate/agenda/booking-pages/${encodeURIComponent(id)}`,
    { ...auth(), method: "PATCH", body: JSON.stringify(input) },
  );
}
export function duplicateBookingPage(id: string) {
  return apiRequest<{ page: BookingPage }>(
    `/real-estate/agenda/booking-pages/${encodeURIComponent(id)}/duplicate`,
    { ...auth(), method: "POST" },
  );
}
export function updateWeeklyAvailability(
  id: string,
  intervals: Array<{ weekday: number; start_minute: number; end_minute: number }>,
) {
  return apiRequest<{ page: BookingPage }>(
    `/real-estate/agenda/booking-pages/${encodeURIComponent(id)}/weekly-availability`,
    { ...auth(), method: "PUT", body: JSON.stringify({ intervals }) },
  );
}
export function createBookingException(id: string, input: Record<string, unknown>) {
  return apiRequest<{ exception: BookingPage["exceptions"][number] }>(
    `/real-estate/agenda/booking-pages/${encodeURIComponent(id)}/exceptions`,
    { ...auth(), method: "POST", body: JSON.stringify(input) },
  );
}
export function deleteBookingException(id: string, exceptionId: string) {
  return apiRequest<void>(
    `/real-estate/agenda/booking-pages/${encodeURIComponent(id)}/exceptions/${encodeURIComponent(exceptionId)}`,
    { ...auth(), method: "DELETE" },
  );
}
export function listBookingAvailability(id: string, date: string) {
  return apiRequest<{
    date: string;
    timezone: string;
    slots: Array<{ starts_at: string; ends_at: string }>;
  }>(
    `/real-estate/agenda/booking-pages/${encodeURIComponent(id)}/availability?date=${encodeURIComponent(date)}`,
    auth(),
  );
}
export function listBookings(id: string) {
  return apiRequest<{
    bookings: Array<{
      id: string;
      appointment_id: string;
      version: number;
      starts_at: string;
      ends_at: string;
      status: string;
    }>;
  }>(`/real-estate/agenda/booking-pages/${encodeURIComponent(id)}/bookings`, auth());
}
export function createBooking(id: string, input: Record<string, unknown>) {
  return apiRequest<{
    booking: {
      id: string;
      appointment_id: string;
      starts_at: string;
      ends_at: string;
      status: string;
    };
  }>(`/real-estate/agenda/booking-pages/${encodeURIComponent(id)}/bookings`, {
    ...auth(),
    method: "POST",
    headers: { "Idempotency-Key": `booking-create:${String(input.id ?? crypto.randomUUID())}` },
    body: JSON.stringify(input),
  });
}
export function rescheduleBooking(
  pageId: string,
  bookingId: string,
  input: { expected_version: number; starts_at: string; ends_at: string },
) {
  return apiRequest<{
    booking: {
      id: string;
      appointment_id: string;
      version: number;
      starts_at: string;
      ends_at: string;
      status: string;
    };
  }>(
    `/real-estate/agenda/booking-pages/${encodeURIComponent(pageId)}/bookings/${encodeURIComponent(bookingId)}`,
    {
      ...auth(),
      method: "PATCH",
      headers: {
        "Idempotency-Key": `booking-reschedule:${bookingId}:${input.expected_version}:${input.starts_at}`,
      },
      body: JSON.stringify(input),
    },
  );
}
