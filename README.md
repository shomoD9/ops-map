# ops-map

A Chrome extension that replaces the new tab page with a visual map of your active campaigns, projects, and missions.

## V1 Status

V1 is implemented as a Manifest V3 extension with inline editing, draggable campaign regions, clickable project nodes, mission rollover (current -> previous), physical project support, per-device web launch routing, and manual cross-browser transfer via export/import.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select `/Users/shomo/development/build/ops-map`.

## Core Interactions

- Click `New Campaign` to create a campaign region.
- Rename a campaign by editing its title directly.
- Edit mission text directly inside each campaign.
- Click `+ Project` on a campaign (or `New Project`) to add projects as either `Launchable` or `Physical Artifact`.
- Right-click a project node to edit or reassign campaigns.
- Click a launchable project node to open its link/URI.
- Use `Web opens in` in the header to choose whether web links open in the current browser or via Edge (best effort) on this device.
- Click `Export Data` to download your full Ops Map map state as JSON.
- Click `Import Data` to load a previously exported JSON file. Import replaces current campaigns/projects/missions/layout after explicit confirmation.
- Click `Google Sync` to view current cloud-sync status and transfer guidance.

## Sync Behavior

- `chrome.storage.sync` is used for map data sync across Chrome instances when the same Google profile has Chrome Sync enabled.
- Cross-browser automatic sync (Chrome <-> Edge via Google account) is not implemented yet.
- Use export/import for cross-browser and cross-device transfer today.
- Device-specific browser launch preference is intentionally local and is not included in exported map files.
