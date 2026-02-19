/*
This file translates domain entities into screen positions.
It exists separately because spatial logic changes for readability reasons and should not be tangled with event handlers.
`src/main.js` calls these helpers to place campaigns and project nodes, while `src/model.js` stays focused on business rules.
*/

const CANVAS_PADDING = 72;
const CAMPAIGN_RADIUS_MIN = 120;
const CAMPAIGN_RADIUS_MAX = 172;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampToBounds(value, min, max) {
  if (max < min) {
    return (min + max) / 2;
  }

  return clamp(value, min, max);
}

function clampPositive(value, min, max) {
  if (max < min) {
    return Math.max(0, max);
  }

  return clamp(value, min, max);
}

export function resolveCampaignRadius(viewport, campaignCount = 0) {
  const minDimension = Math.max(320, Math.min(viewport.width, viewport.height));
  const baseRadius = clamp(minDimension * 0.18, CAMPAIGN_RADIUS_MIN, CAMPAIGN_RADIUS_MAX);
  const crowdingPenalty = Math.max(0, campaignCount - 3) * 7;

  return clamp(baseRadius - crowdingPenalty, CAMPAIGN_RADIUS_MIN, CAMPAIGN_RADIUS_MAX);
}

function hashToUnit(seed) {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash % 1000) / 1000;
}

function campaignBounds(viewport, campaignCount) {
  const radius = resolveCampaignRadius(viewport, campaignCount);

  return {
    radius,
    minX: CANVAS_PADDING + radius,
    maxX: viewport.width - CANVAS_PADDING - radius,
    minY: CANVAS_PADDING + radius,
    maxY: viewport.height - CANVAS_PADDING - radius
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

  const count = state.campaigns.length;
  const bounds = campaignBounds(viewport, count);
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2 + 22;
  const maxOrbitX = Math.max(0, Math.min(centerX - bounds.minX, bounds.maxX - centerX));
  const maxOrbitY = Math.max(0, Math.min(centerY - bounds.minY, bounds.maxY - centerY));
  const maxOrbitRadius = Math.min(maxOrbitX, maxOrbitY);
  const idealSpacing = bounds.radius * 1.52;
  const idealOrbitRadius = count > 1 ? (idealSpacing * count) / (Math.PI * 2) : 0;
  const minOrbitRadius = count > 1 ? bounds.radius * 0.72 : 0;
  const orbitRadius = clampPositive(idealOrbitRadius, minOrbitRadius, maxOrbitRadius);

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
    const clampedX = clampToBounds(x, bounds.minX, bounds.maxX);
    const clampedY = clampToBounds(y, bounds.minY, bounds.maxY);

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
      x: clampToBounds(centroid.x + offsetX, bounds.minX, bounds.maxX),
      y: clampToBounds(centroid.y + offsetY, bounds.minY, bounds.maxY)
    });
  });

  return positions;
}
