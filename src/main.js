/*
This file is the runtime coordinator for Ops Map's new-tab board.
It exists as a separate module because it is the integration layer that connects domain mutations,
persistence, and DOM rendering into one interactive experience.
It imports domain rules from `src/model.js`, board-shaping helpers from `src/layout.js`,
storage adapters from `src/storage.js`, local preference adapters from `src/devicePrefs.js`,
shared aesthetic preference adapters from `src/aestheticPrefs.js`, and transfer/google-sync
scaffolding from `src/transfer.js` and `src/googleSync.js`.
It also coordinates sidebar preference toggles so the interface stays compact
without losing keyboard and pointer clarity.
*/

import { buildCampaignSlots, buildProjectsByCampaign, MAX_CAMPAIGN_SLOTS } from "./layout.js";
import {
  createEmptyState,
  normalizeState,
  addCampaign,
  renameCampaign,
  updateCampaignMission,
  deleteCampaign,
  addProject,
  updateProject,
  deleteProject,
  buildLinkFromHelper,
  inferLinkType,
  normalizeProjectLink,
  LINK_TYPE_HELP,
  PROJECT_MODES,
  MAX_CAMPAIGNS
} from "./model.js";
import { loadState, saveState, subscribeToStateChanges } from "./storage.js";
import {
  loadDevicePrefs,
  subscribeToDevicePrefsChanges,
  DEFAULT_DEVICE_PREFS
} from "./devicePrefs.js";
import {
  AESTHETICS,
  DEFAULT_AESTHETIC,
  sanitizeAesthetic,
  loadAestheticPref,
  saveAestheticPref,
  subscribeToAestheticPrefChanges
} from "./aestheticPrefs.js";
import {
  buildExportPayload,
  serializeExportPayload,
  parseImportPayload,
  suggestExportFileName
} from "./transfer.js";
import { getGoogleSyncStatus, isGoogleSyncAvailable, getGoogleSyncDiagnostics } from "./googleSync.js";

const canvasElement = document.querySelector("#canvas");
const sideBarElement = document.querySelector("#side-bar");
const sidebarToggleButton = document.querySelector("#sidebar-toggle");
const summaryElement = document.querySelector("#state-summary");
const panelRootElement = document.querySelector("#panel-root");
const themeStylesheetElement = document.querySelector("#theme-stylesheet");
const addCampaignButton = document.querySelector("#add-campaign-button");
const addProjectButton = document.querySelector("#add-project-button");
const aestheticToggleButton = document.querySelector("#aesthetic-toggle-button");
const aestheticToggleLabel = document.querySelector("#aesthetic-toggle-label");
const exportDataButton = document.querySelector("#export-data-button");
const importDataButton = document.querySelector("#import-data-button");
const googleSyncButton = document.querySelector("#google-sync-button");
const importFileInput = document.querySelector("#import-file-input");

const PROJECT_TOOLTIP_MS = 1600;
const SAVE_DEBOUNCE_MS = 220;
const EDITORIAL_CAMPAIGN_COLOR = "#3f536d";
const AESTHETIC_STYLESHEETS = {
  [AESTHETICS.BHADRALOK]: "styles/newtab.css",
  [AESTHETICS.VANILLA]: "styles/newtab-vanilla.css"
};
const AESTHETIC_LABELS = {
  [AESTHETICS.BHADRALOK]: "Bhadralok",
  [AESTHETICS.VANILLA]: "Vanilla"
};

let state = createEmptyState();
let devicePrefs = { ...DEFAULT_DEVICE_PREFS };
let activeAesthetic = DEFAULT_AESTHETIC;
let saveTimer = null;
let unsubscribeStorage = null;
let unsubscribeDevicePrefs = null;
let unsubscribeAestheticPrefs = null;
let isSidebarCollapsed = false;

const projectTooltipTimers = new WeakMap();

function getNextAesthetic(currentAesthetic) {
  return sanitizeAesthetic(currentAesthetic) === AESTHETICS.BHADRALOK ? AESTHETICS.VANILLA : AESTHETICS.BHADRALOK;
}

function getAestheticLabel(aesthetic) {
  return AESTHETIC_LABELS[sanitizeAesthetic(aesthetic)] || AESTHETIC_LABELS[DEFAULT_AESTHETIC];
}

