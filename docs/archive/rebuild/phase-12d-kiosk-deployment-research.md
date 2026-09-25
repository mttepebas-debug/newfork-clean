# Phase 12D Kiosk Deployment Research

Status: research complete on 2026-08-17. No native, managed-device, offline, entitlement, or billing
implementation is approved by this document.

## Decision Summary

1. Keep the current online browser kiosk as the default product surface and include it with the
   future core Time capability. Do not add a device surcharge or higher-tier gate without customer
   evidence.
2. If demand passes the pilot gate, test an Android-first managed deployment using a managed web app
   and a customer-selected EMM. The existing web kiosk can remain the application surface; a native
   wrapper is not required for the first managed-device pilot.
3. Treat Apple support as a separate supervised-iPad/MDM compatibility track. Do not promise that a
   full-screen Web Clip alone provides Single App Mode or remote administration.
4. Do not implement offline capture now. Browser storage and background synchronization do not meet
   the current security, revocation, time-ordering, and cross-browser reliability contract.
5. Define accessible hardware and mounting criteria, but do not select, resell, or support a device
   model until real pilot environments are known.

## Evidence Boundary

This research uses current official platform documentation and public first-party competitor
pages. It proves platform capabilities and visible market packaging, not Newfork customer demand,
hardware compatibility, EMM interoperability, support cost, willingness to pay, or production
reliability. No customer interviews, product telemetry, managed-device lab, outage simulation, or
hardware test was available in this phase.

## Customer Demand Gate

Competitor availability proves that shared time clocks are an established category, but it does
not prove which Newfork customers need managed lockdown or offline capture. Before implementation:

- Interview at least 8 customer or design-partner locations across restaurant sizes and network
  conditions.
- Record device ownership, Android/iPad mix, existing EMM use, outage frequency and duration,
  shared-device placement, accessibility needs, internal IT capacity, and willingness to pay for
  device administration.
- Recruit at least 3 organizations and 10 devices for a managed-device pilot before promising a
  supported deployment.
- Require recurring operational need, not preference alone, before an offline spike: at least 3
  pilot organizations must report business-disrupting connectivity loss and accept reconciliation
  and delayed-manager-visibility constraints.
- Measure pilot provisioning time, failed enrollments, support contacts per device-month, remote
  recovery rate, kiosk uptime, browser/app update incidents, and device replacement time.

These thresholds are product decision gates, not claims of statistically representative research.

## Deployment Options

| Option                    | Capability                                                        | Main risk                                                       | Decision                    |
| ------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------- |
| Ordinary browser          | Current online capture on customer hardware                       | User can leave the page; no remote administration               | Keep as default             |
| Android managed web app   | Lock task, boot launch, URL allowlist, remote policy through EMM  | Provisioning and EMM support burden                             | Preferred pilot             |
| Android native wrapper    | Native lifecycle, platform storage, deeper device APIs            | New codebase, stores/distribution, parity burden                | Not justified yet           |
| Supervised iPad           | Single App Mode and managed app controls through MDM/Configurator | Supervision and Apple administration requirements               | Compatibility research only |
| iPad full-screen Web Clip | Browser chrome removal and managed shortcut                       | Full screen is not itself a lockdown or remote-support contract | Convenience only            |
| ChromeOS web kiosk        | Managed PWA/web URL with auto-launch and kiosk policy             | Different hardware and licensing ecosystem                      | Future alternative          |

### Android

Android dedicated devices are fully managed, organization-owned devices. A device policy
controller or EMM can allowlist an app in lock task mode; ordinary screen pinning is explicitly
different because a user can exit it. Android Management API policies can designate a managed web
app as the kiosk app, force-install Chrome, allowlist only the Newfork origin, launch on boot, and
restrict system surfaces. This permits an Android pilot without a native wrapper.

Recommended pilot boundary:

- Customer owns the device, EMM tenant, network, mounting, power, and physical security.
- Newfork publishes a tested policy recipe and supported browser/OS matrix but does not become the
  customer's general device administrator.
- Provisioning begins from a factory-reset, fully managed device and includes replacement, remote
  lock/wipe ownership, OS update windows, certificate rotation, URL allowlisting, and recovery.
- Each supported EMM/device combination needs end-to-end enrollment, update, restart, network loss,
  and revocation tests.

Official basis:

