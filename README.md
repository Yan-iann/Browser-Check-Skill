# browser-check

A Claude Code skill that checks a web page in four browsers before a visual task is called
done: Chrome, Edge, Firefox and WebKit (the engine Safari uses), each at desktop (1440) and
mobile (390) width.

For every page it saves a screenshot per browser, a side-by-side sheet of all four, and a
list of console errors, failed requests, broken images and sideways overflow.

## What you need

- Claude Code on your own machine
- Node 20 or newer
- Google Chrome and Microsoft Edge installed
- Internet for the first run

Tested on Windows only so far.

## Install

Copy the `browser-check/` folder from this repo into the project you want it in:

```
<your project>/.claude/skills/browser-check/
```

That is all. There are no commands to run. The first time the skill is used it installs
what it needs and downloads the Firefox and WebKit builds (about 185 MB, one to a few
minutes). Later runs start straight away.

Put it in the project's `.claude/skills/` folder, not your personal `~/.claude/skills/`.
The skill is meant to load only in the project it is installed in, and it refuses to run
from any other folder.

## Use

Open Claude Code in that project and ask in plain words:

- "check this page in all browsers"
- "does the pricing page look right in Safari and Firefox?"

Claude also runs it by itself as the last check on a task about how a page looks.

## Where the screenshots go

In a project laid out as `websites/<site>/`, they go into that site's own folder:

```
websites/<site>/render/
  chrome/          home-desktop.png   home-mobile.png
  edge/            home-desktop.png   home-mobile.png
  firefox/         home-desktop.png   home-mobile.png
  safari-webkit/   home-desktop.png   home-mobile.png
  compare/         home-desktop.html  home-desktop-01.png ...
  browser-check.json
```

Open `compare/<page>-desktop.html` in your browser to see all four side by side.

If Claude cannot tell which site folder a page belongs to, the skill stops and asks rather
than saving somewhere wrong. It never writes to the project root.

## Limits

- **The Safari column is WebKit, not Safari.** Safari does not exist on Windows. WebKit is
  the same rendering engine and catches most Safari-only layout problems, but it is not the
  Safari app or a real iPhone. Reports call it "WebKit (Safari engine)".
- **Firefox is Playwright's build**, not the Firefox installed on your machine, and its
  mobile run is a narrow desktop window.
- Pages behind a login and unpublished drafts cannot be checked.
- It only loads and scrolls a page. It never clicks, types or submits a form.
- One page takes about 4 minutes. Use it on the pages you changed, not a whole site.

Full instructions for Claude are in [browser-check/SKILL.md](browser-check/SKILL.md).
