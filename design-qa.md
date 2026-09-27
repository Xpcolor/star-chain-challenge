# Design QA — reference typography and glass refinement

Date: 2026-09-27. Scope: current independent visual sample typography, subtle side perspective and translucent backing. This is not a full screenshot clone or full-game migration.

Source visual: C:/Users/xutao/Desktop/ChatGPT 图像 2026年9月27日 06_55_38.png, 1774×887 pixels. Implementation: docs/qa/visual-sample-readable-glass-reference.jpg, 1759×887 content pixels plus the browser scrollbar area, CSS viewport1774×887, DPR approximately1. Both images opened together for the final comparison. Additional screenshot docs/qa/visual-sample-readable-glass-1280.jpg at CSS1280×720. Background, model pose and attack frame differ intentionally: the approved sample uses real3D and is idle in the final reference-sized capture; typography comparison is unaffected.

## Findings and fixes

- Resolved P2: larger left entry text initially met the estimated-damage footer. Fixed flexible grid minimums, line heights and entry spacing without enlarging the frame. Last child now fits each entry and footer is separate.
- Resolved P2: at1774×887 the rail controls initially overlapped the command deck. Replaced fixed-height rail stacking with available-height grid. Final controls bottom685.03, deck top697.18. At1280×720:555.84 and569.29.
- Resolved P2: screen-aligned lightning would not follow inclined panels. Project the original local perimeter through its CSS matrix and perspective division. Final captures show strands on the glass boundary.

## Required surfaces

- Typography: existing Microsoft YaHei UI/system sans and Georgia card figures retained. Classification and rule text equal14/16/18px by tested viewport. Main headings22–24px on broad desktop; lower-height entry titles18–20px. Rule line height1.4–1.5, small labels no longer tiny. Side-panel text and rail controls examined directly at readable resolution in the full captures; DOM sizes and child bounds supplement that focused inspection.
- Spacing: three entries fill each side, no new repeated small boxes; fixed frame sizes retained, only internal spacing and rail distribution adapt. Bottom buttons and navigation remain visible. Existing wide combat area retained.
- Colors: cyan/purple/orange semantics retained; white readable primary text. Dark blue glass at17% opacity on sides and20% on dock, 2px backdrop blur; transparency means83%/80% respectively. Low-opacity continuous edge complements the two long electrical strands.
- Image quality: existing space image and two supplied real3D models retained by the scoped request. Model textures remain softer than the painted reference; this is a known separate materials/asset issue, not fixed by the typography work. No replacement raster or placeholder asset produced.
- Copy: rules, life values, menus and buttons retained. Sample controls and explanation remain sample content.

## Verification

Browser: select5, fire three hits (18→15), reset to18; no observed errors/warnings.1280×720 detailed bounds saved in docs/qa/visual-sample-readable-glass-layout.json.1920×1080 inspected; image readable-glass-1920.jpg precedes the final rail-spacing change and is intermediate evidence only. Final reference-sized and compact screenshots are after repairs.72 tests passed; later CSS-only spacing fixes visually verified and final build passed. No public deployment.

Full-view comparisons: initial match-size comparison exposed entry/control overlap; final images reopened together after repairs and no remaining P0/P1/P2 findings within this typography/glass scope. Broader asset sharpness and public delivery remain outside this scoped pass. No color-contrast guarantee over every animation frame or sustained GPU benchmark.

final result: passed

---

Previous cockpit v3 QA preserved below as historical evidence, not the current sample:

# Design QA — cockpit v3

Date: 2026-09-27. Local implementation and the checks below completed. Owner aesthetic acceptance remains pending. No public deployment.

## Request and decisions

The user accepted the v2 artwork improvement but reported flat overlays and short right-side repair cards leaving a large empty tail. The new brief is transparent floating glass inside a pilot cockpit, looking out into space.

The user explicitly authorized consulting SPGC. Read-only design sources: D:/ais/SPGC/docs/technical/shader-lighting-design.md, docs/specs/shader-lighting-assets.md and docs/specs/design-reference-comparison.md. Adopted shaped reflections, visible material edges, depth/occlusion and actual-frame checks. No SPGC business state, credentials, model calls or production workflows were imported.

