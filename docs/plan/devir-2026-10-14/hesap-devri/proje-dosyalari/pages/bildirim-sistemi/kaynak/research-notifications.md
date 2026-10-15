# Notification system research: multi-tenant shift-scheduling SaaS (US restaurants)

Research date: 2026-10-14. All prices in USD. Each claim has a source URL. Dates are the page's own date when it shows one; "no date" means the page shows none (prices were read on 2026-10-14). Vendor-authored comparisons are marked **[vendor]**. My own inferences are marked **[inference]**.

Context assumed: React 19 web (desktop managers, phone-browser employees, PWA later), Fastify API on Vercel serverless, Supabase Postgres (RLS, pg_cron, Realtime), solo developer, cost-sensitive. Channels: in-app, email (Resend), web push. SMS built but switched off. Native push later.

---

## 1. How professional notification systems are built

### 1.1 The standard pipeline

All the vendors studied use the same stages, with different names:

1. **Event / trigger.** The app reports that something happened ("schedule published", "time-off approved"). Knock's trigger API takes `recipients` (max 1,000 per call), `actor`, `data`, `tenant`, and a `cancellation_key`, and is marked idempotent. https://docs.knock.app/api-reference/workflows (no date)
2. **Workflow / template.** One workflow per notification type. Its steps are channels plus functions: delay, batch (digest), throttle, branch. Knock's throttle has a window (≤31 days, can be "daily at a time in the recipient's time zone"), a threshold, and an optional key. https://docs.knock.app/designing-workflows/throttle-function (no date)
3. **Recipient resolution.** Users, lists/topics (fan-out), and "objects". Novu counts each subscriber in a topic fan-out as one workflow run. https://novu.co/pricing.md (no date)
4. **Preference check.** Done per recipient × category/workflow × channel, and per tenant where relevant (see §3). SuprSend checks category opt-out at trigger time and channel opt-out at each delivery node. https://docs.suprsend.com/docs/preference-evaluation (no date)
5. **Channel routing.** Decides which channels to use, in what order, and when to fall back. Example: 7shifts sends only a push, not also an email, for messaging updates when both are on. https://kb.7shifts.com/hc/en-us/articles/29771113662099/ (updated 2026-07-24)
6. **Delivery** through a provider (Resend, Twilio, a web push service).
7. **Tracking.** Delivery status comes from provider webhooks (for example Resend `email.delivered`, `email.bounced`, `email.complained`, `email.suppressed`, `email.failed`, `email.delivery_delayed`). In-app engagement uses the states seen / read / interacted / archived (Knock). https://www.resend.com/docs/dashboard/webhooks/event-types (no date) · https://docs.knock.app/in-app-ui/feeds/overview (no date)

### 1.2 Reliability concepts

| Concept | What it means here | Source |
|---|---|---|
| **Transactional outbox** | Write the business change (e.g. `schedule.published`) and a `notification_event` row in the **same DB transaction**. A worker reads the outbox later. This avoids "DB committed but notification lost" and "notification sent but DB rolled back". | Pattern overview: https://mfyz.com/durable-queue-workers-with-just-postgres/ (2026-06-09) |
| **Queue with visibility timeout** | pgmq (Supabase Queues) gives SQS-like semantics: a message is "delivered exactly once to a consumer within a customizable visibility window". It can be archived for audit, and RLS can limit consumers. | https://supabase.com/docs/guides/queues.md (no date) |
| **Claiming without a queue extension** | `SELECT … FOR UPDATE SKIP LOCKED` lets several workers claim different rows. | https://mfyz.com/durable-queue-workers-with-just-postgres/ |
| **Retries / backoff / dead letter** | pg-boss has retries with backoff and dead-letter queues. Graphile Worker has max attempts and job keys for dedupe. pgmq exposes a read count, so you write the backoff yourself. | same |
| **Idempotency keys** | Derive the key from the delivery-job ID so a retry reaches the provider with the **same** key. Resend: `Idempotency-Key` header, 1–256 chars, kept **24 h**; same key with a different payload returns 409; also works on `/emails/batch`. | https://resend.com/docs/dashboard/emails/idempotency-keys.md (no date) · https://resend.com/changelog/batch-idempotency-keys.md (created 2025-06-05, updated 2026-07-09) |
| **Dedupe** | Use a unique key per (event_id, recipient, channel) in the deliveries table. Graphile Worker's "job keys" are the queue-level version. | mfyz.com above |
| **Batching / digest** | Collect events per recipient for a window, then send one message. SuprSend bills a digest as **one** notification. Knock and Novu have batch/digest steps (Novu limits custom digest windows to Enterprise). | https://www.suprsend.com/pricing · https://novu.co/pricing.md |
| **Throttling** | Cap N per recipient per window, optionally keyed. | Knock throttle doc above |
| **Quiet hours / time zones** | Evaluate in the recipient's time zone. Slack: admins set default DND hours and members can change them. SuprSend "send in recipient's timezone" is on the paid Essentials tier. | https://slack.com/help/articles/214888418 (no date) · https://www.suprsend.com/pricing |
| **Cancellation** | Cancel a pending delayed or batched notification when the cause disappears (shift deleted before the reminder fires). Knock: `cancellation_key`. | Knock trigger doc above |
| **Logs / audit** | Retention is a pricing lever for vendors: Novu Free 24 h, Pro 7 d, Team 90 d; Courier 7 / 30 / 365 d; SuprSend Free 30 d, paid 90 d. | https://novu.co/pricing.md · https://www.courier.com/pricing · https://www.suprsend.com/pricing |
| **Templates / i18n** | Templates live per workflow and channel. i18n is often a paid tier (Knock Enterprise, SuprSend Essentials). Resend stores templates and React Email can upload to it. | https://knock.app/pricing · https://www.resend.com/docs/knowledge-base/template-emails-with-react-email.md |

