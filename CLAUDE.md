# Resume — Agent Briefing

## What This Is
Resume is a Chrome extension that replaces the new tab page with a visual
canvas showing the user's active campaigns, projects, and missions. It's a
context resumption tool — it helps the user instantly recall what they're
working on and jump straight into it.

## Who It's For
A single user (the creator) who runs multiple parallel "campaigns" (themes of
work like fiction writing, building software, learning) with projects inside
each. The user needs to resume context quickly after breaks.

## Core Concepts
- **Campaign**: A high-level theme of work. Has a name and one current mission.
  Visualized as a region on a canvas. 3-5 at a time.
- **Project**: A specific piece of work inside one or more campaigns. Has a name
  and a link (URL or app URI). Clickable — opens where the work lives.
  Visualized as a node inside campaign regions.
- **Mission**: One per campaign. A short free-text goal that can be updated or
  cleared inline on the canvas.

## How It Should Feel
- **Instant.** The canvas loads in under a second on new tab.
- **Glanceable.** The entire state of all campaigns visible without scrolling.
- **Frictionless.** All editing happens inline on the canvas. No modals, no
  multi-step flows.
- **Spatial.** Campaigns are regions that can overlap (Venn diagram style).
  Projects sit inside them. The layout feels like a map, not a list.

## Technical Constraints
- Chrome extension (Manifest V3) that overrides the new tab page.
- All data stored locally in Chrome storage (chrome.storage.sync for
  cross-device sync).
- No backend. No accounts. No network calls.
- Links can be standard URLs or app URIs (obsidian://, vscode://, cursor://).

## What to Read
- `docs/VISION.md` — Full product vision and future direction.
- `docs/V1_SPEC.md` — V1 scope, requirements, and acceptance criteria.

Build only what's in the V1 spec. Nothing more.
