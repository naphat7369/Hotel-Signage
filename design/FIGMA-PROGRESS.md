# StayScreen Figma design progress

Updated: 2026-09-13

File: https://www.figma.com/design/XUhoUdrJE77r6aOvBU5BLh
Team: TRAMWORK (Starter)
Status: OAuth connected; design writes succeeded; Figma MCP quota then exhausted. Do not claim design complete or implemented in the application.

## Created nodes

- Page `0:1`: 01 • Hotel Signage — UX/UI
- `3:2`: Manage Displays canvas, 1440 × 1024
- `3:87`: Navy sidebar with seven reusable library navigation instances
- `3:119`: Main workspace
- `3:120`: Organisation context (explicitly DEMO WORKSPACE)
- `3:123`: Page heading
- `3:232`: Register display button
- `3:409`: Four fleet summary cards with illustrative counts 12 / 10 / 2 / 1
- `3:445`: Search, branch and connectivity filters
- `3:3`: Register Display canvas, 560 × 720 — EMPTY
- `3:4`: Schedule Builder canvas, 1120 × 1024 — EMPTY
- `3:5`: Display Preview canvas, 640 × 860 — EMPTY

## Discovery and design choices

- No Code Connect files found in the source project. Target file started empty.
- Simple Design System library components were imported and instanced: Navigation Button, Button, Stats Card, Input Field, Select Field.
- Component imports return remote node IDs that may not resolve in later calls. Re-import by published key and choose variants by inspected names; do not rely on remote IDs from earlier calls.
- Library component text uses Inter with Thai fallback; standalone headings use available Noto Sans Thai Regular/SemiBold/Bold. This is a redesign proposal from the brief, not a pixel-exact port of the existing Leelawadee UI application.
- Brand Navy #102039 and Teal #00897D are exploratory instance/container overrides. This is not a completed token library.
- Library spacing token Space/600 imported and bound to main layout gap.
- Sidebar, header, summary and filters were individually rendered. Summary overflow was corrected. Full-screen QA and font audit are still pending.

## Next work after quota becomes available

1. Inspect saved nodes and full-screen screenshot before editing.
2. Add four device cards using Simple Design System Card instances. Last attempted card call was rejected by quota; no cards were created.
3. Complete registration form with six-digit pairing code, branch, group, name, validation and success state.
4. Complete schedule form with published playlist version, target displays, date range, weekdays, timezone and review before publish.
5. Complete display detail/preview with screenshot timestamp, connectivity and cache status as separate indicators. Clearly mark preview as illustrative, not a live production screenshot.
6. Wire prototype Register → Display → Schedule and verify screens.
7. Finish mobile adaptation and handoff notes, then separately implement the approved design in the application.

Do not route around the Figma MCP plan quota using an alternative API or automation surface. No plan purchase or upgrade has been authorized.
