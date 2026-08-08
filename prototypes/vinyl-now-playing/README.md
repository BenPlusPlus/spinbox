# Vinyl Now playing prototype (throwaway)

**Ticket:** [Vinyl Now playing UI prototype](https://github.com/BenPlusPlus/spinbox/issues/7)  
**Branch:** `prototype/vinyl-now-playing`  
**Question:** What should Spinbox's Now playing feel like if it keeps the spirit of [Jeet Nirnejak's vinyl player](https://x.com/jeetnirnejak/status/2086080453417845158) — edge-swap on track change, **no album sides** — as a v1 centerpiece?

This is **not** production and **not** Remix. Static HTML only so it runs with zero stack.

## Run

Open the file in a browser (double-click, or):

```bash
# from repo root
start prototypes/vinyl-now-playing/index.html   # Windows
# open prototypes/vinyl-now-playing/index.html  # macOS
```

Or serve it:

```bash
npx --yes serve prototypes/vinyl-now-playing
```

## Variants (`?variant=`)

| Key | Name | Structure |
|-----|------|-----------|
| **A** | Classic deck | Plinth + tonearm left, metadata + full transport right |
| **B** | Center stage | Huge vinyl, minimal chrome, floating dock controls |
| **C** | Phone stack | Couch/phone frame, big hit targets, up-next strip |

Switch with the floating bar or **← / →**. Shareable URLs keep the variant.

## Interaction under test

- **Edge-swap:** Next/prev (or natural track end) rotates the record edge-on, swaps label/title/time while hidden, rotates back face-on.
- Transport: play/pause, seek, shuffle, repeat cycle (off → all → one).
- No real audio — a timer fakes progress so motion and state stay visible.
- State dump (desktop) surfaces full prototype state after every action.

## What to react to

1. Is vinyl-as-centerpiece the right v1 direction at all?
2. Which variant structure (or mix) belongs in the design doc?
3. Is per-track edge-swap (not album sides) enough of the Jeet spirit?
4. Anything missing before [Browse shell and primary UX structure](https://github.com/BenPlusPlus/spinbox/issues/16) can decide dock vs full route?