### 1.3 How each vendor structures it

- **Knock.** Workflows (steps: channels, delay, batch, throttle, branch, fetch) + categories + preference sets + **tenants** (tenant default preference sets, per-tenant user preferences, per-customer branding). A message is billed per user per channel: "one workflow that sends both an in-app message and an email counts as two". Suppressed, bounced and failed messages are not billed. https://knock.app/pricing · https://docs.knock.app/preferences/tenant-preferences
- **Novu.** Workflows with channel steps and digest/delay. Subscribers, topics, and **Contexts** for multi-tenancy (per-tenant providers, preferences, inbox segregation). Billed per **workflow run**, not per channel. https://novu.co/pricing.md
- **Courier.** Notifications/journeys, subscription **topics** with OPTED_IN / OPTED_OUT / **REQUIRED**, tenants with default preferences. https://www.courier.com/docs/platform/tenants/user-tenant-preferences.md
- **SuprSend.** Workflows, **categories** (sections → categories), tenants with tenant default preferences. Platform admin can block channels or categories for a tenant. https://docs.suprsend.com/docs/tenant-preference.md
- **MagicBell.** Inbox plus "Smart Delivery" across channels. Billed per delivery per channel. https://www.magicbell.com/pricing
- **OneSignal.** Marketing-first push/email/in-app/SMS with segments and journeys. Less suited to per-tenant transactional preferences. https://onesignal.com/pricing
- **Customer.io.** Topics × channels subscription center, opt-in or opt-out per topic. A person must be subscribed to both topic and channel. In-app and Slack ignore global unsubscribe. https://docs.customer.io/messaging/channels/subscriptions/overview.md

---

## 2. Build vs buy

### 2.1 Vendor pricing and fit

| Vendor | Free tier | First paid tier | Billing unit | Multi-tenant | Preferences | React in-app inbox | Notes |
|---|---|---|---|---|---|---|---|
| **Knock** | Developer $0: **10K messages/mo**, unlimited workflows, batch/delay, "built-in multi-tenancy" | Starter **$250/mo**, 50K msgs, then **$0.005/msg** | per user × channel | Yes (tenant prefs) | Yes; per-customer preferences called out on Enterprise | Yes (`@knocklabs/react` feed/popover) | No EU datacenter per a Courier article [vendor]. https://knock.app/pricing (no date) · https://www.courier.com/blog/eu-data-residency-notifications (2026-03-09) |
| **Novu Cloud** | Free $0: **10K workflow runs/mo**, 20 workflows, 3 members, 24 h activity retention, all channels | Pro **$30/mo** (30K+ runs), Team **$250/mo** (250K+, 90 d retention, RBAC) | per workflow run | Yes (Contexts) | Yes (workflow / subscriber global / subscriber per workflow; "critical" workflows) | Yes: `@novu/react` `<Inbox/>` (Bell, Notifications, Preferences), React 18+ incl. 19, headless hooks | US and EU on all plans; overage never stops sending, on-demand rate not published. https://novu.co/pricing.md · https://docs.novu.co/platform/inbox.md |
| **Novu self-hosted** | Free (MIT core) | — | — | — | — | — | Core is MIT; an `enterprise/` folder is under a separate enterprise license. https://www.github.com/novuhq/novu. Needs **MongoDB + Redis (AOF) + S3**, minimum 1 VM with 4 vCPU / 8 GB, recommended about 10 VMs; some Cloud features are missing. https://docs.novu.co/community/self-hosting-novu/overview.md. **Poor fit** for Vercel + Supabase. |
| **Courier** | Developer: **10K notifications/mo**, 7 d logs | Business: **$0.005/send** pay-as-you-go, 30 d logs, EU residency (pricing page) | per send | Yes (tenants) | Yes (topics, REQUIRED status) | Courier Inbox | The pricing page lists EU residency on Business; Courier's own blog says Enterprise. https://www.courier.com/pricing (no date) |
| **SuprSend** | Free: **10K/mo**, branded in-app feed, 30 d logs, **no preferences, no digest** | Essentials **$100/mo** (50K, $2/1K over, no preferences); **Business $250/mo** (preferences + digest, $5/1K over); multi-tenant is an add-on on Business and included on Enterprise | per user × channel; digest = 1 | Add-on / Enterprise | Business+ | Yes (feed) | https://www.suprsend.com/pricing (no date) |
| **MagicBell** | Builder: **1,000 deliveries/mo**, 1 project | Startup **$249/mo**, 50K, $0.0025 over | per delivery × channel | Not stated | Not stated on pricing page | Yes (inbox) | https://www.magicbell.com/pricing (no date) |
| **OneSignal** | Free: email **10K/mo**; mobile push + in-app unlimited **up to 1,000 MAU**; web push "10,000 subscribers per send" (wording unclear); 3 journeys | Growth **from $19/mo**; mobile push **$0.012/MAU**; web push **$0.004/subscriber**; email $1.50/1K after 20K | MAU / subscriber | Weak | Segment-based | No real B2B inbox | https://onesignal.com/pricing (no date) |
| **Customer.io** | — | — | — | — | Topics × channels | — | Marketing automation; overkill for this use. |

