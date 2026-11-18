"""Utilidades de QA. Lee credenciales de prueba de .env.local sin imprimirlas."""
import os, json, re, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3]
QA = ROOT / "AUDIT" / "qa"
SHOTS = QA / "screens"
BASE = os.environ.get("QA_BASE", "http://localhost:3003")
CHROME = str(pathlib.Path.home() / "AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe")

def env():
    e = {}
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m: e[m.group(1)] = m.group(2).strip().strip('"')
    assert "127.0.0.1" in e["NEXT_PUBLIC_SUPABASE_URL"] or "localhost" in e["NEXT_PUBLIC_SUPABASE_URL"], "solo Supabase local"
    return e

class Console:
    def __init__(self, name):
        self.f = open(QA / f"console-{name}.log", "a", encoding="utf-8")
    def attach(self, page, tag):
        page.on("console", lambda m: self.f.write(f"[{tag}] {m.type}: {m.text}\n") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: self.f.write(f"[{tag}] pageerror: {e}\n"))
        page.on("response", lambda r: self.f.write(f"[{tag}] HTTP {r.status} {r.url}\n") if r.status >= 400 else None)

def login(page, email, pw):
    page.goto(f"{BASE}/login"); page.wait_for_load_state("networkidle")
    page.fill("input[name=email]", email); page.fill("input[name=password]", pw)
    page.locator("form button[type=submit]").first.click()
    page.wait_for_load_state("networkidle"); page.wait_for_timeout(800)

def shot(page, name, full=True):
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=full)

def page_of(browser, **kw):
    ctx = browser.new_context(**kw)
    ctx.set_default_timeout(120000); ctx.set_default_navigation_timeout(180000)
    return ctx.new_page()
