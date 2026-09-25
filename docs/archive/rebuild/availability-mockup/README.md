# Availability interactive design preview

Open `index.html` directly in a browser. No server, API or database is used.

The review toolbar is outside the product preview. It switches employee, manager,
team, onboarding, Settings, Schedule and Line Up views. It also switches input
mode, desktop/mobile dimensions and the three undecided visual alternatives.

Examples are stored in browser localStorage under `availability-prototype-*`.
Reset example data with the review toolbar. They are not application records.

Icons are generated from the application's installed lucide-react package by
`node docs/archive/rebuild/availability-mockup/build-icons.cjs`. The existing application
favicon is reused as the brand asset. The preview opens without dependencies or
network access after generation.

Primary visual references: current Jobs & Departments UI contract and CSS.
These are product-design mockups, not a production implementation. In particular,
Schedule examples simulate save/publication locally, and Line Up does not add
the deferred Move here behavior.

Selected visual decisions: tabbed manager drawer, horizontally scrolling mobile
shift options, switch for All day. The manager table uses aligned day, unavailable,
All day and note columns. Empty notes do not create an additional row.

Verification: one integrated jsdom smoke check passed across 14 view/mode renders,
event handlers and core selection/save/copy/dialog interactions. Following the
compact-table update, browser screenshots were inspected at 1440px desktop and
390/320px mobile. The earlier Chrome startup issue no longer blocks this preview.
This is a design prototype, not a production-ready implementation.
