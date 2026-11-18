# Vendored: SailSim

The River Dart scenery, sky, weather, water, tides and rendering come from SailSim (https://github.com/DrDK3/SailSim, the same owner), copied at commit `e3fa0ed4c3ab8a38c484f11203ece114324cc16c` into the same paths it has there:

- `src/render/` (scene, River Dart, water, reflections, sky and clouds, light, post-processing, graphics presets, dynamic resolution)
- `src/sim/` (environment: tides, wind, sky, sun; geodata)
- `src/app/` (the River Dart data loader and helpers it needs)
- `src/ui/` (not used by the game; kept so the vendored code type-checks as it does in SailSim)
- `data/`, `public/geo/`

Changes made for Gull Britannia are marked in the code with a `Gull Britannia:` comment:

```bash
grep -rn "Gull Britannia:" src/render src/sim src/app
```

They are: the `era: '1967'` option in `dart.ts` (no superyacht, no marina lettering) and `population.ts` (fewer cars, period colours); `Woodland.treesIn` (trees made solid) and the woodland made public in `dart.ts`; exports from `scene.ts` for the game's own scene.

The game itself is in `src/gull/` (see the README).