function applyAesthetic(nextAesthetic, options = { persist: false }) {
  const normalized = sanitizeAesthetic(nextAesthetic);
  activeAesthetic = normalized;
  document.body.dataset.aesthetic = normalized;

  // We swap one stylesheet link so visual language switches without touching render/data logic.
  if (themeStylesheetElement) {
    const targetHref = AESTHETIC_STYLESHEETS[normalized] || AESTHETIC_STYLESHEETS[DEFAULT_AESTHETIC];
    if (themeStylesheetElement.getAttribute("href") !== targetHref) {
      themeStylesheetElement.setAttribute("href", targetHref);
    }
  }

  if (aestheticToggleButton && aestheticToggleLabel) {
    const nextLabelAesthetic = getNextAesthetic(normalized);
    const currentLabel = getAestheticLabel(normalized);
    const nextLabel = getAestheticLabel(nextLabelAesthetic);

    aestheticToggleLabel.textContent = `Aesthetic: ${currentLabel}`;

    const actionLabel = `Current aesthetic: ${currentLabel}. Click to switch to ${nextLabel}.`;
    aestheticToggleButton.title = actionLabel;
    aestheticToggleButton.setAttribute("aria-label", actionLabel);
  }

  if (options.persist) {
    saveAestheticPref(normalized).catch((error) => {
      console.warn("Ops Map: failed to save aesthetic preference.", error);
    });
  }
}

function applyDevicePrefs(nextPrefs) {
  devicePrefs = {
    ...DEFAULT_DEVICE_PREFS,
    ...(nextPrefs || {})
  };
}

function applySidebarCollapsedState(collapsed) {
  isSidebarCollapsed = Boolean(collapsed);
  document.body.classList.toggle("is-sidebar-collapsed", isSidebarCollapsed);

  if (sidebarToggleButton) {
    const label = isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
    sidebarToggleButton.setAttribute("aria-label", label);
    sidebarToggleButton.setAttribute("title", label);
    sidebarToggleButton.textContent = isSidebarCollapsed ? ">>" : "<<";
  }

  if (sideBarElement) {
    sideBarElement.dataset.collapsed = isSidebarCollapsed ? "true" : "false";
  }
}

function scheduleStateSave() {
  window.clearTimeout(saveTimer);

  // Debounced writes keep quick inline edits responsive while still persisting safely.
  saveTimer = window.setTimeout(async () => {
    try {
      await saveState(state);
    } catch (error) {
      console.warn("Ops Map: failed to save state.", error);
    }
  }, SAVE_DEBOUNCE_MS);
}

function applyState(nextState, options = { persist: true }) {
  const didChange = nextState !== state;

  state = nextState;
  render();

  if (didChange && options.persist) {
    scheduleStateSave();
  }
}

function closePanel() {
  panelRootElement.hidden = true;
  panelRootElement.innerHTML = "";
}

