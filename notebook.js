"use strict";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const SYSTEM_PROMPT =
  "You are a note-triaging assistant. For each highlighted snippet a user has " +
  "clipped from the web, assign a single short category and write a one-line " +
  "summary (max 12 words). Prefer reusing one of the existing categories when a " +
  "snippet fits; only invent a new category when none fit. Categories are broad " +
  "topics like 'Productivity', 'AI/ML', 'Health', 'Finance', 'Recipes'. " +
  "Also give a brief 'reason' (max 15 words) explaining why you chose that category. " +
  "Respond with ONLY a JSON object: {\"category\": string, \"summary\": string, \"reason\": string}.";

const els = {
  board: document.getElementById("board"),
  empty: document.getElementById("empty"),
  status: document.getElementById("status"),
  search: document.getElementById("search"),
  triageBtn: document.getElementById("triage-btn"),
  untriagedCount: document.getElementById("untriaged-count"),
  settingsBtn: document.getElementById("settings-btn"),
  settings: document.getElementById("settings"),
  apiKey: document.getElementById("api-key"),
  model: document.getElementById("model"),
  saveSettings: document.getElementById("save-settings"),
};

let notes = [];
let filter = "";

init();

async function init() {
  const data = await chrome.storage.local.get(["notes", "apiKey", "model"]);
  notes = data.notes || [];
  els.apiKey.value = data.apiKey || "";
  els.model.value = data.model || "claude-haiku-4-5-20251001";
  render();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.notes) {
      notes = changes.notes.newValue || [];
      render();
    }
  });

  els.search.addEventListener("input", (e) => {
    filter = e.target.value.trim().toLowerCase();
    render();
  });
  els.settingsBtn.addEventListener("click", () => els.settings.showModal());
  els.saveSettings.addEventListener("click", saveSettings);
  els.triageBtn.addEventListener("click", triageAll);
  els.board.addEventListener("click", onBoardClick);

  // Drag a card onto a category group to re-file it (delegated, so it
  // survives re-renders that rebuild the board).
  els.board.addEventListener("dragstart", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    e.dataTransfer.setData("text/plain", card.dataset.id);
    e.dataTransfer.effectAllowed = "move";
    card.classList.add("dragging");
  });
  els.board.addEventListener("dragend", () => {
    els.board.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
    els.board.querySelectorAll(".drop-hover").forEach((el) => el.classList.remove("drop-hover"));
  });
  els.board.addEventListener("dragover", (e) => {
    const zone = e.target.closest("[data-drop]");
    if (!zone) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    zone.classList.add("drop-hover");
  });
  els.board.addEventListener("dragleave", (e) => {
    const zone = e.target.closest("[data-drop]");
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("drop-hover");
  });
  els.board.addEventListener("drop", async (e) => {
    const zone = e.target.closest("[data-drop]");
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove("drop-hover");
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;

    let category = zone.dataset.drop;
    if (category === "__new__") {
      const name = (prompt("New category name:") || "").trim().slice(0, 40);
      if (!name) return;
      category = name;
    } else if (category === "__inbox__") {
      category = null; // back to the untriaged inbox
    }
    await moveNote(id, category);
  });
}

async function moveNote(id, category) {
  const target = notes.find((n) => n.id === id);
  if (!target || target.category === category) return;

  const from = target.category;
  target.category = category;

  const entry = {
    at: Date.now(),
    noteId: id,
    note: target.text ? target.text.slice(0, 140) : target.title || target.url || "",
    from: from || "Inbox",
    to: category || "Inbox",
    aiCategory: target.aiCategory || null,
    aiReason: target.reason || null,
    // A "misfile" = the AI had triaged this note and you moved it elsewhere.
    correctedAi: Boolean(target.aiCategory) && target.aiCategory !== category,
  };

  logCorrection(entry);

  const { corrections = [] } = await chrome.storage.local.get("corrections");
  corrections.unshift(entry);
  // Keep the log from growing without bound.
  if (corrections.length > 500) corrections.length = 500;
  await chrome.storage.local.set({ notes, corrections });
  render();
}

function logCorrection(e) {
  const label = e.correctedAi
    ? `⚠️ Corrected AI misfile: "${e.aiCategory}" → "${e.to}"`
    : `Category changed: ${e.from} → ${e.to}`;
  console.groupCollapsed(label);
  console.log("note:", e.note);
  if (e.aiCategory) {
    console.log(`AI chose "${e.aiCategory}" because: ${e.aiReason || "(no reason recorded)"}`);
  }
  if (e.correctedAi) {
    console.log(`You moved it to "${e.to}" — the AI's bucket was wrong here.`);
  }
  console.log("time:", new Date(e.at).toLocaleString());
  console.groupEnd();
}

// Type showCorrections() in the DevTools console to review every change,
// including why the AI originally chose each (wrong) bucket.
window.showCorrections = async () => {
  const { corrections = [] } = await chrome.storage.local.get("corrections");
  console.table(
    corrections.map((c) => ({
      when: new Date(c.at).toLocaleString(),
      from: c.from,
      to: c.to,
      "AI chose": c.aiCategory || "—",
      "AI reason": c.aiReason || "—",
      "AI wrong?": c.correctedAi ? "yes" : "",
      note: c.note,
    }))
  );
  return corrections;
};

async function saveSettings(e) {
  // Let the dialog close naturally; just persist values.
  await chrome.storage.local.set({
    apiKey: els.apiKey.value.trim(),
    model: els.model.value,
  });
}

function visibleNotes() {
  if (!filter) return notes;
  return notes.filter((n) =>
    (n.text + " " + (n.summary || "") + " " + (n.category || "") + " " + (n.title || ""))
      .toLowerCase()
      .includes(filter)
  );
}