- [Android dedicated devices](https://developer.android.com/work/dpc/dedicated-devices)
- [Android lock task mode](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode)
- [Android Management API dedicated-device policies](https://developers.google.com/android/management/policies/dedicated-devices)
- [Android Enterprise dedicated-device management](https://support.google.com/work/android/answer/9560920)

### Apple

Apple Single App Mode forces one selected app to remain open on a supervised device and reopens it
after restart. Supervision gives organizations additional restrictions and silent app management;
it is not the default state of ordinary customer iPads. Managed Web Clips can open full screen and
can be made nonremovable, but those properties alone do not establish a complete Single App Mode
deployment.

Before claiming iPad support, run a supervised-device lab with at least two current iPadOS versions
and the intended MDM. The lab must determine whether the supported surface is Safari, a managed Web
Clip, or a minimal managed wrapper; verify restart recovery, guided/single-app escape, certificate
and app updates, remote removal, VoiceOver, Switch Control, external keyboard, and kiosk credential
replacement.

Official basis:

- [Apple Configurator Single App Mode](https://support.apple.com/guide/apple-configurator-mac/set-single-app-mode-cadbf9c172/mac)
- [Apple device supervision](https://support.apple.com/guide/apple-configurator-mac/supervise-devices-apd9e4f64088/mac)
- [Apple Web Clip management](https://support.apple.com/guide/deployment/web-clips-payload-settings-depbc7c7808/web)
- [Apple managed app distribution](https://support.apple.com/guide/deployment/distribute-managed-apps-dep575bfed86/web)

## Offline Feasibility

The existing implementation is intentionally online-only and has no service worker, PWA manifest,
IndexedDB event store, local employee verifier, or synchronization engine. Adding an application
shell cache would not make time capture safely offline.

Browser technology can store structured data in IndexedDB and defer work with Background Sync, but:

- Background Sync is not available across all widely used browsers.
- Browser storage can be cleared, evicted, corrupted, or ephemeral in private browsing.
- IndexedDB provides local transactions, not server reconciliation.
- A revoked device or employee cannot be known immediately while disconnected.
- Device wall-clock time is not trusted server time.
- Multiple devices can create conflicting clock and break transitions.
- Encryption at rest does not solve key custody, unlocked-device access, replay, or rollback.

Therefore browser-only offline capture is **not recommended** for implementation. If customer demand
passes the gate, the next permissible step is a threat-modeled spike, preferably on managed
hardware, that proves:

- hardware- or OS-protected device keys and encrypted local storage,
- signed device sequence numbers and append-only event identifiers,
- monotonic local ordering separated from claimed wall-clock time,
- bounded offline authorization and explicit revocation horizon,
- duplicate/replay rejection and deterministic server reconciliation,
- visible queued, accepted, rejected, and manager-review states,
- safe stolen-device recovery and remote credential invalidation,
- crash, power-loss, storage-pressure, clock-change, and multi-device conflict behavior.

Official web-platform basis:

- [MDN Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- [MDN IndexedDB key characteristics](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology)
- [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

## Accessibility Hardware Criteria

Do not prescribe one tablet model yet. A pilot procurement checklist should require:

- a stable 10-13 inch display with sufficient brightness, durable power delivery, and an enclosure
  that does not cover controls, speakers, microphones, or accessibility accessories,
- adjustable or purpose-selected mounting height and angle, reachable placement, clear approach,
  glare control, cable protection, and an alternative accessible station when one fixed placement
  cannot serve all employees,
- primary kiosk controls targeting at least 44 by 44 CSS pixels, visible keyboard focus, no
  pointer-only action, screen-reader names, zoom/reflow, and high-contrast operation,
- support for platform screen readers, external keyboard or switch input, and a conductive stylus
  where direct touch is difficult,
- a private PIN-entry position and a nonvisual support path that does not expose employee identity
  or PINs.

WCAG 2.2 Level AA defines a 24 by 24 CSS-pixel minimum with exceptions; its enhanced criterion uses
44 by 44 CSS pixels. Newfork should use the larger value for frequent shared-tablet controls. The
U.S. Access Board is still developing supplemental self-service kiosk guidance; its material is
useful design input, not a legal conclusion for this product.

Accessibility basis:

- [WCAG 2.2 target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [WCAG 2.2 target size enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced)
- [Android accessible touch targets](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views)
- [U.S. Access Board self-service transaction machines](https://www.access-board.gov/sstm/)

## Packaging Research

Public competitor packaging shows three patterns:

- Homebase exposes tablet/computer/POS clocking in a free location-based plan and charges higher
  monthly amounts per location for broader operations features.
- Deputy includes basic time clocking in a per-user workforce plan and distributes dedicated kiosk
  apps without a separate visible kiosk-app price.
- Connecteam includes kiosk station capability while limiting the number of time clocks across
  tiers.

Sources:

- [Homebase pricing](https://www.joinhomebase.com/pricing)
- [Deputy pricing](https://www.deputy.com/pricing)
- [Connecteam pricing](https://connecteam.com/pricing/)

Recommendation:

- Keep online kiosk access attached to core Time rather than creating a standalone kiosk SKU.
- Do not copy competitor limits before Newfork has support-cost and willingness-to-pay evidence.
- If the managed pilot succeeds, evaluate a per-active-device or per-location **managed deployment
  support** add-on. Price the operational service, not the existence of the browser route.
- Keep customer-owned hardware and EMM charges outside Newfork billing initially.
- Do not bundle offline capture with managed lockdown; they have different risk, cost, and support
  profiles.

## Intentionally Not Approved

- PWA installation, service worker, wake lock, background sync, offline queue, or optimistic offline
  confirmation.
- Android application, DPC, Android Management API integration, EMM partnership, or managed policy
  shipped by Newfork.
- Apple application, entitlement, MDM integration, Single App Mode profile, or supported iPad claim.
- Hardware resale, device model recommendation, mounting installation, remote wipe ownership, or
  customer help-desk commitment.
- Entitlement tables, billing integration, pricing page, paid tier, device quota, or contract terms.
- Biometrics, camera, GPS, badges, or physical-presence claims.

## Next Decision Gate

Phase 12D research is complete. The customer-discovery package is prepared in
`kiosk-customer-discovery-plan.md`, and its workflow has been tested with explicitly fictional cases
in `kiosk-customer-discovery-synthetic-dry-run.md`. Unsent execution materials are available in
`kiosk-customer-discovery-outreach-kit.md`. The dry run and outreach kit are not demand evidence; no
recruitment, outreach, or interviews have occurred. Real execution requires an authorized contact
channel and approved privacy/consent operations. Android-managed-web-app lab work remains gated by
real discovery evidence, and no runtime implementation should begin from this document alone.
