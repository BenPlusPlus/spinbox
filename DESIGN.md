---
name: Spinbox
description: The household record player, set as tonight's radio programme. Night-blue deck, paper pages, ink rules.
colors:
  night: "#16204A"
  night-raised: "#1D2A5E"
  night-line: "#34417A"
  night-mute: "#A9B1D6"
  paper: "#F2F1EC"
  paper-deep: "#E7E5DD"
  sheet: "#FBFAF6"
  ink: "#111318"
  mute: "#565B6B"
  rule: "#D3D2CB"
  on-air-red: "#E5322D"
  red-ink: "#C42420"
  highlight-yellow: "#F2C230"
typography:
  display:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "clamp(3rem, 3.4vw + 1.2rem, 5.75rem)"
    fontWeight: 800
    lineHeight: 0.88
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 68"
  headline:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 2.2vw + 1.6rem, 4.25rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 68"
  title:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 68"
  section:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: "0.04em"
    fontVariation: "'wdth' 82"
  body:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.35
  label:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 750
    lineHeight: 1
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 82"
  caps:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.08em"
    fontVariation: "'wdth' 82"
  clock:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 750
    lineHeight: 1.2
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 82"
rounded:
  none: "0"
  round: "50%"
spacing:
  hairline: "1px"
  rule: "1.5px"
  xs: "0.35rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  gutter-phone: "1.15rem"
  xl: "1.5rem"
  header-gap: "2rem"
  gutter-wide: "2.5rem"
  section: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 1.1rem"
    height: "2.75rem"
  button-primary-hover:
    backgroundColor: "{colors.night}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 1.1rem"
    height: "2.75rem"
  button-secondary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.red-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 1.1rem"
    height: "2.75rem"
  button-danger-hover:
    backgroundColor: "{colors.red-ink}"
    textColor: "{colors.paper}"
  button-small:
    padding: "0 0.8rem"
    height: "2.25rem"
  icon-button:
    backgroundColor: "transparent"
    rounded: "{rounded.none}"
    size: "2.75rem"
  transport-play:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.round}"
    size: "3.75rem"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0.55rem 0.75rem"
    height: "2.75rem"
  rail-item:
    backgroundColor: "{colors.night}"
    textColor: "{colors.night-mute}"
    padding: "0 1.25rem"
    height: "3rem"
  rail-item-hover:
    backgroundColor: "{colors.night-raised}"
    textColor: "{colors.paper}"
  rail-item-current:
    backgroundColor: "{colors.highlight-yellow}"
    textColor: "{colors.ink}"
  listing-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "0.35rem 0.25rem 0.35rem 0.5rem"
    height: "3.25rem"
  listing-row-current:
    backgroundColor: "{colors.highlight-yellow}"
    textColor: "{colors.ink}"
  on-air-tag:
    backgroundColor: "transparent"
    textColor: "{colors.night-mute}"
    typography: "{typography.caps}"
    rounded: "{rounded.none}"
    padding: "0 0.6rem"
    height: "1.75rem"
  on-air-tag-live:
    backgroundColor: "{colors.red-ink}"
    textColor: "{colors.paper}"
  alert:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.8rem 1rem"
  notice:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0.8rem 1rem"
  mini-dock:
    backgroundColor: "{colors.night-raised}"
    textColor: "{colors.paper}"
    padding: "1rem 0.85rem 1rem 1.25rem"
---

# Design System: Spinbox

## Overview

**Creative North Star: "Tonight's Programme"**

Spinbox is set like a radio listings magazine for one household's evening. The record turns on a night-blue deck. The pages are newsprint paper, divided by ink rules. The queue is a timetable that shows when each Track will air. Every surface is either **night** (the rail, the deck, the mini-dock, auth) or **paper** (the pages and the listing). The two meet at a hard edge, with no gradient between them.

Type does the work that imagery and chrome do in a streaming app. Titles are condensed Archivo at weight 800 in uppercase, set tight like a magazine masthead. Body copy stays at normal width so it reads easily. Times and durations use tabular figures, so the listing reads like a printed schedule. Colour is rationed. Red means only that something is live. Yellow means only "this one, now". Every other colour is quarantined to the artwork plates.

The world is flat and square. There are no rounded cards, glows or decorative gradients. Depth comes from the night/paper split, 3px and 2px ink rules, 1.5px ink borders and hairline row dividers. The only circles are things that are physically round: the record, its label, the spindle, the transport play button and the plate play button.

