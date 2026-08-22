# Phase 38 - Financial Notification Automation

## Goal

This phase adds the first automated financial notification routine.

The system can now scan real companies with active subscriptions, evaluate financial notification rules and create queued notification events for:

- rent charge reminders before due date;
- rent charge reminders on due date;
- overdue charge notices;
- owner transfer notices.

No fake data is generated. The automation only works with existing charges, transfers, tenants and owners.

## What was implemented

- Internal automation endpoint:

```txt
POST /automation/financial-notifications/run
```

- Secret-based protection with:

```txt
NOTIFICATION_AUTOMATION_SECRET
```

- Automation run log table:

```txt
notification_automation_runs
```

- Duplicate prevention by related entity, channel and rule step.
- Automatic insertion of queued `notification_events`.
- Support for current notification rule steps:
  - `rent_charge_collection`
  - `owner_transfer`

## Database

Migration added:

```txt
database/migrations/025_notification_automation_runs.sql
```

The migration creates `notification_automation_runs` to keep an audit trail of every automation execution.

## Security

The automation endpoint is not public.

It requires one of these authentication formats:

```txt
Authorization: Bearer <NOTIFICATION_AUTOMATION_SECRET>
```

or:

```txt
x-imobiflow-automation-secret: <NOTIFICATION_AUTOMATION_SECRET>
```

If the secret is not configured, the endpoint refuses execution.

## Behavior

For each active/trial company:

1. load notification rule steps;
2. identify eligible financial charges by due date and status;
3. identify eligible owner transfers by status and due date/payment date;
4. verify recipient contact;
5. render notification template;
6. skip duplicates;
7. create queued notification events;
8. register automation run summary.

## Current rule examples

```txt
3 days before due date -> charge_due_reminder
on due date -> charge_due_reminder
3 days overdue -> charge_overdue_notice
7 days overdue -> charge_overdue_notice
15 days overdue -> charge_overdue_notice
```

## Production note

This phase creates queued notifications. Real sending still depends on:

- configured WhatsApp/email provider;
- dispatch worker/cron execution;
- delivery status webhooks from the provider.

## Next recommended phase

The next SDD step should add scheduled dispatch execution:

- run queued notification dispatch automatically;
- retry failed sends;
- record delivery provider responses;
- optionally expose a secure operational dashboard for automation runs.
