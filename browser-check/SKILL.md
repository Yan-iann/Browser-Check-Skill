---
name: browser-check
description: Cross-browser render check for a web page in Chrome, Edge, Firefox and WebKit (Safari's engine) at desktop, tablet and mobile widths, with a screenshot folder per browser and side-by-side compare sheets. Use as the final check before reporting any task about how a page looks as done, and whenever the user says "check it in all browsers", "cross-browser", "browser check", or asks whether something works or looks right in Safari, Firefox, Edge or on iPhone. Also use when a client reports a problem that only shows in one browser.
---

# Browser Check

Loads the same page in four browser engines at three widths, desktop (1440), tablet (768)
and mobile (390), and saves what each one
actually painted. Chrome is the quick check while you work. This is the check you run once at
the end, on the pages you changed, before saying a visual task is done.

**Safari does not exist on Windows.** The fourth browser is Playwright's WebKit build, the
same rendering engine as Safari. Always call it "WebKit (Safari engine)" in a report. Never
write that something was "checked in Safari" or "works on iPhone".

## How to run

**This skill belongs to the project it is installed in and only runs there.** It lives in
that project's `.claude/skills/browser-check/` folder. Run the script from the project
root:

```bash
node ".claude/skills/browser-check/scripts/check.mjs" <url> [url ...] --site "<site folder>"
```

If your shell is in a subfolder of the project, use the full path to the same file (the
skill's base directory is shown when this skill loads). Run from any folder outside the
project, the script refuses with `installed for <project> only` and does nothing. That is
intended: do not copy the script elsewhere or work around it, tell the user the skill is
only set up for that project.

- **Screenshots go in the `render/` folder of the site you are working on:**
  `websites/<site>/render/`. Always pass `--site "<folder name>"` with the exact name of
  that site's folder under `websites/`, for example `--site "bev palmer"`:
  ```bash
  node ".claude/skills/browser-check/scripts/check.mjs" https://www.example.com.au/pricing/ --site "bev palmer"
  ```
  Without `--site` the script works it out when it safely can (run from inside the site
  folder, a local file that sits in a site folder, or exactly one folder whose name matches
  the URL's domain). If it cannot tell, it stops before loading anything and asks for
  `--site`. It never writes to the repo root and never creates a new site folder: a
  misspelt `--site` is refused. A staging URL never matches by domain, so name the folder.
- The first line of output is `saving to <folder>`. Check it is the right site.
- In a project with no `websites/` folder it saves to `render` in the current folder.
  `--out <dir>` overrides where the files go.
- Local harness files work too: pass the file path instead of a URL.
- Options: `--browsers chrome,edge,firefox,webkit` and `--widths desktop,tablet,mobile` to run a
  subset, `--wait 4000` for the settle time in ms after load (raise it for slow pages).
- Only the pages the task touched. One page is 12 loads and takes about 6 minutes. For more
  than two pages run it in the background and report when it finishes. Never sweep a whole
  site with this: it is one visitor loading pages one at a time, keep it that way (STAQ bans
  IPs that rack up 404s, and WPStaq hosts return 429 under load).
- It only loads and scrolls. It never clicks, types or submits. Do not use it on a page
  where loading alone has a side effect.

## What it writes

```
websites/<site>/render/
  chrome/          <page>-desktop.png   <page>-tablet.png   <page>-mobile.png
  edge/            <page>-desktop.png   <page>-tablet.png   <page>-mobile.png
  firefox/         <page>-desktop.png   <page>-tablet.png   <page>-mobile.png
  safari-webkit/   <page>-desktop.png   <page>-tablet.png   <page>-mobile.png
  compare/         <page>-desktop.html  <page>-desktop-01.png ...   (all four side by side)
  browser-check.json
```

`<page>` comes from the URL path (`/about/team/` becomes `about_team`, the homepage is
`home`). The browser folders are created by the script and overwritten on each run. Other
files already in the site's `render/` folder are left alone. Paths below written as `<out>`
mean this folder.

## Reading the result

1. **Read the compare sheets, all of them.** `compare/<page>-<width>-NN.png` shows the four
   browsers in columns, one screenful per image. Full-page screenshots are 10,000+ px tall
   and unreadable when opened whole, so do not judge from those directly.
2. **Chrome is the baseline.** Walk down each sheet and look for a column that differs from
   Chrome: a section that wrapped, overlapped, collapsed, lost its image or changed order.
3. **Zoom in before you claim anything.** Desktop columns are shown at one third size. Crop
   the full-size shot to confirm:
   ```bash
   python -c "from PIL import Image; Image.open(r'<out>/firefox/home-desktop.png').crop((0, 2400, 1440, 3300)).save(r'<out>/crop.png')"
   ```
4. **Then read `browser-check.json`** for what a screenshot cannot show: `console`, `failed`
   (requests that errored or returned 400+), `broken` (images that did not load), `over`
   (elements wider than the screen) and `scrollW` against `vw`.

To rebuild the compare sheets without loading the site again, run the script with `--site`
and no URL.

## Do not report these as bugs

Each of these was a false alarm on a real run (shichida.com.au homepage, 2026-10-06).

- **Chrome and Edge are the same engine.** A difference between those two is timing: a
  carousel on another slide, an animation mid-way. It is not a browser bug.
- **Carousels and review widgets sit on a different slide in each browser.** Different logos
  or reviews showing is not a difference.
- **Console counts differ by engine and mean nothing on their own.** Firefox logs rejected
  cookies as errors, Chrome logs each failed resource, tracking scripts log styled messages
  as errors. Compare the messages. What matters is an exception from the site's own scripts
  that appears in one engine only.
- **Firefox at 768 and 390 is a narrow desktop Firefox**, not Firefox for Android. It has no touch
  and no mobile user agent. The JSON row carries a note saying so.
- **A Chrome or Edge tablet or mobile shot that looks shrunk** means the page is wider than the screen
  (`sideways` in the output is above 0) and the device zoomed out to fit it. The overflow is
  the finding, not the small text.
- **Fixed headers, chat bubbles and back-to-top buttons appear in the first screen only.**
  The script hides them after that so they are not stamped down the whole page.

A difference only counts once you have seen it in the full-size image and it is not on this
list. If it is real, check the original page the same way before blaming the change you made.

## Report as unconfirmed, not as a bug

These need a real Safari or a second look before anyone acts on them. Say what you saw and
that it is unconfirmed.

- **Text weight in the WebKit column.** On the 2026-10-06 run the headings drew noticeably
  thinner in WebKit than in the other three. WebKit on Windows does not use the Mac text
  engine, so this may not happen in real Safari. Report "headings look lighter in the WebKit
  build, needs a real Mac or iPhone to confirm". Layout that follows from it (a heading
  wrapping onto an extra line and pushing content down) can be reported as seen.
- **A `broken` image in one browser only.** Open that image URL on its own and look at the
  full-size crop of where it sits before reporting it. Same run: one image was flagged in
  WebKit mobile only, with no failed request behind it.

## Report format

One verdict sentence, then a table, then the files. No em dashes.

```
Checked /pricing/ in four browsers at 1440, 768 and 390. One difference, in WebKit mobile.

| Browser                | 1440 | 768 | 390                                        |
|------------------------|------|-----|--------------------------------------------|
| Chrome                 | OK   | OK  | OK                                         |
| Edge                   | OK   | OK  | OK                                         |
| Firefox                | OK   | OK  | OK                                         |
| WebKit (Safari engine) | OK   | OK  | Plan cards overlap the footer (sheet 04)   |

Screenshots: websites/<site>/render/compare/pricing-mobile-04.png
```

State the limits when they matter to the answer: WebKit is the Safari engine, not the Safari
app or a real iPhone; Firefox is Playwright's build (version in the JSON), not the one
installed on this machine; logged-in pages and drafts cannot be loaded.

## Setup

**There is nothing to install by hand. Just run the script.** It sets itself up:

- First run on a machine: it runs `npm install` in the skill folder, then downloads
  Playwright's Firefox and WebKit builds (about 185 MB download, about 500 MB on disk, kept
  outside the skill folder). Lines starting `one-time setup:` show this happening.
- **Give the first run a long timeout (10 minutes) or run it in the background.** The
  download takes one to a few minutes depending on the connection. Tell the user it is a
  one-time setup so the wait makes sense. Later runs skip it.
- After a Playwright update the browser download repeats itself once. No action needed.

What the machine must already have, because the script cannot install these:

- **Claude Code running on the person's own machine.** This does not work as a skill
  uploaded to claude.ai chat, which runs in a cloud sandbox with no browsers.
- **Node 20 or newer.** If `node` is not found or is older, the script cannot start. Tell
  the user to install the current LTS from nodejs.org, then run again.
- **Google Chrome and Microsoft Edge.** If one is missing the run prints `launch failed` for
  it and carries on with the others. Say in the report which browser was skipped.
- **Internet access** for the one-time setup. If it prints `setup failed`, that is a
  connection or proxy problem: say so and run the skill again once it is sorted.

To set the skill up for another project, copy this folder into that project's
`.claude/skills/` without `node_modules`. Each machine builds its own. Do not put it in the
personal `~/.claude/skills/` folder: that would make it load in every project.