**Key Characteristics:**
- Night-blue chrome (rail, deck, mini-dock, tabs, auth) against warm paper pages.
- Condensed uppercase Archivo 800 for titles; normal-width Archivo for reading.
- Square corners everywhere except physically round objects.
- Ink rules as structure: 3px under page heads and above listings, 2px above section titles, hairlines between rows.
- Red only for live state; yellow only for current and selection.
- Tabular-figure clocks and durations: the queue is a timetable.
- The spinning record with tonearm is the centrepiece of Now playing.

## Colors

The palette is a two-surface print palette: night ink and paper stock, plus one live red and one highlighter yellow.

### Primary
- **Programme Night** (night): The deck, the desktop rail, the phone top bar and bottom tabs, the idle Now playing surface and the auth page. It is the "broadcast" surface. Any element on night carries `data-surface="night"` so that focus rings and selection switch to their night variants.
- **Deck Raised** (night-raised): The turntable plinth, the mini-dock and rail hover. It is one step lighter than night and is the only tonal layering on the dark side.

### Secondary
- **On-Air Red** (on-air-red): The live lamp. It marks the dot in the wordmark mark, the plinth lamp when the arm is down, the dock's live dot and the Scan lamp when a Scan run is active. It is never used for text or fills larger than a lamp.
- **Red Ink** (red-ink): The deeper red that carries text and shapes. It fills the live ON AIR tag (paper text on red ink), draws error borders and icons, sets the danger button stroke and the Missing track and Disabled tags, and is the input caret colour.

### Tertiary
- **Highlighter Yellow** (highlight-yellow): Marks the current item or a selection. It fills the current listing row, the current rail item and the text selection, and it is the inset top bar on the current mobile tab. It also marks the item about to be chosen (menu-item hover and plate-play hover) and is the focus ring colour on night.

### Neutral
- **Newsprint Paper** (paper): The page background, the html background, and text and icons on night.
- **Paper Deep** (paper-deep): Listing row hover, read-only inputs, and one sleeve colourway.
- **Sheet** (sheet): Surfaces that sit on top of paper: inputs, the Continue card, the empty-library panel, the alert box, menus and the storage banner.
- **Press Ink** (ink): Body text, primary buttons, rules and borders, the notice box, and the transport play disc on paper.
- **Mute Grey** (mute): Secondary text: ledes, sublines, durations, inactive facets, and the Track actions trigger.
- **Night Line** (night-line): Hairlines and outlines on night: rail dividers, the plinth border, the record ring and the off-air tag border.
- **Night Mute** (night-mute): Secondary text and inactive navigation on night.
- **Hairline Rule** (rule): Row dividers in every listing, the top bar underline on wide screens, and the seek track rest colour on paper.

### Named Rules
**The On-Air Rule.** Red marks live state and nothing else. Use it for the on-air tag, the lamps, the wordmark dot and the record label. Errors use a 1.5px red-ink border and a red-ink icon on sheet or paper, never a red fill.

**The Highlighter Rule.** Yellow means "this one, now": the current listing row, the current rail item, the current mobile tab, text selection, and hover on the item about to be chosen. It never decorates.

**The Plate Quarantine Rule.** Colour outside red and yellow lives only inside artwork plates. A generated sleeve may use any of five colourways: night, red ink, yellow, ink or paper-deep. The surrounding chrome never borrows a plate's colour.

## Typography

**Display Font:** Archivo, self-hosted variable (weights 100–900, widths 62–125%), with Arial Narrow then system-ui as fallbacks
**Body Font:** Archivo at normal width (100%)
**Label/Mono Font:** Archivo at semi-condensed width (82%) with tabular figures for clocks

**Character:** One variable family plays three roles by changing width. At 68% width and weight 800 in uppercase it sets the masthead titles. At 82% width it sets labels and clock figures. At 100% width it is the reading voice.

