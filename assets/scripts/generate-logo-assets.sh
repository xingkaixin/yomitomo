#!/usr/bin/env bash
# 从源 logo 批量生成桌面端应用图标（圆角版）和官网品牌图（直角版），并做体积控制。
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

SRC_W=$(sips -g pixelWidth "$SOURCE" | awk '/pixelWidth/{print $2}')

# 体积上限（bytes）
ICON_PNG_MAX=204800
FAVICON_MAX=8192
LOGO_PNG_MAX=393216
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

check_transparent_corner() {
  local file="$1" label="$2"
  local corner
  corner=$(magick identify -format "%[pixel:p{0,0}]" "$file")
  if [[ "$corner" == *",0)" || "$corner" == "none" ]]; then
    printf "  \033[32mPASS\033[0m %-45s %s\n" "$label" "$corner"
    PASS=$((PASS + 1))
  else
    printf "  \033[31mFAIL\033[0m %-45s corner is %s\n" "$label" "$corner"
    FAIL=$((FAIL + 1))
  fi
}

echo "Generating logo assets from: $SOURCE (${SRC_W}x${SRC_W})"
echo ""

# 桌面端圆角版：用圆角矩形遮罩，圆角外透明（约 22% 圆角半径）
# macOS 实际图标会被系统再加 squircle mask，但 icon.png 运行时（dock/任务栏）
# 需要自带圆角，否则方形满铺会显示白边/方角。
SOURCE_ROUNDED="$TMP_DIR/source-rounded.png"
MASK="$TMP_DIR/mask.png"
CORNER_RADIUS=$(awk "BEGIN{printf \"%d\", $SRC_W * 0.22}")
magick -size "${SRC_W}x${SRC_W}" xc:none \
  -fill white -draw "roundrectangle 0,0 $((SRC_W-1)),$((SRC_W-1)) $CORNER_RADIUS,$CORNER_RADIUS" \
  "$MASK"
magick "$SOURCE" -alpha set "$MASK" -compose DstIn -composite "$SOURCE_ROUNDED"

# 预压缩：macOS .icns 对 alpha 体积更敏感，单独使用更激进的源图。
pngquant --quality 0-40 --strip --force --output "$TMP_DIR/rounded-iconset-pq.png" "$SOURCE_ROUNDED"
SOURCE_ROUNDED_ICONSET_PQ="$TMP_DIR/rounded-iconset-pq.png"
pngquant --quality 25-60 --strip --force --output "$TMP_DIR/rounded-runtime-pq.png" "$SOURCE_ROUNDED"
SOURCE_ROUNDED_RUNTIME_PQ="$TMP_DIR/rounded-runtime-pq.png"
pngquant --quality 30-65 --strip --force --output "$TMP_DIR/source-pq.png" "$SOURCE"
SOURCE_PQ="$TMP_DIR/source-pq.png"

# --- iconset (macOS .icns) ---
echo "[1/5] macOS iconset"
for spec in "16:icon_16x16" "32:icon_16x16@2x" "32:icon_32x32" "64:icon_32x32@2x" \
           "128:icon_128x128" "256:icon_128x128@2x" "256:icon_256x256" "512:icon_256x256@2x" \
           "512:icon_512x512" "1024:icon_512x512@2x"; do
  px="${spec%%:*}"
  name="${spec##*:}"
  sips -s format png -z "$px" "$px" "$SOURCE_ROUNDED_ICONSET_PQ" --out "$ICONSET/$name.raw.png" >/dev/null 2>&1
  pngquant --quality 0-40 --strip --force --output "$ICONSET/$name.png" "$ICONSET/$name.raw.png"
  oxipng -o max --strip safe --quiet "$ICONSET/$name.png" >/dev/null 2>&1 || true
  rm -f "$ICONSET/$name.raw.png"
done
iconutil -c icns "$ICONSET" -o "$TMP_DIR/icon.icns" >/dev/null
cp "$TMP_DIR/icon.icns" "$DESKTOP_RES/icon.icns"
check_size "$DESKTOP_RES/icon.icns" "$ICNS_MAX" "icon.icns (macOS)"
check_transparent_corner "$ICONSET/icon_512x512@2x.png" "iconset 1024 corner alpha"

# --- icon.png (runtime, 1024, 圆角) ---
echo "[2/5] Runtime icon.png"
sips -s format png -z 1024 1024 "$SOURCE_ROUNDED_RUNTIME_PQ" --out "$TMP_DIR/icon-1024.png" >/dev/null 2>&1
pngquant --quality 25-60 --strip --force --output "$DESKTOP_RES/icon.png" "$TMP_DIR/icon-1024.png"
oxipng -o max --strip safe --quiet "$DESKTOP_RES/icon.png" >/dev/null 2>&1 || true
check_size "$DESKTOP_RES/icon.png" "$ICON_PNG_MAX" "icon.png (runtime)"
check_transparent_corner "$DESKTOP_RES/icon.png" "icon.png corner alpha"

# --- icon.ico (Windows, multi-size, 圆角) ---
echo "[3/5] Windows icon.ico"
magick "$SOURCE_ROUNDED_RUNTIME_PQ" -define icon:auto-resize=16,24,32,48,64,128,256 "$DESKTOP_RES/icon.ico"
check_size "$DESKTOP_RES/icon.ico" "$ICO_MAX" "icon.ico (Windows)"
check_transparent_corner "$DESKTOP_RES/icon.ico[6]" "icon.ico 256 corner alpha"

# --- favicon.png (web, 直角, 64) ---
echo "[4/5] Web favicon"
sips -s format png -z 64 64 "$SOURCE_PQ" --out "$TMP_DIR/favicon-64.png" >/dev/null 2>&1
pngquant --quality 70-90 --strip --force --output "$WEB_ASSETS/favicon.png" "$TMP_DIR/favicon-64.png"
check_size "$WEB_ASSETS/favicon.png" "$FAVICON_MAX" "favicon.png (web)"

# --- yomitomo-logo.png (JSON-LD, 直角, 原尺寸) ---
echo "[5/5] JSON-LD logo"
pngquant --quality 30-65 --strip --force --output "$WEB_ASSETS/yomitomo-logo.png" "$SOURCE_PQ"
oxipng -o max --strip safe --quiet "$WEB_ASSETS/yomitomo-logo.png" >/dev/null 2>&1 || true
check_size "$WEB_ASSETS/yomitomo-logo.png" "$LOGO_PNG_MAX" "yomitomo-logo.png (JSON-LD)"

# --- demo avatar (webp, 直角, 96) ---
AVATAR="$WEB_ASSETS/landing-avatars/common/yomitomo.webp"
sips -s format png -z 96 96 "$SOURCE_PQ" --out "$TMP_DIR/avatar-96.png" >/dev/null 2>&1
magick "$TMP_DIR/avatar-96.png" -quality 80 "$AVATAR"
check_size "$AVATAR" "$AVATAR_MAX" "yomitomo.webp (demo avatar)"

# --- cleanup temp ---
rm -rf "$TMP_DIR"

echo ""
echo "Done: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
