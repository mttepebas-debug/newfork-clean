# Onboarding Billing and Trial Spec V1

Date: 2026-09-05

## Scope

This is a product and implementation-boundary spec for V1. It does not implement Stripe, pricing, packages, seats, refunds, disputes, tax, payroll, I-9 or webhook reconciliation.

V1 keeps billing/trial as an internal entitlement contract so owner onboarding, invitations, organization closure and future billing integration do not make conflicting assumptions.

## Locked Product Decisions

- Owner onboarding can finish without a card.
- Successful owner onboarding starts a cardless 14-day trial.
- Employee invitations are sent only after owner onboarding finishes successfully.
- Billing/trial failure must not create ownerless organizations.
- Owners can close an organization at any time.
- Scheduled closure keeps the organization usable until the current trial or paid period ends and can be canceled before the effective time.
- Immediate closure cancels the active trial/paid entitlement, removes organization access from all users and is not restorable by the user or support.
- Global user accounts remain after organization closure; only organization access is removed.
- Ownership can be transferred only to an active, onboarding-complete admin with verified email.
- Ownership transfer is irreversible after acceptance.
- After ownership transfer, the previous owner's stored payment method must be detached from the organization before the next renewal charge.

## Internal Trial Entitlement Contract

When owner onboarding completes, the system should be able to derive or create one organization-scoped entitlement:

```text
trial_entitlement
- workspace_id
- status: trialing | active | past_due | soft_locked | cancelled | expired
- trial_started_at
- trial_ends_at
- current_period_started_at
- current_period_ends_at
- billing_owner_user_id
- provider: internal | stripe
- provider_customer_id nullable
- provider_subscription_id nullable
- payment_method_required_at nullable
- cancelled_at nullable
- cancellation_reason nullable
```

V1 can defer the physical table if no runtime billing surface needs it yet, but all code should treat entitlement as organization-scoped, never user-scoped.

## Trial Start Rule

Trial starts only after owner onboarding Finish succeeds transactionally. Draft organizations and incomplete onboarding do not consume trial time.

The 14-day end timestamp becomes the default scheduled closure effective time for trial organizations.

## Soft-Lock Model

Soft lock is for expired trial, failed renewal or missing required payment method after owner transfer.

Allowed during soft lock:

- login
- organization switcher
- account/profile security pages
- billing/payment recovery surface
- organization closure
- read-only export window where allowed by retention policy
- support-visible diagnostics

Blocked during soft lock:

- schedule create/edit/publish
- employee creation, invite sending and role changes
- document requirement changes
- kiosk enrollment and time capture mutations
- announcement broadcast
- non-essential settings mutations

Employee app access should be read-only or blocked according to final billing UX, but employees must receive a clear organization-unavailable state instead of a random route failure.

## Closure and Retention

Scheduled closure:

- creates a pending closure request
- keeps access active until `closure_effective_at`
- can be canceled by an owner before the effective time
- should align to current trial or paid period end unless a future provider contract dictates otherwise

Immediate closure:

- requires explicit acknowledgement and typed organization name
- cancels entitlement immediately
- tombstones the organization for all tenant access
- suspends memberships
- revokes pending invitations
- clears active workspace preferences
- must not expose post-delete export or restore actions

Retention purge:

- is a separate background system task
- should be idempotent
- should preserve only legally or operationally required external tombstones
- should not be confused with user-restorable organization deletion

## Ownership Transfer Billing Rule

At transfer acceptance:

- target admin becomes owner
- previous owner becomes admin
- previous owner's saved payment method is detached from the organization
- historical invoices stay attached to the organization record
- new owner/admin can view historical invoice metadata according to future billing permissions
- next renewal requires a new payment method from the new owner or another authorized billing admin

Until the real billing provider exists, the implementation records an audit event:

```text
billing.payment_method.detach_required_after_owner_transfer
```

That event is a placeholder obligation, not a completed provider-side detach.

## Future Billing Plan Boundaries

The future billing plan must decide:

- Stripe Billing customer/subscription model
- whether customer is organization-only or organization plus billing contact
- seat definition and metering
- price/package taxonomy
- dunning and grace periods
- refund and dispute policy
- webhook reconciliation and idempotency
- Customer Portal permissions
- payment method update authority
- invoice visibility by role
- tax handling
- account deletion effects on billing contacts

V1 must not hard-code any of these beyond the entitlement and lifecycle boundaries above.
