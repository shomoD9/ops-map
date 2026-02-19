# ops-map

A Chrome extension that replaces the new tab page with a visual map of your active campaigns, projects, and missions.

## V1 Status

V1 is implemented as a Manifest V3 extension with inline editing, draggable campaign regions, clickable project nodes, and mission rollover (current -> previous).

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select `/Users/shomo/development/build/ops-map`.

## Core Interactions

- Click `New Campaign` to create a campaign region.
- Rename a campaign by editing its title directly.
- Edit mission text directly inside each campaign.
- Click `+ Project` on a campaign (or `New Project`) to add projects and links.
- Right-click a project node to edit or reassign campaigns.
- Click a project node to launch its link/URI.
