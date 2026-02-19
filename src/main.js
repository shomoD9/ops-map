/*
This file is the runtime orchestrator for the new-tab map.
It exists separately because it coordinates UI rendering, event handling, and persistence calls across the other modules.
It imports domain rules from `src/model.js`, layout helpers from `src/layout.js`, sync storage adapters from `src/storage.js`,
and local device-preference adapters from `src/devicePrefs.js` so browser-launch behavior can vary per machine.
*/

import { ensureCampaignPositions, computeProjectPositions, resolveCampaignRadius } from "./layout.js";
import {
  createEmptyState,
  normalizeState,
  addCampaign,
  renameCampaign,
  repositionCampaign,
  updateCampaignMission,
  deleteCampaign,
  addProject,
  updateProject,
  deleteProject,
  buildLinkFromHelper,
  inferLinkType,
  normalizeProjectLink,
  LINK_TYPE_HELP,
  DEFAULT_CAMPAIGN_COLORS,
  PROJECT_MODES
} from "./model.js";
import { loadState, saveState, subscribeToStateChanges } from "./storage.js";
import {
  loadDevicePrefs,
  saveDevicePrefs,
  subscribeToDevicePrefsChanges,
  DEFAULT_DEVICE_PREFS,
  WEB_BROWSER_TARGETS
} from "./devicePrefs.js";

const canvasElement = document.querySelector("#canvas");
const summaryElement = document.querySelector("#state-summary");
const panelRootElement = document.querySelector("#panel-root");
const emptyStateElement = document.querySelector("#empty-state");
const addCampaignButton = document.querySelector("#add-campaign-button");
const addProjectButton = document.querySelector("#add-project-button");
const emptyStateCreateButton = document.querySelector("#empty-state-create");
const browserTargetSelect = document.querySelector("#browser-target-select");

const CAMPAIGN_EDGE_PADDING = 18;
const PROJECT_TOOLTIP_MS = 1600;
const SAVE_DEBOUNCE_MS = 220;

let state = createEmptyState();
let devicePrefs = { ...DEFAULT_DEVICE_PREFS };
let saveTimer = null;
let dragSession = null;
let dragFrameId = null;
let unsubscribeStorage = null;
let unsubscribeDevicePrefs = null;

const projectTooltipTimers = new WeakMap();

function getViewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeWebBrowserTarget(target) {
  return target === WEB_BROWSER_TARGETS.EDGE ? WEB_BROWSER_TARGETS.EDGE : WEB_BROWSER_TARGETS.CURRENT;
}

function applyDevicePrefs(nextPrefs) {
  // Device preferences are always merged with defaults so partial payloads stay safe.
  devicePrefs = {
    ...DEFAULT_DEVICE_PREFS,
    ...(nextPrefs || {}),
    webBrowserTarget: sanitizeWebBrowserTarget(nextPrefs?.webBrowserTarget)
  };

  // The select is the visible source of truth in the header, so we keep it in sync with in-memory prefs.
  if (browserTargetSelect) {
    browserTargetSelect.value = devicePrefs.webBrowserTarget;
  }
}

function clampToBounds(value, min, max) {
  if (max < min) {
    return (min + max) / 2;
  }

  return clamp(value, min, max);
}

function clampCampaignPosition(position, campaignCount = state.campaigns.length) {
  const viewport = getViewport();
  const campaignRadius = resolveCampaignRadius(viewport, campaignCount);

  return {
    x: clampToBounds(
      position.x,
      campaignRadius + CAMPAIGN_EDGE_PADDING,
      viewport.width - campaignRadius - CAMPAIGN_EDGE_PADDING
    ),
    y: clampToBounds(
      position.y,
      campaignRadius + CAMPAIGN_EDGE_PADDING,
      viewport.height - campaignRadius - CAMPAIGN_EDGE_PADDING
    )
  };
}

