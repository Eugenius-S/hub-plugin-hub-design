# Hub Design: an Agents Hub plugin

A design canvas inside the hub, like Claude Design: a session's designs on an infinite field, a toolbar, zoom, color, comment pins. You move, paint and comment by hand, everything goes to the designer as one batch, and the designer edits the file.

The interface is in English by default and in Russian when the hub language (`hub.lang`) is Russian; any other language falls back to English. The language is read when a text is drawn, so a switch takes effect without a reload.

## How it works

The view is `#/x/hub-design`. The layout follows Claude Design; colors, fonts and the light/dark theme come from the hub.

1. **Canvas** — an infinite field. A session's HTML designs lie on it as frames: a caption on top, settings, download and PLAY (open in a new tab) on the right. On the left is a chat with a specialist (`designer` by default; with a design open, its author). The design window is screen height (1440×900); a long page scrolls inside the frame; the "Comments" tab holds the batch of drafts.
   Top right is the close button: it closes Hub Design and returns you to where you came from.
   **The start screen** (as in Claude Design) opens on entering the view and on a click on the logo at the top left: a title, tabs "All / Mine / Others" ("Mine" are the designs opened on the canvas), search, a "list/tiles" switch, sorting, an "Open a design by path" field. A row of presets — presentation, design, design in code, design system, animation: a click leads the chat to the right specialist (animation — `animator`, the rest — `designer`) and puts a stub "new …: " into the input. Below are past designs as cards with a live preview, a name, an author and "edited N ago": a click opens the design on the canvas. When the hub has directions, the designs are laid out in folders: one tile per direction folder (the working folder of the direction's session) with previews of its last four designs, a design that lies elsewhere goes under "No direction"; a click on a tile shows that folder's designs ("← All folders" goes back), a search looks through all of them. Designs found once are remembered by the page (the feed tail of a session forgets them, so the first run also reads the sessions' history once, in the background): the list does not shrink when a session moves on to other work. The view opened from a direction's chat starts in that direction's folder. If you write in the chat right away on the start screen, a new file is made from your instructions and opens on the canvas when it appears.
2. **Toolbar** at the top left: page, Select, Hand, Text, Frame, Comment, Pencil (line, arrow), Shapes (rectangle, oval). Top right: PLAY, the side panel, zoom with a menu ("Fit all", 50, 100, 200%).
3. **Zoom and pan.** The wheel or a pinch zooms to the cursor; space and drag, or the Hand, pans. The canvas view is remembered in the browser.
4. **Select.** A click on an element inside a design gives a frame and dragging; a corner resizes, a double click edits the text; the up arrow selects the parent, the undo arrow returns it to how it was. The panel on the right: fill and text color from a palette, font, sizes, padding, border, radius.
5. **Comment** — a click on a place puts a pin with text, and an element is attached to it: not just one selector but landmarks (id, nearest ancestor with an id, tag, text, attributes, classes, neighboring text, size and position). If the design is re-laid out and the element's selector changes, the pin finds it by its landmarks, moves with it and updates the selector; if it is not found, or there are two candidates with close scores, the pin stays where it was marked "element not found" (a dashed circle and a warning sign in the list) and does not land on a foreign element. In the message to the designer the landmarks go in words. In the window: "Send" (goes straight to the design's author), "Close" (stays a draft), "Delete". A **drag** in the comment mode draws a rectangle: a comment on a whole area (in the message: x, y, width and height in design pixels and the elements inside it). **Frame** adds a new frame on the canvas. (The Note tool is gone; notes made earlier are still shown and can be deleted.) **Pencil and shapes** — circle something or point with an arrow.
6. **Sending** — there is no "Send to the designer" button. Hand edits, tweaks and drawings go by themselves, as one message, 8 s after the last edit (while you are still moving, it waits) to whoever is chosen at the bottom in "Who receives the edits" (the designer or the design's author by default). If the recipient is busy, the message joins their queue. A comment goes with its own button in the pin window; the text from the input takes everything that has accumulated with it. In the message: for a pin the selector, landmarks and coordinates, for an edit "was → now", for a drawing the type and place. There is no list of hand edits above the input: they are visible only in the "Comments" tab (marked "in the file"). To undo an edit use the × in its row there, or the undo arrow on the selected element on the canvas (also after sending: an edit written to the file is rolled back to the copy). An item that could not be written to the file goes to the designer in words, and Hub Design does not write it to the file after that. There is one recipient per batch — the one chosen at the bottom (if you did not choose by hand, it is the author of the design in focus).
7. When a session edits the file, the frame reloads and the pins of the previous round go dim.

### Where a new design is saved

A new design asked for from a direction (the view was opened from its chat, or its folder is open on the start screen) carries a line for the designer: save it in `<direction folder>/design/<design-name>/`, not in its own working folder. The folder comes from the hub snapshot (the cwd of the direction's session), never guessed. From the hub chat, a specialist's chat or outside any folder the line is not added.

### Hand edits go straight into the file

Move, resize, text and tweaks are written by Hub Design into the `.html` itself, through `server.py`: this way "by hand" stays an edit, not a request.

- **The write is pinpoint.** On the element it found it sets an inline style (`translate`, `width`, `height`, the panel's styles) or its text; tweaks are a `var`/`attr` on `<html>`. The rest of the file is not touched. If the element is not found unambiguously (repeats, template pieces, scripts), nothing is written and the item goes to the designer as an ordinary item.
- **A copy.** Before the first write a `<name>.r<N>.html` is put next to the file: the file as it was (N is the round number). If you undo a hand edit, the file returns to the copy on disk.
- **The author is mid-turn — no writing.** While the specialist editing the design is busy, the write waits and retries every 5 s; when the turn ends, it is written. If somebody else managed to edit the file, the write does not overwrite it: the frame is re-read and the item stays a draft.
- **What you see.** In "Comments" a written edit carries the "in the file" mark. In the message to the designer such items are marked "already in the file", plus the path of the copy: the look is right, keep it, and do not touch the copy.
- Writing goes only into HTML from the working folders of sessions and projects, only for a request from the hub page, at most 2 MiB.

### Design size

A design can set the frame size itself: `<meta name="hub-frame" content="1080x1350">` (the first one wins), otherwise an explicit `width`/`height` in px on `html`/`body`. Then the frame is exactly that size (100-8000 px), the width switch is replaced by "Design size", and the PDF is one page of that size. No size - a window by width (1440×900), as before. One file is one page: a design opened from the dashboard, a card or a session is alone on the canvas.

### PDF

The "Download PDF" button in the frame header prints the design at screen size (a 1440×900 frame gives a 1440×900 page; a design with its own size gives one page of that size) with its own Chrome and no margins; a design's own `@page` is respected. `server.py` starts the headless Chrome from `hub.json` → `testchrome.path` with `--print-to-pdf`. If Chrome is not configured, the page prints itself from a hidden frame and the browser offers "Save as PDF".

### Cards in the chat feed

When a session sends an `.html` design, a `.pdf`, a Markdown document (`.md`) or a video (mp4, mov, webm, gif) as a file (`hub send-file`) or names its full path in a reply, the feed of any session shows a card instead of a bare link: a tile (a shot of the design, the first page of a PDF, a rendered document, a video frame or an icon), a name (the design `<title>`, the first heading of a document or the file name), "Hub Design · agent", an **Open in Hub Design** button, "Copy path" and "Hide". Pictures get no card. A click opens the file in Hub Design (a video - in a player). Hidden cards are remembered by the browser. Shots are made by the plugin process with its own Chrome and cached on disk; only on the computer the hub runs on. The first page of a PDF is rasterized by the system (macOS `sips`); elsewhere a PDF card keeps its icon.

### Documents on the canvas

A PDF opens in the browser's built-in viewer and a Markdown file is rendered to a page (headings, lists, tables, code, quotes; raw HTML in the source is shown as text, so a document cannot run anything), so pins and comments work on it. The frame's label has **Make a design based on this**: the designer gets a request to make a layout based on the document's path (in the hub language). Documents are read-only on the canvas: hand edits, tweaks and "Download PDF" are for designs.

### Who gets the edits

The author of a design is the session that wrote the file (Write/Edit), then the one that sent it to the owner (send-file); a session that only named the path is not an author. No author - the designer, if the hub has one.

### Tweaks, errors, grids

- **Tweaks.** A design that declares `#hub-tweaks` itself (text, color, int, float, range, boolean, enum) gets a panel on the right with these values. Edits are live; the batch carries "was → now" for each tweak. Colors (a `color` tweak, or an enum like `bg: ink/red/blue` whose page paints a CSS variable) are swatches with the last one "own color" (a picker); the chosen color is the tweak's value. Below, for any design: **Margins, Font size, Letter spacing, Line spacing** - three presets and a slider each, live on the page; they are not written to the file, the designer gets them in words ("add to the padding…"). Moves in the panel go to the author by themselves after 8 s, marked "no report needed: end the turn with a single line —"; that reply is not shown in the chat.
- **The selected element** goes into the message as a line "Selected: file `selector` tag “label”".
- **Design errors.** Script errors and unhandled promise rejections show as a mark on the frame; the "Ask to fix" button puts them into the batch.
- **Grid.** For a container with `grid-template-columns: repeat(N, minmax(0, 1fr))` the properties panel shows "Columns: N"; "To flex" and "To grid" wrap the selection.
- **Grids over the frame** (frame menu → "Grids over the frame…"): up to six, columns, rows or cells, gap, margin, color. Only on the canvas — they do not reach the design or PLAY; in the batch they go as a line of the frame view.

### Specialists

Hub Design installs the designer specialist from the specialists catalog (a button on the start screen). The specialists the plugin needs are designer (required) and animator (for the "Animation" preset, desirable); the list is `NEEDED` in `lib.js`. If there is no designer in the hub, the start screen shows a banner "Hub Design needs the designer" with an "Install" button: it sends the hub, in your name, "Install the specialist for Hub Design: specialists install designer" (the hub installs it); after the click it reads "Asked the hub, waiting", and the banner disappears by itself when the session appears. If there is no animator, a quiet line "no specialist animator" appears by the "Animation" preset. If you write in the chat of a specialist who is not in the hub, the same banner shows above the input.

### The palette button in the input

In any session's input, before the microphone, a palette button appears. A click takes the typed text and the last HTML from the conversation, opens Hub Design (the recipient is the design's author, looked up in the long history too; with no author, a list of specialists to choose from) and puts the text into the design's input; the design opens on the canvas at once. The `composer.tools` slot is this hub's addition to the Plugin API, with no version number: on a hub without it there is no button, the rest works.

### hide-sidebar is recommended

With the [hide-sidebar](https://github.com/Eugenius-S/hub-plugin-hide-sidebar) plugin the canvas gets the full width: on entering the view Hub Design hides the session list on the left and on leaving brings it back (the `hub-sidebar` event). Everything works without it, the canvas is just narrower.

Drafts live in the browser until sent: a page reload does not lose them. The queue of a busy recipient is shown above the input: "Send now" and "Remove", as in the hub chat. Data of the plugin's earlier versions (design-canvas) is picked up once.

## Install

"Settings" → "Plugins" → paste the link to this repository → "Check and install". You need Python 3 and a browser on the same computer as the hub: the preview is served from `localhost`.

## How it is built

The plugin process (`server.py`) listens on `127.0.0.1` at the hub page's port + 11 (8787 → 8798; a different one via `HUB_DESIGN_PORT`) and serves web files from the hub's session and project working folders, without hidden ones. Into HTML it injects `agent.js`: it draws frames, pins and drawings over the design and talks to the hub page through `postMessage`. It needs its own address so the design's scripts do not run with the hub page's rights; it allows only the hub page to embed it and rejects requests from foreign sites.

## Limitations

- Same computer only: there is no preview over the network (tailnet, phone).
- The message carries a selector and coordinates, without a snapshot of the element; a drawing goes as a description.
- There is no export to Figma; "Download" gives the frame's HTML file, PDF is a separate button.
- After a frame reload the undo arrow rolls an edit back to what is already written in the file, not to the original; the original look is in the copy `<name>.r<N>.html`.
- The canvas was checked in a browser on macOS; it was not checked on Windows and Linux.

## Tests

`PYTHONPATH=<hub code> python3 -W ignore -m unittest discover -s tests` — the server, writing to the file (`handwrite.py`), PDF, the manifest; `node --test tests/*.test.mjs` — the logic, element landmarks, the en/ru tables. No browser needed.

Icon — [3D Fluency](https://icons8.com/icons/3d-fluency) by Icons8.
