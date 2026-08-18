# Kiosk Customer Discovery Plan

Status: plan prepared on 2026-08-17. Recruitment, outreach, interviews, product telemetry, and
managed-device testing have not started.

## Purpose

Determine whether Newfork customers have enough recurring operational need to justify:

1. supported Android managed-device deployment,
2. a later offline-capture security spike,
3. managed-deployment support pricing,
4. specific accessibility hardware or mounting requirements.

The current online browser kiosk remains the baseline. This discovery does not reconsider payroll,
labor, compliance, biometrics, GPS, camera, or employee-surveillance features.

## Evidence Boundary

- Competitive products and platform capabilities are context, not customer-demand proof.
- Preferences such as "that sounds useful" do not count as operational need.
- A remembered incident without frequency, impact, and current workaround is weak evidence.
- A pilot commitment is stronger than stated willingness to try or pay.
- Interview findings do not approve implementation. They inform a separate product decision.

## Participant Mix

Recruit at least 8 operating locations across at least 3 organizations. Do not fill the sample with
multiple nearly identical locations from one operator.

Complete at least 10 interviews: at least 3 decision-makers, 3 location managers, and 4 hourly
employees. An IT or outsourced-support participant can supplement but not replace employee input.

Cover these dimensions:

| Dimension     | Required variation                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| Size          | Single-location and multi-location operators                                                           |
| Role          | Owner/operator, location manager, and hourly employee perspectives                                     |
| Current clock | Shared tablet/POS, manager terminal, paper, or employee phone                                          |
| Device        | Android, iPad, POS/desktop, and no dedicated device where available                                    |
| Network       | Stable, intermittent, and known outage-prone environments                                              |
| IT capacity   | No internal IT, outsourced support, and managed-device/EMM experience                                  |
| Placement     | Counter, kitchen/back office, entrance, mobile station, or other actual placement                      |
| Accessibility | At least two locations with a concrete motor, visual, cognitive, reach, language, or input-access need |

Interview decision-makers and operators separately when possible. Employees must be invited
voluntarily and should not be interviewed in the presence of a manager about individual time-clock
mistakes or accommodation needs.

## Recruitment Screener

Record only what is needed to balance the sample:

1. How many locations and hourly employees does the organization operate?
2. How do employees currently clock in, start or end breaks, and clock out?
3. Is any shared device used? Who owns and supports it?
4. Which device and operating system are used?
5. Has the location had an internet or device outage affecting time capture in the last 90 days?
6. Does the organization already use MDM, EMM, Apple Business Manager, or Android Enterprise?
7. Is the participant an operator, manager, employee, or IT/support stakeholder?
8. Are there known accessibility or physical-placement constraints the participant is comfortable
   discussing?
9. Would the organization consider a time-bounded pilot on customer-owned hardware?

Do not collect employee names, PINs, schedules, time records, disability diagnoses, or account
credentials in the screener.

## Interview Flow

Use a 30-40 minute semi-structured interview. Complete current-state questions before showing any
Newfork concept.

### 1. Current Workflow

- Walk me through the last normal shift change from the first clock-in to the final clock-out.
- Where is the clock device, and what happens when several employees need it together?
- Who sets up, updates, restarts, replaces, and physically secures the device?
- What information can employees see before and after identifying themselves?

### 2. Recent Incidents

- Tell me about the most recent time an employee could not record an action as intended.
- What happened next, who noticed, and how was the record repaired?
- How often has that happened in the last 30 and 90 days?
- What was the operational cost: queue, missed record, manager correction, support call, or lost
  confidence?

Ask for a concrete last occurrence before asking for general opinions.

### 3. Device Lockdown And Support

- Has someone left the clock screen, changed settings, opened another app, or disconnected power?
- What controls exist today: browser full screen, Guided Access, screen pinning, Single App Mode,
  Android lock task, MDM, physical enclosure, or none?
- Which failures can the location manager recover without outside help?
- Who is responsible for remote wipe, OS updates, Wi-Fi certificates, and replacement?
- What support response time would make a managed deployment useful rather than burdensome?

### 4. Connectivity

- Describe the most recent internet outage during operating hours.
- How long did it last and how did employees record time while disconnected?
- Was the problem internet loss, Wi-Fi coverage, captive portal, DNS, device failure, or backend
  availability?
- When connectivity returned, who reconciled records and how were conflicts handled?
- Is delayed manager visibility acceptable? For how long?

Do not ask "Would offline mode help?" until the actual outage workflow is understood.

### 5. Accessibility And Placement

- Who has difficulty seeing, reaching, touching, hearing, reading, or navigating the current clock?
- Is the screen reachable from seated and standing positions?
- Are glare, noise, gloves, wet hands, limited dexterity, language, or privacy practical barriers?
- Which alternatives are currently used: keyboard, switch, stylus, screen reader, assistance, or a
  second station?
- What would make independent use easier without exposing another employee's identity or PIN?

Record functional barriers and requested outcomes, not diagnoses.

### 6. Concept Reaction

Only after current-state evidence is complete, describe three separate concepts without promising
delivery:

1. current online browser kiosk on customer hardware,
2. customer-owned Android device locked to Newfork through the customer's EMM,
3. offline actions queued for later server reconciliation with visible pending/rejected states.

For each concept ask:

- Which observed problem would this solve, if any?
- What new responsibility or failure would it create?
- Who would approve, configure, pay for, and support it?
- What would have to be proven in a pilot?
- What would make the organization reject it?

### 7. Commitment And Pricing Evidence