function hexToRgba(hexColor, alpha) {
  const hex = (hexColor || "").replace("#", "");
  if (![3, 6].includes(hex.length)) {
    return `rgba(180, 196, 215, ${alpha})`;
  }

  const normalized = hex.length === 3 ? hex.split("").map((part) => `${part}${part}`).join("") : hex;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function scheduleStateSave() {
  window.clearTimeout(saveTimer);

  // We debounce writes so drag operations feel smooth and still persist reliably.
  saveTimer = window.setTimeout(async () => {
    try {
      await saveState(state);
    } catch (error) {
      console.warn("Ops Map: failed to save state.", error);
    }
  }, SAVE_DEBOUNCE_MS);
}

function applyState(nextState, options = { persist: true }) {
  const positioned = ensureCampaignPositions(nextState, getViewport());
  const didChange = positioned !== state;

  state = positioned;
  render();

  if (didChange && options.persist) {
    scheduleStateSave();
  }
}

function closePanel() {
  panelRootElement.hidden = true;
  panelRootElement.innerHTML = "";
}

function createPanelScaffold(titleText) {
  panelRootElement.hidden = false;
  panelRootElement.innerHTML = "";

  const headerElement = document.createElement("div");
  headerElement.className = "panel-header";

  const titleElement = document.createElement("h3");
  titleElement.textContent = titleText;

  const closeButton = document.createElement("button");
  closeButton.className = "panel-close";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", closePanel);

  headerElement.append(titleElement, closeButton);
  panelRootElement.append(headerElement);

  const formElement = document.createElement("form");
  panelRootElement.append(formElement);

  return formElement;
}

function createField(labelText, inputElement, hintText = "") {
  const fieldElement = document.createElement("div");
  fieldElement.className = "panel-field";

  const labelElement = document.createElement("label");
  labelElement.textContent = labelText;

  fieldElement.append(labelElement, inputElement);

  if (hintText) {
    const hintElement = document.createElement("small");
    hintElement.textContent = hintText;
    fieldElement.append(hintElement);
  }

  return fieldElement;
}

function createActionsRow(primaryLabel, onDelete) {
  const actionsElement = document.createElement("div");
  actionsElement.className = "panel-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", closePanel);

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = primaryLabel;

  actionsElement.append(cancelButton);

  if (onDelete) {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", onDelete);
    actionsElement.append(deleteButton);
  }

  actionsElement.append(saveButton);

  return actionsElement;
}

function nextCampaignPlacement() {
  const viewport = getViewport();
  const totalCampaigns = state.campaigns.length + 1;
  const placementIndex = totalCampaigns - 1;
  const angle = -Math.PI / 2 + (2 * Math.PI * placementIndex) / Math.max(3, totalCampaigns);
  const campaignRadius = resolveCampaignRadius(viewport, totalCampaigns);
  const idealSpacing = campaignRadius * 1.52;
  const idealOrbitRadius = totalCampaigns > 1 ? (idealSpacing * totalCampaigns) / (Math.PI * 2) : 0;
  const minOrbitRadius = totalCampaigns > 1 ? campaignRadius * 0.72 : 0;
  const maxOrbitRadius = Math.max(0, Math.min(viewport.width, viewport.height) * 0.34);
  const orbitRadius =
    maxOrbitRadius < minOrbitRadius ? maxOrbitRadius : clamp(idealOrbitRadius, minOrbitRadius, maxOrbitRadius);

  return clampCampaignPosition(
    {
      x: viewport.width / 2 + Math.cos(angle) * orbitRadius,
      y: viewport.height / 2 + 18 + Math.sin(angle) * orbitRadius
    },
    totalCampaigns
  );
}

