#!/usr/bin/env python3
"""สร้าง version.json จากไฟล์ในโฟลเดอร์นี้: python3 release.py "บันทึกการเปลี่ยนแปลงสั้นๆ" """
import hashlib, json, re, sys
from pathlib import Path
d = Path(__file__).resolve().parent
ver = re.search(r'APP_VERSION = "([\d.]+)"', (d / "app.py").read_text("utf-8")).group(1)
files = {n: hashlib.sha256((d / n).read_bytes()).hexdigest() for n in ("app.py", "ui.html", "icon.png")}
(d / "version.json").write_text(json.dumps({"version": ver, "notes": " ".join(sys.argv[1:]), "files": files},
                                           ensure_ascii=False, indent=2), "utf-8")
print("version.json ->", ver)
