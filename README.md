# PART-OUT

Drop a car GLB, spin it, snap corner dots onto real vertices, cut parts, mirror L/R, export.

For 400–800 face kits. Holds ~5k faces.

## Use

1. Garage car or drop a `.glb`.
2. **Dots** — click 4 corners (2 for wheels). **Door 2D** guesses a driver-door poster and snaps verts.
3. **Cut** (Enter). **L/R** mirrors sided parts.
4. **Mesh** — click a named panel, Cut. **Named** / **C** claims every useful name.
5. **Explode** / **E**. **Export** writes a parted GLB.

Space = place / spin. V = dots / mesh. Ctrl+Z = undo (dot → pick → last cut).

## Local Grok

Read `AGENTS.project.md`. Finish cuts and snap quality. Do not rebuild the engine or pull a 256 GB CAD dump.

```bash
npm install
npm run dev
npm test
```
