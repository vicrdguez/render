#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
profile=${1:-release}
case "$profile" in
  release) cargo build --release -p render-desktop ;;
  debug) cargo build -p render-desktop ;;
  *) printf '%s\n' 'usage: scripts/bundle.sh [release|debug]' >&2; exit 2 ;;
esac
bundle="target/bundle/Render.app"
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
cp "target/$profile/render-desktop" "$bundle/Contents/MacOS/Render"
cp assets/fonts/LICENSE.md "$bundle/Contents/Resources/Fonts-LICENSE.md"
cp assets/icons/LICENSE "$bundle/Contents/Resources/Icons-LICENSE"
cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Render</string>
<key>CFBundleIdentifier</key><string>dev.render.desktop</string>
<key>CFBundleName</key><string>Render</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSSupportsAutomaticGraphicsSwitching</key><true/>
<key>LSMinimumSystemVersion</key><string>13.0</string>
</dict></plist>
PLIST
if command -v codesign >/dev/null 2>&1; then
  codesign --force --sign - "$bundle"
fi
printf 'Built %s\n' "$bundle"
