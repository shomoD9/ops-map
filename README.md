# ops-map

A Chrome extension that replaces the new tab page with a structured six-section board for campaigns, missions, and projects.

## V1 Status

V1 is implemented as a Manifest V3 extension with inline campaign and mission editing, per-campaign project lists, physical project support, per-device web launch routing, and manual cross-browser transfer via export/import.

The board now uses a fixed maximum of six campaign sections. This removes overlap-driven visualization complexity and keeps layout readability stable.
The visual system now follows an editorial style: warm paper tones, serif-led hierarchy, restrained controls, and one shared accent tone.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select `/Users/shomo/development/build/ops-map`.

## Core Interactions

- Click `New Campaign` to create a campaign section (up to six).
- The board uses a two-row horizontal flow with wider campaign cards; horizontal scrolling reveals additional campaign columns (up to six total).
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
- Cross-browser automatic sync (Chrome <-> Edge via Google account) is not implemented yet.
- Export/import is the current cross-browser transfer path.
- Device-specific browser launch preference is intentionally local and is not included in exported map files.
