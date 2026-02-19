/*
This file translates domain entities into screen positions.
It exists separately because spatial logic changes for readability reasons and should not be tangled with event handlers.
`src/main.js` calls these helpers to place campaigns and project nodes, while `src/model.js` stays focused on business rules.
*/

const CANVAS_PADDING = 90;
const CAMPAIGN_RADIUS = 175;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashToUnit(seed) {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash % 1000) / 1000;
}

function campaignBounds(viewport) {
  return {
    minX: CANVAS_PADDING + CAMPAIGN_RADIUS,
    maxX: viewport.width - CANVAS_PADDING - CAMPAIGN_RADIUS,
    minY: CANVAS_PADDING + CAMPAIGN_RADIUS,
    maxY: viewport.height - CANVAS_PADDING - CAMPAIGN_RADIUS
  };
}

function projectBounds(viewport) {
  return {
    minX: CANVAS_PADDING,
    maxX: viewport.width - CANVAS_PADDING,
    minY: CANVAS_PADDING,
    maxY: viewport.height - CANVAS_PADDING
  };
}

export function ensureCampaignPositions(state, viewport) {
  if (!state.campaigns.length) {
    return state;
  }

  const bounds = campaignBounds(viewport);
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2 + 22;
  const orbitRadius = Math.max(80, Math.min(viewport.width, viewport.height) * 0.26);
  const count = state.campaigns.length;

  let didChange = false;

  const campaigns = state.campaigns.map((campaign, index) => {
    let x = campaign.x;
    let y = campaign.y;

    // Missing coordinates are seeded into a ring so first render is immediately readable.
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const angle = (-Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, count)) % (2 * Math.PI);
      x = centerX + Math.cos(angle) * orbitRadius;
      y = centerY + Math.sin(angle) * orbitRadius;
      didChange = true;
    }

    // Positions are clamped to keep campaigns usable after viewport resizes.
    const clampedX = clamp(x, bounds.minX, bounds.maxX);
    const clampedY = clamp(y, bounds.minY, bounds.maxY);

    if (clampedX !== x || clampedY !== y) {
      didChange = true;
    }

    return {
      ...campaign,
      x: clampedX,
      y: clampedY
    };
  });

  return didChange
    ? {
        ...state,
        campaigns
      }
    : state;
}

function centroidFromCampaigns(campaignById, campaignIds, viewport) {
  const points = campaignIds.map((id) => campaignById.get(id)).filter(Boolean);

  if (!points.length) {
    return {
      x: viewport.width / 2,
      y: viewport.height / 2
    };
  }

  const sum = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y
    }),
    { x: 0, y: 0 }
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length
  };
}

export function computeProjectPositions(state, viewport) {
  const campaignById = new Map(state.campaigns.map((campaign) => [campaign.id, campaign]));
  const membershipGroups = new Map();

  // Projects with the same campaign membership share one spatial cluster.
  state.projects.forEach((project) => {
    const key = [...project.campaignIds].sort().join("|");
    if (!membershipGroups.has(key)) {
      membershipGroups.set(key, []);
    }

    membershipGroups.get(key).push(project.id);
  });

  const positions = new Map();
  const bounds = projectBounds(viewport);

  state.projects.forEach((project) => {
    const membershipKey = [...project.campaignIds].sort().join("|");
    const group = membershipGroups.get(membershipKey) ?? [];
    const groupIndex = Math.max(0, group.indexOf(project.id));
    const centroid = centroidFromCampaigns(campaignById, project.campaignIds, viewport);

    const spreadRadius = group.length > 1 ? 28 + Math.min(46, group.length * 6) : 0;
    const baseAngle = hashToUnit(membershipKey) * Math.PI * 2;
    const angle = baseAngle + (group.length > 1 ? (Math.PI * 2 * groupIndex) / group.length : 0);

    // Single-member groups stay exactly at their campaign centroid so overlap semantics remain obvious.
    const offsetX = spreadRadius ? Math.cos(angle) * spreadRadius : 0;
    const offsetY = spreadRadius ? Math.sin(angle) * spreadRadius : 0;

    positions.set(project.id, {
      x: clamp(centroid.x + offsetX, bounds.minX, bounds.maxX),
      y: clamp(centroid.y + offsetY, bounds.minY, bounds.maxY)
    });
  });

  return positions;
}
