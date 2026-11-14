#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sykhai Downloader - โปรแกรมดาวน์โหลดไฟล์/วิดีโอ ใช้ส่วนตัว (macOS)
ใช้ Python มาตรฐานอย่างเดียว + yt-dlp / ffmpeg / deno ในโฟลเดอร์ bin/
"""
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
import uuid
import webbrowser
import atexit
import hashlib
import py_compile
import shutil
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_VERSION = "1.03"
PORT = 8765
BASE = Path(__file__).resolve().parent
BIN = BASE / "bin"
CONFIG = BASE / "config.json"
DEFAULT_DIR = Path.home() / "Downloads" / "SykhaiDownloader"
UPDATE_BASE = os.environ.get(
    "SYKHAI_UPDATE_BASE",
    "https://raw.githubusercontent.com/souliya8470/sykhai-editor/main/downloader/")
UPDATE_FILES = ("app.py", "ui.html", "icon.png")
MAX_ACTIVE = 3          # ดาวน์โหลดพร้อมกันสูงสุด
SEGMENTS = 8            # จำนวนส่วนที่แบ่งโหลดต่อไฟล์ (แบบ IDM)
MIN_SEGMENT_SIZE = 4 * 1024 * 1024
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")

QUALITIES = {
    "best": "bv*+ba/b",
    "2160": "bv*[height<=2160]+ba/b[height<=2160]/b",
    "1080": "bv*[height<=1080]+ba/b[height<=1080]/b",
    "720": "bv*[height<=720]+ba/b[height<=720]/b",
    "480": "bv*[height<=480]+ba/b[height<=480]/b",
    "audio": "ba/b",
}

jobs = {}
last_poll = [time.time()]
order = []
lock = threading.Lock()
slots = threading.Semaphore(MAX_ACTIVE)


# ---------- ตั้งค่า ----------
def get_cfg():
    try:
        return json.loads(CONFIG.read_text("utf-8"))
    except Exception:
        return {}


def set_cfg(**kw):
    c = get_cfg()
    c.update(kw)
    CONFIG.write_text(json.dumps(c, ensure_ascii=False), "utf-8")


BROWSERS = ("none", "chrome", "safari", "firefox", "edge", "brave")


def get_browser():
    b = get_cfg().get("browser")
    if b in BROWSERS:
        return b
    return "chrome" if os.path.exists("/Applications/Google Chrome.app") else "none"


def load_dir():
    try:
        d = Path(get_cfg()["dir"])
    except Exception:
        d = DEFAULT_DIR
    try:
        d.mkdir(parents=True, exist_ok=True)
    except Exception:
        d = DEFAULT_DIR
        d.mkdir(parents=True, exist_ok=True)
    return d


def save_dir(d):
    set_cfg(dir=str(d))


def tool(name):
    p = BIN / name
    return str(p) if p.exists() else None


# ---------- ตัวช่วย ----------
def clean_name(name):
    name = urllib.parse.unquote(name or "").strip()
    name = re.sub(r'[\x00-\x1f/\\:*?"<>|]', "_", name).strip(". ")
    return name[:180] or "download"


def unique_path(folder, name):
    p = folder / name
    stem, suf, i = p.stem, p.suffix, 1
    while p.exists() or p.with_name(p.name + ".part").exists():
        p = folder / f"{stem} ({i}){suf}"
        i += 1
    return p


def http_open(url, headers=None, timeout=30):
    h = {"User-Agent": UA}
    h.update(headers or {})
    return urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout)


def probe(url):
    """เช็กว่าลิงก์เป็นไฟล์ตรง ๆ หรือเป็นหน้าเว็บวิดีโอ"""
    try:
        with http_open(url, {"Range": "bytes=0-0"}, 15) as r:
            ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if (not ctype or ctype in ("text/html", "application/xhtml+xml")
                    or "mpegurl" in ctype or "dash+xml" in ctype):
                return None
            ranged = r.status == 206
            total = None
            m = re.search(r"/(\d+)\s*$", r.headers.get("Content-Range") or "")
            if ranged and m:
                total = int(m.group(1))
            elif not ranged and r.headers.get("Content-Length"):
                total = int(r.headers["Content-Length"])
            name = None
            cd = r.headers.get("Content-Disposition") or ""
            m = re.search(r"filename\*=(?:UTF-8'')?([^;]+)", cd, re.I)
            if m:
                name = m.group(1).strip('" ')
            else:
                m = re.search(r'filename="?([^";]+)"?', cd, re.I)
                if m:
                    name = m.group(1)
            final = r.geturl()
            if not name:
                name = os.path.basename(urllib.parse.urlparse(final).path)
            return {"url": final, "total": total, "ranged": ranged, "name": clean_name(name)}
    except Exception:
        return None


def upd(job, **kw):
    with lock:
        job.update(kw)


# ---------- โหลดไฟล์ตรงแบบแบ่งหลายส่วน ----------
def download_direct(job, info):
    folder = load_dir()
    target = unique_path(folder, info["name"])
    part = target.with_name(target.name + ".part")
    url, total = info["url"], info["total"]
    upd(job, title=target.name, size=total or 0, mode="ไฟล์ตรง")
    state = {"done": 0}
    errors = []
    cancel = job["cancel"]

    def add(n):
        with lock:
            state["done"] += n

    def seg(start, end):
        pos, tries = start, 0
        while pos <= end and not cancel.is_set():
            before = pos
            try:
                with http_open(url, {"Range": f"bytes={pos}-{end}"}) as r, open(part, "r+b") as f:
                    if r.status != 206:
                        raise IOError("เซิร์ฟเวอร์ไม่ยอมให้แบ่งส่วน")
                    f.seek(pos)
                    while not cancel.is_set():
                        chunk = r.read(262144)
                        if not chunk:
                            break
                        f.write(chunk)
                        pos += len(chunk)
                        add(len(chunk))
            except Exception as e:
                last = str(e)
            else:
                last = "การเชื่อมต่อหลุด"
            if pos <= end and not cancel.is_set():
                tries = 0 if pos > before else tries + 1
                if tries > 5:
                    errors.append(last)
                    return
                time.sleep(1.5)

    def single():
        try:
            with http_open(url) as r, open(part, "wb") as f:
                while not cancel.is_set():
                    chunk = r.read(262144)
                    if not chunk:
                        break
                    f.write(chunk)
                    add(len(chunk))
        except Exception as e:
            errors.append(str(e))

    threads = []
    if info["ranged"] and total and total >= MIN_SEGMENT_SIZE:
        with open(part, "wb") as f:
            f.truncate(total)
        size = total // SEGMENTS
        for i in range(SEGMENTS):
            a = i * size
            b = total - 1 if i == SEGMENTS - 1 else (i + 1) * size - 1
            threads.append(threading.Thread(target=seg, args=(a, b), daemon=True))
        upd(job, mode=f"ไฟล์ตรง · {SEGMENTS} ส่วน")
    else:
        threads.append(threading.Thread(target=single, daemon=True))
    for t in threads:
        t.start()

    last_done, last_t = 0, time.time()
    while any(t.is_alive() for t in threads):
        time.sleep(0.5)
        now = time.time()
        done = state["done"]
        speed = (done - last_done) / max(now - last_t, 0.001)
        last_done, last_t = done, now
        eta = int((total - done) / speed) if total and speed > 0 else None
        upd(job, downloaded=done, speed=speed, eta=eta,
            percent=(done * 100.0 / total) if total else 0)

    if cancel.is_set():
        part.unlink(missing_ok=True)
        return upd(job, status="cancelled", speed=0, eta=None)
    if errors or (total and state["done"] < total):
        part.unlink(missing_ok=True)
        return upd(job, status="error", speed=0, eta=None,
                   error=errors[0] if errors else "ไฟล์โหลดมาไม่ครบ")
    part.rename(target)
    upd(job, status="done", percent=100, speed=0, eta=None, file=str(target),
        downloaded=state["done"], size=total or state["done"])


# ---------- โหลดวิดีโอผ่าน yt-dlp ----------
def num(s):
    try:
        return float(s)
    except Exception:
        return None


def download_video(job):
    ytdlp = tool("yt-dlp")
    if not ytdlp:
        return upd(job, status="error", error="ไม่พบ yt-dlp ในโฟลเดอร์ bin (เปิดด้วย start.command ใหม่)")
    folder = load_dir()
    q = job["quality"]
    cmd = [ytdlp, "--no-playlist", "--no-warnings", "--newline", "--progress",
           "--progress-template",
           "download:PRG|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|"
           "%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s",
           "--print", "before_dl:TTL|%(title)s",
           "--print", "after_move:FIL|%(filepath)s",
           "-f", QUALITIES.get(q, QUALITIES["best"]),
           "-N", "4", "--retries", "10", "--fragment-retries", "10",
           "-o", str(folder / "%(title).150B [%(id)s].%(ext)s")]
    b = get_browser()
    if b != "none":
        cmd += ["--cookies-from-browser", b]
    if tool("ffmpeg"):
        cmd += ["--ffmpeg-location", str(BIN)]
    if q == "audio":
        cmd += ["-x", "--audio-format", "mp3", "--audio-quality", "192K"]
    else:
        cmd += ["-S", "res,vcodec:h264,acodec:m4a", "--merge-output-format", "mp4"]
    cmd.append(job["url"])
    env = dict(os.environ)
    env["PATH"] = str(BIN) + os.pathsep + env.get("PATH", "")
    env["PYTHONIOENCODING"] = "utf-8"
    upd(job, mode="วิดีโอ")
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, encoding="utf-8", errors="replace", env=env)
    except Exception as e:
        return upd(job, status="error", error=str(e))
    upd(job, proc=proc)
    err = ""
    for line in proc.stdout:
        line = line.strip()
        if line.startswith("PRG|"):
            p = line.split("|")
            if len(p) >= 6:
                done = num(p[1]) or 0
                total = num(p[2]) or num(p[3]) or 0
                upd(job, downloaded=done, size=total, speed=num(p[4]) or 0,
                    eta=int(num(p[5])) if num(p[5]) is not None else None,
                    percent=min(done * 100.0 / total, 100) if total else 0)
        elif line.startswith("TTL|"):
            upd(job, title=line[4:])
        elif line.startswith("FIL|"):
            upd(job, file=line[4:])
        elif line.startswith("ERROR:"):
            err = line[6:].strip()
    code = proc.wait()
    upd(job, proc=None, speed=0, eta=None)
    if job["cancel"].is_set():
        return upd(job, status="cancelled")
    if code != 0:
        msg = err or f"yt-dlp จบด้วยรหัส {code}"
        if "Sign in to confirm" in msg:
            msg = ("YouTube ขอให้ยืนยันตัวตน — เลือกเบราว์เซอร์ที่ล็อกอิน YouTube ไว้ "
                   "ในช่อง 'ใช้ล็อกอินจาก' ด้านบน แล้วลองใหม่ | " + msg)
        elif "cookies" in msg.lower() and ("could not" in msg.lower() or "permission" in msg.lower()):
            msg = ("อ่านล็อกอินจากเบราว์เซอร์ไม่ได้ (ถ้าเป็น Safari ต้องให้สิทธิ์ Full Disk Access "
                   "กับ Terminal/แอป) | " + msg)
        return upd(job, status="error", error=msg)
    upd(job, status="done", percent=100)


def run_job(job):
    with slots:
        if job["cancel"].is_set():
            return upd(job, status="cancelled")
        upd(job, status="running")
        try:
            info = probe(job["url"])
            if job["cancel"].is_set():
                return upd(job, status="cancelled")
            if info:
                download_direct(job, info)
            else:
                download_video(job)
        except Exception as e:
            upd(job, status="error", error=str(e))


def add_job(url, quality):
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "url": url, "title": url, "quality": quality, "status": "queued",
           "percent": 0, "speed": 0, "eta": None, "size": 0, "downloaded": 0,
           "file": None, "error": None, "mode": "", "cancel": threading.Event(), "proc": None}
    with lock:
        jobs[jid] = job
        order.append(jid)
    threading.Thread(target=run_job, args=(job,), daemon=True).start()


def public(job):
    return {k: v for k, v in job.items() if k not in ("cancel", "proc")}


def choose_folder():
    try:
        out = subprocess.run(
            ["osascript", "-e",
             'POSIX path of (choose folder with prompt "เลือกโฟลเดอร์เก็บไฟล์")'],
            capture_output=True, text=True, timeout=300)
        p = out.stdout.strip()
        if p and Path(p).is_dir():
            save_dir(Path(p))
            return True
    except Exception:
        pass
    return False


# ---------- อัปเดตตัวเอง ----------
def vtuple(v):
    try:
        return tuple(int(x) for x in str(v).split("."))
    except Exception:
        return (0,)


def fetch_url(name, timeout=30):
    with http_open(UPDATE_BASE + name + "?t=" + str(int(time.time())), timeout=timeout) as r:
        return r.read()


def update_check():
    try:
        m = json.loads(fetch_url("version.json", 15).decode("utf-8"))
        latest = str(m.get("version"))
    except Exception as e:
        return {"ok": False, "error": "เช็กอัปเดตไม่ได้: " + str(e)}
    return {"ok": True, "current": APP_VERSION, "latest": latest,
            "available": vtuple(latest) > vtuple(APP_VERSION), "notes": m.get("notes", "")}


def active_jobs():
    with lock:
        return any(j["status"] in ("queued", "running") for j in jobs.values())


def restart_soon():
    def go():
        time.sleep(1)
        cleanup()
        args = [sys.executable, str(Path(__file__).resolve())] + sys.argv[1:]
        subprocess.Popen(["/bin/sh", "-c", 'sleep 2; exec "$@"', "sh"] + args,
                         cwd=str(BASE), start_new_session=True)
        os._exit(0)
    threading.Thread(target=go, daemon=True).start()


def update_apply():
    if active_jobs():
        return {"ok": False, "error": "มีงานกำลังโหลดอยู่ รอให้เสร็จหรือกดยกเลิกก่อน"}
    tmp = BASE / "update_tmp"
    try:
        m = json.loads(fetch_url("version.json", 15).decode("utf-8"))
        if vtuple(m["version"]) <= vtuple(APP_VERSION):
            return {"ok": False, "error": "เป็นเวอร์ชันล่าสุดแล้ว"}
        shutil.rmtree(tmp, ignore_errors=True)
        tmp.mkdir()
        files = m["files"]
        for name, sha in files.items():
            if name not in UPDATE_FILES:
                return {"ok": False, "error": "ไฟล์อัปเดตไม่ถูกต้อง: " + name}
            data = fetch_url(name, 120)
            if hashlib.sha256(data).hexdigest() != sha:
                return {"ok": False, "error": "ไฟล์โหลดมาไม่ครบ ลองใหม่อีกครั้ง"}
            (tmp / name).write_bytes(data)
        if "app.py" in files:
            py_compile.compile(str(tmp / "app.py"), cfile=str(tmp / "check.pyc"), doraise=True)
        backup = BASE / "backup" / APP_VERSION
        backup.mkdir(parents=True, exist_ok=True)
        for name in files:
            if (BASE / name).exists():
                shutil.copy2(BASE / name, backup / name)
        for name in files:
            os.replace(tmp / name, BASE / name)
        shutil.rmtree(tmp, ignore_errors=True)
    except Exception as e:
        shutil.rmtree(tmp, ignore_errors=True)
        return {"ok": False, "error": "อัปเดตไม่สำเร็จ: " + str(e)}
    restart_soon()
    return {"ok": True, "version": str(m["version"])}


# ---------- เว็บเซิร์ฟเวอร์ในเครื่อง ----------
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def allowed(self):
        ok = (f"127.0.0.1:{PORT}", f"localhost:{PORT}")
        if self.headers.get("Host") not in ok:
            return False
        origin = self.headers.get("Origin")
        return origin is None or origin in tuple("http://" + h for h in ok)

    def do_GET(self):
        if not self.allowed():
            return self.send_json({"error": "forbidden"}, 403)
        if self.path == "/api/jobs":
            last_poll[0] = time.time()
            with lock:
                data = [public(jobs[i]) for i in order]
            return self.send_json({"jobs": data, "dir": str(load_dir()), "version": APP_VERSION,
                                   "browser": get_browser(),
                                   "ready": bool(tool("yt-dlp"))})
        if self.path == "/api/update-check":
            return self.send_json(update_check())
        if self.path in ("/", "/index.html"):
            body = (BASE / "ui.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return self.wfile.write(body)
        self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        if not self.allowed() or "application/json" not in (self.headers.get("Content-Type") or ""):
            return self.send_json({"error": "forbidden"}, 403)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            data = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return self.send_json({"error": "bad request"}, 400)
        p = self.path
        if p == "/api/add":
            q = data.get("quality") if data.get("quality") in QUALITIES else "best"
            count = 0
            for u in data.get("urls") or []:
                u = str(u).strip()
                if re.match(r"^https?://", u, re.I):
                    add_job(u, q)
                    count += 1
            return self.send_json({"added": count})
        if p == "/api/cancel":
            job = jobs.get(data.get("id"))
            if job and job["status"] in ("queued", "running"):
                job["cancel"].set()
                proc = job.get("proc")
                if proc:
                    try:
                        proc.terminate()
                    except Exception:
                        pass
            return self.send_json({"ok": True})
        if p == "/api/clear":
            with lock:
                for i in list(order):
                    if jobs[i]["status"] in ("done", "error", "cancelled"):
                        order.remove(i)
                        jobs.pop(i)
            return self.send_json({"ok": True})
        if p == "/api/reveal":
            job = jobs.get(data.get("id"))
            f = job and job.get("file")
            if f and os.path.exists(f):
                subprocess.Popen(["open", "-R", f])
            else:
                subprocess.Popen(["open", str(load_dir())])
            return self.send_json({"ok": True})
        if p == "/api/update-apply":
            return self.send_json(update_apply())
        if p == "/api/browser":
            if data.get("browser") in BROWSERS:
                set_cfg(browser=data["browser"])
            return self.send_json({"browser": get_browser()})
        if p == "/api/folder":
            return self.send_json({"ok": choose_folder(), "dir": str(load_dir())})
        self.send_json({"error": "not found"}, 404)


def cleanup():
    for job in list(jobs.values()):
        job["cancel"].set()
        proc = job.get("proc")
        if proc:
            try:
                proc.terminate()
            except Exception:
                pass


def open_window(url, server=None):
    """เปิดเป็นหน้าต่างแอปของตัวเอง (ไม่มีแถบ URL)"""
    try:
        import webview
        webview.create_window("Sykhai Downloader", url, width=940, height=760,
                              min_size=(640, 480))
        webview.start()  # รอจนกว่าจะปิดหน้าต่าง
        return
    except Exception as e:
        print("เปิดหน้าต่างแบบ native ไม่ได้:", e)
    chrome = "/Applications/Google Chrome.app"
    if os.path.exists(chrome):
        subprocess.Popen(["open", "-na", "Google Chrome", "--args", f"--app={url}",
                          "--user-data-dir=" + str(BASE / "chrome-profile"),
                          "--window-size=940,760"])
        if server is None:
            return
        while True:  # ปิดโปรแกรมเองเมื่อปิดหน้าต่างและไม่มีงานค้าง
            time.sleep(10)
            with lock:
                active = any(j["status"] in ("queued", "running") for j in jobs.values())
            if not active and time.time() - last_poll[0] > 150:
                return
    webbrowser.open(url)
    if server is not None:
        while True:
            time.sleep(3600)


def main():
    url = f"http://127.0.0.1:{PORT}/"
    window = "--window" in sys.argv
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        print("โปรแกรมเปิดอยู่แล้ว กำลังเปิดหน้าจอให้...")
        if window:
            open_window(url)
        else:
            webbrowser.open(url)
        return
    server.daemon_threads = True
    load_dir()
    atexit.register(cleanup)
    print(f"Sykhai Downloader v{APP_VERSION} ทำงานที่ {url}")
    threading.Thread(target=server.serve_forever, daemon=True).start()
    if window:
        open_window(url, server)
        return
    print("ปิดหน้าต่างนี้ = ปิดโปรแกรม")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
