# Phase 37 - Notification Dispatch Queue

## Goal

This phase turns prepared notifications into an operational delivery workflow.

Before this phase, the system could prepare notification records for tenants and owners. Now each notification can move through a dispatch lifecycle:

```txt
prepared
↓
queued
↓
sent / delivered / failed
```

The implementation is intentionally conservative: the system does not pretend to send messages when no real provider is configured.

## What was implemented

- Queue fields on `notification_events`.
- Delivery attempt history in `notification_delivery_attempts`.
- Backend service for notification queue and dispatch.
- Provider abstraction for HTTP-based WhatsApp and email providers.
- Manual delivery registration for operations that are still sent outside the system.
- UI actions in the notification module:
  - send to queue;
  - attempt provider dispatch;
  - register manual delivery.

## Database

Migration added:

```txt
database/migrations/024_notification_dispatch_queue.sql
```

New fields in `notification_events`:

- `scheduled_for`
- `queued_at`
- `last_attempt_at`
- `delivered_at`
- `failed_at`
- `attempt_count`
- `max_attempts`
- `failure_reason`
- `provider_response`

New table:

```txt
notification_delivery_attempts
```

Each attempt stores provider, channel, attempt number, status, request payload, response payload and error details.

## Backend endpoints

```txt
POST /notifications/events/:id/queue
POST /notifications/events/:id/dispatch
POST /notifications/events/:id/manual-delivery
```

All endpoints require:

```txt
notifications.manage
```

## Provider configuration

The backend is ready for HTTP providers using environment variables:

```txt
WHATSAPP_PROVIDER_URL
WHATSAPP_PROVIDER_TOKEN
EMAIL_PROVIDER_URL
EMAIL_PROVIDER_TOKEN
```

When a provider URL is missing, dispatch does not mark the notification as sent. It records a skipped delivery attempt and keeps the event queued with `PROVIDER_NOT_CONFIGURED`.

## Manual delivery

Manual delivery exists for the implementation period where the operator may send a WhatsApp or email outside ImobiFlow.

It still records:

- provider name;
- attempt number;
- status;
- sent timestamp;
- audit-ready delivery attempt.

## Production note

This phase prepares the delivery engine but does not bind ImobiFlow to a specific WhatsApp/email vendor.

Next vendor-specific phases can implement adapters for providers such as:

- Z-API;
- Evolution API;
- Twilio;
- Meta WhatsApp Cloud API;
- Resend;
- SendGrid.

## Next recommended phase

The next SDD step should implement automatic financial notification scheduling:

- reminders before charge due date;
- overdue notifications;
- payment confirmation messages;
- owner transfer notifications after payment confirmation;
- scheduled dispatch worker or cron endpoint.
