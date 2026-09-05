# MAG7 frontend verification — 2026-09-05

## Wide-screen spacing correction

Expanded the flow container from 1120px to 1360px (21%), keeping the execution
column at 185px. At desktop widths the canvas moves up 42px, top padding drops
to 20px, and stock labels increase to 14px. Inspected the animated page at
1920 × 1080: measured container 1360px, page width 1905px (scrollbar excluded),
no horizontal overflow. Cube scales with the shared diagram geometry.
Typecheck/build and eight tests pass. Small-screen geometry is unchanged.

## Synchronized vault reaction

The shared animation clock now waits for the deposit's 1.5-second arrival,
turns the shell 90 degrees over 1.3 seconds with a soft glow, then holds for
200 ms before releasing the five stock particles together at cycle 3 seconds.
The label stays outside the rotating shell. Motion-off resets the shell to
45 degrees, clears the glow and hides all seven particles (browser verified).
The new timing regression test checks arrival, midpoint, settling and loop
continuity. Build/typecheck and eight tests pass. The automated full-cycle
browser sampler timed out; that check is not claimed as passed.

## Reserve follow-up

Fixed the disconnected lower reserve reported in
`codex-clipboard-0394f4fa-39d4-4319-ba77-b5b234711e7d.png`.
The connector, three diamond outlines, arrow and center dot now share SVG
coordinates. Text no longer moves the platform vertically. The reserve label
has a bounded, wrapping layout with a separate policy amount and explanation.
Verified desktop 1488 × 1056 and phone 390 × 844 screenshots in
`qa/reserve-desktop.png` and `qa/reserve-mobile.png`; phone page width is 375px
with no horizontal page overflow. Typecheck, build and seven tests pass.
This is a scoped reserve correction; financial logic is unchanged.

## Diagram correction after client feedback

The client's screenshot exposed P2 issues in the original pass: stretched cube,
fixed-pixel/scaled-SVG geometry mismatch, sparse internal detail and an excessive
reserve connector. These supersede the earlier acceptance of the simple cube.

Corrected in `src/diagram.css` and `src/Diagram.tsx`: shared proportional
coordinates, square-faced layered CSS 3D shell, readable inner core, separate
allocation paths, aligned headings and shortened reserve path. Retained the
explicitly requested code-native SVG/CSS animation rather than raster artwork.

Evidence: `qa/refined-desktop.png` (1488 × 1056 CSS viewport),
`qa/refined-mobile.png` (390 × 844 CSS viewport), and focused side-by-side
`qa/refined-comparison.png`. Compared the capital-flow region with the original
`codex-clipboard-d7ab4231-321f-4c80-b701-fdc4ff84f961.png` reference; the new
client screenshot is defect evidence, not a replacement design target.
Reference and rendered regions were normalized to 900 × 720 each. Desktop
browser captures exclude the scrollbar, so the raster width is 1473 pixels.

Typography: retained local fonts and made headings align. Spacing: shorter
470-unit desktop canvas and reserve path. Colors: retained slate/lime tokens,
increased reserve-line legibility. Asset quality: replaced distorted cuboid
with proportionate faces and layered inner shell. Content: preserved dynamic
weights and honest reserve-policy language. No financial logic was changed.

Post-fix checks: five readable phone rows; page scroll width 375 at a 390 CSS
pixel viewport; selection yields one highlighted and four dimmed paths.
Production build/typecheck and seven frontend tests passed. Residual P3:
the moving CSS shell is an adaptation, not an exact static illustration copy.

final result: passed

## Result

Local preview and static production build are ready for client review. Visual
QA passes for the implemented responsive adaptation, not a pixel-identical
reproduction or a mainnet readiness assessment.

## Reference comparison

Compared the supplied Index Infrastructure screenshot and rendered desktop
at 1488 × 1056 in a side-by-side composite (`qa/comparison.png`). Preserved
the slate palette, one-third editorial column, grid rules, mono labels,
lime accents, capital-flow composition, five allocations and deposit strip.
Local Inter and IBM Plex Mono are bundled with the build.

Intentional differences: explicit demo banner; corrected basket-versus-vault
weight language; no invented launch date or audit approval; functional
transaction tabs; added content below the hero. The cube is a working CSS 3D
wireframe rather than the reference's layered static illustration. Execution
uses a Lucide control icon. The real form is taller than the reference strip.

Checked desktop 1488 × 1056, tablet 768 × 1024, and phone 390 × 844.
Tablet uses a stacked hero with facts alongside its introduction. Phone uses
a vertical flow with all five allocations. Observed page widths remained
within the viewport; holdings have an intentional horizontal table scroller.
Captured desktop, tablet, and mobile-flow screenshots in ignored `qa/`.

## Interaction checks

- Browser demo wallet connection, deposit review/confirmation, updated balances.
- In-kind preview with individual token amounts; oversized redemption error.
- Documentation navigation, content search and empty result state.
- Stock focus/hover selects one connector and dims the other four.
- Motion toggle and emulated reduced motion: final 20% labels, hidden particles,
  no cube animation. Offscreen/hidden-page pause and cleanup implemented.
- Keyboard-operable stock controls, transaction tabs with arrow/Home/End keys,
  native modal focus behavior, skip link and visible focus indicators.
- Reviewed foreground/background contrast and responsive readable hierarchy.
  This is not a full external accessibility certification.

Development hot reload temporarily emitted hook-order warnings when hook
definitions were edited; final verification uses a full page reload.

## Automated verification

- TypeScript check and Vite production build pass.
- Seven focused tests pass: integer precision, demo accounting, transaction
  availability, configuration validation, session invalidation, docs search,
  rejected/failed/replaced transaction handling.
- Anvil integration passes against actual IndexVault/PriceOracle artifacts
  and mock tokens/router: exact approval, deposit, paused USDG redemption,
  idle-liquidity limit, stale NAV, price-independent paused in-kind exit,
  account mismatch and invalidated-session rejection.
- Four retained static-hosting tests pass.

## Performance and boundaries

One observed 179-interval requestAnimationFrame sample in the desktop browser
had median 4.2 ms and p95 4.3 ms. This measures callback cadence, not paint/GPU
cost, real mobile performance, or a universal 60fps guarantee. SVG lengths are
cached, no per-frame React state is used, and animation pauses when not visible.

The production JS is approximately 561 KB / 185 KB gzip. Vite emits a chunk-size
advisory; deferred loading/code splitting is a possible later optimization.

Real browser-extension prompts, wallet-specific network/account behavior and
the published deployment still need end-to-end acceptance with the actual
wallet and reviewed public deployment configuration. No real funds were used.
The Anvil adapter fixture is not a full browser-extension test. WalletConnect
and public deployment remain out of scope. Backend changes and the previous
eight-concept gallery were preserved.
