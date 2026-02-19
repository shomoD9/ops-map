# Opening

Ops Map is now a working Manifest V3 Chrome extension that replaces the new tab page with a spatial map of active work. The system is designed around one moment: the first few seconds after opening the browser, when context is usually missing and momentum can be lost. Instead of showing a generic start page, the extension shows campaigns as visual regions, projects as clickable launch nodes, and missions as short direction-setting statements so resumption happens at a glance.

The implementation stays intentionally local. There is no backend, no account model, and no network dependency. Data is stored in `chrome.storage.sync`, which means the extension behaves like a personal context surface rather than a shared application platform. The architecture reflects that constraint by favoring small modules, direct state transitions, and rendering logic that can respond immediately to edits and drag interactions.

# Ontology

The core entity is the campaign, which represents a durable theme of effort and anchors both visual identity and mission context. A campaign has a name, a color, and a position on the canvas so the map can become spatial memory, not just text memory. It also carries a current mission and a previous mission, which together describe where that campaign is headed and where it was headed immediately before.

A project is a launch object tied to one or more campaigns. It has a name and a link or URI that opens the actual place where work happens. In the data model, projects are defined by campaign memberships, and in the layout model those memberships determine where the project is placed. A project with one membership sits in that campaign’s region, while a project with multiple memberships is placed at the centroid of those campaigns so overlap semantics remain visible.

A mission is not a separate table-like object in this version; it is embedded in campaign state as current and previous text fields. The mission lifecycle is handled as a rule: when current mission changes, old current becomes previous; when mission is cleared, both fields reset so the campaign returns to a true unset state. This keeps mission history intentionally shallow and low-maintenance, aligned with v1 scope.

# Geography

The root `manifest.json` declares the extension boundary, requests storage permission, and maps Chrome’s new tab override to `newtab.html`. The root `newtab.html` is the only runtime document and provides the UI shell: a top action bar, the map canvas container, an empty-state prompt, and a lightweight panel host for inline editors.

The `styles/newtab.css` file owns visual language and interaction feel. It defines the map atmosphere, campaign region styling, project node affordances, and panel layout, including responsive adjustments for narrower screens. The styling is intentionally separated from behavior so readability, hierarchy, and overlap clarity can evolve without changing state logic.

The `src/` directory contains runtime behavior split by responsibility. `src/main.js` is the orchestrator that loads state, renders campaigns and projects, wires UI events, handles drag and edit interactions, and schedules persistence. `src/model.js` is the domain layer that enforces data invariants and lifecycle rules for campaigns, projects, and mission rollover. `src/layout.js` translates memberships and campaign positions into spatial coordinates and keeps elements in-bounds across viewport changes. `src/storage.js` is the persistence adapter that hides browser API differences and falls back to localStorage outside extension runtime.

The rest of the repository documents intent and constraints. `README.md` provides the project identity. `docs/VISION.md` captures the long-range product trajectory. `docs/V1_SPEC.md` defines v1 scope and acceptance criteria. `CLAUDE.md` acts as a compact implementation brief for coding agents.

# Flow

The primary runtime flow starts when Chrome opens a new tab and loads `newtab.html`, which executes `src/main.js`. Initialization reads persisted state through `src/storage.js`, normalizes that state through `src/model.js`, applies positional defaults through `src/layout.js`, and then renders campaign regions followed by project nodes into the canvas. The render order is deliberate: campaigns establish context first, projects then appear as actionable nodes above that context.

A mission update flow begins in a content-editable mission field inside a campaign region. On blur, `src/main.js` sends the new text to `updateCampaignMission` in `src/model.js`, which applies rollover logic and returns an updated state object. The orchestrator re-renders immediately and schedules a debounced save through `src/storage.js`, preserving a fast editing feel while avoiding excessive storage writes.

A project management flow starts either from the global “New Project” action, a campaign-local “+ Project” action, or a right-click on an existing project node. The inline panel lets the user edit name, link type, helper input, final URI, and campaign memberships. The helper uses `buildLinkFromHelper` from `src/model.js` to construct URI formats for web, Obsidian, VS Code, Cursor, or custom schemes. On submit, `addProject` or `updateProject` enforces invariants such as required links and at least one campaign membership, then the map re-renders and persists.

A campaign deletion flow uses explicit confirmation in `src/main.js`, then delegates to `deleteCampaign` in `src/model.js`. That rule removes the campaign and strips its membership from all projects, deleting only projects that become orphaned. This guarantees the map never contains a project without campaign context.

# Philosophy

The architecture is deliberately small and local because the product promise is speed of resumption, not system breadth. The module split follows cognitive boundaries rather than framework conventions: domain truth in `src/model.js`, spatial truth in `src/layout.js`, persistence truth in `src/storage.js`, and interaction truth in `src/main.js`. This keeps tradeoffs explicit and makes behavior changes easier to reason about.

The rendering strategy chooses direct DOM updates over framework abstraction to reduce startup overhead and keep the extension lightweight. The persistence strategy chooses debounced sync writes to balance responsiveness with storage efficiency. The interaction strategy prefers inline editing, one-click launching, and right-click editing so the map remains a live surface rather than a mode-based administration interface.

The main accepted tradeoff in v1 is simplicity over advanced layout intelligence. Campaign overlap and project placement are heuristic rather than physics-driven, and mission history is one step deep by design. Those constraints keep the experience fast and legible while leaving room for future sophistication without changing the core ontology.
