const MENU_TEXT = "send-to-notebook";
const MENU_LINK = "save-link-to-notebook";

chrome.runtime.onInstalled.addListener(() => {
  // Shows only when text is highlighted.
  chrome.contextMenus.create({
    id: MENU_TEXT,
    title: "Send to Magpie",
    contexts: ["selection"],
  });
  // Shows only when nothing is selected (Chrome's "page" context excludes
  // selection/link/image), so the two items never appear together.
  chrome.contextMenus.create({
    id: MENU_LINK,
    title: "Save page link to Magpie",
    contexts: ["page"],
  });
  refreshBadge();
});

chrome.runtime.onStartup.addListener(refreshBadge);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.pageUrl || tab?.url || "";
  let text = "";

  if (info.menuItemId === MENU_TEXT) {
    text = (info.selectionText || "").trim();
    if (!text) return;
  } else if (info.menuItemId === MENU_LINK) {
    // Link-only note: no snippet, just the source.
    text = "";
  } else {
    return;
  }

  const note = {
    id: crypto.randomUUID(),
    text,
    url,
    title: tab?.title || "",
    createdAt: Date.now(),
    category: null,
    summary: null,
  };

  const { notes = [] } = await chrome.storage.local.get("notes");
  notes.unshift(note);
  await chrome.storage.local.set({ notes });
  refreshBadge(notes);
});

// Toolbar icon opens (or focuses) the notebook tab.
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("notebook.html");
  const existing = await chrome.tabs.query({ url });
  if (existing.length) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.windows.update(existing[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});

// Keep the badge in sync if notes change from the notebook UI.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.notes) refreshBadge(changes.notes.newValue || []);
});

async function refreshBadge(notes) {
  if (!notes) ({ notes = [] } = await chrome.storage.local.get("notes"));
  const untriaged = notes.filter((n) => !n.category).length;
  chrome.action.setBadgeText({ text: untriaged ? String(untriaged) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
}
