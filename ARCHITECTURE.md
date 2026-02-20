# Opening

Ops Map is a Manifest V3 browser extension that replaces the default new-tab page with a compact operating board for active work. The system is designed for immediate orientation: when a tab opens, the user should see campaign intent, current mission text, and actionable project entries without panning, dragging, or restoring layout state from memory. The architecture therefore optimizes for structural clarity first and visual novelty second.

The current interface intentionally abandons free-form spatial mapping in favor of a fixed six-slot board. This shift is not cosmetic; it changes the system contract. The board now assumes a maximum of six campaigns, and each campaign occupies a deterministic section. By constraining placement, the runtime eliminates overlap failure modes and keeps reading order stable even when projects belong to multiple campaigns.

Persistence remains local-first with synchronized extension storage where available. Shared map data is saved in `chrome.storage.sync`, while machine-specific behavior such as link launch target remains local to each installation. Cross-browser continuity is handled through explicit export/import, and a separate Google Sync module exists as a scaffold for future cloud-backed synchronization.
The current presentation layer adopts a typographic editorial direction with a monochrome palette: off-white surfaces, black ink tones, Garamond-led typography, and hand-drawn-style campaign outlines. This keeps the UI visually quiet while still giving container boundaries a human, sketched character.

# Ontology

The core entity is the campaign. A campaign is a strategic container with a name, a color, and mission continuity fields (`currentMission` and `previousMission`). In board mode, campaigns are ordered entities rather than spatial ones. They still carry legacy coordinate fields in state for compatibility with older payloads, but the renderer no longer depends on those coordinates to determine display. Campaign color is still preserved in stored and imported data for compatibility, yet direct color editing is intentionally removed from the board UI because the interface now uses one global accent system.

The second core entity is the project. A project represents executable or trackable work and can belong to one or many campaigns. Launchable projects hold a link or URI and can be opened directly from the board. Physical projects are deliberately non-launchable, allowing real-world artifacts to remain in the same model without fake URLs. When a project belongs to multiple campaigns, the same project appears in each relevant campaign section as an intentional duplicate view.

A third entity type is the device preference record. This stores local behavior decisions that should not propagate with shared map state, most notably whether standard web URLs should open in the current browser or attempt an Edge handoff. This separation keeps collaboration-safe data distinct from personal machine ergonomics.

# Geography

At the root, `manifest.json` declares extension metadata, permissions, and the new-tab override. The page shell lives in `newtab.html`. That shell defines a collapsible left sidebar for global controls, a main board container with six uniform campaign slots rendered by JavaScript, an inline panel root for create/edit/import/export workflows, and a hidden file input used for JSON imports.

Visual structure is implemented in `styles/newtab.css`. The stylesheet establishes spacing tokens, sidebar behavior, board grid geometry, campaign card hierarchy, project row rhythm, and panel styling. It intentionally encodes uniform section behavior so rendering remains clean under dense text and mixed project membership. The same file also defines collapsed-sidebar behavior and responsive rules that preserve card readability on narrower widths.

Runtime behavior is coordinated in `src/main.js`. This module initializes state and preferences, wires user interactions, renders the six-slot board, handles inline edits, opens project and campaign forms, and drives import/export/google-sync scaffold panels. It also owns persistence timing through debounced saves and storage subscriptions so multiple windows remain consistent.

Board-shaping helpers live in `src/layout.js`. In the current architecture, this module no longer computes coordinates. Instead, it derives visible campaigns, constructs fixed slot assignments, and builds campaign-to-project groupings for rendering. The domain model lives in `src/model.js`, which normalizes payloads, enforces invariants, applies mutations, and now enforces the six-campaign cap. Persistence adapters are split into `src/storage.js` for shared map state and `src/devicePrefs.js` for local machine preferences. Transfer concerns are isolated in `src/transfer.js`, and deferred cloud status is exposed by `src/googleSync.js`.

Supporting product context remains in `README.md` and `docs/`. `README.md` explains operator-facing usage and current sync boundaries. `docs/V1_SPEC.md` and `docs/VISION.md` capture implementation scope and longer-term direction.

# Flow

When a new tab opens, `newtab.html` loads `src/main.js`. Initialization loads synchronized map state and local device preferences in parallel. The incoming state is normalized through `src/model.js`, then applied as the in-memory source of truth for rendering. Rendering itself is deterministic: `src/layout.js` creates a six-slot view model, `src/main.js` renders each slot as either an active campaign card or an empty placeholder, and project lists are generated by campaign membership. The board is locked to exactly two campaign columns across the available width, and additional campaigns are reached through downward scrolling.

Editing flow is split by complexity. Campaign title edits happen inline, and mission edits now use a compact single mission field without a dedicated heading block; contextual guidance is delivered via tooltip text while the field still commits on blur through model mutation helpers. Campaign creation assigns a fixed accent-compatible color value into model state for backward compatibility, but color is no longer exposed as an interactive control in the board header. Project creation and editing use the panel form because project mode, link type, and campaign memberships require structured controls, while each campaign card renders project entries in a two-column chip grid with a minimal `+` add control beside the projects heading and compact inline edit icons embedded in each project pill. Launching a project depends on mode: launchable entries open links, while physical entries produce a local explanatory tooltip.

Transfer flow is explicit and defensive. Export serializes a versioned payload containing map data only. Import reads JSON text, validates envelope and version, normalizes the incoming state, and presents a replace-all confirmation that compares current and incoming campaign/project counts before any mutation occurs. Invalid imports stop at panel messaging and do not change state. Background synchronization flow continues through storage subscriptions: remote state updates are normalized and applied without forcing page refresh.

# Philosophy

The architecture now prioritizes legibility guarantees over free-form map expression. Earlier spatial rendering offered flexibility but made cleanliness fragile under real-world text lengths and mixed memberships. The six-slot board makes the visual contract explicit: every campaign gets a stable container, every project has a consistent row treatment, and no interaction can degrade into geometric collision chaos.

Boundaries between concerns remain deliberate. Domain integrity is kept in `src/model.js`, board composition in `src/layout.js`, and browser-side integration in `src/main.js`. This separation keeps changes local: visual rework can happen in CSS and renderer code without mutating persistence semantics, and future sync upgrades can replace the Google scaffold without re-architecting campaign/project interaction.
The editorial redesign follows the same philosophy. Typography, color, spacing, and interaction restraint are implemented as a system of tokens and component rules, which keeps the interface warm and assured without introducing decorative complexity into runtime logic.

The final tradeoff is practical and intentional. Ops Map gives up infinite canvas behavior in exchange for predictability, readability, and maintenance simplicity. Within this constraint, the product still preserves key flexibility through multi-campaign project membership, inline editing, and portable export/import workflows.
