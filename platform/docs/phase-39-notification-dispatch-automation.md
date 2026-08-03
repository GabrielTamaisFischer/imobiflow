# Phase 39 - Notification Dispatch Automation

## Goal

This phase adds the secure automation that processes queued notifications.

The previous phase creates queued notification events from financial rules. This phase executes the queue and attempts delivery through the configured provider.

## Endpoint

```txt
POST /automation/notification-dispatch/run
```

Request body:

```json
{
  "limit_per_run": 120
}
```

Authentication:

```txt
Authorization: Bearer <NOTIFICATION_AUTOMATION_SECRET>
```

or:

```txt
x-imobiflow-automation-secret: <NOTIFICATION_AUTOMATION_SECRET>
```

## Behavior

The automation:

1. loads companies with active/trial subscription;
2. finds `queued` or retryable `failed` notification events;
3. respects `scheduled_for`;
4. respects `attempt_count < max_attempts`;
5. checks if the provider for the channel is configured;
6. sends through the dispatch service;
7. records each provider attempt in `notification_delivery_attempts`;
8. records the run summary in `notification_automation_runs`.

## Provider safety

If the provider is not configured for a channel, the automation skips the event and does not consume delivery attempts.

Required provider variables:

```txt
WHATSAPP_PROVIDER_URL
WHATSAPP_PROVIDER_TOKEN
EMAIL_PROVIDER_URL
EMAIL_PROVIDER_TOKEN
```

## Run log

Each run stores:

- companies scanned;
- queued events found;
- events dispatched;
- failed events;
- skipped events;
- missing provider count;
- errors.

## Production note

This endpoint is ready to be called by an external scheduler, cron service or backend worker.

For production, configure:

```txt
NOTIFICATION_AUTOMATION_SECRET
```

Then schedule:

```txt
POST /automation/financial-notifications/run
POST /automation/notification-dispatch/run
```

The first endpoint creates queued notifications. The second endpoint sends queued notifications.

## Next recommended phase

The next SDD step should add provider delivery webhooks:

- delivered;
- read;
- failed;
- bounced;
- blocked;
- provider message id reconciliation.
