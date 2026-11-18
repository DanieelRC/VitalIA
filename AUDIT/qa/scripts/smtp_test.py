"""Registro de un consultorio de prueba contra un SMTP local: el correo de confirmación debe salir por SMTP. Limpia al final."""
import json, re, time, pathlib, sys
from playwright.sync_api import sync_playwright
from common import *
import rest
STAMP = str(int(time.time())); mail = f"qa-smtp-{STAMP}@example.test"; out = pathlib.Path(sys.argv[1])
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME)
    r = page_of(b); r.goto(BASE + "/registro"); r.wait_for_load_state("networkidle")
    r.fill("input[name=full_name]", "Nutrióloga SMTP QA"); r.fill("input[name=clinic]", "Consultorio SMTP QA"); r.fill("input[name=email]", mail); r.fill("input[name=password]", f"Qa-{STAMP}-x9")
    r.locator("input[name=terms]").check(); r.locator("form button[type=submit]").last.click()
    r.wait_for_url(re.compile("/registro/confirma"), timeout=180000); b.close()
time.sleep(2)
got = [json.loads(l) for l in out.read_text(encoding="utf-8").splitlines()] if out.exists() else []
print(json.dumps([g for g in got if mail in g["to"]], ensure_ascii=False))
uid = rest.uid(mail); cid = rest.call("GET", f"/rest/v1/profiles?select=clinic_id&id=eq.{uid}")[0]["clinic_id"]
rest.call("DELETE", f"/rest/v1/clinics?id=eq.{cid}"); rest.call("DELETE", f"/auth/v1/admin/users/{uid}")
