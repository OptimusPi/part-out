# PART-OUT

Drop a car GLB on the bench, spin it, and part it out.

- **Mesh claim** — click a named panel (door, wheel, hood) and cut it free. Left/right mirrors when the part is sided.
- **Vertex snap** — plant corner dots on real vertices, extrude a slice volume, and cut doors / glass / bumpers off a fused mesh.
- **Garage** — six shipped GLBs, from a named golf cart to single-mesh fused bodies. Open your own `.glb` anytime.

Built for 400–800 face low-poly kits; holds up around ~5k faces.

## Use it

1. Pick a garage car or drop a GLB.
2. **Mesh** mode: click a panel → **Cut**. **C** claims every named mesh at once.
3. **Verts** mode: snap 4 corners (2 for wheels/mirrors) → **Cut**. Sided parts mirror across the car.
4. Drag **Explode** (or tap **E**) to pull parts off the body. **Export** writes a parted GLB.

Space toggles place/spin. Enter cuts. V swaps mesh/verts.

## Dev

```bash
npm install
npm run dev
```
