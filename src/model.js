/*
This file holds the domain rules for campaigns, projects, and missions.
It exists separately so business behavior stays predictable and testable without depending on DOM rendering details.
`src/main.js` calls these pure functions to mutate state, and `src/layout.js` reads the resulting entities to place them spatially.
This module also defines project mode semantics so launchable and physical artifacts can share one map model safely.
*/

export const STATE_VERSION = 1;

export const DEFAULT_CAMPAIGN_COLORS = [
  "#ffd99b",
  "#a8e1cf",
  "#b7d4ff",
  "#f5bed8",
  "#d1c3f2",
  "#f7d6b2",
  "#c5e9f4"
];

export const LINK_TYPE_HELP = {
  web: {
    label: "Web URL",
    helperLabel: "Domain or URL",
    hint: "Use a domain or full URL. We auto-prefix https:// when needed."
  },
  obsidian: {
    label: "Obsidian",
    helperLabel: "Vault path or full URI",
    hint: "Input can be a path. We convert it to obsidian://open?path=..."
  },
  vscode: {
    label: "VS Code",
    helperLabel: "Absolute file path",
    hint: "We convert paths to vscode://file/... so one click opens your editor."
  },
  cursor: {
    label: "Cursor",
    helperLabel: "Absolute file path",
    hint: "We convert paths to cursor://file/... for Cursor deep links."
  },
  antigravity: {
    label: "Google Antigravity",
    helperLabel: "Absolute file path",
    hint: "We convert paths to antigravity://file/... for Antigravity deep links."
  },
  custom: {
    label: "Custom URI",
    helperLabel: "Full URI",
    hint: "Use any URI your machine knows how to open."
  }
};

export const PROJECT_MODES = {
  LAUNCHABLE: "launchable",
  PHYSICAL: "physical"
};
export const MAX_CAMPAIGNS = 6;

const PROJECT_MODE_KEYS = Object.values(PROJECT_MODES);
const LINK_TYPE_KEYS = Object.keys(LINK_TYPE_HELP);
const URL_SCHEME_PATTERN = /^[a-zA-Z][\w+.-]*:\/\//;
const GOOGLE_PLAY_BOOKS_HOST = "play.google.com";
const GOOGLE_PLAY_BOOKS_READER_PATH = "/books/reader";