**Volume estimate [inference].** Take a 60-person restaurant group: weekly publish (60 people), daily changes, shift reminders (about 60 × 4 shifts per week), and requests and decisions. That is roughly **2,000–5,000 channel-messages per customer per month** when in-app + push + email each count. Ten customers is 20K–50K a month.
- Knock: past the free tier, so **$250/mo**.
- SuprSend: **$250/mo**, because preferences and digest need Business.
- Novu: about **$30/mo**, because it bills per run, not per channel.
- Courier: about **$100–250/mo**.
- Own build: **$0** extra infra, plus Resend Pro **$20/mo** (see §6, because of the 100/day free cap).

### 2.2 Building it ourselves on Postgres

Pieces already available, at no extra cost:
- **Supabase Queues (pgmq)** for delivery jobs: visibility timeout, archive, RLS. https://supabase.com/docs/guides/queues.md
- **pg_cron**, which supports **sub-minute** schedules ("pg_cron seconds syntax"). https://supabase.com/blog/supabase-cron (2024-12-04)
- **pg_net** to call an HTTP worker (pattern: Vault secret + `net.http_post` in a cron job). https://supabase.com/docs/guides/functions/schedule-functions.md
- **Vercel Cron cannot be the worker clock on Hobby.** Hobby allows once per day with ±59 min precision. Pro allows once per minute. https://vercel.com/docs/cron-jobs/usage-and-pricing (updated 2026-07-15). Use **pg_cron → pg_net → API drain endpoint** (or a Supabase Edge Function) instead.
- **Supabase Realtime** for the live in-app badge: Free 200 / Pro 500 concurrent connections, 100 / 500 msgs/s. https://supabase.com/docs/guides/realtime/quotas (no date). Polling with TanStack Query is also fine at this scale.
- **web-push** (npm, MPL-2.0, v3.6.7): `generateVAPIDKeys`, `setVapidDetails`, `sendNotification` with `TTL` (default 4 weeks), `urgency`, `topic` (coalescing). https://cdn.jsdelivr.net/npm/web-push@3.6.7/README.md · https://cdn.jsdelivr.net/npm/web-push@3.6.7/package.json
- **Resend** SDK + React Email (§6).

Vendor-side counterargument [vendor]: Knock estimates an in-house in-app feed alone takes about 3 months and a full system takes "five engineers… at least three months". Its main arguments are preferences, batching, an internal template dashboard, and observability. https://knock.app/blog/build-v-buy-pointer (updated 2024-02-09). That estimate assumes a generic system with many channels and editors. **Our scope is much smaller**: about 10–15 notification types, 3 channels, no marketing, no non-engineer template editing.

### 2.3 Recommendation

**Build in-house on Postgres. Novu Cloud is the documented fallback.**