function openCampaignEditor() {
  const formElement = createPanelScaffold("Create Campaign");

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Campaign name";
  nameInput.required = true;
  nameInput.autofocus = true;

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = DEFAULT_CAMPAIGN_COLORS[state.campaigns.length % DEFAULT_CAMPAIGN_COLORS.length];

  const errorElement = document.createElement("p");
  errorElement.className = "panel-error";

  formElement.append(
    createField("Name", nameInput),
    createField("Color", colorInput, "This color helps separate regions when campaigns overlap."),
    errorElement,
    createActionsRow("Create Campaign")
  );

  formElement.addEventListener("submit", (event) => {
    event.preventDefault();

    const placement = nextCampaignPlacement();
    const nextState = addCampaign(state, {
      name: nameInput.value,
      color: colorInput.value,
      x: placement.x,
      y: placement.y
    });

    if (nextState === state) {
      errorElement.textContent = "A campaign needs a name.";
      return;
    }

    applyState(nextState);
    closePanel();
  });
}

function showProjectTooltip(projectNode, message) {
  if (!projectNode) {
    return;
  }

  const existingTimer = projectTooltipTimers.get(projectNode);
  if (existingTimer) {
    window.clearTimeout(existingTimer);
  }

  projectNode.dataset.tip = message;
  projectNode.dataset.tipVisible = "true";

  const nextTimer = window.setTimeout(() => {
    delete projectNode.dataset.tipVisible;
    delete projectNode.dataset.tip;
    projectTooltipTimers.delete(projectNode);
  }, PROJECT_TOOLTIP_MS);

  projectTooltipTimers.set(projectNode, nextTimer);
}

function openWebLink(link) {
  // Current browser mode is the lowest-friction default for standard web links.
  if (sanitizeWebBrowserTarget(devicePrefs.webBrowserTarget) === WEB_BROWSER_TARGETS.CURRENT) {
    window.open(link, "_blank", "noopener,noreferrer");
    return;
  }

  // Edge routing depends on protocol handler support, so we keep a safe fallback.
  try {
    const edgeTarget = `microsoft-edge:${link}`;
    const opened = window.open(edgeTarget, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.open(link, "_blank", "noopener,noreferrer");
    }
  } catch (error) {
    window.open(link, "_blank", "noopener,noreferrer");
  }
}

function launchProject(project, projectNode) {
  if (project.mode === PROJECT_MODES.PHYSICAL) {
    showProjectTooltip(projectNode, "Physical artifact — no link");
    return;
  }

  const link = (project.link || "").trim();

  if (!link) {
    // Missing links are edited inline rather than throwing runtime errors.
    openProjectEditor({ projectId: project.id });
    return;
  }

  if (/^https?:\/\//i.test(link)) {
    openWebLink(link);
    return;
  }

  window.location.assign(link);
}

function buildCampaignCheckboxes(selectedIds) {
  const wrapper = document.createElement("div");
  wrapper.className = "checkbox-grid";

  state.campaigns.forEach((campaign) => {
    const chip = document.createElement("label");
    chip.className = "checkbox-chip";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = campaign.id;
    checkbox.checked = selectedIds.includes(campaign.id);

    const text = document.createElement("span");
    text.textContent = campaign.name;

    chip.append(checkbox, text);
    wrapper.append(chip);
  });

  return wrapper;
}

