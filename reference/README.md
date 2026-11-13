# Reference videos for editing-style presets

Owner (Tar) wants presets for the editor, learned from how Thai and Lao creators/shops edit
product videos (cosmetics and supplements) on TikTok. This folder is the starting data.
Data-only: nothing here touches `src/` or `index.html`, so no APP_VERSION bump is needed.

## Files
- `reference-videos.json` — 147 TikTok videos (collected 2026-11-13).
  - 84 Thai (cosmetics 62, supplement 22), 63 Lao (cosmetics 31, supplement 32).
  - Fields: `url`, `creator`, `topic_note` (English keywords), `language`, `category`,
    `duration_s`, `plays`, `likes`, `creator_followers`, `original_sound`,
    plus an empty `style` block and `reviewed:false` to fill in later.

## What the data is NOT
- It is links plus metadata only. **No editing facts yet** (cut rate, transitions, text style, music use).
- Only 24 Thai cosmetics videos have `duration_s`/`plays`/`likes`. For the rest those are `null`,
  because TikTok started answering 403 to metadata requests and collection was stopped (not bypassed).
- Lao videos are mostly small shops, not famous influencers, and have no view counts.
- Facebook videos were not collected yet.

## What the 24 videos with metrics suggest (small sample, not proof)
- 13 of 24 have 300k+ plays; 12 of those 13 run 9–42 s. Median length of the 24 is about 22 s.
- 18 of 24 use the creator's own original sound, not a trending song.
- Top plays: foundation reply video 42 s (3.0M), 7-Eleven sachet cream 19 s (1.8M),
  oil blotting paper 13 s (1.5M), Pala lip 16 s (1.1M).

## Suggested way to turn this into presets
1. Tar (or the server) downloads a chosen subset of clips (start with the 13 high-play ones plus ~10 Lao ones).
2. Add an analyzer to the editor/server that measures per clip: shot count and cuts per 10 s
   (ffmpeg scene detection), first-3-second hook (text/zoom/face), on-screen text timing,
   audio type (voice-only / music / SFX), aspect ratio.
3. Write the results into each video's `style` block and set `reviewed:true`.
4. Group by category and language, then turn the common patterns into presets
   (for example: cuts per 10 s, hook text in the first 2 s, text position/style, music level).
5. Tar reviews the grouped presets before they are added to the editor.

Note: the shop server's ffmpeg.exe is blocked by Windows, so run the analysis
somewhere ffmpeg works. Respect copyright: keep downloaded clips private, store only the measured numbers here.
