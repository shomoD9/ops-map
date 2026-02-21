# Return — V1 Specification

## What We're Building

A Chrome extension that replaces the new tab page with a visual map of
campaigns, projects, and missions. The map is a context resumption tool — it
answers "what am I working on, where did I leave off, and where do I go to
work on it?" in a single glance.

## Who It's For

Me (Shomo). I am the only user. I run 3–5 parallel campaigns with multiple
projects each. I need instant visual recall of where everything stands when I
sit down to work.

## Core Concepts

### Campaign
A high-level theme of work.

Examples: "Fiction Writing," "Building," "Learning to Code," "Job Search."

- Has a name
- Has a color or visual identity (to distinguish regions on the canvas)
- Has a current mission (the immediate next goal for this campaign)
- Represented visually as a region on the canvas
- Campaigns can overlap when they share projects
- Expected count: 3–5 at any time

### Project
A specific piece of work within one or more campaigns.

Examples: "Slopinator," "Novella," "React Course," "PM Job Applications."

- Has a name
- Has a link (URL or app URI) that opens where the work lives
- Belongs to one or more campaigns
- Represented as a clickable node on the canvas
- If a project belongs to multiple campaigns, it appears at the visual
  intersection of those campaigns
- Expected count per campaign: 1–10, typically 2–4

### Mission
The immediate next goal for a campaign. One per campaign at a time.

- Free-text, short (a sentence or two)
- A campaign may not have a mission set yet — it just doesn't show one
- V1 tracks only one mission value per campaign (the current one)

## What the User Sees

### The Canvas
When I open a new tab in Chrome, I see the map. It fills the screen.

On the canvas:
- Campaigns appear as labeled regions — overlapping circles or organic shapes
  (Venn diagram model)
- Projects appear as labeled, clickable nodes inside their campaign region(s)
- Each campaign displays its name and current mission (if set) — the mission
  text should be visible on or near the campaign region
- The layout is spatial and glanceable — I should be able to take in the state
  of everything in 2–3 seconds

The canvas should feel calm and clear, not cluttered. At 5 campaigns and 15
projects, it should still feel readable.

### Interactions
All editing happens inline on the canvas. No separate "settings page" or
"edit mode." The map is always live.

**Campaigns:**
- Add a new campaign (give it a name, it appears on the canvas)
- Rename a campaign
- Delete a campaign (with confirmation — also removes projects that only
  belong to this campaign)
- Rearrange campaigns on the canvas (drag to reposition)

**Projects:**
- Add a new project to a campaign (provide name + link)
- Edit a project's name or link
- Assign a project to additional campaigns
- Remove a project from a campaign (if it belongs to others, it stays; if it
  was the last one, the project is deleted)
- Click a project to open its link in a new tab or via app URI
- The app should provide a helper when adding/editing a project link — let the
  user pick the type of app (IDE, Obsidian, Web URL) and help construct the
  correct URI format

**Missions:**
- Set or update a campaign's current mission (inline edit, directly on the
  canvas)
- Clear a mission (resets to "no mission set")
- The canvas should make it obvious when a campaign has no mission set —
  a gentle prompt like "What's the next mission?" encourages the user to set
  one

All interactions should feel fast and lightweight. Prefer inline editing,
right-click context menus, or single-click actions over modals and multi-step
flows.

## Data & Storage

- All data stored in Chrome's local storage (chrome.storage.sync) for
  automatic sync across Chrome instances where the user is signed in
- No backend, no accounts, no server, no network calls
- Data model is simple: campaigns, projects, missions — all small text and
  links
- chrome.storage.sync has a limit of ~100KB — more than enough for this use
  case

## What V1 Does NOT Include

- No git integration or auto-detection of activity
- No multi-device link management (one link per project)
- No AI or LLM features
- No task lists or sub-tasks within projects
- No metrics, analytics, or dashboards
- No import/export
- No collaboration features
- No mobile support
- No built-in mission history timeline

## Success Criteria

- I open a new tab and see my map in under 1 second
- I can glance at the map and know the state of all my campaigns in 3 seconds
- I can click any project and be in my working environment in one click
- I can update a mission in under 5 seconds without leaving the canvas
- I can add a new project in under 10 seconds
- After 2 weeks of daily use, the map is still current — I haven't abandoned
  it because maintaining it felt like work