function openProjectEditor(options = {}) {
  if (!state.campaigns.length) {
    openCampaignEditor();
    return;
  }

  const project = options.projectId ? state.projects.find((item) => item.id === options.projectId) : null;
  const isEditMode = Boolean(project);
  const defaultCampaignIds = project
    ? project.campaignIds
    : options.seedCampaignId
      ? [options.seedCampaignId]
      : [state.campaigns[0].id];

  const formElement = createPanelScaffold(isEditMode ? "Edit Project" : "Create Project");

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.required = true;
  nameInput.placeholder = "Project name";
  nameInput.value = project?.name ?? "";
  nameInput.autofocus = true;

  const projectModeInitial =
    project?.mode === PROJECT_MODES.PHYSICAL ? PROJECT_MODES.PHYSICAL : PROJECT_MODES.LAUNCHABLE;

  const projectModeSelect = document.createElement("select");
  [
    { value: PROJECT_MODES.LAUNCHABLE, label: "Launchable" },
    { value: PROJECT_MODES.PHYSICAL, label: "Physical Artifact" }
  ].forEach((optionInfo) => {
    const option = document.createElement("option");
    option.value = optionInfo.value;
    option.textContent = optionInfo.label;
    option.selected = optionInfo.value === projectModeInitial;
    projectModeSelect.append(option);
  });

  const linkTypeSelect = document.createElement("select");
  const linkTypeInitial = project?.linkType || inferLinkType(project?.link || "");
  const orderedLinkTypes = ["web", "obsidian", "vscode", "cursor", "antigravity", "custom"];
  const linkTypeEntries = orderedLinkTypes
    .filter((key) => LINK_TYPE_HELP[key])
    .map((key) => [key, LINK_TYPE_HELP[key]]);
  Object.entries(LINK_TYPE_HELP).forEach(([key, info]) => {
    if (!orderedLinkTypes.includes(key)) {
      linkTypeEntries.push([key, info]);
    }
  });

  linkTypeEntries.forEach(([key, info]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = info.label;
    option.selected = key === linkTypeInitial;
    linkTypeSelect.append(option);
  });

  const helperLabel = document.createElement("label");
  helperLabel.textContent = LINK_TYPE_HELP[linkTypeInitial].helperLabel;

  const helperInput = document.createElement("input");
  helperInput.type = "text";
  helperInput.placeholder = "Use helper input then click Build";
  helperInput.value = project?.link ?? "";

  const buildButton = document.createElement("button");
  buildButton.type = "button";
  buildButton.textContent = "Build Link";

  const helperRow = document.createElement("div");
  helperRow.className = "helper-row";
  helperRow.append(helperInput, buildButton);

  const helperField = document.createElement("div");
  helperField.className = "panel-field";
  helperField.append(helperLabel, helperRow);

  const helperHint = document.createElement("small");
  helperHint.textContent = LINK_TYPE_HELP[linkTypeInitial].hint;
  helperField.append(helperHint);

  const linkInput = document.createElement("input");
  linkInput.type = "text";
  linkInput.placeholder = "Final link or URI";
  linkInput.value = project?.link ?? "";
  linkInput.required = projectModeInitial === PROJECT_MODES.LAUNCHABLE;

  const linkTypeField = createField("Link Type", linkTypeSelect);
  const linkField = createField("Link", linkInput);

  const campaignsCheckboxes = buildCampaignCheckboxes(defaultCampaignIds);
  const campaignsField = createField("Campaigns", campaignsCheckboxes, "A project can belong to one or many campaigns.");

  const errorElement = document.createElement("p");
  errorElement.className = "panel-error";

  const refreshHelperMetadata = () => {
    const selectedType = linkTypeSelect.value;
    helperLabel.textContent = LINK_TYPE_HELP[selectedType].helperLabel;
    helperHint.textContent = LINK_TYPE_HELP[selectedType].hint;
  };

  const refreshProjectModeFields = () => {
    const isLaunchable = projectModeSelect.value === PROJECT_MODES.LAUNCHABLE;

    // Physical projects intentionally hide URI controls to keep the panel semantically clean.
    linkTypeField.hidden = !isLaunchable;
    helperField.hidden = !isLaunchable;
    linkField.hidden = !isLaunchable;

    linkTypeSelect.disabled = !isLaunchable;
    helperInput.disabled = !isLaunchable;
    buildButton.disabled = !isLaunchable;
    linkInput.disabled = !isLaunchable;
    linkInput.required = isLaunchable;

    if (!isLaunchable) {
      errorElement.textContent = "";
    }
  };

  linkTypeSelect.addEventListener("change", refreshHelperMetadata);
  projectModeSelect.addEventListener("change", refreshProjectModeFields);

  buildButton.addEventListener("click", () => {
    const built = buildLinkFromHelper(linkTypeSelect.value, helperInput.value);

    if (!built) {
      errorElement.textContent = "Helper input is empty.";
      return;
    }

    linkInput.value = built;
    errorElement.textContent = "";
  });

  refreshProjectModeFields();

  const handleDelete = isEditMode
    ? () => {
        const confirmed = window.confirm(`Delete project "${project.name}"?`);
        if (!confirmed) {
          return;
        }

        applyState(deleteProject(state, project.id));
        closePanel();
      }
    : null;

  formElement.append(
    createField("Name", nameInput),
    createField("Project Mode", projectModeSelect, "Physical artifacts stay on the map but do not launch links."),
    linkTypeField,
    helperField,
    linkField,
    campaignsField,
    errorElement,
    createActionsRow(isEditMode ? "Save Project" : "Create Project", handleDelete)
  );

  formElement.addEventListener("submit", (event) => {
    event.preventDefault();

    const campaignIds = Array.from(campaignsCheckboxes.querySelectorAll("input[type='checkbox']:checked")).map(
      (checkbox) => checkbox.value
    );

    if (!campaignIds.length) {
      errorElement.textContent = "Select at least one campaign.";
      return;
    }

    if (!nameInput.value.trim()) {
      errorElement.textContent = "Project name is required.";
      return;
    }

    const normalizedProjectMode =
      projectModeSelect.value === PROJECT_MODES.PHYSICAL ? PROJECT_MODES.PHYSICAL : PROJECT_MODES.LAUNCHABLE;

    if (normalizedProjectMode === PROJECT_MODES.LAUNCHABLE && !linkInput.value.trim()) {
      errorElement.textContent = "Project link is required.";
      return;
    }

    const normalizedLinkType = linkTypeSelect.value;
    const payload = {
      name: nameInput.value,
      mode: normalizedProjectMode,
      linkType: normalizedLinkType,
      link:
        normalizedProjectMode === PROJECT_MODES.PHYSICAL
          ? ""
          : normalizeProjectLink(linkInput.value, normalizedLinkType),
      campaignIds
    };

    const nextState = isEditMode ? updateProject(state, project.id, payload) : addProject(state, payload);

    if (nextState === state) {
      errorElement.textContent = isEditMode
        ? "No changes were detected."
        : "Could not create project. Check name and campaign selections.";
      return;
    }

    applyState(nextState);
    closePanel();
  });
}

