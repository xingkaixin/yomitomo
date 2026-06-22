#!/usr/bin/env bash
# 从源 logo 批量生成桌面端应用图标、官网品牌图，并做体积控制。
# 依赖：sips / iconutil（macOS 自带）、pngquant、magick（ImageMagick 7）。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE="$REPO_ROOT/.issues/v0.9.0/backlog/RD-702/new-logo.png"

if [ ! -f "$SOURCE" ]; then
  echo "ERROR: source logo not found at $SOURCE" >&2
  exit 1
fi

for cmd in sips iconutil pngquant magick; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: required command '$cmd' not found" >&2
    exit 1
  fi
done

DESKTOP_RES="$REPO_ROOT/apps/desktop/resources"
WEB_ASSETS="$REPO_ROOT/apps/web/public/assets"
TMP_DIR="$(mktemp -d)"
ICONSET="$TMP_DIR/icon.iconset"
mkdir -p "$ICONSET"

# 体积上限（bytes）
ICON_PNG_MAX=204800
FAVICON_MAX=8192
LOGO_PNG_MAX=262144
ICNS_MAX=819200
ICO_MAX=393216
AVATAR_MAX=30720

PASS=0
FAIL=0

check_size() {
  local file="$1" max="$2" label="$3"
  local size
  size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
  if [ "$size" -le "$max" ]; then
    printf "  \033[32mPASS\033[0m %-45s %8d / %-8d bytes\n" "$label" "$size" "$max"
    PASS=$((PASS + 1))
  else
    printf "  \033[31mFAIL\033[0m %-45s %8d / %-8d bytes\n" "$label" "$size" "$max"
    FAIL=$((FAIL + 1))
  fi
}

echo "Generating logo assets from: $SOURCE"
echo ""

# 预压缩源图（红土色块 logo 色彩简单，激进降色后视觉无损）
pngquant --quality 40-70 --strip --force --output "$TMP_DIR/source-pq.png" "$SOURCE"
SOURCE_PQ="$TMP_DIR/source-pq.png"

# --- iconset (macOS .icns) ---
echo "[1/5] macOS iconset"
for spec in "16:icon_16x16" "32:icon_16x16@2x" "32:icon_32x32" "64:icon_32x32@2x" \
           "128:icon_128x128" "256:icon_128x128@2x" "256:icon_256x256" "512:icon_256x256@2x" \
           "512:icon_512x512" "1024:icon_512x512@2x"; do
  px="${spec%%:*}"
  name="${spec##*:}"
  sips -s format png -z "$px" "$px" "$SOURCE_PQ" --out "$ICONSET/$name.raw.png" >/dev/null 2>&1
  pngquant --quality 50-90 --strip --force --output "$ICONSET/$name.png" "$ICONSET/$name.raw.png"
  rm -f "$ICONSET/$name.raw.png"
done
iconutil -c icns "$ICONSET" -o "$TMP_DIR/icon.icns" >/dev/null
cp "$TMP_DIR/icon.icns" "$DESKTOP_RES/icon.icns"
check_size "$DESKTOP_RES/icon.icns" "$ICNS_MAX" "icon.icns (macOS)"

# --- icon.png (runtime, 1024) ---
echo "[2/5] Runtime icon.png"
sips -s format png -z 1024 1024 "$SOURCE_PQ" --out "$TMP_DIR/icon-1024.png" >/dev/null 2>&1
pngquant --quality 40-70 --strip --force --output "$DESKTOP_RES/icon.png" "$TMP_DIR/icon-1024.png"
check_size "$DESKTOP_RES/icon.png" "$ICON_PNG_MAX" "icon.png (runtime)"

# --- icon.ico (Windows, multi-size) ---
echo "[3/5] Windows icon.ico"
magick "$SOURCE_PQ" -define icon:auto-resize=16,24,32,48,64,128,256 "$DESKTOP_RES/icon.ico"
check_size "$DESKTOP_RES/icon.ico" "$ICO_MAX" "icon.ico (Windows)"

# --- favicon.png (64) ---
echo "[4/5] Web favicon"
sips -s format png -z 64 64 "$SOURCE" --out "$TMP_DIR/favicon-64.png" >/dev/null 2>&1
pngquant --quality 70-90 --strip --force --output "$WEB_ASSETS/favicon.png" "$TMP_DIR/favicon-64.png"
check_size "$WEB_ASSETS/favicon.png" "$FAVICON_MAX" "favicon.png (web)"

# --- yomitomo-logo.png (JSON-LD, 1254) ---
echo "[5/5] JSON-LD logo"
pngquant --quality 40-70 --strip --force --output "$WEB_ASSETS/yomitomo-logo.png" "$SOURCE_PQ"
check_size "$WEB_ASSETS/yomitomo-logo.png" "$LOGO_PNG_MAX" "yomitomo-logo.png (JSON-LD)"

# --- demo avatar (webp, 96) ---
AVATAR="$WEB_ASSETS/landing-avatars/common/yomitomo.webp"
sips -s format png -z 96 96 "$SOURCE" --out "$TMP_DIR/avatar-96.png" >/dev/null 2>&1
magick "$TMP_DIR/avatar-96.png" -quality 80 "$AVATAR"
check_size "$AVATAR" "$AVATAR_MAX" "yomitomo.webp (demo avatar)"

# --- cleanup temp ---
rm -rf "$TMP_DIR"

echo ""
echo "Done: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
