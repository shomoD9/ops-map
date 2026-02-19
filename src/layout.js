/*
This file now defines structural layout helpers for the six-slot campaign board.
It exists separately so view-shaping logic (slot assignment and campaign/project grouping)
stays independent from DOM event wiring in `src/main.js`.
`src/main.js` calls these functions to build a deterministic board model before rendering,
while `src/model.js` remains responsible for state mutation and normalization rules.
*/

export const MAX_CAMPAIGN_SLOTS = 6;

function normalizePositiveInteger(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.trunc(value);
  return rounded > 0 ? rounded : fallback;
}

export function getVisibleCampaigns(state, maxSlots = MAX_CAMPAIGN_SLOTS) {
  const safeMax = normalizePositiveInteger(maxSlots, MAX_CAMPAIGN_SLOTS);
  const campaigns = Array.isArray(state?.campaigns) ? state.campaigns : [];

  // The board intentionally exposes only the configured maximum number of campaign sections.
  return campaigns.slice(0, safeMax);
}

export function buildCampaignSlots(state, maxSlots = MAX_CAMPAIGN_SLOTS) {
  const safeMax = normalizePositiveInteger(maxSlots, MAX_CAMPAIGN_SLOTS);
  const campaigns = getVisibleCampaigns(state, safeMax);

  // We always return a full slot array so the UI grid remains visually stable.
  return Array.from({ length: safeMax }, (_, slotIndex) => ({
    slotIndex,
    campaign: campaigns[slotIndex] ?? null
  }));
}

export function buildProjectsByCampaign(state, maxSlots = MAX_CAMPAIGN_SLOTS) {
  const campaigns = getVisibleCampaigns(state, maxSlots);
  const campaignIdSet = new Set(campaigns.map((campaign) => campaign.id));
  const projectsByCampaign = new Map();

  campaigns.forEach((campaign) => {
    projectsByCampaign.set(campaign.id, []);
  });

  const projects = Array.isArray(state?.projects) ? state.projects : [];

  projects.forEach((project) => {
    const memberships = Array.isArray(project?.campaignIds) ? project.campaignIds : [];

    memberships.forEach((campaignId) => {
      if (!campaignIdSet.has(campaignId)) {
        return;
      }

      // Projects can appear in multiple campaign sections by design in board mode.
      projectsByCampaign.get(campaignId).push(project);
    });
  });

  return projectsByCampaign;
}
