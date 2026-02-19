# Opening

Ops Map is a Manifest V3 Chrome extension that replaces the default new tab page with a live map of campaigns, projects, and missions. The central idea is still context resumption: when the tab opens, the user should be able to understand what matters right now and jump directly into work. The implementation is intentionally direct. There is no server, no account layer, and no remote API. The system is built to be immediate, personal, and low-maintenance.

The current version extends the first release with device-aware launch behavior and a broader concept of what a project can be. Projects are no longer only URL-backed launch targets. A project can now be a launchable digital destination or a physical artifact that lives in the map for context but does not open a link. This keeps the map honest when active work includes things that are real but not URL-addressable.

# Ontology

The campaign remains the primary region-level entity. It carries identity through name and color, position through x/y coordinates, and directional context through mission text. Mission state is intentionally shallow and operational: a campaign stores current mission and previous mission, with previous mission automatically updated when current mission changes.

The project entity now has two modes. In launchable mode, a project represents a doorway into a URI and carries a link type plus normalized link value. In physical mode, a project represents a real-world artifact or non-launchable work object; it still belongs to one or more campaigns, still participates in spatial layout, but intentionally stores no launch URI. This split lets the map stay semantically correct without forcing fake links.

A third conceptual entity now exists as local runtime context: per-device preferences. These preferences are not part of synced map state because they encode machine-specific behavior, specifically how normal web links should be opened on the current device. The active preference controls whether web links open in the current browser or attempt a best-effort route into Edge.

# Geography

At the repository root, `manifest.json` defines the extension boundary, requests storage permission, and wires `newtab.html` as the new tab override. The root `newtab.html` is the runtime shell document. It provides the top bar, the map canvas mount, empty-state messaging, and the inline editing panel container, and now includes a browser-target selector used for device-local launch routing.

The `styles/newtab.css` stylesheet defines the visual system for the map. It covers the translucent top bar, campaign region sizing and overlap presentation, project node styling, physical-project differentiation, tooltip presentation, panel forms, and responsive behavior. It mirrors the classes and state data attributes emitted from runtime rendering.

The `src/` directory contains behavior modules. `src/main.js` orchestrates startup, rendering, input handling, panel workflows, drag interactions, project launch behavior, and persistence scheduling. `src/model.js` defines domain normalization and mutation rules for campaigns, missions, and both project modes, including link helper transformations across supported URI schemes. `src/layout.js` computes campaign and project placement and now also resolves responsive campaign radius so crowded maps remain legible. `src/storage.js` handles synced map persistence through `chrome.storage.sync` with local fallback behavior for non-extension contexts. `src/devicePrefs.js` handles local-only preference persistence through `chrome.storage.local`, including subscriptions that keep multiple extension tabs on the same machine aligned.

The narrative and planning documents remain in place. `README.md` provides quick-start usage. `docs/VISION.md` explains the long-term product direction. `docs/V1_SPEC.md` captures the original v1 scope and constraints. `CLAUDE.md` contains the concise implementation brief for coding agents.

# Flow

Runtime begins when a new tab loads `newtab.html`, which imports `src/main.js`. Initialization concurrently loads synced map state and local device preferences, normalizes both, applies campaign positioning constraints, and renders the canvas. Campaign regions are rendered first so spatial context appears before actionable project nodes.

When the user edits mission text inline, the blur event sends the candidate mission into `updateCampaignMission` in `src/model.js`. The model enforces mission rollover semantics, returns updated state, and `src/main.js` immediately re-renders while debouncing writes to `chrome.storage.sync` through `src/storage.js`.

When the user creates or edits a project, the panel flow in `src/main.js` collects project mode, link details when relevant, and campaign memberships. The payload is passed into `addProject` or `updateProject` in `src/model.js`, which enforces invariants. Launchable projects must have valid links, while physical projects intentionally clear link values. On success, state is rendered and persisted.

When a project node is clicked, `src/main.js` resolves behavior by mode. Physical projects show a short tooltip confirming there is no launch target. Launchable projects route by link scheme. Web links respect the local browser-target preference, while app-style URIs are opened directly via location assignment.

When campaign dragging starts, runtime records pointer-relative offset and performs frame-throttled position updates. During drag, state updates re-render without persistence. On drag finalization, the last position is committed and persisted. This preserves smooth pointer feedback without flooding storage writes.

# Philosophy

The architecture keeps a strict separation between shared truth and local preference. Shared map state belongs in synced storage because campaigns, missions, and projects are conceptual work context that should travel with the user’s Chrome profile. Launch routing preferences belong in local storage because they reflect machine-level environment differences and should not leak across devices.

The project mode expansion reflects a practical tradeoff in favor of representational accuracy. The map is more useful when it can model real active work even when that work is not directly launchable. The implementation accepts a small increase in model complexity to preserve that fidelity.

The system continues to favor explicit modules over framework abstraction. Domain mutations, layout heuristics, sync persistence, local preferences, and DOM orchestration each live in dedicated files so future changes can stay narrow and understandable. This keeps the map fast to load, straightforward to maintain, and aligned with its purpose as a low-friction context surface rather than a heavyweight productivity platform.