function flushDragFrame() {
  dragFrameId = null;

  if (!dragSession?.pendingPosition) {
    return;
  }

  // During drag we render from pending position but skip persistence until drag finalization.
  applyState(repositionCampaign(state, dragSession.campaignId, dragSession.pendingPosition), { persist: false });
}

function scheduleDragFrame() {
  if (dragFrameId !== null) {
    return;
  }

  dragFrameId = window.requestAnimationFrame(flushDragFrame);
}

function finalizeCampaignDrag(pointerId = null) {
  if (!dragSession || (pointerId !== null && dragSession.pointerId !== pointerId)) {
    return;
  }

  if (dragFrameId !== null) {
    window.cancelAnimationFrame(dragFrameId);
    dragFrameId = null;
  }

  if (dragSession.pendingPosition) {
    // Final drag commit is the only drag write that persists to storage.
    applyState(repositionCampaign(state, dragSession.campaignId, dragSession.pendingPosition));
  }

  document.body.classList.remove("is-dragging-campaign");
  dragSession = null;
}

function startCampaignDrag(event, campaign, regionElement) {
  const interactiveTarget = event.target.closest("button,[contenteditable='true'],input,textarea,select,label");
  if (interactiveTarget) {
    return;
  }

  const origin = clampCampaignPosition({ x: campaign.x, y: campaign.y });

  // Dragging starts from the region body so repositioning feels direct and spatial.
  dragSession = {
    campaignId: campaign.id,
    pointerId: event.pointerId,
    offsetX: event.clientX - origin.x,
    offsetY: event.clientY - origin.y,
    pendingPosition: origin
  };

  try {
    regionElement.setPointerCapture(event.pointerId);
  } catch (error) {
    // Pointer capture can fail on rapid re-renders; window-level handlers still keep drag usable.
  }

  document.body.classList.add("is-dragging-campaign");
  event.preventDefault();
}

