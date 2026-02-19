# Opening

Ops Map is a Manifest V3 new-tab extension designed as a context resumption surface. When the user opens a tab, the extension renders a map of campaigns, projects, and missions so intent and launch points are visible immediately. The system is intentionally local-first and lightweight: no backend service, no application account model, and no network-dependent runtime path for core usage.

The current architecture now supports two kinds of continuity. The first is browser-native continuity through `chrome.storage.sync`, which keeps map state aligned across Chrome instances signed into the same syncing profile. The second is explicit continuity through file transfer: users can export a versioned JSON snapshot and import it elsewhere, which is the practical cross-browser bridge for now. The design keeps those paths separate so automatic sync remains simple while manual transfer stays explicit and reversible.

# Ontology

The campaign is the region-level anchor of the model. It represents a durable theme of effort, carries visual identity through name and color, and carries directional context through mission fields. Mission state is intentionally minimal and operational: one current mission and one previous mission, with rollover handled as an internal mutation rule rather than a separate history subsystem.

A project is a map node that belongs to one or more campaigns. Projects can be launchable or physical. A launchable project includes URI-oriented launch data and behaves like a one-click doorway into the tool where work happens. A physical project has presence in the map without a launch URI, which allows the model to represent real-world artifacts without forcing fake links. This mode split keeps the map semantically honest while preserving one shared project abstraction.

Per-device launch preference is modeled as separate local context rather than part of shared map state. This preference controls web-link routing behavior on one machine and intentionally does not sync with map content. Transfer payloads also intentionally exclude that preference, so import/export reproduces campaign and project state without overwriting machine-specific behavior.

# Geography

At the root, `manifest.json` declares permissions and the new-tab override entrypoint. The runtime document is `newtab.html`, which hosts top-bar controls, canvas mount points, inline panel containers, and a hidden file input used by import actions. `styles/newtab.css` defines the visual system for regions, nodes, panel states, warning callouts, and destructive confirmation affordances used by transfer flows.

The `src/` directory is split by responsibility. `src/main.js` is the orchestrator and interaction layer. It coordinates startup, rendering, edits, drag behavior, project launching, export/import prompts, and save scheduling. `src/model.js` is the domain layer for normalization and state mutation rules across campaigns, missions, and project modes. `src/layout.js` resolves responsive campaign sizing and spatial placement for campaigns and projects. `src/storage.js` is the shared-state persistence boundary backed by `chrome.storage.sync` with local fallback for non-extension contexts. `src/devicePrefs.js` is the local-only persistence boundary for per-device routing preferences. `src/transfer.js` defines versioned export contracts and safe parse/validation rules for imports. `src/googleSync.js` is a deliberate scaffold interface that reports current cloud-sync unavailability while preserving a stable integration seam for future OAuth-backed sync.

The remaining root documentation files provide product context and scope boundaries. `README.md` explains setup, interaction, and sync behavior for users and contributors. `docs/VISION.md` captures long-horizon direction. `docs/V1_SPEC.md` records the initial baseline scope that this architecture extends.

# Flow

Runtime begins when Chrome loads `newtab.html` and executes `src/main.js`. Initialization loads synced map data and local device preferences in parallel, normalizes map data through `src/model.js`, clamps positions through `src/layout.js`, and renders campaigns before projects so spatial context appears first.

Editing flows remain inline. Campaign titles and mission text are content-editable fields that commit on blur, passing changes into model mutation functions and then through debounced persistence into shared sync storage. Project edits run through panel forms, where project mode determines whether launch-link fields are active. Launchable projects enforce non-empty link semantics, while physical projects intentionally suppress link requirements and launch behavior.

Transfer flow now adds a second continuity path. Export builds a versioned JSON envelope from current map state and downloads it immediately. Import starts from the hidden file input, parses and validates payload structure in `src/transfer.js`, normalizes incoming state, and then presents an explicit replace-all confirmation callout that compares current and incoming entity counts. Only explicit confirmation applies replacement state and persists it. Parse or validation failures do not mutate state and are surfaced as informational panel messages.

Google Sync flow is intentionally transparent in this iteration. Selecting Google Sync opens a scaffold panel that reports status as coming soon and directs users to export/import for current cross-browser transfer. This keeps capability messaging explicit while preserving a clean future hook for cloud sync implementation.

# Philosophy

The architecture favors explicit boundaries between shared truth and device-local behavior. Campaign and project state belongs in shared sync because it is conceptual work context, while launch routing preference belongs locally because it reflects machine environment. This distinction avoids hidden surprises during transfer and keeps per-device ergonomics intact.

The transfer design favors predictability over implicit merge complexity. Replace-all import with strong warning language is chosen because it is deterministic, easy to explain, and low-risk to reason about. Versioned envelopes and strict validation create a stable contract that future migration logic can build on without weakening current safety.

The system continues to prioritize readability and low operational overhead. Domain logic, layout heuristics, persistence boundaries, transfer contracts, and UI orchestration remain separated in dedicated modules, so future evolution can happen in narrow slices without blurring concerns.
