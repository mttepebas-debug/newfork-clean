# Kiosk Customer Discovery Synthetic Dry Run

Status: completed on 2026-08-17 using fictional cases only. Nothing in this document is customer
evidence, a customer quote, a demand signal, a pilot commitment, or implementation approval.

## Purpose

Test whether the discovery plan can:

- preserve contradictory evidence,
- keep managed-device, offline, accessibility, and packaging decisions separate,
- prevent a high problem score from bypassing hard pilot thresholds,
- distinguish concept interest from an operational commitment,
- produce a clear next step without inventing demand.

## Fictional Sample

The cases below were constructed for process coverage. They do not represent real organizations.

| Research ID     | Environment                                                | Fictional current-state evidence                                                                       | Counter-evidence                                                                          |
| --------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `SYN-A / LOC-1` | 45 employees, shared Android tablet, no EMM                | Employees leave the browser weekly; manager restores it; operator volunteers as a possible pilot owner | No committed device count or success outcome; captures usually complete after restoration |
| `SYN-A / LOC-2` | 28 employees, Android tablet at a high/glare-prone counter | Two recent escape incidents; one seated employee needs assistance reaching the screen                  | No device or mounting budget is committed                                                 |
| `SYN-A / LOC-3` | 22 employees, fixed POS browser                            | No escape or outage incident in 90 days                                                                | Managed-device benefit is unclear here                                                    |
| `SYN-B / LOC-1` | 60 employees, supervised iPad with MDM                     | Monthly 20-40 minute Wi-Fi outages create paper records and manager corrections                        | Existing lockdown already works; Android is not desired                                   |
| `SYN-B / LOC-2` | 38 employees, mounted iPad                                 | One employee cannot independently use the mounted touch flow; PIN privacy is poor when assisted        | Network and device administration are stable                                              |
| `SYN-B / LOC-3` | 30 employees, managed iPad                                 | No material kiosk incident in 90 days                                                                  | Current managed setup is considered sufficient                                            |
| `SYN-C / LOC-1` | 75 employees, POS browser                                  | Weekly captive-portal failures cause 5-10 minute capture delays and later corrections                  | Root cause may be network configuration, not offline product capability                   |
| `SYN-C / LOC-2` | 20 employees, unmanaged Android tablet                     | One brief outage in 90 days; owner says offline sounds useful                                          | No missed capture, pilot owner, device count, or success outcome                          |

The fictional set covers eight locations, three organizations, Android/iPad/POS surfaces, stable and
intermittent networks, existing and absent device management, contradictory locations, and two
independent-use barriers. A real study still requires the role-specific minimum interview count in
the discovery plan.

## Example Evidence Rows

| Research ID     | Track          | Evidence type           | Frequency and impact                 | Current workaround          | Contradicting evidence                       |
| --------------- | -------------- | ----------------------- | ------------------------------------ | --------------------------- | -------------------------------------------- |
| `SYN-A / LOC-1` | Managed device | Recent incidents        | Weekly; manager interruption         | Reopen browser              | Actions usually remain available online      |
| `SYN-B / LOC-1` | Offline        | Recent incidents        | Monthly; paper plus correction       | Paper log                   | Existing lockdown is not the problem         |
| `SYN-B / LOC-2` | Accessibility  | Independent-use barrier | Ongoing; employee needs assistance   | Coworker/manager assistance | Hardware placement may be the primary cause  |
| `SYN-C / LOC-1` | Offline        | Recent incidents        | Weekly; short delays and corrections | Retry after captive portal  | Network remediation may be smaller and safer |
| `SYN-C / LOC-2` | Offline        | Stated preference       | One low-impact outage                | Wait and retry              | No operational loss or commitment            |

The dry run showed that incident evidence and counter-evidence fit the log without forcing a feature
conclusion. It also showed why stated preference must not be scored as a recent incident.

## Trial Scorecard

These scores test arithmetic and gate behavior only.

| Track                  | Frequency | Impact | Reach | Commitment | Total | Hard-gate result                                                                                         |
| ---------------------- | --------: | -----: | ----: | ---------: | ----: | -------------------------------------------------------------------------------------------------------- |
| Android managed device |         3 |      2 |     2 |          2 |     9 | Fail: fewer than 3 organizations and 10 committed devices                                                |
| Offline capture        |         3 |      2 |     3 |          1 |     9 | Fail: fewer than 3 organizations with qualifying recurring disruption and no managed-hardware commitment |

Both fictional tracks reach the rubric's pilot-eligible band but fail their mandatory thresholds.
This is the intended result: score and hard gate are conjunctive, not alternative approval paths.

### Accessibility Result

Applying the same demand score to accessibility produced a false framing. The two fictional barriers
could score highly because they block independent use, but baseline accessibility must not wait for
three organizations or a paid pilot. The discovery plan was changed so one credible core-action
barrier can trigger a separately scoped accessibility review while hardware procurement remains
evidence-gated.

### Packaging Result

The fictional sample contains no validated support cost, buyer budget, replaced expense, or actual
willingness-to-pay evidence. Packaging therefore receives **no score and no proposal**, even though
some fictional participants express concept interest.

## Process Findings

### Passed

- Eight locations and three organizations can be represented without exposing identities.
- The evidence log preserves recency, workaround, and contradictory facts.
- Separate managed-device and offline scores avoid a generic kiosk-demand number.
- Hard organization/device thresholds prevent a score-only pilot approval.
- Concept interest does not become commitment without an owner, device count, and success outcome.
- Network configuration remains a competing explanation for apparent offline demand.

### Plan Corrections Made

- Added a minimum of 10 role-balanced interviews so location count cannot substitute for employee
  and manager perspectives.
- Restricted the numeric rubric to managed-device and offline problems.
- Added a separate accessibility rule based on independent-use impact rather than demand prevalence.
- Clarified packaging output as buyer/cost/support evidence rather than a feature score.

### Still Untested

- Recruitment feasibility and sample bias.
- Whether real participants can recall bounded recent incidents.
- Consent, raw-note storage, and deidentification operations.
- Real willingness to commit devices, EMM access, owners, and measurable outcomes.
- Inter-rater consistency when two researchers score the same evidence.
- Any Android, Apple, EMM, hardware, network, or offline runtime behavior.

## Dry-Run Decision

- **Managed device:** no-go from synthetic data; await real evidence.
- **Offline:** no-go from synthetic data; await real evidence and preserve the online-only contract.
- **Accessibility:** validate and remediate credible independent-use barriers independently of market
  demand when real evidence exists.
- **Packaging:** no-go until pilot support cost and real buyer evidence exist.

## Next Decision Gate

The discovery workflow is internally coherent after the corrections above, but external validity is
zero because all cases are fictional. The next permissible step requires user-provided access to
real participants or deidentified real interview evidence. Android lab work and all runtime changes
remain unapproved.