function handlePointerMove(event) {
  if (!dragSession || dragSession.pointerId !== event.pointerId) {
    return;
  }

  const position = clampCampaignPosition({
    x: event.clientX - dragSession.offsetX,
    y: event.clientY - dragSession.offsetY
  });

  if (
    dragSession.pendingPosition &&
    position.x === dragSession.pendingPosition.x &&
    position.y === dragSession.pendingPosition.y
  ) {
    return;
  }

  dragSession.pendingPosition = position;
  scheduleDragFrame();
}

function handlePointerUp(event) {
  finalizeCampaignDrag(event.pointerId);
}

function applyMissionEditorPlaceholder(missionEditor, missionValue) {
  const mission = (missionValue || "").trim();
  missionEditor.textContent = mission;
  missionEditor.dataset.empty = mission ? "false" : "true";
}

function renderCampaign(campaign, campaignRadius) {
  const region = document.createElement("article");
  region.className = "campaign-region";
  region.style.left = `${campaign.x}px`;
  region.style.top = `${campaign.y}px`;
  region.style.setProperty("--campaign-size-runtime", `${campaignRadius * 2}px`);
  region.style.background = `radial-gradient(circle at 30% 24%, ${hexToRgba(campaign.color, 0.78)} 0, ${hexToRgba(
    campaign.color,
    0.4
  )} 100%)`;

  const header = document.createElement("div");
  header.className = "campaign-header";

  const campaignName = document.createElement("div");
  campaignName.className = "campaign-name";
  campaignName.contentEditable = "true";
  campaignName.spellcheck = false;
  campaignName.textContent = campaign.name;

  campaignName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      campaignName.blur();
    }
  });

  campaignName.addEventListener("blur", () => {
    applyState(renameCampaign(state, campaign.id, campaignName.textContent));
  });

  const actions = document.createElement("div");
  actions.className = "campaign-meta-actions";

  const projectCreateButton = document.createElement("button");
  projectCreateButton.className = "project-create";
  projectCreateButton.type = "button";
  projectCreateButton.textContent = "+ Project";
  projectCreateButton.addEventListener("click", () => {
    openProjectEditor({ seedCampaignId: campaign.id });
  });

  const deleteButton = document.createElement("button");
  deleteButton.className = "campaign-delete";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => {
    const confirmed = window.confirm(`Delete campaign "${campaign.name}"?`);
    if (!confirmed) {
      return;
    }

    applyState(deleteCampaign(state, campaign.id));
  });

  actions.append(projectCreateButton, deleteButton);
  header.append(campaignName, actions);

  const missionBlock = document.createElement("div");
  missionBlock.className = "mission-block";

  const missionLabel = document.createElement("p");
  missionLabel.className = "mission-label";
  missionLabel.textContent = "Current Mission";

  const missionEditor = document.createElement("div");
  missionEditor.className = "mission-editor";
  missionEditor.contentEditable = "true";
  missionEditor.spellcheck = true;
  applyMissionEditorPlaceholder(missionEditor, campaign.currentMission);

  missionEditor.addEventListener("input", () => {
    const text = missionEditor.textContent.trim();
    missionEditor.dataset.empty = text ? "false" : "true";
  });

  missionEditor.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      missionEditor.blur();
    }
  });

  missionEditor.addEventListener("blur", () => {
    applyState(updateCampaignMission(state, campaign.id, missionEditor.textContent));
  });

  missionBlock.append(missionLabel, missionEditor);

  if (campaign.previousMission) {
    const previousMission = document.createElement("p");
    previousMission.className = "previous-mission";

    const prefix = document.createElement("strong");
    prefix.textContent = "Previous: ";

    previousMission.append(prefix, campaign.previousMission);
    missionBlock.append(previousMission);
  }

  region.append(header, missionBlock);

  if (dragSession?.campaignId === campaign.id) {
    region.classList.add("dragging");
  }

  region.addEventListener("pointerdown", (event) => startCampaignDrag(event, campaign, region));

  return region;
}

