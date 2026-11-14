#!/bin/bash
# ติดตั้ง Sykhai Downloader เป็นแอป Mac (รันครั้งเดียว)
SRC="$(cd "$(dirname "$0")" && pwd)"
D="$HOME/Library/Application Support/SykhaiDownloader"
APP="$HOME/Applications/Sykhai Downloader.app"
mkdir -p "$D/bin" "$HOME/Applications"

if ! python3 -c "import sys" >/dev/null 2>&1; then
  echo "ยังไม่มี Python 3 — กำลังเปิดหน้าต่างติดตั้งของ Apple กดติดตั้ง แล้วรันไฟล์นี้อีกครั้ง"
  xcode-select --install
  exit 1
fi

cp "$SRC/app.py" "$SRC/ui.html" "$D/"
cd "$D" || exit 1

echo "[1/5] yt-dlp"
if [ ! -x bin/yt-dlp ]; then
  curl -L --fail -o bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" \
    && chmod +x bin/yt-dlp || { echo "โหลด yt-dlp ไม่สำเร็จ"; rm -f bin/yt-dlp; }
fi

echo "[2/5] deno"
if [ ! -x bin/deno ]; then
  if [ "$(uname -m)" = "arm64" ]; then DENO=deno-aarch64-apple-darwin.zip; else DENO=deno-x86_64-apple-darwin.zip; fi
  curl -L --fail -o bin/deno.zip "https://github.com/denoland/deno/releases/latest/download/$DENO" \
    && unzip -o -q bin/deno.zip -d bin && chmod +x bin/deno
  rm -f bin/deno.zip
fi

echo "[3/5] ตัวสร้างหน้าต่างแอป + ffmpeg"
[ -x venv/bin/python ] || python3 -m venv venv
venv/bin/pip install -q --upgrade pip >/dev/null 2>&1
venv/bin/pip install -q pywebview imageio-ffmpeg || echo "ติดตั้งส่วนเสริมไม่สำเร็จ (จะเปิดผ่าน Chrome แทน)"
if [ ! -x bin/ffmpeg ]; then
  if command -v ffmpeg >/dev/null 2>&1; then
    ln -sf "$(command -v ffmpeg)" bin/ffmpeg
  else
    FF="$(venv/bin/python -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())' 2>/dev/null)"
    [ -n "$FF" ] && ln -sf "$FF" bin/ffmpeg
  fi
fi
xattr -dr com.apple.quarantine bin >/dev/null 2>&1

echo "[4/5] สร้างแอป"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cat > "$APP/Contents/MacOS/SykhaiDownloader" <<'LAUNCH'
#!/bin/bash
D="$HOME/Library/Application Support/SykhaiDownloader"
cd "$D" || exit 1
"$D/bin/yt-dlp" -U >/dev/null 2>&1 &
exec "$D/venv/bin/python" "$D/app.py" --window >> "$D/log.txt" 2>&1
LAUNCH
chmod +x "$APP/Contents/MacOS/SykhaiDownloader"

if [ -f "$SRC/icon.png" ]; then
  IS="$(mktemp -d)/icon.iconset"; mkdir -p "$IS"
  for s in 16 32 64 128 256 512; do
    sips -z $s $s "$SRC/icon.png" --out "$IS/icon_${s}x${s}.png" >/dev/null 2>&1
    sips -z $((s*2)) $((s*2)) "$SRC/icon.png" --out "$IS/icon_${s}x${s}@2x.png" >/dev/null 2>&1
  done
  iconutil -c icns "$IS" -o "$APP/Contents/Resources/icon.icns" >/dev/null 2>&1
fi

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>SykhaiDownloader</string>
<key>CFBundleIdentifier</key><string>online.touktashop.sykhaidownloader</string>
<key>CFBundleName</key><string>Sykhai Downloader</string>
<key>CFBundleDisplayName</key><string>Sykhai Downloader</string>
<key>CFBundleIconFile</key><string>icon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.03</string>
<key>LSMinimumSystemVersion</key><string>10.15</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --deep -s - "$APP" >/dev/null 2>&1
touch "$APP"

echo "[5/5] เสร็จแล้ว — กำลังเปิดแอป"
open "$APP"
echo ""
echo "แอปอยู่ที่: $APP"
echo "ลากไอคอนไปวางที่ Dock ได้เลย แล้วลบโฟลเดอร์ที่โหลดมาทิ้งได้"