### Hierarchy
- **Display** (800, 68% width, clamp(3rem → 5.75rem), line-height 0.88, uppercase, balanced wrap): The Now playing Track title. The idle "Nothing playing" title goes larger, clamp(3.25rem → 6.5rem). On phones the title is clamp(2.25rem, 10vw, 3.25rem).
- **Headline** (800, 68% width, clamp(2.5rem → 4.25rem), line-height 0.92, uppercase): Page titles, set above a 3px ink rule. The auth card heading is a fixed 2.5rem.
- **Title** (800, 68% width, 1.5–2.25rem, line-height 1, uppercase): Library facet tabs (Artists / Albums / Tracks), the "Tonight's listing" head, the Continue Track title, empty-state heads, the wordmark and the sleeve titles on plates.
- **Section** (750, 82% width, 1.0625rem, letter-spacing 0.04em, uppercase): Section titles such as Continue and Recently played, always below a 2px ink rule.
- **Body** (400, 1rem, line-height 1.5, max 38rem): Ledes and copy. Row titles use weight 550–650, and tile titles use 650 and clamp at two lines.
- **Meta** (400, 0.875rem, mute): Sublines, artists and durations.
- **Label** (750, 82% width, 0.875rem, letter-spacing 0.06em, uppercase): Buttons, rail items, tabs, field labels and the search submit.
- **Caps** (700–800, 82% width, 0.6875–0.75rem, letter-spacing 0.08–0.12em, uppercase): State tags only: the on-air tag, dock state, the listing "On air / Paused" tag, member and Invite tags, the Missing track tag and "earlier tonight" played times.
- **Clock** (600–750, 82% width, tabular figures): Projected on-air times, durations, track numbers, the seek clock and counts.

### Named Rules
**The Masthead Rule.** Titles are condensed (68% width), weight 800 and uppercase, with line-height ≤ 1. Body copy is never condensed and never uppercase.

**The Timetable Rule.** Every number that a reader scans down a column uses tabular figures at semi-condensed width.

