#!/usr/bin/env bash
# Echo Translate — macOS setup: checks Python 3.10+, runs the tests, and puts a double-click launcher on the Desktop.
# Usage (in Terminal, inside the unzipped folder):  bash install_mac.sh
set -e
cd "$(dirname "$0")"
APP_DIR="$(pwd)"
if ! command -v python3 >/dev/null; then
  echo "Python 3.10+ is required: https://www.python.org/downloads/macos/"; exit 1
fi
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' || {
  echo "Python 3.10+ is required (found $(python3 --version))."; exit 1; }
[ -d "/Applications/Google Chrome.app" ] || echo "Note: install Google Chrome — speech recognition and translation need Chrome."
python3 -m unittest discover -s tests
LAUNCHER="$HOME/Desktop/Echo Translate.command"
cat > "$LAUNCHER" <<CMD
#!/usr/bin/env bash
cd "$APP_DIR" && python3 server.py
CMD
chmod +x "$LAUNCHER" start_mac_linux.sh
echo "Done. Double-click 'Echo Translate' on your Desktop, then open http://127.0.0.1:8765 in Chrome."
