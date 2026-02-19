# Ops Map — Vision

## The Problem

At any given time, I'm running multiple parallel "campaigns" — fiction writing,
building open-source tools, learning to code, job searching. Each campaign
contains multiple projects spread across different tools and platforms.

When I sit down to work after a break — after lunch, after a flight, after a
day at the office — I've lost context. I don't remember where I left off across
all these tracks. The activation energy to recall and resume is too high. So I
open YouTube instead.

Existing tools don't solve this:
- **To-do apps** focus on tasks, not campaigns. They don't give you the big
  picture.
- **Project management tools** (Linear, Asana, Notion boards) have learning
  curves and require constant maintenance. They become their own project to
  manage.
- **None of them** give a single-glance overview of everything I'm doing, where
  I left off, and where I'm headed.

The core problem is **context resumption across many parallel tracks of work.**

## The Vision

A visual map that shows everything I'm working on, always one glance away.

Open a new Chrome tab, and instead of the default page, I see:
- My **campaigns** as overlapping regions on a canvas
- My **projects** as clickable nodes inside those regions
- The **current mission** for each campaign — where I'm headed
- The **previous mission** — where I've been

Every project is a launchpad. One click takes me straight to where the work
lives — my IDE, Obsidian, Google Docs, whatever.

The whole thing fits on one screen. No dashboards, no navigation, no pages to
drill into. Just the map.

## The Map — In Detail

### Campaigns
The big themes of work. Fiction Writing. Building. Learning. Job Search.

Visualized as regions on the canvas — think overlapping circles, like a Venn
diagram. When two campaigns share a project, their regions overlap, and the
shared project sits at the intersection.

Expected count: 3–5 active at any time.

### Projects
The actual things being worked on. A novella. Slopinator. A React course.

Each project is a named, clickable node. Clicking it opens the tool where the
work lives — an IDE via app URI, an Obsidian vault, a Google Doc, a website.
Projects belong to one or more campaigns and appear visually inside the
appropriate region(s).

Expected count per campaign: 1–10, typically 2–4.

### Missions
Each campaign has one current mission — the immediate goal that all projects
in that campaign are working toward. "Finish novella first draft." "Ship
Slopinator V1." "Complete React fundamentals."

When the mission is updated, the old one automatically becomes the "previous
mission." This is how history writes itself — the only maintenance is
updating what you're aiming at, and the record of where you've been emerges
for free.

## How the Map Stays Current

This is the critical design constraint. Every previous tool died because
maintaining it was a chore. The map must not become another thing to manage.

In V1, the only regular action is updating a campaign's mission when the goal
shifts. Everything else — history, context — writes itself from that single
action.

In future versions, the map gets smarter: it reads git commits to detect what
was worked on last, proactively surfaces context, and reduces manual input
even further.

## The Launchpad

Every project on the map is a door to where the work lives. Click it, and
you're there:
- Building projects → open in IDE (VS Code, Cursor via app URI)
- Writing projects → open in Obsidian (via obsidian:// URI)
- Reading projects → open Google Books or web resources
- Research projects → open Google Docs, Notion, or web pages

The map is not where work happens. It's where work **begins.**

## What This Is NOT

- Not a to-do list
- Not a project management tool with tickets and sprints
- Not a place where work happens
- Not an AI agent (in V1)
- Not a dashboard with metrics or charts
- Not a collaboration tool

## Future Directions

These are not V1. They are the trajectory.

- **Git integration**: Auto-detect last activity per project by reading recent
  commits. The map knows what you did without you telling it.
- **Device-aware links**: Same project, different machines, different URIs. The
  map knows which device you're on and opens the right link.
- **Auto-context capture**: The map watches what you're working on across tools
  and updates itself.
- **Mission suggestions**: Based on activity patterns, the map suggests what
  your next mission should be.
- **AI-powered context summaries**: When you open the map, each campaign shows
  a brief natural-language summary of recent activity.