function openImportPicker() {
  if (!importFileInput) {
    openInfoPanel("Import Unavailable", "The import control is not available in this build.");
    return;
  }

  importFileInput.value = "";
  importFileInput.click();
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

function openInfoPanel(titleText, messageText) {
  const formElement = createPanelScaffold(titleText);
  formElement.addEventListener("submit", (event) => event.preventDefault());

  const messageElement = document.createElement("p");
  messageElement.className = "panel-note";
  messageElement.textContent = messageText;

  const actionsElement = document.createElement("div");
  actionsElement.className = "panel-actions";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", closePanel);

  actionsElement.append(closeButton);
  formElement.append(messageElement, actionsElement);
}

function getStateEntityCounts(targetState) {
  return {
    campaigns: Array.isArray(targetState?.campaigns) ? targetState.campaigns.length : 0,
    projects: Array.isArray(targetState?.projects) ? targetState.projects.length : 0
  };
}

function triggerJsonDownload(fileName, content) {
  const blob = new Blob([content], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Releasing the object URL avoids leaking transient in-memory blob URLs.
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

function exportStateToFile() {
  try {
    const payload = buildExportPayload(state);
    const serialized = serializeExportPayload(payload);
    triggerJsonDownload(suggestExportFileName(), serialized);
  } catch (error) {
    openInfoPanel("Export Failed", "Ops Map could not export data right now. Try again.");
  }
}

function openImportConfirmationPanel(importSourceLabel, incomingState) {
  const formElement = createPanelScaffold("Import Data (Replace Current Map)");
  formElement.addEventListener("submit", (event) => event.preventDefault());

  const currentCounts = getStateEntityCounts(state);
  const incomingCounts = getStateEntityCounts(incomingState);

  const warningCallout = document.createElement("div");
  warningCallout.className = "panel-warning";

  const warningTitle = document.createElement("h4");
  warningTitle.textContent = "This will fully replace your current map.";

  const warningBody = document.createElement("p");
  warningBody.textContent =
    "Campaigns, projects, missions, and layout data from the import file will overwrite your current Ops Map data.";

  warningCallout.append(warningTitle, warningBody);

  const importSummary = document.createElement("p");
  importSummary.className = "panel-note";
  importSummary.textContent = `Import file: ${importSourceLabel || "Selected file"} · Incoming ${incomingCounts.campaigns} campaign${
    incomingCounts.campaigns === 1 ? "" : "s"
  }, ${incomingCounts.projects} project${incomingCounts.projects === 1 ? "" : "s"}.`;

  const currentSummary = document.createElement("p");
  currentSummary.className = "panel-note";
  currentSummary.textContent = `Current map: ${currentCounts.campaigns} campaign${
    currentCounts.campaigns === 1 ? "" : "s"
  }, ${currentCounts.projects} project${currentCounts.projects === 1 ? "" : "s"}. Device-specific browser preference will stay unchanged.`;

  const actionsElement = document.createElement("div");
  actionsElement.className = "panel-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", closePanel);

  const replaceButton = document.createElement("button");
  replaceButton.type = "button";
  replaceButton.className = "destructive-action";
  replaceButton.textContent = "Replace Current Map";
  replaceButton.addEventListener("click", () => {
    // Import replacement applies normalized state in one atomic transition.
    applyState(incomingState);
    closePanel();
  });

  actionsElement.append(cancelButton, replaceButton);
  formElement.append(warningCallout, importSummary, currentSummary, actionsElement);
}

async function handleImportFileSelection(file) {
  if (!file) {
    return;
  }

  let parsedImport;

  try {
    parsedImport = parseImportPayload(await file.text());
  } catch (error) {
    openInfoPanel("Import Failed", error instanceof Error ? error.message : "Import failed.");
    return;
  }

  const normalizedIncomingState = normalizeState(parsedImport.payload.state);
  openImportConfirmationPanel(file.name, normalizedIncomingState);
}

function openGoogleSyncPanel() {
  const formElement = createPanelScaffold("Google Sync");
  formElement.addEventListener("submit", (event) => event.preventDefault());

  const status = getGoogleSyncStatus();
  const available = isGoogleSyncAvailable();
  const diagnostics = getGoogleSyncDiagnostics();

  const statusCallout = document.createElement("div");
  statusCallout.className = "panel-warning";

  const titleElement = document.createElement("h4");
  titleElement.textContent = available ? "Google Sync Available" : "Google Sync Coming Soon";

  const bodyElement = document.createElement("p");
  bodyElement.textContent = status.reason;

  statusCallout.append(titleElement, bodyElement);

  const guidance = document.createElement("p");
  guidance.className = "panel-note";
  guidance.textContent =
    "For cross-browser transfer today, export data from one Ops Map instance and import it in the other browser/device.";

  const diagnosticsTitle = document.createElement("p");
  diagnosticsTitle.className = "panel-note";
  diagnosticsTitle.textContent = "Sync diagnostics (this device):";

  // These values make the two most common sync blockers visible without opening DevTools.
  const diagnosticsLines = [
    `Extension ID: ${diagnostics.extensionId}`,
    `State backend: ${diagnostics.storageBackend}`,
    `Cross-browser cloud sync: ${diagnostics.crossBrowserCloudSync}`
  ];

  const diagnosticsBody = document.createElement("p");
  diagnosticsBody.className = "panel-note";
  diagnosticsBody.textContent = diagnosticsLines.join("\n");
  diagnosticsBody.style.whiteSpace = "pre-line";

  const syncHint = document.createElement("p");
  syncHint.className = "panel-note";
  syncHint.textContent =
    "If two devices show different extension IDs, they will not share chrome.storage.sync data even under the same Google profile.";

  const actionsElement = document.createElement("div");
  actionsElement.className = "panel-actions";

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "Export Data";
  exportButton.addEventListener("click", () => {
    exportStateToFile();
  });

  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.textContent = "Import Data";
  importButton.addEventListener("click", () => {
    closePanel();
    openImportPicker();
  });

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", closePanel);

  actionsElement.append(exportButton, importButton, closeButton);
  formElement.append(statusCallout, guidance, diagnosticsTitle, diagnosticsBody, syncHint, actionsElement);
}

function openCampaignEditor() {
  if (state.campaigns.length >= MAX_CAMPAIGNS) {
    openInfoPanel("Campaign Limit Reached", `Ops Map currently supports up to ${MAX_CAMPAIGNS} campaigns.`);
    return;
  }

  const formElement = createPanelScaffold("Create Campaign");

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Campaign name";
  nameInput.required = true;
  nameInput.autofocus = true;

  const errorElement = document.createElement("p");
  errorElement.className = "panel-error";

  formElement.append(createField("Name", nameInput), errorElement, createActionsRow("Create Campaign"));

  formElement.addEventListener("submit", (event) => {
    event.preventDefault();

    const nextState = addCampaign(state, {
      name: nameInput.value,
      // Color remains in data for backward compatibility, but the UI now uses one editorial accent.
      color: EDITORIAL_CAMPAIGN_COLOR
    });

    if (nextState === state) {
      errorElement.textContent = "A campaign needs a name, and the board supports up to six campaigns.";
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
  window.open(link, "_blank", "noopener,noreferrer");
}

function launchProject(project, projectNode) {
  if (project.mode === PROJECT_MODES.PHYSICAL) {
    showProjectTooltip(projectNode, "Physical artifact - no link");
    return;
  }

  const link = (project.link || "").trim();

  if (!link) {
    // Missing links are corrected via the project editor instead of failing silently.
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
    createField("Project Mode", projectModeSelect, "Physical artifacts stay on the board but do not launch links."),
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

function syncMissionEmptyState(missionSection, missionEditor) {
  const hasMission = Boolean(missionEditor.textContent.trim());
  missionEditor.dataset.empty = hasMission ? "false" : "true";
  missionSection.dataset.empty = hasMission ? "false" : "true";
}

function applyMissionEditorPlaceholder(missionSection, missionEditor, missionValue) {
  const mission = (missionValue || "").trim();
  missionEditor.textContent = mission;
  syncMissionEmptyState(missionSection, missionEditor);
}

function buildProjectEditGlyph() {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.classList.add("project-edit-glyph");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");

  // A simple pencil mark keeps the affordance compact without introducing noisy label text.
  const path = document.createElementNS(namespace, "path");
  path.setAttribute("d", "M3 11.5L11.6 2.9a1.3 1.3 0 011.8 0l.7.7a1.3 1.3 0 010 1.8L5.5 14H3z");

  const line = document.createElementNS(namespace, "path");
  line.setAttribute("d", "M9.9 4.6l1.5 1.5");

  svg.append(path, line);

  return svg;
}

function renderProjectRow(project) {
  const row = document.createElement("div");
  row.className = "campaign-project-row";

  const launchButton = document.createElement("button");
  launchButton.type = "button";
  launchButton.className = `project-launch${project.mode === PROJECT_MODES.PHYSICAL ? " is-physical" : ""}`;
  launchButton.textContent = project.name;
  launchButton.title =
    project.mode === PROJECT_MODES.PHYSICAL
      ? `${project.name}\nPhysical artifact (no link)`
      : `${project.name}\n${project.link || "No link set"}`;

  launchButton.addEventListener("click", () => {
    launchProject(project, launchButton);
  });

  // Right-click remains a direct edit shortcut for power users.
  launchButton.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openProjectEditor({ projectId: project.id });
  });

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "project-edit-icon";
  editButton.setAttribute("aria-label", `Edit project ${project.name}`);
  editButton.title = `Edit ${project.name}`;
  editButton.append(buildProjectEditGlyph());
  editButton.addEventListener("click", () => {
    openProjectEditor({ projectId: project.id });
  });

  row.append(launchButton, editButton);

  return row;
}

function renderCampaignCard(campaign, projects) {
  const article = document.createElement("article");
  article.className = "campaign-card";

  const header = document.createElement("div");
  header.className = "campaign-card-header";

  const title = document.createElement("h2");
  title.className = "campaign-title";
  title.contentEditable = "true";
  title.spellcheck = false;
  title.textContent = campaign.name;
  title.title = campaign.name;

  title.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      title.blur();
    }
  });

  title.addEventListener("blur", () => {
    applyState(renameCampaign(state, campaign.id, title.textContent));
    title.title = title.textContent.trim();
  });

  const headerActions = document.createElement("div");
  headerActions.className = "campaign-header-actions";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "campaign-delete";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => {
    const confirmed = window.confirm(`Delete campaign "${campaign.name}"?`);
    if (!confirmed) {
      return;
    }

    applyState(deleteCampaign(state, campaign.id));
  });

  headerActions.append(deleteButton);
  header.append(title, headerActions);

  const missionSection = document.createElement("section");
  missionSection.className = "mission-block";
  missionSection.title = "Current mission. Click to edit.";

  const missionEditor = document.createElement("div");
  missionEditor.className = "mission-editor";
  missionEditor.contentEditable = "true";
  missionEditor.spellcheck = true;
  // The mission field is intentionally compact; the contextual label lives in tooltip text.
  missionEditor.title = "Current mission. Click to edit.";
  missionEditor.setAttribute("aria-label", `Current mission for ${campaign.name}`);
  applyMissionEditorPlaceholder(missionSection, missionEditor, campaign.currentMission);

  missionEditor.addEventListener("input", () => {
    syncMissionEmptyState(missionSection, missionEditor);
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

  missionSection.append(missionEditor);

  const projectsSection = document.createElement("section");
  projectsSection.className = "projects-block";

  const projectsHeader = document.createElement("div");
  projectsHeader.className = "projects-header";

  const projectsLabel = document.createElement("p");
  projectsLabel.className = "projects-label";
  projectsLabel.textContent = "Projects";

  const addProjectInlineButton = document.createElement("button");
  addProjectInlineButton.type = "button";
  addProjectInlineButton.className = "projects-add-icon";
  addProjectInlineButton.textContent = "+";
  addProjectInlineButton.setAttribute("aria-label", `Add project to ${campaign.name}`);
  addProjectInlineButton.title = `Add project to ${campaign.name}`;
  addProjectInlineButton.addEventListener("click", () => {
    openProjectEditor({ seedCampaignId: campaign.id });
  });

  projectsHeader.append(projectsLabel, addProjectInlineButton);

  const projectsList = document.createElement("div");
  projectsList.className = "projects-list";

  if (projects.length === 0) {
    const emptyProjects = document.createElement("p");
    emptyProjects.className = "projects-empty";
    emptyProjects.textContent = "No projects in this campaign yet.";
    projectsList.append(emptyProjects);
  } else {
    projects.forEach((project) => {
      projectsList.append(renderProjectRow(project));
    });
  }

  projectsSection.append(projectsHeader, projectsList);

  article.append(header, missionSection, projectsSection);
  return article;
}

function renderEmptySlot(slotIndex) {
  const article = document.createElement("article");
  article.className = "campaign-card campaign-slot-empty";

  const title = document.createElement("h2");
  title.className = "empty-slot-title";
  title.textContent = `Campaign Slot ${slotIndex + 1}`;

  const body = document.createElement("p");
  body.className = "empty-slot-body";
  body.textContent = "Create a campaign to use this section.";

  const createButton = document.createElement("button");
  createButton.type = "button";
  createButton.className = "empty-slot-create";
  createButton.textContent = "Create Campaign";
  createButton.addEventListener("click", () => {
    openCampaignEditor();
  });

  article.append(title, body, createButton);
  return article;
}

function renderSummary() {
  const campaignCount = state.campaigns.length;
  const projectCount = state.projects.length;
  const missionCount = state.campaigns.filter((campaign) => campaign.currentMission).length;
  const verboseSummary = `${campaignCount} campaign${campaignCount === 1 ? "" : "s"} · ${projectCount} project${
    projectCount === 1 ? "" : "s"
  } · ${missionCount} active mission${missionCount === 1 ? "" : "s"}`;

  // Compact tokens reduce sidebar text load, while title/aria preserve full clarity.
  summaryElement.textContent = `${campaignCount}c · ${projectCount}p · ${missionCount}m`;
  summaryElement.title = verboseSummary;
  summaryElement.setAttribute("aria-label", verboseSummary);
}

function syncSidebarActionStates() {
  const atCampaignLimit = state.campaigns.length >= MAX_CAMPAIGNS;

  if (addCampaignButton) {
    addCampaignButton.disabled = atCampaignLimit;
    addCampaignButton.title = atCampaignLimit
      ? `Campaign limit reached (${MAX_CAMPAIGNS}).`
      : "Create a new campaign";
  }

  if (addProjectButton) {
    addProjectButton.disabled = state.campaigns.length === 0;
    addProjectButton.title = state.campaigns.length === 0 ? "Create a campaign first" : "Create a new project";
  }
}

function render() {
  canvasElement.innerHTML = "";

  const slots = buildCampaignSlots(state, MAX_CAMPAIGN_SLOTS);
  const projectsByCampaign = buildProjectsByCampaign(state, MAX_CAMPAIGN_SLOTS);

  // Rendering all six slots keeps the board calm and predictable at every campaign count.
  slots.forEach((slot) => {
    if (!slot.campaign) {
      canvasElement.append(renderEmptySlot(slot.slotIndex));
      return;
    }

    const projects = projectsByCampaign.get(slot.campaign.id) || [];
    canvasElement.append(renderCampaignCard(slot.campaign, projects));
  });

  renderSummary();
  syncSidebarActionStates();
}

function bindGlobalEvents() {
  addCampaignButton.addEventListener("click", () => openCampaignEditor());
  addProjectButton.addEventListener("click", () => openProjectEditor());

  sidebarToggleButton?.addEventListener("click", () => {
    // Sidebar collapse is purely presentational; board data remains unchanged.
    applySidebarCollapsedState(!isSidebarCollapsed);
  });

  if (exportDataButton) {
    exportDataButton.addEventListener("click", () => {
      exportStateToFile();
    });
  }

  if (importDataButton) {
    importDataButton.addEventListener("click", () => {
      openImportPicker();
    });
  }

  if (importFileInput) {
    importFileInput.addEventListener("change", async () => {
      const file = importFileInput.files?.[0];
      await handleImportFileSelection(file);
      importFileInput.value = "";
    });
  }

  if (googleSyncButton) {
    googleSyncButton.addEventListener("click", openGoogleSyncPanel);
  }

  if (aestheticToggleButton) {
    aestheticToggleButton.addEventListener("click", () => {
      // Aesthetic switching is immediate and UI-only, then persisted to synced preferences.
      applyAesthetic(getNextAesthetic(activeAesthetic), { persist: true });
    });
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePanel();
    }
  });
}

async function initialize() {
  const [loadedState, loadedDevicePrefs, loadedAesthetic] = await Promise.all([
    loadState(),
    loadDevicePrefs(),
    loadAestheticPref()
  ]);

  // Sidebar defaults to collapsed so the board owns first visual focus on every new tab.
  applySidebarCollapsedState(true);
  applyDevicePrefs(loadedDevicePrefs || DEFAULT_DEVICE_PREFS);
  applyAesthetic(loadedAesthetic || DEFAULT_AESTHETIC);
  bindGlobalEvents();

  applyState(normalizeState(loadedState || createEmptyState()), { persist: false });

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

  unsubscribeAestheticPrefs = subscribeToAestheticPrefChanges((incomingAesthetic) => {
    applyAesthetic(incomingAesthetic || DEFAULT_AESTHETIC);
  });

  window.addEventListener("beforeunload", () => {
    unsubscribeStorage?.();
    unsubscribeDevicePrefs?.();
    unsubscribeAestheticPrefs?.();
  });
}

initialize();