**The Small Caps Carry State Rule.** Small uppercase caps label a state (on air, paused, can't play, missing, admin, disabled) or a time. They never sit above a heading as an introduction.

## Layout

The layout breaks at one width, called **wide** (min-width 56rem).

- **Wide:** A two-column shell: a sticky 15.5rem night rail, then the stage. The rail holds the wordmark, ruled navigation and, at its foot, the mini-dock. The stage has a 4.25rem top bar with right-aligned search over a 1px rule. Pages max out at 78rem, with 2.5rem gutters, 2.5rem top padding and 4rem bottom padding.
- **Phone:** A night top bar of 3.5rem with the wordmark. Pages use 1.15rem gutters. A fixed footer stacks the mini-dock above four bottom tabs, which are 3.75rem tall plus the safe-area inset. Page bottom padding reserves the tabs plus the dock.
- **Now playing** is flush, with no page padding. On wide screens it is a split: the night deck (1.08fr, sticky, full height) beside the paper programme column (min 24rem) with the title, seek bar, transport and Tonight's listing. On phones the deck fills the screen and the listing follows on a paper panel that runs to the edges.
- **Rhythm:** Page head padding is 1.1rem, then a 3px rule, then a 2rem gap. Sections are 3rem apart. Listing rows are at least 3.25rem tall with hairline dividers. Album grids use auto-fill minmax(9.5rem) with 1.75rem/1rem gaps, rising to minmax(11rem) with 2.25rem/1.5rem gaps on wide screens.
- **Touch:** Every interactive control is at least 2.75rem (44px), except the 2.25rem small transport and small buttons inside rows.

## Elevation & Depth

Spinbox is flat. Depth comes from surface (night against paper), tonal steps on night (night → night-raised) and ink rules, not from shadow. Things at rest never cast a shadow. Soft, ink-tinted drop shadows appear only on overlays that float over content: the Track actions menu and the Play queue sheet. The record and the mini disc get a 1px night-line ring instead of a shadow. The only gradients render the physical record: groove rings and a fixed conic sheen.

### Shadow Vocabulary
- **Menu drop** (`box-shadow: 0 12px 28px -8px rgba(17, 19, 24, 0.35)`): The Track actions dropdown, under its 1.5px ink border.
- **Sheet rise** (`box-shadow: 0 -16px 32px -12px rgba(17, 19, 24, 0.35)`): The Play queue sheet rising above the phone dock.
- **Sheet side** (`box-shadow: 16px 0 40px -16px rgba(17, 19, 24, 0.35)`): The Play queue sheet opening to the right of the wide rail.

### Named Rules
**The Flat Stock Rule.** Surfaces are flat at rest. Only floating overlays cast a soft shadow, and it is always ink-tinted and offset downward or outward, never a glow.

## Shapes

All corners are square (radius 0) on buttons, inputs, cards, tags, menus, banners, plates, the plinth and the seek thumb. Circles (50%) are reserved for physically round objects. These are the record, its label, the spindle, the mini disc, the wordmark lamp, live dots, the transport play button and the plate play button. Borders come in three weights: 1.5px ink for controls and contained surfaces, 3px and 2px ink for structural rules, and 1px rule or night-line for hairlines. Artwork plates are square and clip their content. They carry a 1px inset outline at 12% ink, so pale plates still hold an edge on paper.

## Components

### Buttons
Buttons are printed, flat and declarative.
- **Shape:** Square (0), 1.5px border, minimum height 2.75rem, padding 0 1.1rem, label type (uppercase, 82% width, 750, 0.06em) with a 1.15rem icon gap of 0.5rem.
- **Primary:** Ink fill with paper text. On hover it turns night.
- **Secondary:** A transparent ink outline. On hover it fills with ink and the text turns paper.
- **Danger:** A transparent red-ink outline. On hover it fills with red ink and the text turns paper.
- **Small:** 2.25rem tall, 0.8rem padding, 0.8125rem text. It is set through custom properties (see the implementation rules).
- **Transitions:** Background and colour change over 160ms with cubic-bezier(0.22, 1, 0.36, 1). Disabled buttons drop to 0.45 opacity with a not-allowed cursor.
- **Icon button:** A square 2.75rem button with transparent fill and a 1.25rem glyph. Its visible label stays in the DOM as the accessible name but is painted at font-size 0. On hover it gets an 8% ink wash. In rows, hover inverts it to an ink fill.
- **Transport play:** A 3.75rem disc in the surface foreground colour, with the glyph in the surface background colour. On hover it scales to 1.04.
- **Plate play:** A 3rem paper disc with a 1.5px ink ring. It sits at the bottom right of an album tile and appears on hover or focus. Its hover state is yellow.

### Chips (state tags)
- **Style:** Caps type, padding 0.2rem 0.4rem, square. A hairline or 1px ink border.
- **State:** Admin is an ink fill with paper text. Disabled and Missing track are red-ink outline and text. A live Invite has an ink border, and a used one has a rule border.

### Cards / Containers
- **Corner Style:** Square (0).
- **Background:** Sheet on paper.
- **Shadow Strategy:** None (see Elevation & Depth).
- **Border:** 1.5px ink (Continue card, empty-library panel), or a 3px ink top rule (auth card).
- **Internal Padding:** 1rem for the Continue card, 1.5rem for the empty panel, and 1.75–2.25rem for the auth card.

### Inputs / Fields
- **Style:** Sheet fill, 1.5px ink border, square, minimum height 2.75rem, padding 0.55rem 0.75rem, 1rem normal-width text, red-ink caret. Field labels above the input use label type.
- **Focus:** A 2px night outline sitting flush (offset 0). On night surfaces the focus ring is yellow.
- **Read-only:** Paper-deep fill.
- **Search:** The input joins a solid ink "Search" submit button with no gap, and the left icon is in mute.

### Navigation
- **Rail (wide):** A night column. The wordmark is condensed 800 at 2rem, with the red-dot lamp. Items are 3rem rows divided by night-line hairlines, with label type in night-mute and the icon first. Hover moves to night-raised with paper text. The current item is a solid yellow block with ink text.
- **Bottom tabs (phone):** Four night cells, 3.75rem tall, with the icon above 0.6875rem caps. The current tab uses paper text and a 3px yellow inset top bar.
- **Facet tabs:** Condensed 800 titles in mute, each followed by a small tabular count. The current facet turns ink with a 5px ink underline that sits on a 2px ink baseline rule.
- **Back link:** A crumb in caps at 0.8125rem in mute with a back arrow. It turns ink on hover.

### Listings (Track rows)
A hairline-ruled list, with a 1px rule above the first row and below every row. The grid columns are lead cell (number or 2.75rem plate), title and subline, duration (hidden below 30rem), and actions (play plus the Track actions menu). Row hover is paper-deep.

### Tonight's Listing (signature)
The Play queue set as a timetable. The head is condensed 800 at 1.5rem over a 3px ink rule, with a caps count. Each row leads with a 4.25rem projected on-air clock in tabular figures. The current row is filled yellow with an ink bottom rule and carries an "On air / Paused" caps tag. Projected times update in place as the playhead moves. The same listing renders in the Now playing programme column, under the deck on phones, and in the Play queue sheet.

### Now Playing Deck (signature)
A square night-raised plinth with a 1px night-line border holds the record. The record has groove gradients, a fixed sheen and a 1px ring. It spins at 1.8s per turn while playing. The label is a sleeve-colourway disc, with condensed title and artist sized in container units. There is a paper spindle and an SVG tonearm that rotates from -5° to 24° over 700ms when the arm drops. A square lamp at the bottom left goes on-air red with the arm, and "33⅓" sits at the bottom right. On a Track change, the record turns edge-on over 420ms with cubic-bezier(0.65, 0, 0.35, 1). Under reduced motion, every animation and transition collapses to 0.01ms. The deck bar holds the on-air tag, which is outlined night-line when off air and a solid red-ink block with a paper dot when live.

### Artwork Plates
Plates are square. They show the indexed cover when one exists. Otherwise they show a printed sleeve: a `sleeveFor(title)` colourway with the title condensed 800 in uppercase, sized at 11cqi, clamped to 4 lines and anchored to the bottom left. Small (2.75rem) plates omit the title.

### Alerts and Banners
- **Alert:** Sheet, 1.5px red-ink border, red-ink icon, ink text, max 40rem.
- **Notice:** An ink fill with paper text and an info icon.
- **Storage banner:** A full-width sheet strip under the top bar with a 1.5px red-ink bottom border. It has a bold lead line and a plain explanation.

### Implementation Rules
**The Layer Order Rule.** Remix `css()` emits each class into its own sublayer, `@layer rmx.<hash>`, and orders the sublayers by first appearance in the document. `globalStyles` declares `@layer reset, rmx;` first and keeps every element reset inside `@layer reset`, because unlayered global CSS would beat every `css()` style. In `mix={[base, modifier]}`, a modifier wins only if its layer was created after the base's. A shared modifier can therefore lose, so it sets custom properties that the base reads. For example, `btnSmall` sets `--btn-h`, `--btn-px` and `--btn-fs`, and `buttonBase` consumes them. Surface tones work the same way: `paperTone` and `nightTone` set `--tx-fg`, `--tx-bg`, `--tx-mute` and `--tx-rest`. Nested selectors on a parent class (for example `'& h2'`) can lose to a later layer, so style the child directly.

**The Inline-Flex Icon Rule.** Icon buttons centre their glyph with `display: inline-flex`, never grid. A hidden label inside a grid creates a phantom row.

**The String Clamp Rule.** Unitless properties passed to `css()` must be strings. Write `WebkitLineClamp: '2'`, because the number `2` compiles to `2px`.

**The Square-Stroke Icon Rule.** Icons are inline 24×24 SVGs with a 2px `currentColor` stroke, square caps and miter joins. Transport glyphs use solid fills. Size them with CSS (1–1.5rem), never with an icon font.

## Do's and Don'ts

### Do:
- **Do** set every title in condensed (68% width) Archivo 800 uppercase with line-height ≤ 1, and keep reading text at normal width.
- **Do** mark structure with ink rules: 3px under page heads and above listings, 2px above section titles, and 1px rule between rows.
- **Do** keep red for live state (the on-air tag, lamps, the record label) and draw errors as a 1.5px red-ink border with a red-ink icon on sheet or paper.
- **Do** keep yellow for the current row, the current rail item, the current tab, selection, and hover on the item about to be chosen.
- **Do** use tabular figures at 82% width for clocks, durations and counts.
- **Do** keep corners square. Reserve 50% radius for objects that are physically round.
- **Do** make a shared modifier set custom properties that the base reads, instead of overriding properties directly.
- **Do** keep every control at least 2.75rem tall and collapse all motion under `prefers-reduced-motion`.

### Don't:
- **Don't** use red fills for errors or decoration, or yellow for anything other than "current" or "selected".
- **Don't** round cards, buttons, inputs or plates.
- **Don't** add glows, decorative gradients or resting shadows. The only gradients render the record.
- **Don't** put a small uppercase eyebrow or kicker above a heading. Small caps carry state or time only.
- **Don't** let chrome borrow a plate's colourway. Colour stays inside the plate.
- **Don't** write global element CSS outside `@layer reset`, or pass numbers for unitless `css()` properties.
- **Don't** centre icon-button glyphs with grid.