Reasons:
1. Cost: $0 extra versus $30–250/mo.
2. **Tenant isolation stays inside our own RLS + `authorize()` model.** A vendor would hold a second copy of user, tenant and preference data, which is a second system to secure and keep in sync.
3. Notification content is deeply tied to schedule data (who, which shift, which location, the employee's time zone).
4. Lock-in: vendor workflows, templates and preference schemas do not port between vendors.
5. Vercel serverless + Supabase already provides queue, cron and realtime.

What we give up: a ready inbox UI, a template editor, and delivery dashboards. These are easy at our scale. A notifications table is the inbox, and a deliveries table is the log.

When to switch to buying [inference]: many more channels (Slack/Teams), non-engineers editing templates, or more than about 100K messages/mo with complex digests. Then Novu (MIT core, $30 tier, React 19 inbox, Contexts for tenants) is the cheapest credible buy. Knock is the most polished but $250/mo past 10K.

Note: `web-push`, `resend` and `@react-email/*` are new dependencies, so they need explicit approval under the repo's rules.

---

## 3. Preference model

### 3.1 How others handle "admin turns a type off"

| Product | Admin / tenant level | Can the user override? | Source |
|---|---|---|---|
| **Knock** | Tenant default preference set. By default the user's per-tenant preferences **win**. The tenant can **force** a value with `__strategy__: "replace"` on a category or channel, which overrides the user's opt-in. Commercial: a user opt-out always wins. | Yes, unless the tenant used replace | https://docs.knock.app/preferences/tenant-preferences |
| **Courier** | Tenant default per topic: OPTED_IN / OPTED_OUT / **REQUIRED**. REQUIRED ignores user choices ("use REQUIRED for transactional messages"). | Yes, except REQUIRED | https://www.courier.com/docs/platform/tenants/user-tenant-preferences.md |
| **SuprSend** | Order: user > tenant > category default. **But** if the tenant admin turns a category **off**, users do not receive it even if they opted in. A platform admin can disable a channel, which "cannot be re-enabled by the tenant or user". `visible_to_subscriber:false` hides a category from users. Channel-level opt-outs (email unsubscribe, SMS STOP, OS push off) override everything. | Only inside what the tenant allows | https://docs.suprsend.com/docs/preference-evaluation · https://docs.suprsend.com/docs/tenant-preference.md |
| **Novu** | Workflow channel defaults, then subscriber global, then subscriber per workflow. **Critical** workflows are hidden from the preference UI and ignore subscriber settings (e.g. password reset). | Yes, except critical | https://docs.novu.co/platform/concepts/preferences |
| **Slack** | Admins set **default** DND hours and an org policy. Members can change their own. Owners restrict *who can send* @channel/@here (they restrict the sender, not the receiver). | Yes | https://slack.com/help/articles/214888418 · https://slack.com/help/articles/115004855143 |
| **GitHub** | Users choose "On GitHub" / email per participating/watching category. Orgs can only restrict **email routing to verified domains**. | Users own preferences | https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications |
| **Atlassian (Jira Cloud)** | No admin switch to disable a user's emails. The request JRACLOUD-74800 (opened 2020-07-16) is still "Gathering Interest". | Users own preferences | https://jira.atlassian.com/browse/JRACLOUD-74800 |
| **Microsoft Teams** | New centralized per-user channel-notification page (MC1466307, published 2026-09-02, GA late Oct 2026). "No changes… to existing admin policies". | Users own preferences | https://mc.merill.net/message/MC1466307 |
| **Notion** | User-level settings. Some types cannot be unsubscribed (person-property mentions) and can only be hidden by an inbox filter. Email is sent only if the app isn't open / push not seen within 5 min. | Partially | https://www.notion.com/sv/help/notification-settings |
| **Google Workspace** | No primary source found for an admin-level per-type override of user notification settings, so this is not claimed. | — | — |

**Pattern [inference].** Collaboration tools (Slack, GitHub, Atlassian, Teams) leave preferences to users. Admins control senders, defaults and domains. B2B notification platforms (Courier, SuprSend, Knock) add a tenant layer with three powers: **set defaults**, **force off / hide**, and **mark required**.

Shift-scheduling tools are mixed:
- Deputy: business-level SMS master switch that overrides the publish dialog.
- Sling: "not possible for an admin or manager to adjust an employee's notifications".
- When I Work: the account plan decides which alerts are available; users choose within that.

### 3.2 Recommended model

- **Matrix = category × channel**, not per type. Use about 5–6 user-visible categories: *My schedule*, *Requests & decisions*, *Shift reminders*, *Open shifts & swaps*, *Announcements*, *Manager approvals* (managers only). Channels: in-app (always on; it is the record), push, email, SMS (hidden until enabled).
- **Three classes per notification type:** `required` (locked, not shown as a toggle, or shown greyed out), `default_on`, `default_off`. This mirrors Courier REQUIRED and Novu critical.
- **Workspace (tenant) level, owner/admin only, very few switches:**
  - turn optional categories off for the workspace (e.g. announcements email);
  - reminder lead time;
  - SMS master switch (Deputy-style; off by default);
  - default quiet hours.
  - A workspace "off" means users **cannot** turn it back on (SuprSend semantics). A workspace "default" can be changed by users (Knock default semantics).
- **Precedence:** required > workspace off > channel-level hard opt-outs (email unsubscribe, SMS STOP, push permission revoked) > user choice > workspace default > system default.
- **Avoiding settings hell:** ship good defaults so most users never open settings. Hide channels the user can't receive (no push subscription, no phone). Show only categories relevant to the role. Let the user "turn off this kind" from the notification itself (Connecteam does this: the three-dot menu on a notification can stop that type). https://help.connecteam.com/en/articles/6444946-the-notifications-center (2022-08-15)

### 3.3 Legal: email

- **CAN-SPAM.** "Transactional or relationship" content includes messages about the recipient's **employment relationship or employee benefits**. Such messages are exempt from most of the Act; only the rule against false or misleading routing information applies. Commercial email needs an opt-out honored within **10 business days**, working for 30 days after sending. The penalty is up to **$53,088 per email** (inflation-adjusted Jan 2024). https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business. **Implication [inference]:** schedule and request notifications to employees are transactional. Product-marketing email to owners is commercial.
- **Gmail subscription guidelines.** One-click unsubscribe is required for "subscription messages", which includes promotional mail, newsletters and **"some notification messages"**. Password resets, receipts and OTPs are outside that. Honor within **48 h**. https://support.google.com/mail/answer/15263077?hl=en (no date)
- **Bulk sender rules.** 5,000+ messages a day to Gmail. Since **Nov 2025** Gmail can **reject** non-compliant mail, not only spam-folder it. Requirements: SPF + DKIM + DMARC (p=none acceptable), From-domain alignment, spam rate < 0.1% (never ≥ 0.3%), one-click unsubscribe. https://help.zoho.com/portal/en/community/topic/gmail-is-ramping-up-its-email-sender-policy-from-november-2025 · https://bird.com/docs/knowledge-base/deliverability/gmail-yahoo-requirements
- **Outlook.com.** Domains sending over 5,000 a day need SPF/DKIM/DMARC from **2025-05-05**: junk first, rejection later. https://petri.com/?p=758767
- **Recommendation [inference].** We won't reach bulk volume soon, but we should comply from day one: authenticated subdomain, DMARC, and `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) on **optional** categories (reminders, announcements, digest). The link turns off that **category's email**, not the whole account. Required mail (security, invites, billing) has no unsubscribe.

### 3.4 Legal: SMS (US)

- **CTIA principles** (May 2023 ed.): per-campaign opt-in, confirmation for recurring programs, a call to action that discloses sender, frequency and fees, a stop method in messages, and exactly **one** opt-out confirmation, then silence. https://bird.com/explained/compliance/what-are-the-ctia-messaging-principles
- **FCC TCPA revocation rule** (order Feb 2024, in force **2025-04-11**):
  - revoke by **any reasonable means**; "stop / quit / end / revoke / opt out / cancel / unsubscribe" are per se reasonable;
  - honor within **10 business days**;
  - one clarification text allowed.
  - The "**revoke-all**" part (an opt-out on one message type stops all unrelated texts) was delayed to **2027-01-31** (order 2026-01-06).
  - https://activeprospect.com/blog/tcpa-revocation-of-consent/ (2026-08-19) · https://www.wiley.law/alert-FCC-Grants-Limited-Waiver-for-Part-of-the-TCPA-Consent-Revocation-Rule · https://www.consumerfinancialserviceslawmonitor.com/2026/01/fcc-further-extends-effective-date-for-tcpa-revoke-all-rule/
- **Implication [inference].** Store per-phone consent (timestamp, source screen, consent text version, IP/user). Treat STOP as a global SMS opt-out for that number. Handle HELP. Never text before opt-in. Registration costs are in §7.

### 3.5 Web push permission UX

- Never prompt on page load ("the worst thing you can do").
- Ask at a moment of clear value, using a double-permission (soft-ask) pattern.
- Offer a settings toggle.
- Avoid the permanent "denied" state, which most users can't undo.
- Always explain how to turn it off.
- https://web.dev/articles/push-notifications-permissions-ux (updated 2025-03-26)

Firefox (Jan 2020) and Chrome (Feb 2020) show a **quieter UI** for prompts without a user gesture, and for sites with low accept rates. https://onesignal.com/blog/web-push-permission-prompting-changes/ (2020-01-09)

---

## 4. In-app UX

### 4.1 General best practice

Source: https://www.saasui.design/blog/saas-notification-center-ux-patterns (2026-07-27)
- **Bell + popover** for quick triage. A **full page** for history/filter. Toasts are separate.
- **Badge = unread "you are needed" items**, capped (e.g. "9+"). Opening the panel clears the badge but does **not** mark items read. Clicking marks read. "Mark all as read" must be predictable, with undo.
- **Group** bursts by object / actor / type ("Ana and 4 others…"); one group counts as one unread.
- **Actionable** items (approve / decline) work in place, with immediate feedback.
- Empty state "all caught up". A loading skeleton. Honest error state.

Knock exposes **seen / read / interacted / archived** with separate unseen and unread counts for badges. https://docs.knock.app/in-app-ui/feeds/overview. **[inference]:** use *seen* for the badge (cleared on open) and *read* for the item's bold state.

Product examples:
- **Linear Inbox.** Read/unread (`U`), mark all read (`Alt+U`), **snooze** (`H`), delete / delete all read, quick search filters, a "Priority" tab, at most 2,000 open notifications, no archive. https://linear.app/docs/inbox.md
- **GitHub.** Inbox with **Done** and **Saved**. Saved items are kept indefinitely; others about 3 months. Mobile push only for mentions, assignments, review and deploy requests, with **working hours** scheduling. https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications
- **Asana.** Tabs Activity / Bookmarks / Archive. Archive within 30 s (critical) or 60 min prevents the email. Notifications within an hour batch into one email, except comments and assignments. https://help.asana.com/s/article/inbox (snapshot 2026-10-03)
- **Notion.** Inbox badge and type filters. Email only if the app isn't open or push hasn't been seen in 5 min. https://www.notion.com/sv/help/notification-settings

### 4.2 Shift-scheduling competitors

**7shifts** (updated 2026-07-24 / 2026-09-10 / 2026-09-30)
- Bell icon top-right on web and mobile. **Only push/SMS items appear, not email.** 3 months of history.
- Per-type × channel toggles (Mobile / Email) plus a separate SMS toggle. Push is "recommended".
- Notification types by channel:
  - SMS + push + email: schedule published, open shifts, shift reminders, trade requests, shift-pool decisions.
  - Push + email: availability decisions, time-off created (manager) or acknowledged (employee), announcements, new message, late-punch alert (manager).
  - Push only: overtime, onboarding reminders, minor compliance alert.
  - Email only: time-off deleted.
- The SMS setting doesn't control MFA texts.
- https://kb.7shifts.com/hc/en-us/articles/29771113662099/ · https://kb.7shifts.com/hc/en-us/articles/4417513423123 · https://kb.7shifts.com/hc/en-us/articles/15976960549267

**When I Work** (2025-08-06; notification center article 2023-02-16)
- 13 alert types.
- Email, plus mobile: push if logged in, **SMS fallback if logged out**, capped at **20 SMS per user per day**.
- Role-based visibility: managers and supervisors get approvals, overtime and payroll.
- Schedule-update push only if the shift is within 2 days.
- Notification center sections: **"Things needing your action"** (approve on hover), **"Awaiting action from others"**, **"Notifications"**, plus search.
- https://help.wheniwork.com/articles/setting-your-alert-preferences/ · https://help.wheniwork.com/articles/viewing-notifications-computer/

**Deputy** (no date; image timestamp 2025-08-19)
- Business-level "Allow SMS Notifications" master switch overrides the publish dialog. SMS is off during trial and costs extra per message.
- Reminders are configured by the manager or admin (15 min–24 h before), delivered as a web bell or app push.
- https://help.deputy.com/hc/en-au/articles/4621872438671 · https://help.deputy.com/hc/en-au/articles/4692822425999 · https://help.deputy.com/hc/en-au/articles/4692617656335

**Sling** (2025-07-21)
- Each user controls their own settings; admins **cannot** change an employee's.
- Email frequency: immediately / every 15 min / hourly (a simple digest).
- https://support.getsling.com/en/articles/1078442-notification-settings

**Connecteam** (2024-09-04 / 2026-08-13)
- Settings are personal and per feature.
- On publish the admin chooses: notify or "Don't notify assigned users", email+push or SMS (price shown before sending), plus a custom "what changed" message. Sent notifications can't be recalled.
- Users can stop a type from the notification's menu.
- https://help.connecteam.com/en/articles/5079947-manage-notifications · https://help.connecteam.com/en/articles/6669123-job-schedule-how-to-customize-notifications-when-publishing-shifts

**Homebase**
- Email + push per staff profile ("Edit notification settings").
- Its marketing page says SMS / email / app alerts on publish, on change, and as automatic shift reminders.
- https://help.homebase.ai/en/articles/9778589-staff-notification-settings (2025-11-17) · https://www.joinhomebase.com/glossary/schedule-notifications

### 4.3 Recommendation for us [inference]

- **Manager (desktop):** bell + popover with two sections, "Needs your action" (inline Approve/Deny for time-off and swap, plus a link to detail) and "Updates". Add a full Notifications page with filter by location and type. Badge = unseen count of action-needed + updates, capped at 99+.
- **Employee (phone):** no popover. The bell opens a **full-screen list** (a bottom sheet is too cramped for history). Every item deep-links to the exact shift or request.
- **States:** `created → seen (badge cleared on open) → read (clicked) → archived/done`. Add "Mark all read". Don't build snooze in the MVP.
- **Grouping:** one item per publish event ("Your schedule for Oct 20–26 is published: 5 shifts"), not one per shift.
- **Publish dialog:** a "Notify affected staff" default-on toggle plus an optional note (Connecteam-style). Notify only people whose shifts changed.

---

## 5. Web push today

- **Support.** Push API works in Chrome 50+, Edge 79+, Firefox 44+, Safari macOS 18+ (partial 16.1–17.6), Safari **iOS 16.4+ (partial)**, Chrome Android, and Samsung Internet. About 96.7% global usage. https://caniuse.com/push-api
- **iOS.** Push works **only for web apps added to the Home Screen**, on iOS 16.4+. `Notification.requestPermission()` must run from a click handler, before other `await`s. Subscribing from a normal Safari tab is impossible.
  - Reliability: reports of disappearing subscriptions on iOS 17–18. iOS may revoke a subscription after silent pushes, so always show a notification inside `event.waitUntil`. Delete a subscription only on 404/410. Use email/in-app as fallback.
  - https://webscraft.org/blog/pwa-pushspovischennya-na-ios-u-2026-scho-realno-pratsyuye?lang=en (2026-03-12, updated 2026-10-13)
- **iOS 26.** "Add to Home Screen" from Safari now creates a **web app by default** ("Open as web app" toggle), with no manifest required ("zero conditions"). This lowers the install friction for push; the article does not discuss push itself. https://heise.de/-10749652 (no date)
- **EU.** Apple announced removal of Home Screen web apps in the EU for iOS 17.4 (Feb 2024), then **reversed on 2024-03-01**. https://9to5mac.com/2024/03/01/apple-home-screen-web-apps-ios-17-eu/. (A MagicBell article dated 2026-03-20 still says EU PWAs lost push; that contradicts the reversal, so treat it as outdated.) Not relevant for a US-only product.
- **Declarative Web Push** (WebKit, 2025-03-27; iOS/iPadOS 18.4, macOS 15.5):
  - The push payload is standard JSON (`"web_push"` key + `notification` object). The browser shows it **without running service-worker JS**; the SW can optionally modify it.
  - There is no silent-push penalty, and the subscription survives SW removal.
  - Backward compatible: older browsers handle it in the SW.
  - https://webkit.org/?p=16535
  - **Recommendation:** send declarative-format payloads from day one and keep a SW `push` handler for other browsers.
- **Library and cost.** `web-push` (MPL-2.0) with VAPID keys. Push services (FCM, Mozilla, Apple) are **free**. Store subscriptions per device: endpoint, keys, user agent, `last_success_at`. Use `topic` to collapse repeated updates and `TTL` short for reminders. https://cdn.jsdelivr.net/npm/web-push@3.6.7/README.md
- **Opt-in rates.** No reliable public web-push benchmark was found. As a proxy, native app median opt-in in 2025 was **Android 53.3% / iOS 48.85%**. https://www.airship.com/mobile-app-push-notification-benchmarks-for-2026/ (data 2025, page 2026-06-05). **[inference]:** expect lower for iOS web, because the Home Screen install step is required first.
- **Soft-prompt design [inference, from web.dev].**
  - Trigger it after the employee first opens their published schedule: card "Get a ping when your schedule changes → Turn on".
  - On iOS Safari not installed: show "Add to Home Screen" steps instead.
  - If denied: show how to re-enable in browser settings, and keep email as the channel.
  - Never prompt managers on page load.

---

## 6. Email with Resend

- **Pricing** (transactional; https://resend.com/pricing, no date):
  - **Free $0:** 3,000/mo, **100/day cap**, 1 webhook endpoint, 30-day retention, 3 domains.
  - **Pro $20/mo:** 50K/mo, no daily cap, 10 domains, 5 webhooks; overage **$0.90 per 1K**.
  - **Scale $90/mo:** 100K/mo; dedicated IP **+$30/mo** (for senders over 3,000/day).
  - **[inference]:** one publish to a 100-person team would exhaust the free tier's 100/day. **Budget Pro $20/mo from the first real customer.**
- **API:** default rate limit **10 requests/s per team** (429 above). https://resend.com/docs/api-reference/introduction
- **Batch:** up to **100 emails per call** on `/emails/batch`, with idempotency support. https://resend.com/changelog/batch-idempotency-keys.md
- **Idempotency:** `Idempotency-Key` header, 24 h retention, 409 on payload mismatch. https://resend.com/docs/dashboard/emails/idempotency-keys.md
- **Webhooks:** sent, delivered, delivery_delayed, bounced, complained, failed, suppressed, opened, clicked, scheduled, received, plus domain and contact events. https://www.resend.com/docs/dashboard/webhooks/event-types. Signature verification is via Svix, per third-party guides: https://hookdeck.com/webhooks/platforms/guide-to-resend-webhooks-features-and-best-practices.md. Act on `bounced` and `complained` by marking the address undeliverable and stopping email to it.
- **React Email:** pass a component to `resend.emails.send({ react })`. Templates can also be stored in Resend (`npx react-email@latest resend setup`). https://www.resend.com/docs/knowledge-base/template-emails-with-react-email.md
- **Regions:** sending from us-east-1, eu-west-1, sa-east-1, ap-northeast-1. **All account data is stored in the US** regardless of region. https://resend.com/docs/dashboard/domains/regions
- **Domain authentication:** SPF + DKIM + DMARC with alignment (§3.3). Use a dedicated subdomain (e.g. `mail.<domain>`) so product email reputation is isolated [inference].
- **Transactional best practices [inference]:**
  - one email per event (or digest), with a plain-text part;
  - subject says the fact ("Your schedule for Oct 20–26 is published");
  - deep link to the item, workspace name in the body;
  - no tracking pixels on security mail;
  - `List-Unsubscribe` only on optional categories.

---

## 7. SMS (keep it ready but off)

| Provider | US outbound SMS | Inbound | Carrier fees | Number / mo | Source |
|---|---|---|---|---|---|
| **Twilio** | **$0.0083**/segment | $0.0083 | 10DLC: AT&T $0.0035, T-Mobile $0.0045, Verizon $0.005; failed-message fee $0.001 | local $1.15, toll-free $2.15 | https://www.twilio.com/en-us/sms/pricing/us (no date) |
| **Telnyx** | **$0.0040** | free | about $0.003 (AT&T/TMO/VZ) | local $1.00 | https://telnyx.com/resources/twilio-telnyx-sms-pricing (rates "as of Jan 2026") [vendor] |
| **Plivo** | **≈$0.0077** (up from ≈$0.0055) | — | extra | — | https://apicostcalc.com/blog/plivo-sms-price-hike-closes-twilio-gap.html (2026-09-28) |
| **Vonage** | **≈$0.0076** | — | extra | — | same source |
| **AWS End User Messaging** | per-country CSV (not shown on page) | — | — | 10DLC $1, toll-free $2 | https://aws.amazon.com/end-user-messaging/pricing |

**10DLC registration** (Twilio; changes effective 2025-08-01):
- Brand: Sole Prop / Low-Volume Standard **$4.50** one-time; Standard **$46** (includes secondary vetting).
- Campaign vetting **$15**.
- Monthly campaign: Standard **$10/mo**, Low-volume mixed **$1.50/mo**.
- Authentication+ retry $12.50.
- https://support.twilio.com/hc/en-us/articles/1260803965530
- AWS lists similar figures: brand $4.50, vetting $41.50, campaign $10/mo or $2/mo low-volume. https://aws.amazon.com/end-user-messaging/pricing

**Toll-free alternative.** Verification is free and takes about 5–15 business days. Unverified traffic is heavily filtered. Number about $2/mo. https://www.telphiconsulting.com/blog/twilio-toll-free-verification-cost (2026-06-20). Bandwidth: "toll-free verification is essentially free, while 10DLC registration costs money". Toll-free gives handset-level delivery receipts; 10DLC suits smaller senders. https://www.bandwidth.com/blog/10dlc-to-toll-free-sms/ (2025-03-24)

**Who is the brand.** If the SaaS sends in its own name, register **ourselves** as the brand (Primary profile) with one campaign. If customers send in their own name, each needs a secondary brand. https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv. **[inference]:** 7shifts-style notifications are sent in the product's name, so one brand and one "account notifications" campaign. Starting cost is about $4.50–46 one-time + $15 vetting + $1.50–10/mo + about $1/mo number, or toll-free about $2/mo with free verification.

**Ready but off [inference]:**
- a `Channel` adapter interface (`send(job) → providerMessageId`) with an `sms` adapter behind a feature flag (environment level, plus a workspace master switch like Deputy's);
- `phone_e164`, `sms_consent_at`, `sms_consent_source`, `sms_consent_text_version` on the user;
- an `sms_opt_outs` table keyed by phone;
- an inbound webhook route for STOP/HELP (dormant);
- a per-user daily cap (When I Work uses 20/day);
- SMS never used for required messages until it is turned on.
- Pick **Telnyx** for price or **Twilio** for ecosystem when it is turned on. No account or number is bought until then.

---

## 8. Which notifications are mandatory vs optional

Synthesis [inference], grounded in the patterns above (Courier REQUIRED, Novu critical, Notion's unsubscribable mentions, 7shifts / When I Work types, CAN-SPAM's employment-relationship category).

| Notification | Recipient | Class | Channels (default) | Note |
|---|---|---|---|---|
| Invite / join workspace, email verification, password reset, email or login change, new-device or security alert | user | **Required** | email (+in-app where relevant) | Never unsubscribable; no List-Unsubscribe |
| Billing: payment failed, card expiring, plan change, invoice | owner | **Required** | email + in-app | |
| Legal / ToS / privacy policy change | owner (+users if affected) | **Required** | email | |
| Ownership transfer, role change, removed from workspace | affected user | **Required** | email + in-app | |
| **Schedule published** (affecting me) | employee | **Required in-app**; at least one external channel default on (push, else email) | in-app + push/email | Core job of the product. Some fair-workweek laws require 14-day advance notice in covered jurisdictions (Oregon, Seattle, NYC fast food, Chicago, Philadelphia, SF, Berkeley, Emeryville, Evanston). Most have size thresholds above our ICP, but Berkeley's (100+ employees worldwide, 10+ in Berkeley) and Emeryville's (56+) are lower, so keep a delivery log. https://www.nory.ai/blog/predictive-scheduling-laws (2026-08-18) |
| **My shift changed / removed / added** after publish | employee | **Required in-app**; external default on | in-app + push/email | Same reasoning |
| Time-off decision, swap/drop decision, availability decision | requester | Required in-app; external default on | in-app + push/email | User may turn the external channel off |
| New time-off / swap / availability request to approve | manager | Default on (in-app always) | in-app + email | A digest option fits here |
| Open shift available, shift offered up | eligible employees | Optional, default on | in-app + push | Throttle and group |
| Shift reminder (X h before) | employee | Optional; workspace toggles it and sets lead time | push | Cancel if the shift is changed or deleted |
| Onboarding incomplete reminder | employee | Default on, auto-stops when done | email + in-app | |
| Announcements from manager | team | Optional, default on | in-app + push | |
| Daily/weekly digest (manager) | manager | Optional, default off | email | |
| Product news / marketing | owner | Optional, opt-in | email | **Commercial** under CAN-SPAM: unsubscribe + physical address |

---

## Proposed architecture (summary) [inference]

```
API RPC (e.g. publish_schedule_service)
  └─ same tx: INSERT notification_events(type, workspace_id, actor, payload, dedupe_key UNIQUE)
pg_cron (every ~10–30 s) → fan-out function (SQL, SECURITY DEFINER in app_private):
  resolve recipients (RLS-consistent scope) → preference resolution
  (required > workspace off > hard opt-out > user > workspace default > system default)
  → INSERT notifications (in-app row = the inbox) + notification_deliveries(channel, status, idempotency_key UNIQUE)
  → pgmq.send('deliveries', delivery_id)  [or claim with SKIP LOCKED]
pg_cron → pg_net POST /internal/notifications/drain (secret from Vault) on the Fastify API
  → read N jobs (visibility timeout) → Resend (Idempotency-Key = delivery_id) / web-push / (sms adapter, flag off)
  → status sent|failed; retry with backoff via read_ct; dead-letter after K; archive
Resend webhooks → delivered/bounced/complained → update delivery + suppress address
Realtime private channel (or 30–60 s polling) → badge count in web app
Scheduled types (reminders, digests, quiet-hours deferral) = deliveries with not_before timestamp
```

Main risks to check:
- the worker must authenticate with the service role and still respect tenant scope;
- pg_net calls are fire-and-forget, so pg_cron must re-sweep stuck jobs;
- the Resend free 100/day cap;
- iOS push reliability, so required messages fall back to email if there is no active push subscription.
