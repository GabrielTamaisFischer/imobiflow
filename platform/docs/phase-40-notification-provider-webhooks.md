# Phase 40 - Notification Provider Webhooks

## Goal

This phase adds inbound delivery webhooks for notification providers.

After a WhatsApp or email provider sends a message, ImobiFlow can now receive delivery updates and reconcile the internal notification event.

## Endpoint

```txt
POST /webhooks/notifications/:provider
```

Examples:

```txt
POST /webhooks/notifications/whatsapp_http
POST /webhooks/notifications/email_http
POST /webhooks/notifications/meta
POST /webhooks/notifications/resend
```

Authentication:

```txt
Authorization: Bearer <NOTIFICATION_PROVIDER_WEBHOOK_SECRET>
```

or:

```txt
x-imobiflow-notification-webhook-secret: <NOTIFICATION_PROVIDER_WEBHOOK_SECRET>
```

## Supported statuses

The notification lifecycle now supports:

```txt
sent
delivered
read
failed
bounced
blocked
```

The database constraints were updated for both:

- `notification_events`
- `notification_delivery_attempts`

## Database

Migration added:

```txt
database/migrations/026_notification_provider_webhooks.sql
```

New table:

```txt
notification_provider_webhook_events
```

This stores:

- provider;
- provider event id;
- provider message id;
- normalized status;
- payload hash;
- raw payload;
- linked notification event;
- processed timestamp.

## Idempotency

Every webhook payload is hashed with SHA-256.

The unique key:

```txt
provider + payload_hash
```

prevents the same provider event from being processed repeatedly.

## Reconciliation

The webhook can locate the internal notification by:

1. `notification_event_id` in payload/metadata;
2. `provider_message_id`;
3. provider name.

When matched, ImobiFlow updates:

- `status`;
- `provider_message_id`;
- `sent_at`;
- `delivered_at`;
- `failed_at`;
- `failure_reason`;
- `provider_response`;
- delivery attempt history.

## Production note

Each real provider will still need a small adapter/configuration pass because vendors use different payload names.

The generic parser already supports common keys such as:

- `message_id`;
- `provider_message_id`;
- `wamid`;
- `status`;
- `delivery_status`;
- `event_type`;
- `reason`;
- `error_message`.

## Next recommended phase

The next SDD step should add a visible automation/operations dashboard:

- automation runs;
- provider webhook events;
- failed notification reasons;
- retry controls;
- delivery KPIs.