function createId(prefix) {
  // UUID gives stable uniqueness when available, with a deterministic fallback for older contexts.
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function cleanText(input) {
  return typeof input === "string" ? input.trim() : "";
}

function cleanMission(input) {
  // Missions are allowed to include punctuation and spacing, so we only normalize edges.
  return typeof input === "string" ? input.trim() : "";
}

function uniqueIds(ids) {
  return Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function withUpdatedStamp(state) {
  return {
    ...state,
    updatedAt: new Date().toISOString()
  };
}

function sanitizeLinkType(linkType) {
  return LINK_TYPE_KEYS.includes(linkType) ? linkType : "web";
}

function sanitizeProjectMode(mode) {
  // Unknown modes collapse to launchable so older/newer payloads stay operable.
  return PROJECT_MODE_KEYS.includes(mode) ? mode : PROJECT_MODES.LAUNCHABLE;
}

function sanitizeColor(color, fallbackIndex) {
  const candidate = cleanText(color);
  if (candidate) {
    return candidate;
  }

  return DEFAULT_CAMPAIGN_COLORS[fallbackIndex % DEFAULT_CAMPAIGN_COLORS.length];
}

function parseUrlWithOptionalHttps(link) {
  try {
    return new URL(link);
  } catch {
    // Domain-only input is common in the project editor, so we retry with https:// before giving up.
    if (URL_SCHEME_PATTERN.test(link)) {
      return null;
    }
  }

  try {
    return new URL(`https://${link}`);
  } catch {
    return null;
  }
}

function normalizeGooglePlayBooksReaderLink(link) {
  const parsed = parseUrlWithOptionalHttps(link);
  if (!parsed) {
    return link;
  }

  const normalizedHost = parsed.hostname.toLowerCase();
  const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";

  if (normalizedHost !== GOOGLE_PLAY_BOOKS_HOST || normalizedPath !== GOOGLE_PLAY_BOOKS_READER_PATH) {
    return link;
  }

  if (!parsed.searchParams.has("pg")) {
    return link;
  }

  // Google Play Books uses `pg` as a volatile page anchor; removing it restores "resume from last read page" behavior.
  parsed.searchParams.delete("pg");
  return parsed.toString();
}

export function normalizeProjectLink(link, linkType) {
  const trimmed = cleanText(link);

  if (!trimmed) {
    return "";
  }

  let normalized = trimmed;

  // Web links are the only case where implicit https:// is useful in v1.
  if (linkType === "web" && !URL_SCHEME_PATTERN.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  return normalizeGooglePlayBooksReaderLink(normalized);
}

export function buildLinkFromHelper(linkType, helperInput) {
  const cleaned = cleanText(helperInput);

  if (!cleaned) {
    return "";
  }

  if (linkType === "web") {
    return normalizeProjectLink(cleaned, "web");
  }

  if (linkType === "obsidian") {
    if (cleaned.startsWith("obsidian://")) {
      return cleaned;
    }

    return `obsidian://open?path=${encodeURIComponent(cleaned)}`;
  }

  if (linkType === "vscode") {
    if (cleaned.startsWith("vscode://")) {
      return cleaned;
    }

    return `vscode://file/${cleaned.replace(/^\/+/, "")}`;
  }

  if (linkType === "cursor") {
    if (cleaned.startsWith("cursor://")) {
      return cleaned;
    }

    return `cursor://file/${cleaned.replace(/^\/+/, "")}`;
  }

  if (linkType === "antigravity") {
    if (cleaned.startsWith("antigravity://")) {
      return cleaned;
    }

    // Antigravity uses the same file-shaped URI pattern as other editor deep links.
    return `antigravity://file/${cleaned.replace(/^\/+/, "")}`;
  }

  return cleaned;
}

export function inferLinkType(link) {
  const cleaned = cleanText(link).toLowerCase();

  if (cleaned.startsWith("obsidian://")) {
    return "obsidian";
  }

  if (cleaned.startsWith("vscode://")) {
    return "vscode";
  }

  if (cleaned.startsWith("cursor://")) {
    return "cursor";
  }

  if (cleaned.startsWith("antigravity://")) {
    return "antigravity";
  }

  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
    return "web";
  }

  if (cleaned.includes("://")) {
    return "custom";
  }

  return "web";
}

export function createEmptyState() {
  return {
    version: STATE_VERSION,
    campaigns: [],
    projects: [],
    updatedAt: new Date().toISOString()
  };
}

export function normalizeState(rawState) {
  if (!rawState || typeof rawState !== "object") {
    return createEmptyState();
  }

  const campaigns = (Array.isArray(rawState.campaigns)
    ? rawState.campaigns
        .map((campaign, index) => {
          if (!campaign || typeof campaign !== "object") {
            return null;
          }

          const id = cleanText(campaign.id) || createId("campaign");
          const name = cleanText(campaign.name) || `Campaign ${index + 1}`;

          return {
            id,
            name,
            color: sanitizeColor(campaign.color, index),
            x: isFiniteNumber(campaign.x) ? campaign.x : null,
            y: isFiniteNumber(campaign.y) ? campaign.y : null,
            // Legacy payloads may still include removed mission-history keys; we intentionally drop them.
            currentMission: cleanMission(campaign.currentMission)
          };
        })
        .filter(Boolean)
    : []
  ).slice(0, MAX_CAMPAIGNS);

  const campaignIds = new Set(campaigns.map((campaign) => campaign.id));

  const projects = Array.isArray(rawState.projects)
    ? rawState.projects
        .map((project, index) => {
          if (!project || typeof project !== "object") {
            return null;
          }

          const id = cleanText(project.id) || createId("project");
          const mode = sanitizeProjectMode(project.mode);
          const linkType = sanitizeLinkType(project.linkType || inferLinkType(project.link));
          const memberships = uniqueIds(project.campaignIds).filter((campaignId) => campaignIds.has(campaignId));

          if (memberships.length === 0) {
            return null;
          }

          return {
            id,
            name: cleanText(project.name) || `Project ${index + 1}`,
            mode,
            linkType,
            link: normalizeProjectLink(project.link, linkType),
            campaignIds: memberships
          };
        })
        .filter(Boolean)
    : [];

  return {
    version: STATE_VERSION,
    campaigns,
    projects,
    updatedAt: cleanText(rawState.updatedAt) || new Date().toISOString()
  };
}

export function addCampaign(state, campaignDraft) {
  // The board layout is intentionally fixed to six campaign sections.
  if (state.campaigns.length >= MAX_CAMPAIGNS) {
    return state;
  }

  const name = cleanText(campaignDraft?.name);
  if (!name) {
    return state;
  }

  const campaign = {
    id: createId("campaign"),
    name,
    color: sanitizeColor(campaignDraft?.color, state.campaigns.length),
    x: isFiniteNumber(campaignDraft?.x) ? campaignDraft.x : null,
    y: isFiniteNumber(campaignDraft?.y) ? campaignDraft.y : null,
    currentMission: ""
  };

  return withUpdatedStamp({
    ...state,
    campaigns: [...state.campaigns, campaign]
  });
}

export function renameCampaign(state, campaignId, nextName) {
  const name = cleanText(nextName);
  if (!name) {
    return state;
  }

  let didChange = false;

  const campaigns = state.campaigns.map((campaign) => {
    if (campaign.id !== campaignId || campaign.name === name) {
      return campaign;
    }

    didChange = true;

    return {
      ...campaign,
      name
    };
  });

  return didChange ? withUpdatedStamp({ ...state, campaigns }) : state;
}

export function updateCampaignColor(state, campaignId, nextColor) {
  let didChange = false;

  const campaigns = state.campaigns.map((campaign, index) => {
    if (campaign.id !== campaignId) {
      return campaign;
    }

    const normalizedColor = sanitizeColor(nextColor, index);
    if (normalizedColor === campaign.color) {
      return campaign;
    }

    didChange = true;
    return {
      ...campaign,
      color: normalizedColor
    };
  });

  return didChange ? withUpdatedStamp({ ...state, campaigns }) : state;
}

export function repositionCampaign(state, campaignId, position) {
  if (!isFiniteNumber(position?.x) || !isFiniteNumber(position?.y)) {
    return state;
  }

  let didChange = false;

  const campaigns = state.campaigns.map((campaign) => {
    if (campaign.id !== campaignId) {
      return campaign;
    }

    if (campaign.x === position.x && campaign.y === position.y) {
      return campaign;
    }

    didChange = true;

    return {
      ...campaign,
      x: position.x,
      y: position.y
    };
  });

  return didChange ? withUpdatedStamp({ ...state, campaigns }) : state;
}

export function updateCampaignMission(state, campaignId, missionInput) {
  const nextMission = cleanMission(missionInput);
  let didChange = false;

  const campaigns = state.campaigns.map((campaign) => {
    if (campaign.id !== campaignId) {
      return campaign;
    }

    if (campaign.currentMission === nextMission) {
      return campaign;
    }

    didChange = true;
    return {
      ...campaign,
      currentMission: nextMission
    };
  });

  return didChange ? withUpdatedStamp({ ...state, campaigns }) : state;
}

export function deleteCampaign(state, campaignId) {
  const campaigns = state.campaigns.filter((campaign) => campaign.id !== campaignId);

  if (campaigns.length === state.campaigns.length) {
    return state;
  }

  // When we remove a campaign, each project loses that membership; orphaned projects are removed.
  const projects = state.projects
    .map((project) => ({
      ...project,
      campaignIds: project.campaignIds.filter((id) => id !== campaignId)
    }))
    .filter((project) => project.campaignIds.length > 0);

  return withUpdatedStamp({
    ...state,
    campaigns,
    projects
  });
}

export function addProject(state, projectDraft) {
  const name = cleanText(projectDraft?.name);
  const mode = sanitizeProjectMode(projectDraft?.mode);
  const linkType = sanitizeLinkType(projectDraft?.linkType);
  const link = mode === PROJECT_MODES.PHYSICAL ? "" : normalizeProjectLink(projectDraft?.link, linkType);
  const validCampaignIds = new Set(state.campaigns.map((campaign) => campaign.id));
  const campaignIds = uniqueIds(projectDraft?.campaignIds).filter((campaignId) => validCampaignIds.has(campaignId));

  if (!name || campaignIds.length === 0) {
    return state;
  }

  // Physical artifacts intentionally do not require launch links.
  if (mode === PROJECT_MODES.LAUNCHABLE && !link) {
    return state;
  }

  const project = {
    id: createId("project"),
    name,
    mode,
    link,
    linkType,
    campaignIds
  };

  return withUpdatedStamp({
    ...state,
    projects: [...state.projects, project]
  });
}

export function updateProject(state, projectId, projectPatch) {
  const validCampaignIds = new Set(state.campaigns.map((campaign) => campaign.id));
  let didChange = false;

  const nextProjects = state.projects
    .map((project) => {
      if (project.id !== projectId) {
        return project;
      }

      const linkType = sanitizeLinkType(projectPatch?.linkType ?? project.linkType);
      const mode = sanitizeProjectMode(projectPatch?.mode ?? project.mode);
      const nextCampaignIds = uniqueIds(projectPatch?.campaignIds ?? project.campaignIds).filter((campaignId) =>
        validCampaignIds.has(campaignId)
      );

      // Removing the final campaign membership means the project no longer exists in this map.
      if (nextCampaignIds.length === 0) {
        didChange = true;
        return null;
      }

      const nextName = cleanText(projectPatch?.name ?? project.name);
      const nextLink =
        mode === PROJECT_MODES.PHYSICAL
          ? ""
          : normalizeProjectLink(projectPatch?.link ?? project.link, linkType);

      // Launchable projects without a valid link are treated as invalid edits and ignored.
      if (mode === PROJECT_MODES.LAUNCHABLE && !nextLink) {
        return project;
      }

      if (
        nextName === project.name &&
        nextLink === project.link &&
        mode === project.mode &&
        linkType === project.linkType &&
        nextCampaignIds.length === project.campaignIds.length &&
        nextCampaignIds.every((campaignId) => project.campaignIds.includes(campaignId))
      ) {
        return project;
      }

      didChange = true;

      return {
        ...project,
        name: nextName || project.name,
        mode,
        link: nextLink,
        linkType,
        campaignIds: nextCampaignIds
      };
    })
    .filter(Boolean);

  return didChange
    ? withUpdatedStamp({
        ...state,
        projects: nextProjects
      })
    : state;
}

export function deleteProject(state, projectId) {
  const projects = state.projects.filter((project) => project.id !== projectId);

  return projects.length === state.projects.length ? state : withUpdatedStamp({ ...state, projects });
}
