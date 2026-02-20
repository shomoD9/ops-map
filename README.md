# ops-map

A Chrome extension that replaces the new tab page with a structured six-section board for campaigns, missions, and projects.

## V1 Status

V1 is implemented as a Manifest V3 extension with inline campaign and mission editing, per-campaign project lists, physical project support, per-device web launch routing, and manual cross-browser transfer via export/import.

The board now uses a fixed maximum of six campaign sections. This removes overlap-driven visualization complexity and keeps layout readability stable.
The visual system now follows a monochrome editorial style: off-white paper tones, Garamond typography, restrained controls, and hand-drawn-style campaign borders.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select `/Users/shomo/development/build/ops-map`.

## Core Interactions

- Click `New Campaign` to create a campaign section (up to six).
- The board is locked to exactly two campaign columns across the tab width, and additional campaign rows are reached by vertical scrolling.
- Click a campaign title to rename it inline.
- Edit mission text directly inside each campaign card.
- Click the `+` beside `Projects` in a campaign card (or `New Project`) to add a project.
- Each project pill includes a compact inline edit icon so edit actions stay available without visual bulk.
- Projects that belong to multiple campaigns are intentionally duplicated across those campaign sections.
- Click a launchable project button to open its link/URI.
- Right-click a project button to open edit mode quickly.
- Use the collapsible left sidebar (`<<` / `>>`) to show or hide controls.
- Use `Web opens in` to choose whether web links open in the current browser or via Edge (best effort) on this device.
- Use `Export Data` and `Import Data` for cross-browser and cross-device transfer.
- Use `Google Sync` to view current cloud-sync scaffold status and guidance.

## Sync Behavior

- `chrome.storage.sync` is used for map data sync across Chrome instances when the same Google profile has Chrome Sync enabled.
- For unpacked installs, extension IDs must match across devices or sync data is isolated per ID.
- `manifest.json` includes a pinned extension `key` so this repo resolves to one stable extension ID across devices.
- Cross-browser automatic sync (Chrome <-> Edge via Google account) is not implemented yet.
- Export/import is the current cross-browser transfer path.
- Device-specific browser launch preference is intentionally local and is not included in exported map files.

## Unpacked Cross-Device Sync

Chrome profile sign-in alone is not enough for extension state to carry over. Chrome sync scopes extension data by extension ID, so both devices must run the same Ops Map extension ID. This repository pins the ID through the `manifest.json` `key` field, which keeps unpacked installs aligned as long as both devices load this same source tree.

To verify alignment, open `chrome://extensions` on each device with Developer mode enabled and compare the Ops Map extension ID. The IDs must be identical. In-app, the `Google Sync` panel now also prints the local extension ID and active storage backend so you can confirm runtime conditions from the new-tab UI.

If you are migrating from older unpacked installs that used different IDs, use this one-time flow: export from the primary device, remove the old unpacked extension on both devices, load this updated repo on both devices, confirm matching IDs, import on the primary device, then let Chrome sync propagate to the secondary device.

Sync timing is eventual rather than instant. Ops Map writes with a short local debounce and then relies on Chrome Sync transport, so cross-device appearance usually lands within seconds but can sometimes take a few minutes.