function render() {
  const list = visibleNotes();
  const untriaged = notes.filter((n) => !n.category).length;
  els.untriagedCount.textContent = untriaged ? String(untriaged) : "";
  els.triageBtn.disabled = untriaged === 0;

  els.empty.classList.toggle("hidden", notes.length !== 0);
  els.board.innerHTML = "";

  if (list.length === 0) return;

  // Group by category; untriaged notes go into a pinned "Inbox" group.
  const groups = new Map();
  for (const n of list) {
    const key = n.category || "Inbox";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }

  const keys = [...groups.keys()].sort((a, b) => {
    if (a === "Inbox") return -1;
    if (b === "Inbox") return 1;
    return a.localeCompare(b);
  });

  for (const key of keys) {
    const items = groups.get(key);
    const section = document.createElement("section");
    section.className = "category";
    section.dataset.drop = key === "Inbox" ? "__inbox__" : key;
    section.innerHTML =
      `<div class="category-head"><h2>${escapeHtml(key)}</h2>` +
      `<span class="count">${items.length}</span></div>` +
      `<div class="cards"></div>`;
    const cards = section.querySelector(".cards");
    for (const n of items) cards.appendChild(cardEl(n));
    els.board.appendChild(section);
  }

  // Drop target for creating a brand-new category on the fly.
  const newZone = document.createElement("section");
  newZone.className = "category newcat";
  newZone.dataset.drop = "__new__";
  newZone.innerHTML = `<div class="newcat-box">＋ Drop here for a new category…</div>`;
  els.board.appendChild(newZone);
}

function cardEl(n) {
  const card = document.createElement("article");
  card.className = "card" + (n.category ? "" : " untriaged");
  card.dataset.id = n.id;
  card.draggable = true;

  const host = safeHost(n.url);
  const when = new Date(n.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  const body = n.text
    ? `<blockquote>${escapeHtml(n.text)}</blockquote>`
    : `<div class="linknote">🔗 ${escapeHtml(n.title || host)}</div>`;

  card.innerHTML =
    (n.summary ? `<div class="summary">${escapeHtml(n.summary)}</div>` : "") +
    body +
    `<div class="meta">` +
    (n.url
      ? `<a class="source" href="${escapeAttr(n.url)}" target="_blank" rel="noreferrer" title="${escapeAttr(n.title || n.url)}">${escapeHtml(host)}</a>`
      : `<span class="source">unknown source</span>`) +
    `<span>${when} · <button class="del" data-id="${n.id}" title="Delete">✕</button></span>` +
    `</div>`;
  return card;
}

async function onBoardClick(e) {
  const del = e.target.closest(".del");
  if (!del) return;
  const id = del.dataset.id;
  notes = notes.filter((n) => n.id !== id);
  await chrome.storage.local.set({ notes });
  render();
}

async function triageAll() {
  const { apiKey, model } = await chrome.storage.local.get(["apiKey", "model"]);
  if (!apiKey) {
    showStatus("Add your Anthropic API key in Settings to enable AI triage.", true);
    els.settings.showModal();
    return;
  }

  const pending = notes.filter((n) => !n.category);
  if (!pending.length) return;

  els.triageBtn.disabled = true;
  let done = 0;
  let failed = 0;

  for (const note of pending) {
    showStatus(`Triaging ${done + failed + 1} of ${pending.length}…`);
    try {
      const result = await categorize(note, apiKey, model);
      // Re-read by id in case the list changed under us.
      const target = notes.find((n) => n.id === note.id);
      if (target) {
        target.category = result.category || "Unsorted";
        target.summary = result.summary || null;
        // Remember the AI's original call + reasoning so manual corrections
        // can be compared against it later.
        target.aiCategory = result.category || null;
        target.reason = result.reason || null;
      }
      done++;
      await chrome.storage.local.set({ notes });
      render();
    } catch (err) {
      failed++;
      console.error("Triage failed for note", note.id, err);
    }
  }

  if (failed) {
    showStatus(`Triaged ${done} note(s); ${failed} failed. Check the API key or console.`, true);
  } else {
    showStatus(`Triaged ${done} note(s).`);
    setTimeout(() => els.status.classList.add("hidden"), 2500);
  }
  render();
}

async function categorize(note, apiKey, model) {
  const existing = [...new Set(notes.map((n) => n.category).filter(Boolean))];
  const userContent =
    (existing.length ? `Existing categories: ${existing.join(", ")}\n\n` : "") +
    `Source: ${note.title || note.url || "unknown"}\n` +
    (note.text
      ? `Snippet:\n"""${note.text.slice(0, 4000)}"""`
      : `(No snippet — this is a saved link. Categorize based on the page title/URL above.)`);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      // Required to call the API directly from a browser context.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: model || "claude-haiku-4-5-20251001",
      max_tokens: 200,
      // Cache the static system prompt across the per-note calls in a batch.
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseResult(text);
}

function parseResult(text) {
  // Be tolerant: extract the first {...} block if the model added prose.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in model response");
  const obj = JSON.parse(match[0]);
  return {
    category: typeof obj.category === "string" ? obj.category.trim().slice(0, 40) : "Unsorted",
    summary: typeof obj.summary === "string" ? obj.summary.trim().slice(0, 140) : null,
    reason: typeof obj.reason === "string" ? obj.reason.trim().slice(0, 200) : null,
  };
}

function showStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle("error", isError);
  els.status.classList.remove("hidden");
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url || "unknown source";
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function escapeAttr(s) {
  return escapeHtml(s);
}