- Would the organization supply a factory-reset device and EMM access for a limited pilot?
- How many locations and devices would it commit?
- Who is the named pilot owner and support contact?
- Which measurable outcome would justify continuing after the pilot?
- Does the organization expect managed deployment support inside the Time plan, per location, per
  device, or as a separate service? Why?
- Which current expense or support task would this replace?

Do not present a price before the participant explains the expected value and budget owner. Record a
pilot commitment only when an owner, device count, and expected outcome are identified.

## Deidentified Evidence Log

Keep raw recordings, contact information, and consent records outside the repository in an approved
restricted system. Add only deidentified summaries here or to a future research report.

Use one row per distinct observation:

| Field                  | Value                                                                      |
| ---------------------- | -------------------------------------------------------------------------- |
| Research ID            | Organization and location pseudonym, for example `ORG-A / LOC-2`           |
| Participant role       | Owner, manager, employee, or IT/support                                    |
| Environment            | Device, OS, current clock, network, placement                              |
| Observation            | Concise paraphrase without names or identifying details                    |
| Evidence type          | Observed workflow, recent incident, stated preference, or pilot commitment |
| Recency                | Date or bounded period                                                     |
| Frequency              | Count or range in 30/90 days                                               |
| Impact                 | Queue, missed record, correction, support, downtime, accessibility barrier |
| Current workaround     | Actual response used today                                                 |
| Proposed need          | Browser, managed device, offline, accessibility, or none                   |
| Contradicting evidence | Facts that weaken the proposed need                                        |
| Follow-up              | Specific unanswered question                                               |

## Scoring Rubric

Score managed-device and offline problems independently. Do not combine them into one "kiosk
demand" score. Accessibility barriers and packaging evidence use the separate rules below.

| Measure              | 0                   | 1                        | 2                                      | 3                                                  |
| -------------------- | ------------------- | ------------------------ | -------------------------------------- | -------------------------------------------------- |
| Frequency            | Never               | Less than quarterly      | Monthly                                | Weekly or more                                     |
| Operational impact   | None                | Minor workaround         | Manager correction/support             | Blocks capture or independent use                  |
| Cross-location reach | One isolated report | Repeated at one location | Multiple locations in one organization | Multiple organizations                             |
| Commitment           | No interest         | Concept interest         | Named pilot owner                      | Device count, owner, and success outcome committed |

Interpretation:

- `0-4`: no implementation case; retain browser baseline.
- `5-8`: continue discovery or run a narrow feasibility check only if one critical unknown dominates.
- `9-12`: eligible for a separately approved pilot plan when the Phase 12D organization/device
  thresholds are also met.

The score structures judgment; it does not replace contradictory evidence or security review.

## Decision Rules

### Android Managed-Device Pilot

Recommend a lab and pilot plan only when:

- at least 3 organizations commit at least 10 customer-owned devices,
- each organization names an operational owner and accepts responsibility boundaries,
- observed escape, administration, recovery, or support problems recur beyond a stated preference,
- the organizations can supply or select an EMM path,
- success metrics and an exit/recovery procedure are agreed.

Otherwise keep the online browser kiosk as the supported baseline.

### Offline Security Spike

Recommend a threat-modeled spike only when:

- at least 3 organizations show recurring, business-disrupting connectivity loss,
- incidents are connectivity failures rather than device, Wi-Fi configuration, or backend defects
  better solved elsewhere,
- customers accept bounded offline authorization, delayed visibility, rejected conflicts, and
  manager reconciliation,
- managed hardware and secure local key/storage options can be tested.

Offline preference, competitor parity, or one exceptional outage is insufficient.

### Accessibility

Do not require cross-customer prevalence or pilot commitment before investigating an accessibility
barrier. One credible report that an employee cannot independently complete a core kiosk action can
justify a separately scoped accessibility review or fix. Validate the functional barrier with the
affected user where possible, check whether it is caused by software, mounting, hardware, policy,
or assistance practices, and avoid recording diagnoses.

Hardware procurement or a supported mounting program still requires pilot-environment evidence;
baseline product accessibility does not.

### Packaging

Do not create entitlement or billing work from interview sentiment. A packaging proposal requires:

- a validated buyer and budget owner,
- measured provisioning and support cost from a pilot,
- willingness-to-pay evidence tied to a replaced cost or operational outcome,
- a clear distinction between core browser kiosk and managed deployment support.

## Discovery Output

After the minimum sample, produce one evidence-backed report containing:

- participant mix and known sample bias,
- confirmed problems and contradictory evidence,
- managed-device and offline findings scored separately,
- accessibility barriers evaluated by independent-use impact rather than demand prevalence,
- packaging evidence tied to buyer, replaced cost, and measured support burden,
- pilot commitments without customer-identifying data in the repository,
- go, extend-discovery, or no-go recommendation for each track,
- unverified assumptions and the smallest next experiment.

## Stop Conditions

Stop or redesign discovery if recruitment reaches only one customer profile, managers speak for all
employees, participants cannot describe recent incidents, raw personal data would need to enter the
repository, or proposed features are being sold before their risks and ownership are explained.

## Next Decision Gate

The synthetic workflow dry run is recorded in `kiosk-customer-discovery-synthetic-dry-run.md`, and
unsent execution materials are prepared in `kiosk-customer-discovery-outreach-kit.md`. Neither is
customer evidence. No outreach has been performed. Before participant contact, an authorized
research owner must supply the approved contact channel, restricted research store,
consent/retention policy, scheduling method, and compensation decision. Android lab work remains
gated by real discovery evidence.
