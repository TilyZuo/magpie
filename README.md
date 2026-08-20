# 🐦 Magpie

A Chrome (MV3) extension that lets you **highlight any text on a page (or just
grab the link), right-click, and stash it in a local notebook**. Magpie then
**triages each clip with Claude** — assigning a category and a one-line
summary — and keeps a link back to the source. Like the bird, it collects little
treasures and tidies them into its nest.

Everything is **local-only**: notes live in `chrome.storage.local` on your
machine. The only network call is the AI triage request to the Anthropic API,
using a key **you** provide.

## How it fits together

```
┌─────────────┐   right-click "Send to Magpie"     ┌────────────────────┐
│  Any web     │ ─────────────────────────────────▶ │ background.js       │
│  page (text  │   selection (or link) + url + title│ (service worker)    │
│  selected)   │                                    │  saves to storage   │
└─────────────┘                                     └─────────┬──────────┘
                                                              │ chrome.storage.local
                                                              ▼
                                              ┌────────────────────────────┐
                                              │ notebook.html (own tab)     │
                                              │  • groups notes by category │
                                              │  • "Triage" → Claude API     │
                                              │  • drag cards to re-file     │
                                              │  • links back to source     │
                                              └────────────────────────────┘
```

The notebook is a full-page UI bundled **inside** the extension. That is what
makes "local-only" work: a normal hosted web page cannot read an extension's
storage, but an extension page can.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** and select this `magpie` folder.
4. Pin the extension if you like (puzzle-piece icon → pin).

## Use

1. **Clip text:** select some text on any article, right-click → **Send to
   Magpie**. Or, with nothing selected, right-click → **Save page link to
   Magpie** to stash just the URL. The toolbar badge counts un-triaged notes.
2. Click the Magpie icon to open the **notebook** tab.
3. Open **⚙ Settings**, paste your Anthropic API key (from
   `console.anthropic.com` — this needs API credits, separate from any Claude.ai
   subscription), and Save.
4. Click **Triage**. Each un-triaged note gets a category + one-line summary and
   is filed into its group.
5. **Organize by hand:** drag any card onto another category, back to the Inbox,
   or onto the dashed "＋ new category" zone to create one. Every move is logged
   (see below). Search filters notes; click a card's source host to revisit the
   page; click ✕ to delete.

## Bring your own key

Magpie ships with **no key baked in**. Each person pastes their own Anthropic API
key in Settings; it's stored only in that browser's `chrome.storage.local` and is
never shared. So the same build works for anyone who installs it.

## Correction log

Every time you move a card to a different category, Magpie logs it to the
DevTools console — and flags it as a **⚠️ corrected AI misfile** when you're
overriding an AI decision, showing the reason the AI originally chose that bucket.
The full history is saved under `corrections` in storage. In the notebook tab's
console run:

```js
showCorrections()
```

to print a table of every change (when, from → to, what the AI chose, its reason,
whether it was wrong, and the note text).

## Files

| File            | Role                                                       |
| --------------- | ---------------------------------------------------------- |
| `manifest.json` | MV3 manifest (`contextMenus` + `storage` permissions)      |
| `background.js` | Context-menu items, saves clips/links, manages the badge   |
| `notebook.html` | Notebook UI markup + settings dialog                       |
| `notebook.css`  | Styles                                                     |
| `notebook.js`   | Render, search, drag-to-recategorize, Claude triage, log   |
| `logo.svg`      | Source of the Magpie mark                                  |
| `icons/`        | Toolbar / store icons rendered from the logo               |

## Notes & limits

- The API key is stored in `chrome.storage.local` (this browser only). Treat the
  unpacked extension as personal/dev use, not a published, shared build.
- Triage runs one request per un-triaged note; the static system prompt is cached
  (`cache_control`) so repeat batches are cheaper.
- Default model is **Claude Haiku 4.5** (fast/cheap); switch to **Sonnet 4.6** in
  Settings for smarter categorization.
- Data export/import and cross-device sync are intentionally out of scope for
  this local-only v1.
