# Phase 44 - Financial Operation Actions

This phase turns the financial operations panel into an actionable workflow for the finance team.

## Implemented

- Added `financial_operation_actions` with `company_id`, RLS, status, due date, related charge, related webhook and related owner transfer.
- Extended `GET /finance/operations-summary` to return open financial action counts and recent financial action items.
- Added backend actions:
  - review gateway inconsistency for a charge;
  - create missing owner transfer for paid charges;
  - create a collection task for overdue charges;
  - mark financial webhook issues as reviewed;
  - request webhook reprocessing.
- Every action writes financial audit logs and keeps the operation scoped by company and permission.
- Updated the finance page with action buttons directly inside the operational alerts.
- Added a financial operation actions panel with open and completed action history.

## Access Rules

All new endpoints require:

- valid authenticated session;
- company context;
- active subscription;
- `finance.manage` permission.

## Notes

Webhook reprocessing is currently registered as an operational request. The next phase can add an automated worker to safely replay supported gateway webhook events with idempotency controls.

## Validation

- Backend build: `npm run build`
- Frontend build: `npm run build`
