#!/usr/bin/env bash
# 从源 logo 批量生成桌面端应用图标（圆角版）和官网品牌图（直角版），并做体积控制。
# 依赖：iconutil（macOS 自带）、pngquant、oxipng、cwebp、magick（ImageMagick 7）。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE="$REPO_ROOT/assets/yomitomo-logo.webp"

if [ ! -f "$SOURCE" ]; then
  echo "ERROR: source logo not found at $SOURCE" >&2
  exit 1
fi

for cmd in iconutil pngquant oxipng cwebp magick; do
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

echo "Generating logo assets from: $SOURCE"
echo ""

# 桌面端圆角版：内容居中在 1024 画布上，圆角外透明。
# macOS 用 Apple 图标网格（内容 824）；旧版系统和开发态 Dock 会原样显示 icns/png，
# 留白决定了它和其他图标是否等大。Windows 不做系统遮罩，内容放大到 896 保住 16px 的辨识度。
render_rounded_icon() {
  local content="$1" output="$2"
  local padding=$(((1024 - content) / 2))
  local radius
  radius=$(awk "BEGIN{printf \"%d\", $content * 0.225}")
  magick -size "${content}x${content}" xc:none \
    -fill white -draw "roundrectangle 0,0 $((content-1)),$((content-1)) $radius,$radius" \
    "$TMP_DIR/mask.png"
  magick "$SOURCE" -filter Lanczos -resize "${content}x${content}" -alpha set \
    "$TMP_DIR/mask.png" -compose DstIn -composite "$TMP_DIR/rounded.png"
  magick -size 1024x1024 xc:none "$TMP_DIR/rounded.png" -geometry "+$padding+$padding" \
    -compose Over -composite "$output"
}

ICON_MAC="$TMP_DIR/icon-mac.png"
ICON_WIN="$TMP_DIR/icon-win.png"
render_rounded_icon 824 "$ICON_MAC"
render_rounded_icon 896 "$ICON_WIN"

# --- iconset (macOS .icns) ---
echo "[1/5] macOS iconset"
for spec in "16:icon_16x16" "32:icon_16x16@2x" "32:icon_32x32" "64:icon_32x32@2x" \
           "128:icon_128x128" "256:icon_128x128@2x" "256:icon_256x256" "512:icon_256x256@2x" \
           "512:icon_512x512" "1024:icon_512x512@2x"; do
  px="${spec%%:*}"
  name="${spec##*:}"
  magick "$ICON_MAC" -filter Lanczos -resize "${px}x${px}" "$ICONSET/$name.raw.png"
  pngquant --quality 60-90 --strip --force --output "$ICONSET/$name.png" "$ICONSET/$name.raw.png"
  oxipng -o max --strip safe --quiet "$ICONSET/$name.png" >/dev/null 2>&1 || true
  rm -f "$ICONSET/$name.raw.png"
done
iconutil -c icns "$ICONSET" -o "$TMP_DIR/icon.icns" >/dev/null
cp "$TMP_DIR/icon.icns" "$DESKTOP_RES/icon.icns"
check_size "$DESKTOP_RES/icon.icns" "$ICNS_MAX" "icon.icns (macOS)"
check_transparent_corner "$ICONSET/icon_512x512@2x.png" "iconset 1024 corner alpha"

# --- icon.png (runtime, 1024, 圆角) ---
echo "[2/5] Runtime icon.png"
pngquant --quality 60-90 --strip --force --output "$DESKTOP_RES/icon.png" "$ICON_MAC"
oxipng -o max --strip safe --quiet "$DESKTOP_RES/icon.png" >/dev/null 2>&1 || true
check_size "$DESKTOP_RES/icon.png" "$ICON_PNG_MAX" "icon.png (runtime)"
check_transparent_corner "$DESKTOP_RES/icon.png" "icon.png corner alpha"

# --- icon.ico (Windows, multi-size, 圆角) ---
echo "[3/5] Windows icon.ico"
magick "$ICON_WIN" -define icon:auto-resize=16,24,32,48,64,128,256 "$DESKTOP_RES/icon.ico"
check_size "$DESKTOP_RES/icon.ico" "$ICO_MAX" "icon.ico (Windows)"
check_transparent_corner "$DESKTOP_RES/icon.ico[6]" "icon.ico 256 corner alpha"

# --- favicon.png (web, 直角, 64) ---
echo "[4/5] Web favicon"
magick "$SOURCE" -filter Lanczos -resize 64x64 "$TMP_DIR/favicon-64.png"
pngquant --quality 70-90 --strip --force --output "$WEB_ASSETS/favicon.png" "$TMP_DIR/favicon-64.png"
check_size "$WEB_ASSETS/favicon.png" "$FAVICON_MAX" "favicon.png (web)"

# --- yomitomo-logo.png (JSON-LD, 直角, 原尺寸) ---
echo "[5/5] JSON-LD logo"
magick "$SOURCE" "$TMP_DIR/logo.png"
pngquant --quality 60-90 --strip --force --output "$WEB_ASSETS/yomitomo-logo.png" "$TMP_DIR/logo.png"
oxipng -o max --strip safe --quiet "$WEB_ASSETS/yomitomo-logo.png" >/dev/null 2>&1 || true
check_size "$WEB_ASSETS/yomitomo-logo.png" "$LOGO_PNG_MAX" "yomitomo-logo.png (JSON-LD)"

# --- demo avatar (webp, 直角, 96) ---
AVATAR="$WEB_ASSETS/landing-avatars/common/yomitomo-96.webp"
cwebp -quiet -q 82 -m 6 -resize 96 96 "$TMP_DIR/logo.png" -o "$AVATAR"
check_size "$AVATAR" "$AVATAR_MAX" "yomitomo-96.webp (demo avatar)"

# --- cleanup temp ---
rm -rf "$TMP_DIR"

echo ""
echo "Done: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