function renderProject(project, position) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `project-node${project.mode === PROJECT_MODES.PHYSICAL ? " physical" : ""}`;
  button.style.left = `${position.x}px`;
  button.style.top = `${position.y}px`;
  button.textContent = project.name;
  button.title =
    project.mode === PROJECT_MODES.PHYSICAL
      ? `${project.name}\nPhysical artifact (no link)\nRight-click to edit`
      : `${project.name}\n${project.link || "No link set"}\nClick to launch, right-click to edit`;

  button.addEventListener("click", () => {
    launchProject(project, button);
  });

  // Right-click opens direct editing without sacrificing one-click launch behavior.
  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openProjectEditor({ projectId: project.id });
  });

  return button;
}

function renderSummary() {
  const campaignCount = state.campaigns.length;
  const projectCount = state.projects.length;
  const missionCount = state.campaigns.filter((campaign) => campaign.currentMission).length;

  summaryElement.textContent = `${campaignCount} campaign${campaignCount === 1 ? "" : "s"} · ${projectCount} project${
    projectCount === 1 ? "" : "s"
  } · ${missionCount} active mission${missionCount === 1 ? "" : "s"}`;
}

function renderEmptyState() {
  emptyStateElement.hidden = state.campaigns.length > 0;
}

function render() {
  canvasElement.innerHTML = "";
  const viewport = getViewport();
  // Radius is recomputed per render so campaign sizing adapts to campaign count and viewport changes.
  const campaignRadius = resolveCampaignRadius(viewport, state.campaigns.length);

  state.campaigns.forEach((campaign) => {
    canvasElement.append(renderCampaign(campaign, campaignRadius));
  });

  const projectPositions = computeProjectPositions(state, viewport);

  state.projects.forEach((project) => {
    const position = projectPositions.get(project.id);

    if (position) {
      canvasElement.append(renderProject(project, position));
    }
  });

  renderSummary();
  renderEmptyState();
}

function bindGlobalEvents() {
  addCampaignButton.addEventListener("click", openCampaignEditor);
  addProjectButton.addEventListener("click", () => openProjectEditor());
  emptyStateCreateButton.addEventListener("click", openCampaignEditor);

  if (browserTargetSelect) {
    browserTargetSelect.addEventListener("change", async () => {
      const nextPrefs = {
        ...devicePrefs,
        webBrowserTarget: sanitizeWebBrowserTarget(browserTargetSelect.value)
      };

      applyDevicePrefs(nextPrefs);

      try {
        await saveDevicePrefs(nextPrefs);
      } catch (error) {
        console.warn("Ops Map: failed to save local device preferences.", error);
      }
    });
  }

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", handlePointerUp);
  window.addEventListener("blur", () => finalizeCampaignDrag());

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePanel();
    }
  });

  window.addEventListener("resize", () => {
    // Resize can push nodes off-screen, so we run layout normalization and persist if needed.
    applyState(state);
  });
}

async function initialize() {
  const [loadedState, loadedDevicePrefs] = await Promise.all([loadState(), loadDevicePrefs()]);
  applyDevicePrefs(loadedDevicePrefs || DEFAULT_DEVICE_PREFS);
  bindGlobalEvents();

  applyState(normalizeState(loadedState || createEmptyState()));

  // Storage subscription keeps multiple Chrome windows in sync without manual refresh.
  unsubscribeStorage = subscribeToStateChanges((incomingState) => {
    const normalized = normalizeState(incomingState || createEmptyState());

    if (normalized.updatedAt === state.updatedAt) {
      return;
    }

    applyState(normalized, { persist: false });
  });

  unsubscribeDevicePrefs = subscribeToDevicePrefsChanges((incomingPrefs) => {
    applyDevicePrefs(incomingPrefs || DEFAULT_DEVICE_PREFS);
  });

  window.addEventListener("beforeunload", () => {
    unsubscribeStorage?.();
    unsubscribeDevicePrefs?.();
  });
}

initialize();
