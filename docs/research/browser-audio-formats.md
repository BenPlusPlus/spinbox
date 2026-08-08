# Browser playback of Spinbox library formats

**Ticket:** [#4](https://github.com/BenPlusPlus/spinbox/issues/4) · **Map:** [#1](https://github.com/BenPlusPlus/spinbox/issues/1)  
**Scope:** Modern Chromium / Firefox / Safari matrix for native `<audio>` (and the same decode stack for Web Audio `decodeAudioData`).  
**Library context:** Private household Library, mostly **mp3** / **m4a**, sparse **wav** / **flac** / **ogg** / **aac**.

## Summary (one-line)

**mp3, m4a/AAC, wav, and flac play natively across modern Chromium, Firefox, and Safari; raw ADTS `.aac` is OS-dependent on Firefox; Ogg (Vorbis/Opus) needs Safari 18.4+ (or server-side transcode).** For a mostly-mp3/m4a household library, **server-side transcoding is optional by default**—required only for Ogg on older Safari, odd containers/codecs, or deliberate bandwidth/lossless policy.

## Definitions

| Term | Meaning here |
| --- | --- |
| **Native** | Browser decodes and plays via HTMLMediaElement / underlying media engine without WASM/JS codecs or server rewrite. |
| **Remux** | Change **container** only (e.g. ADTS AAC → `.m4a` / MP4); codec payload unchanged. Cheap, lossless. |
| **Transcode** | Re-encode audio (e.g. FLAC → AAC, Vorbis → AAC). CPU-costly; quality trade-off if lossy. |
| **Modern matrix** | Current Chromium (Chrome/Edge/etc.), Firefox, and Safari on current major desktop/mobile OS releases—not IE, not decade-old Safari. |

MIME types commonly served for these files:

| Extension / form | Typical MIME | Codec + container |
| --- | --- | --- |
| `.mp3` | `audio/mpeg` | MPEG-1 Audio Layer III (frame stream; often treated as its own “format”) |
| `.m4a` | `audio/mp4` or `audio/x-m4a` | Usually **AAC** (or ALAC) in **MPEG-4** |
| `.wav` | `audio/wav` / `audio/wave` | Usually **PCM** in RIFF/WAVE |
| `.flac` | `audio/flac` | **FLAC** in native FLAC container |
| `.ogg` / `.oga` / `.opus` | `audio/ogg` | **Vorbis** or **Opus** (sometimes FLAC) in **Ogg** |
| `.aac` | `audio/aac` | **AAC** in **ADTS** (not the same as `.m4a`) |

Sources: [MDN — Web audio codec guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs), [MDN — Media container formats](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers).

## Support matrix (modern Chromium / Firefox / Safari)

Legend: **Yes** = reliable native `<audio>` playback on current majors · **Partial** = works under conditions (OS/version) · **No** = do not rely on native play.

| Format | Chromium | Firefox | Safari | Notes |
| --- | --- | --- | --- | --- |
| **mp3** | Yes | Yes | Yes | Universal for years; Can I use global ~97%. |
| **m4a / AAC-in-MP4** | Yes | Yes* | Yes | Preferred portable music packaging per MDN. \*Firefox uses **OS media stack** for AAC (see below). |
| **wav (PCM)** | Yes | Yes | Yes | Large files; bandwidth/storage concern, not decode support. |
| **flac** | Yes (56+) | Yes (51+) | Yes (Safari 13+ macOS; iOS 11+) | Native FLAC container + FLAC-in-MP4/Ogg where engines allow. |
| **ogg (Vorbis)** | Yes | Yes | **Partial → Yes** | Safari **18.4+** (macOS 15.4 / iOS 18.4 / iPadOS 18.4 / visionOS 2.4) for Ogg Vorbis; older Safari **No**. |
| **ogg (Opus)** | Yes | Yes | **Partial → Yes** | Same Safari 18.4+ Ogg story; earlier Safari Opus only in niche CAF packaging, not typical `.ogg`/`.opus` library files. |
| **aac (ADTS / `.aac`)** | Yes | **Partial** | Yes | ADTS support in Firefox only when OS media framework provides AAC; remux to `.m4a` is safer. |

### Can I use (audio element) — current majors

| Feature | Chrome | Firefox | Safari | Can I use |
| --- | --- | --- | --- | --- |
| MP3 | Yes | Yes | Yes | [caniuse.com/mp3](https://caniuse.com/mp3) |
| AAC | Yes | Partial | Yes | [caniuse.com/aac](https://caniuse.com/aac) |
| WAV | Yes | Yes | Yes | [caniuse.com/wav](https://caniuse.com/wav) |
| FLAC | Yes | Yes | Yes | [caniuse.com/flac](https://caniuse.com/flac) |
| Ogg Vorbis | Yes | Yes | Yes from 18.4 (partial earlier) | [caniuse.com/ogg-vorbis](https://caniuse.com/ogg-vorbis) |
| Opus | Yes | Yes | Partial (Ogg path improved 18.4+) | [caniuse.com/opus](https://caniuse.com/opus) |

Can I use explicitly scopes these tables to the HTML `audio` element.

### MDN / browser-doc highlights

- **MDN recommends AAC-in-MP4, MP3, or Vorbis for general music**; **“AAC in an MP4 container is supported by all major browsers.”**  
  [Web audio codec guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs)
- **FLAC:** MDN browser table lists Chrome / Edge / Firefox (51 desktop, 58 mobile) / Opera / Safari 11+ for FLAC support; containers include MP4, Ogg, native FLAC.  
  Same guide.
- **MP3:** MDN lists support Yes across Chrome, Edge, Firefox, Opera, Safari 3.1+.  
  Same guide.
- **Vorbis:** MDN notes **no** Safari support historically for Vorbis in HTML media (Chromium/Firefox long Yes); this is superseded for **Ogg** on **Safari 18.4+** by Apple/WebKit notes below.
- **ADTS / `audio/aac`:** MDN containers guide: Firefox AAC (including ADTS) **depends on the OS media infrastructure**.  
  [Media container formats — ADTS](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers#adts)
- **MP4 audio codecs:** AAC / FLAC / MP3 / Opus listed with Firefox AAC tied to OS media stack.  
  [Media container formats — MPEG-4](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers#mpeg-4_mp4)
- **Ogg on Safari:** MDN: *“Safari 18.4+ … added support for Opus and Vorbis codecs in Ogg containers.”*  
  [Media container formats — Ogg](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers#ogg)
- **WebKit / Apple:** Safari 18.4 release notes — *“Added support for Ogg Opus and Ogg Vorbis on macOS Sequoia 15.4, iOS 18.4, iPadOS 18.4, and visionOS 2.4.”*  
  [Safari 18.4 Release Notes](https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes) · [WebKit blog](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)

### Firefox AAC caveat (`*` above)

Firefox does not ship a built-in AAC decoder the way Chromium and Safari do; it decodes AAC via the **host OS** media frameworks. In practice:

- **Windows / macOS / Android / iOS:** AAC in `.m4a` works on normal household devices.
- **Some Linux installs:** may lack licensed AAC plugins → `.m4a` / ADTS can fail even though “Firefox supports AAC.”

For Spinbox’s private household (phones + laptops on Windows/macOS/iOS/Android first), treat **m4a as natively playable**. If Linux desktops matter later, feature-detect and optionally transcode.

### Web Audio API vs `<audio>`

- **`HTMLMediaElement` (`<audio>` / `Audio`)** is the path for streaming library Tracks with seek, range requests, and low memory.
- **`AudioContext.decodeAudioData`** uses the **same browser media decoding pipeline** for compressed formats; it does **not** invent extra codecs. Expect the **same codec matrix**.
- **Media Source Extensions (MSE)** can differ (e.g. some engines play progressive HTTP FLAC but not FLAC-in-MSE). Spinbox v1 leanings (simple stream + range requests) should prefer progressive/`<audio src>` or equivalent, not assume MSE for lossless.
- Runtime check: `audio.canPlayType('audio/mpeg')`, `canPlayType('audio/mp4; codecs="mp4a.40.2"')`, `canPlayType('audio/flac')`, `canPlayType('audio/ogg; codecs="vorbis"')`, etc. Prefer capability detection over UA sniffing.

## When is server-side transcoding / remux **required** vs **optional**?

### Required (for a playable Track in-browser)

| Situation | Action | Why |
| --- | --- | --- |
| **Ogg Vorbis/Opus** served to **Safari &lt; 18.4** (or any Safari on OS older than the 18.4 OS floor) | **Transcode** to AAC-in-MP4 or MP3 | No native Ogg Vorbis/Opus path. |
| **Exotic / non-web codecs** (WMA, APE, Musepack, Shorten, some DSD, etc.) if ever present | **Transcode** | Outside the common web codec set. |
| **Broken or non-web containers** that browsers reject even when codec is fine | **Remux** first; **transcode** if remux fails | Container ≠ codec. |
| **Raw ADTS `.aac` failing on a target browser** (typically some Firefox/Linux) | Prefer **remux → `.m4a`**; fall back to transcode | MDN: ADTS AAC is OS-dependent on Firefox. |
| **ALAC-only `.m4a`** if Chromium/Firefox refuse (Safari OK) | **Transcode** to AAC or FLAC policy choice | ALAC is Apple-centric; not in Spinbox’s stated “sparse” list but appears in some iTunes libraries. |

### Optional (native works; ops/product choice)

| Situation | Action | Why |
| --- | --- | --- |
| **mp3 / m4a (AAC)** bulk of Library | **None** | Full modern matrix support. |
| **flac** sparse tracks | Optional **transcode to AAC/MP3** for constrained links (cellular over VPN) or low-power clients; keep FLAC when on LAN | Decode is native; cost is **bytes and decode CPU**, not “won’t play.” |
| **wav** sparse tracks | Optional **transcode** to FLAC or AAC | PCM plays everywhere; files are large. |
| **ogg** when **all** household clients are Safari 18.4+ **and** Chromium/Firefox | Optional | Native path exists; still may prefer one canonical stream format for simpler caching. |
| **Normalize format** for a single CDN/cache key or gapless pipeline later | Optional product decision | Not a browser-support requirement for v1. |

### Remux vs transcode (cost ladder)

1. **Serve original bytes** — default for mp3/m4a/wav/flac on modern clients.  
2. **Remux** — fix container (ADTS→MP4, rare MP4 brand issues) without quality loss.  
3. **Transcode on demand** — Ogg→AAC for old Safari; exotic codecs; optional bitrate ladder for remote access.  
4. **Transcode + cache** — same, but store derived files so sparse oddballs are not re-encoded every play.

## Implications for Spinbox (private, mostly mp3/m4a)

### Default architecture recommendation

1. **Index and stream originals** for **mp3** and **m4a (AAC)** — covers the bulk of the Library with **zero** transcoder dependency for playback.  
2. **Stream originals** for **flac** and **wav** on LAN / Tailscale; treat “remote bandwidth” as a later policy toggle, not a v1 blocker.  
3. **Do not build a mandatory always-on transcoding farm for v1** solely for format reach—unless household Safari clients still need Ogg support.  
4. **Ogg policy (pick one when implementing):**  
   - **A. Lazy path:** detect client `canPlayType`; if no Ogg, on-demand transcode (or pre-transcode at scan) to AAC/MP3.  
   - **B. Scan-time:** always derive an AAC/MP3 companion for Ogg (and any non-playable type). Sparse Ogg makes either cheap.  
5. **Raw `.aac`:** at scan or first play, **remux to `.m4a`** (or serve with careful MIME) rather than inventing a special player path.  
6. **Feature-detect** at play time for edge Firefox/Linux AAC and old Safari; surface a clear “format not supported on this browser” only after detection fails and no derivative exists.

### What this does *not* force

- No need to re-encode the whole Library to one format.  
- No need for client-side WASM codecs for the stated format set on a modern matrix (optional later for esoterica).  
- Public CDN multi-bitrate ladders are out of scope for private-first LAN/VPN access.

### Residual risks

| Risk | Severity for Spinbox | Mitigation |
| --- | --- | --- |
| Safari &lt; 18.4 + Ogg | Medium if any Ogg + any older iPhone/Mac remains | On-demand or scan-time AAC derivative |
| Firefox Linux + AAC | Low for “household couch phone” leanings | `canPlayType` + optional derivative |
| FLAC over slow remote VPN | UX (buffering), not hard fail | Optional quality profile later |
| ALAC / odd iTunes rips labeled `.m4a` | Low–medium if present | Probe codec at scan; transcode if not AAC/FLAC/MP3 |
| Wrong MIME / missing range requests | Ops | Serve correct `Content-Type` + `Accept-Ranges`; orthogonal to codec matrix |

## Decision input for later tickets

- **Streaming architecture** can assume **byte-range progressive delivery of originals** for the common path.  
- **Transcoding** is a **sparse / edge** subsystem (Ogg, exotic, optional remote profiles)—not the center of the design.  
- Product copy / admin scan reports can list “playable natively” vs “needs derivative” using the matrix above.

## Primary sources

| Source | URL |
| --- | --- |
| MDN — Web audio codec guide | https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs |
| MDN — Media container formats | https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers |
| Can I use — MP3 | https://caniuse.com/mp3 |
| Can I use — AAC | https://caniuse.com/aac |
| Can I use — WAV | https://caniuse.com/wav |
| Can I use — FLAC | https://caniuse.com/flac |
| Can I use — Ogg Vorbis | https://caniuse.com/ogg-vorbis |
| Can I use — Opus | https://caniuse.com/opus |
| Apple — Safari 18.4 release notes | https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes |
| WebKit — Features in Safari 18.4 | https://webkit.org/blog/16574/webkit-features-in-safari-18-4/ |

## Research status

- **Fact-finding complete** for v1 format/transcoding leanings.  
- Not a product lock: implementation tickets may still choose on-demand vs scan-time derivatives and remote quality profiles.
