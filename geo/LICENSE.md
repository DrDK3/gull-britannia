# Licences for the River Dart data in this folder

The files in `public/geo/` are not covered by the repository's MIT licence. They are derived from open data and
carry the licences of their sources. If you reuse them, keep these attributions.

| Files | Source and attribution | Licence |
| --- | --- | --- |
| `features.json`, `roads.json` (buildings, roads, quays, piers, moorings) | © OpenStreetMap contributors, via Overture Maps Foundation; Microsoft ML Building Footprints | Open Database Licence (ODbL) 1.0 |
| `elevation.i16z`, `town.i16z`, `watermask.png`, `current.i16z` (terrain and what is derived from it) | © Environment Agency copyright and/or database right 2015. All rights reserved. Via Tilezen terrain tiles | Open Government Licence v3.0 |
| `drape.jpg`, `minimap.png` (satellite colour) | Contains modified Copernicus Sentinel data 2025 | Copernicus Sentinel data terms (free, full and open access, with attribution) |
| `manifest.json` | Describes the files above | As the files it describes |

The data was built by SailSim's pipeline (https://github.com/DrDK3/SailSim). Gull Britannia removes and adds
features at run time to show the river as it was in 1967; see `SOURCES.md`.
