# Phase 36 - Owner Transfer Notifications

## Goal

This phase adds the first operational layer for owner transfer notifications. The goal is to let the real estate team prepare a clear message for the owner when a transfer is calculated, pending, approved, or paid.

The implementation keeps the system multi-company and audit-ready. It does not send real WhatsApp or email messages yet; it creates the notification event that will be consumed by the future delivery provider/queue.

## What was implemented

- Notification templates for owner transfer events:
  - `owner_transfer_calculated`
  - `owner_transfer_pending`
  - `owner_transfer_paid`
- Template variants for WhatsApp and email.
- Notification rule steps for the `owner_transfer` rule.
- Backend endpoint:
  - `POST /finance/owner-transfers/:id/prepare-notification`
- Permission requirement:
  - `finance.manage`
- Finance UI action on each owner transfer card:
  - prepare a pending transfer notice;
  - prepare a payment receipt/completion notice after transfer confirmation.
- Audit log for every prepared owner transfer notification.
- Usage cost event for WhatsApp preparation, allowing future tenant cost monitoring.

## Database

Migration added:

```txt
database/migrations/023_owner_transfer_notification_templates.sql
```

The migration inserts templates into `notification_templates` and rule steps into `notification_rule_steps`.

## Backend behavior

The new endpoint:

1. validates the authenticated company context;
2. checks `finance.manage`;
3. loads the owner transfer with owner, property, and contract data;
4. validates the owner contact based on the selected channel;
5. renders a template when available;
6. falls back to a safe default message if the template is missing;
7. stores the record in `notification_events`;
8. writes an audit log;
9. records WhatsApp usage cost when the selected channel is WhatsApp.

## Frontend behavior

In the financial dashboard, owner transfer cards now include an action to prepare an owner notification.

The button prepares:

- a pending transfer message when the transfer is not paid;
- a payment/comprovante message when the transfer is already paid.

In preview mode, the event is created locally for visual validation. In production mode, the UI calls the backend endpoint.

## Important production note

This phase prepares notifications but does not deliver them through a real provider yet.

Real sending still requires a future dispatch layer connected to WhatsApp/email providers, with queue, retries, delivery status, and failure handling.

## Next recommended phase

The next SDD step should implement the notification dispatch layer:

- notification queue;
- provider abstraction;
- WhatsApp/email adapters;
- delivery status updates;
- retry strategy;
- delivery logs;
- financial notification automation by status.
