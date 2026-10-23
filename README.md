# Hub Design: an Agents Hub plugin

A design canvas inside the hub, like Claude Design: a session's designs on an infinite field, a toolbar, zoom, color, comment pins. You move, paint and comment by hand, everything goes to the designer as one batch, and the designer edits the file.

The interface is in English by default and in Russian when the hub language (`hub.lang`) is Russian; any other language falls back to English. The language is read when a text is drawn, so a switch takes effect without a reload.

## How it works

The view is `#/x/hub-design`. The layout follows Claude Design; colors, fonts and the light/dark theme come from the hub.

1. **Canvas.** An infinite field. A session's HTML designs lie on it as frames: a caption on top, settings, download and PLAY (open in a new tab) on the right. On the left is a chat with a specialist (`designer` by default; with a design open, its author). The design window is screen height (1440×900); a long page scrolls inside the frame; the "Comments" tab holds the batch of drafts.
   Top right is the close button: it closes Hub Design and returns you to where you came from.
   **The start screen** (as in Claude Design) opens on entering the view and on a click on the logo at the top left: a title, tabs "All / Mine / Others" ("Mine" are the designs opened on the canvas), search, a "list/tiles" switch, sorting, an "Open a design by path" field. A row of presets: presentation, design, design system, animation, your code. A click leads the chat to the right specialist (animation: `animator`, the rest: `designer`) and puts a stub "new …: " into the input. Below are past designs as cards with a live preview, a name, an author and "edited N ago": a click opens the design on the canvas. When the hub has directions, the designs are laid out in folders: one tile per direction folder (the working folder of the direction's session) with previews of its last four designs, a design that lies elsewhere goes under "No direction"; a click on a tile shows that folder's designs ("← All folders" goes back), a search looks through all of them. Every design ever made or sent stays in the list (see "Every design stays"): the list does not shrink when a session moves on or is removed. The view opened from a direction's chat starts in that direction's folder. If you write in the chat right away on the start screen, a new file is made from your instructions and opens on the canvas when it appears.
2. **Toolbar** at the top left: page, Select, Hand, Text, Frame, Comment, Pencil (line, arrow), Shapes (rectangle, oval). Top right: PLAY, the side panel, zoom with a menu ("Fit all", 50, 100, 200%).
3. **Zoom and pan.** The wheel or a pinch zooms to the cursor; space and drag, or the Hand, pans. The canvas view is remembered in the browser.
4. **Select.** A click on an element inside a design gives a frame and dragging; a corner resizes, a double click edits the text; the up arrow selects the parent, the undo arrow returns it to how it was. The panel on the right: fill and text color from a palette, font, sizes, padding, border, radius.
5. **Comment.** A click on a place puts a pin with text, and an element is attached to it: not just one selector but landmarks (id, nearest ancestor with an id, tag, text, attributes, classes, neighboring text, size and position). If the design is re-laid out and the element's selector changes, the pin finds it by its landmarks, moves with it and updates the selector; if it is not found, or there are two candidates with close scores, the pin stays where it was marked "element not found" (a dashed circle and a warning sign in the list) and does not land on a foreign element. In the message to the designer the landmarks go in words. In the window: "Send" (goes straight to the design's author), "Close" (stays a draft), "Delete". A **drag** in the comment mode draws a rectangle: a comment on a whole area (in the message: x, y, width and height in design pixels and the elements inside it). **Frame** adds a new frame on the canvas. (The Note tool is gone; notes made earlier are still shown and can be deleted.) **Pencil and shapes.** Circle something or point with an arrow.
6. **Sending.** There is no "Send to the designer" button. Hand edits, tweaks and drawings go by themselves, as one message, 8 s after the last edit (while you are still moving, it waits) to whoever is chosen at the bottom in "Who receives the edits" (the designer or the design's author by default). If the recipient is busy, the message joins their queue. A comment goes with its own button in the pin window; the text from the input takes everything that has accumulated with it. In the message: for a pin the selector, landmarks and coordinates, for an edit "was → now", for a drawing the type and place. There is no list of hand edits above the input: they are visible only in the "Comments" tab (marked "in the file"). To undo an edit use the × in its row there, or the undo arrow on the selected element on the canvas (also after sending: an edit written to the file is rolled back to the copy). An item that could not be written to the file goes to the designer in words, and Hub Design does not write it to the file after that. There is one recipient per batch: the one chosen at the bottom (if you did not choose by hand, it is the author of the design in focus).
7. When a session edits the file, the frame reloads and the pins of the previous round go dim.

### Every design stays

The start screen does not rely on what the page happened to see. The plugin process keeps a registry of designs, `<hub state>/hub-design/registry.json`: it reads the hub's journal and its archive once from the very beginning, then follows the live journal with its own offset. A design is a file of a type the canvas opens (`.html`, `.htm`, `.pdf`, `.svg`) that a session sent to the owner (by the source path) or created with the Write tool; an Edit only refreshes the time. One entry per file, however the path was written. Nothing is dropped because the session is gone or the feed tail moved on; the page hides only a file that is no longer on the disk, and paths of another OS. The hub's own sessions (the hub, its developer) are left out. The first pass over a large archive runs in the background (about ten seconds for half a gigabyte), the start screen shows what there is meanwhile. The folders of the registered designs are served by the plugin like the working folders of sessions (their pictures and styles lie beside them), except a too wide one: the home folder and above. `python3 registry.py --report [hub state dir]` counts what the journal holds without writing anything.

### Where a new design is saved

A new design asked for from a direction (the view was opened from its chat, or its folder is open on the start screen) carries a line for the designer: save it in `<direction folder>/design/<design-name>/`, not in its own working folder. The folder comes from the hub snapshot (the cwd of the direction's session), never guessed. From the hub chat, a specialist's chat or outside any folder the line is not added.

### Hand edits go straight into the file

Move, resize, text and tweaks are written by Hub Design into the `.html` itself, through `server.py`: this way "by hand" stays an edit, not a request.

- **The write is pinpoint.** On the element it found it sets an inline style (`translate`, `width`, `height`, the panel's styles) or its text; tweaks are a `var`/`attr` on `<html>`. The rest of the file is not touched. If the element is not found unambiguously (repeats, template pieces, scripts), nothing is written and the item goes to the designer as an ordinary item.
- **A copy.** Before the first write a `<name>.r<N>.html` is put next to the file: the file as it was (N is the round number). If you undo a hand edit, the file returns to the copy on disk.
- **The author is busy: no writing.** While the specialist editing the design is busy, the write waits and retries every 5 s; when the author finishes, it is written. If somebody else managed to edit the file, the write does not overwrite it: the frame is re-read and the item stays a draft.
- **What you see.** In "Comments" a written edit carries the "in the file" mark. In the message to the designer such items are marked "already in the file", plus the path of the copy: the look is right, keep it, and do not touch the copy.
- Writing goes only into HTML from the working folders of sessions and projects, only for a request from the hub page, at most 2 MiB.

### Design size

A design can set the frame size itself: `<meta name="hub-frame" content="1080x1350">` (the first one wins), otherwise an explicit `width`/`height` in px on `html`/`body`. Then the frame is exactly that size (100-8000 px), the width switch is replaced by "Design size", and the PDF is one page of that size. No size - a window by width (1440×900), as before. One file is one page: a design opened from the dashboard, a card or a session is alone on the canvas.

### PDF

The "Download PDF" button in the frame header prints the design at screen size (a 1440×900 frame gives a 1440×900 page; a design with its own size gives one page of that size) with its own Chrome and no margins; a design's own `@page` is respected. `server.py` starts the headless Chrome from `hub.json` → `testchrome.path` with `--print-to-pdf`. If Chrome is not configured, the page prints itself from a hidden frame and the browser offers "Save as PDF".

### Cards in the chat feed

When a session sends an `.html` design, a `.pdf`, an `.svg` or a `.pptx` as a file (`hub send-file`) or names its full path in a reply, the feed of any session shows a card instead of a bare link: a tile (a shot of the design, the first page of a PDF, an SVG, or an icon for a PPTX), a name (the design `<title>`, or the file name), "Hub Design · agent", and a row of buttons under it: **Open** (the file as is, in the hub's Files), **Hub Design** (on the canvas), "Copy path" and "Hide". Videos, other pictures and Markdown files get no card, no button and no Telegram post (cards and "Open in Hub Design" are only for `.html`/`.htm`, `.pdf`, `.svg` and `.pptx`; a PPTX has no preview and goes to Telegram as a file). A click or Enter on the card opens the file in Files. All icons are outline icons that follow the hub theme. Hidden cards are remembered by the browser. Shots are made by the plugin process with its own Chrome and cached on disk; only on the computer the hub runs on. The first page of a PDF is rasterized by the system (macOS `sips`); elsewhere a PDF card keeps its icon.

### Documents on the canvas

A PDF opens in the browser's built-in viewer and an SVG is shown as a picture (in an `<img>`, so its scripts do not run). The frame's label has **Make a design based on this**: the designer gets a request to make a layout based on the document's path (in the hub language). Documents are read-only on the canvas: hand edits, tweaks and "Download PDF" are for designs.

### Who gets the edits

The author of a design is the session that wrote the file (Write/Edit), then the one that sent it to the owner (send-file); a session that only named the path is not an author. No author - the designer, if the hub has one.

### Tweaks, errors, grids

- **Tweaks.** A design that declares `#hub-tweaks` itself (text, color, int, float, range, boolean, enum) gets a panel on the right with these values. Edits are live; the batch carries "was → now" for each tweak. Colors (a `color` tweak, or an enum like `bg: ink/red/blue` whose page paints a CSS variable) are swatches with the last one "own color" (a picker); the chosen color is the tweak's value. Below, for any design: **Margins, Font size, Letter spacing, Line spacing** - three presets and a slider each, live on the page; they are not written to the file, the designer gets them in words ("add to the padding…"). Moves in the panel go to the author by themselves after 8 s, marked "no report needed: reply with a single line —"; that reply is not shown in the chat.
- **The selected element** goes into the message as a line "Selected: file `selector` tag “label”".
- **Design errors.** Script errors and unhandled promise rejections show as a mark on the frame; the "Ask to fix" button puts them into the batch.
- **Grid.** For a container with `grid-template-columns: repeat(N, minmax(0, 1fr))` the properties panel shows "Columns: N"; "To flex" and "To grid" wrap the selection.
- **Grids over the frame** (frame menu → "Grids over the frame…"): up to six, columns, rows or cells, gap, margin, color. Only on the canvas: they do not reach the design or PLAY; in the batch they go as a line of the frame view.

### Designs in Telegram

Off by default. A design (HTML, PDF, SVG) that the designer or the animator (or their executors) sends with `hub send-file` comes to Telegram as a post: a shot of its first screen, its name and author, and ❤️ / 👎 buttons. A press goes back to the author as a message; after 👎 a "Why?" with reason buttons follows (or reply in your own words). A reply to the post goes to the author as an edit. The design does not come a second time as a document. Once you answer the author on the page (in the author's chat or the Hub Design chat), the author's posts leave Telegram.

It needs a hub whose Telegram bot knows the `telegram.post` and `telegram.unpost` facts and the `telegram.design_posts` setting; without them nothing is sent. Turn it on in hub.json: `"telegram": {"design_posts": true}`; your own lists: `{"sessions": ["designer", "animator"], "types": [".html", ".pdf", ".svg"]}`, `"sessions": "*"` is any session.

### Style reference library

Optional, and hidden until you point it at a folder. A style reference is a short Markdown file (the look of a site or product: colors, type, spacing) with a preview picture. When the library exists, a "Style" button appears in the design input. It opens a searchable grid of previews (by name, category and tags, and by labels if the library has them, see below; 24 per page, pictures load lazily) and a card with the description and the palette read from the file. "Use" attaches the style to the next message to the designer as a chip above the input; the message then ends with a line `Style reference: <full path to the .md file>`, and the attachment is dropped once the message is sent. Hand-edit auto-sends never carry a style.

The library is a folder with `index.json` next to the `.md` files and previews. `index.json` is either an object `{id: entry}` or a list of entries; an entry is `{"id": "…", "name": "…", "file": "style.md", "category": "…", "tags": ["…"], "preview": "previews/style.png", "site": "https://…", "description": "…"}`; only `name` and `file` are required. The folder is `extensions.<account>:hub-design.styles_dir` in hub.json (or the `HUB_DESIGN_STYLES` environment variable of the plugin process); by default `<hub state>/style-library`. No folder, no button.

**Search by labels.** Put a `tags.json` next to `index.json`: `{id: {"theme": "dark", "style": ["…"], "mood": ["…"], "industry": ["…"], "medium": ["…"], "density": ["…"]}}`. With it the search box understands plain words in English or Russian (`dark fintech`, `light friendly bank`), a brand word stands for its nearest labels (`like Apple`), and `like <style name>` takes the labels of that style as a model; the entries are ranked by how many wanted labels they have, the name, the category, the tags and the description, and distant relatives are cut. A medium named in the query (`slides like Apple`) is required: the entries of another medium drop to a fifth of their score, and the brand's own site does not win over the slides asked for; a mobile app also matches an iOS app. Above the grid there is a row of chips per axis (medium, theme, style, mood, industry, density; the most frequent labels; the medium - what the style is made for: website, slides, iOS app, banner, email, document, dashboard... - comes first): a click filters, a second click takes it off. A card shows two or three of its labels in small type, the detail view all of them. The words and their synonyms are in `style-vocab.json` (extend it freely). Without `tags.json` nothing changes: search by name, category and tags, a row of category chips.

**Default style.** `extensions.<account>:hub-design.default_style` in hub.json is a folder with a `DESIGN.md` (and, optionally, a `preview.png` beside it). That style stands first in the Style window with the mark "default", the Style button shows it, and a message to the designer with no other style chosen ends with `Style reference: <path to its DESIGN.md>`. Choose another style and it works as before; "Use as default" in the default's card goes back. It is a library of one style outside the main folder, so it works without a library too. Not set, or no `DESIGN.md` there - nothing of this exists.

The plugin process serves a file only by the id from the index, only from inside that folder (a path with `..`, a drive, a backslash or a link leading out is refused), previews only as png, jpg, webp or avif; the JSON routes answer only to the hub page's origin.

### Designs of your other machines

One owner, several hubs (say a Mac and a Windows PC): each start screen shows the designs of the other machines below its own, one section per machine (“Mac · designs: 12”), as pictures with the name, the author, the date and a machine label. A click opens the picture large over the dashboard; the file, the canvas and the edits stay on the machine that has it. “Mine” shows none of them; the search finds them by name, file and author.

It works through a folder all the hubs share. Every plugin process writes `<folder>/<machine>/registry.json` (the names, authors and dates of its designs, file names only, no paths) and `<folder>/<machine>/shots/<id>.jpg` (a 480 px wide shot: HTML through headless Chrome, PDF through `sips` on a Mac), and reads the other machines' subfolders. A shot is taken again only when the design changed (at most 12 per pass, a pass a minute), the registry is written only when something changed, and the shots of designs that are gone are deleted. About 15–40 KB per design.

The folder is `<hub code>/hub-sync/design` when the hub code has a `hub-sync/sync.py` next to it (the hub-sync exchange then carries it between the machines), otherwise `extensions.<account>:hub-design.peers_dir` in hub.json or the `HUB_DESIGN_PEERS` environment variable of the plugin process (it wins over the setting); `""` turns it off. No folder, nothing changes. The machine name is the host name, as in hub-sync.

### Specialists

Hub Design installs the designer specialist from the specialists catalog (a button on the start screen). The specialists the plugin needs are designer (required) and animator (for the "Animation" preset, desirable); the list is `NEEDED` in `lib.js`. If there is no designer in the hub, the start screen shows a banner "Hub Design needs the designer" with an "Install" button: it sends the hub, in your name, "Install the specialist for Hub Design: specialists install designer" (the hub installs it); after the click it reads "Asked the hub, waiting", and the banner disappears by itself when the session appears. If there is no animator, a quiet line "no specialist animator" appears by the "Animation" preset. If you write in the chat of a specialist who is not in the hub, the same banner shows above the input.

### The palette button in the input

In any session's input, before the microphone, a palette button appears. A click takes the typed text and the last HTML from the conversation, opens Hub Design (the recipient is the design's author, looked up in the long history too; with no author, a list of specialists to choose from) and puts the text into the design's input; the design opens on the canvas at once. The `composer.tools` slot is this hub's addition to the Plugin API, with no version number: on a hub without it there is no button, the rest works.

### hide-sidebar is recommended

With the [hide-sidebar](https://github.com/Eugenius-S/hub-plugin-hide-sidebar) plugin the canvas gets the full width: on entering the view Hub Design hides the session list on the left and on leaving brings it back (the `hub-sidebar` event). Everything works without it, the canvas is just narrower.

Drafts live in the browser until sent: a page reload does not lose them. The queue of a busy recipient is shown above the input: "Send now" and "Remove", as in the hub chat. Data of the plugin's earlier versions (design-canvas) is picked up once.

## Install

"Settings" → "Plugins" → paste the link to this repository → "Check and install". You need Python 3 and a browser on the same computer as the hub: the preview is served from `localhost`.

**Downloading styles.** Settings has a tab "Hub Design: styles" (`hub.addSettings`). Paste a link to a style site (several, one per line), press "Download": the plugin process (`fetcher.py`) saves each style into the library above (the `.md` file, the preview picture, an entry in `index.json`), and the Style window sees them at once, without a restart. The library folder is created if it does not exist yet. A link may be the whole site, a collection page or one style. The tab shows "N of M", what was added, skipped and failed, and the name of the style in work; "Stop" ends the run after the current style. A style that is already in the library (the entry is in `index.json` and the file is on the disk) is skipped, so a stopped or broken run continues from the same place and a repeated run costs nothing. The pace is slow on purpose (a pause of one to two and a half seconds between styles); on a refusal of the site (HTTP 403 or 429) or a captcha the run stops with a plain line instead of pushing on. An `index.json` that cannot be read is left untouched. Only the process downloads; the page does it on the machine where the hub runs.

A site is a source module in `sources/` (`sources/__init__.py` describes what one provides: its links, its page parser). The first one is `styles.refero.design`, the page of a style carries its `DESIGN.md` in the HTML, no sign-in needed. A link to a site without a source is refused with the list of the supported ones. **You are responsible for the terms of the site you download from**; the plugin downloads for your own use, and the library stays on your machine (it is not part of this repository).

## How it is built

The plugin process (`server.py`) listens on `127.0.0.1` at the hub page's port + 11 (8787 → 8798; a different one via `HUB_DESIGN_PORT`) and serves web files from the hub's session and project working folders, without hidden ones. Into HTML it injects `agent.js`: it draws frames, pins and drawings over the design and talks to the hub page through `postMessage`. It needs its own address so the design's scripts do not run with the hub page's rights; it allows only the hub page to embed it and rejects requests from foreign sites.

## Limitations

- Same computer only: there is no preview over the network (tailnet, phone).
- The message carries a selector and coordinates, without a snapshot of the element; a drawing goes as a description.
- There is no export to Figma; "Download" gives the frame's HTML file, PDF is a separate button.
- After a frame reload the undo arrow rolls an edit back to what is already written in the file, not to the original; the original look is in the copy `<name>.r<N>.html`.
- The canvas was checked in a browser on macOS; it was not checked on Windows and Linux.

## Tests

`PYTHONPATH=<hub code> python3 -W ignore -m unittest discover -s tests`: the server, writing to the file (`handwrite.py`), PDF, Telegram posts (`tgpost.py`), the manifest; the style downloader (`sources/`, `fetcher.py`: a made-up site on localhost, no real pages); the registry (`registry.py`); `node --test tests/*.test.mjs`: the logic, element landmarks, the en/ru tables. No browser needed.

Icon: [3D Fluency](https://icons8.com/icons/3d-fluency) by Icons8.
