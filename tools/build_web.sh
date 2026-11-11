#!/usr/bin/env bash
# Exports the browser build to build/web using the "Web" preset
# (single-threaded, so it runs on any static host such as GitHub Pages).
#
# Needs Godot 4.7.2 and its export templates (Editor > Manage Export
# Templates), or at least web_nothreads_release.zip + version.txt in
# ~/.local/share/godot/export_templates/4.7.2.stable/
#
# Usage: tools/build_web.sh [path/to/godot]
set -euo pipefail
GODOT="${1:-godot}"
cd "$(dirname "$0")/.."
rm -rf build/web
mkdir -p build/web
"$GODOT" --headless --path . --export-release "Web" build/web/index.html
touch build/web/.nojekyll
echo "Built build/web. Test locally with:"
echo "  python3 -m http.server 8000 --directory build/web"
echo "then open http://localhost:8000/"
