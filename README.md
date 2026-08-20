# Text Grabber → Notebook

A Chrome (MV3) extension that lets you **highlight any text on a page, right-click,
and drop it into a local notebook**. The notebook then **triages each clip with
Claude** — assigning a category and a one-line summary — and keeps a link back to
the source.

Everything is **local-only**: notes live in `chrome.storage.local` on your
machine. The only network call is the AI triage request to the Anthropic API,
using a key you provide.

## How it fits together

```
┌─────────────┐   right-click "Send to Notebook"   ┌────────────────────┐
│  Any web     │ ─────────────────────────────────▶ │ background.js       │
│  page (text  │   selection + page url + title     │ (service worker)    │
│  selected)   │                                    │  saves to storage   │
└─────────────┘                                     └─────────┬──────────┘
                                                              │ chrome.storage.local
                                                              ▼
                                              ┌────────────────────────────┐
                                              │ notebook.html (own tab)     │
                                              │  • groups notes by category │
                                              │  • "Triage" → Claude API     │
                                              │  • links back to source     │
                                              └────────────────────────────┘
```

The notebook is a full-page UI bundled **inside** the extension. That is what
makes "local-only" work: a normal hosted web page cannot read an extension's
storage, but an extension page can.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** and select this `text-grabber-notebook` folder.
4. Pin the extension if you like (puzzle-piece icon → pin).

## Use

1. On any article, select some text.
2. Right-click → **Send to Notebook**. The toolbar badge shows how many notes
   are waiting to be triaged.
3. Click the extension icon to open the **Notebook** tab.
4. Open **⚙ Settings**, paste your Anthropic API key (from
   `console.anthropic.com`), and Save.
5. Click **Triage**. Each untriaged note gets a category + summary, and is filed
   into its group. Use the search box to filter; click the source host to revisit
   the original page; click ✕ to delete.

## Files

| File              | Role                                                      |
| ----------------- | -------------------------------------------------------- |
| `manifest.json`   | MV3 manifest (`contextMenus` + `storage` permissions)    |
| `background.js`   | Context-menu item, saves clips, manages the badge        |
| `notebook.html`   | Notebook UI markup + settings dialog                     |
| `notebook.css`    | Styles                                                   |
| `notebook.js`     | Render, search, settings, and the Claude triage call     |
| `icons/`          | Toolbar icons                                            |

## Notes & limits

- The API key is stored in `chrome.storage.local` (this browser only). Treat the
  unpacked extension as personal/dev use, not a published, shared build.
- Triage runs one request per untriaged note; the static system prompt is cached
  (`cache_control`) so repeat batches are cheaper.
- Default model is **Claude Haiku 4.5** (fast/cheap); switch to **Sonnet 4.6** in
  Settings for smarter categorization.
- Data export/import and cross-device sync are intentionally out of scope for
  this local-only v1.