C:/Users/xutao/Desktop/特效建议.txt was treated as optional design reference. Adopted circuit tracing, parallax, card lift and energy transfer, rail arcs/numeric entry, responsive exhaust, soft impact/heal effects and a refracting backdrop. Retained single-click confirmation and existing JavaScript/Three architecture; no framework migration or commerce features.

## Implemented

- Three repair cards fill the available panel height equally. Progress remains at each card's lower edge. Compact desktop typography and reserved reward text prevent overflow.
- Translucent glass with controlled reflection bands, thickness edges, inset lighting, restrained perspective and an outer canopy behind text. A darker translucent dock preserves contrast over bright Earth clouds.
- Real Three geometry for 22 lit foreground rocks and 520 points; separate far-field background, ship layer and readable DOM HUD. Pointer smoothing moves layers at different depths. This remains illustrated 2.5D ships, not newly reconstructed volumetric ships.
- One-way presentation events carry committed results. Selected cards connect to the engine; confirmation sends bounded data particles; rail movement emits arcs and endpoint waves; labels enter vertically.
- A spherical hex-grid hit field, soft shader rings, adaptive exhaust, 65 ms ship-motion hold and brief local camera recoil. Background shader samples the existing cosmos texture with a localized radial displacement on impact. Existing arrival, victory, defeat and collapse preserved.
- Reduced-motion preference, hidden-page pause, mobile fallback and teardown paths are implemented. No extra audio or downloaded assets; existing sound cues preserved.

## Verified evidence

- npm test: 72 passed, 0 failed. Includes real app action/settlement/refill/restart tests, event deduplication, differentiated fire/healing cues and full simulated matches. Final shader/CSS refinements also compiled and were loaded in the browser.
- npm run build passed. Windows-aware git diff whitespace check passed. SHA-256 of engine/records/progress/advice still matches the v2 backup.
- Local isolated QA server: http://127.0.0.1:8791/, data .local/cockpit-v3-qa. Existing 8788 preview remains available; no public records altered by testing.
- Actual play: orange 16+4=20 previewed and settled 2 damage, 1 blocked, 1 healing; HP became [19,16]. Supply continued to the robot. A separate legal fold 16→4 produced 2 damage and 1 healing. Canvas receipt showed shots:1;heal:1; renderer remained ready, no browser warnings/errors observed.
- Screenshot evidence: docs/qa/game-1440-cockpit-v3.png, game-1920-cockpit-v3.png, game-2560-cockpit-v3.png, game-390-cockpit-v3.png. Intermediate actual effects: cockpit-v3-shot-01.png, cockpit-v3-shot-02.png, cockpit-v3-soft-impact.png. Intermediate images precede the last canopy stacking correction; final screenshot is cockpit-v3-final.png.
- Layout measurements: docs/qa/cockpit-v3-layout.json. Actual sampled viewports: 1440×900, 1920×1032, 2560×1032, 390×796. The browser host sometimes reserves 48 px from the requested height; report measured dimensions, not merely requested overrides. Desktop dock bottoms: 894, 1022, 1022. No horizontal overflow, all 63 ticks retained, repair client/scroll heights equal at every measured width. Mobile uses vertical scrolling and hides the added space canvas.
- Pointer interaction changed --look-x/--look-y and the panel's actual matrix3d transform while the space renderer was ready. Canopy z-index 1 is below DOM app z-index 2, preventing the early title obstruction.

## Limits

These checks do not prove an aesthetic approval, a sustained FPS target, subjective sound mixing, every multi-effect combination or forced WebGL context restoration. Reduced-motion logic was implemented and reviewed but the OS preference was not toggled during this run. New high-detail GLB fleet reconstruction and PvP remain unimplemented. The background source remains 1672×941.

Backup: .local/cockpit-v3-backup. Existing unrelated work is preserved. No Git commit, push or public deployment was made.
