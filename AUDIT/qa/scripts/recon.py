from playwright.sync_api import sync_playwright
from common import *
e = env(); out = []
def dump(page, label):
    page.wait_for_load_state("networkidle")
    els = page.locator("a[href], button, input, textarea, select").all()
    out.append(f"\n=== {label} {page.url}")
    for el in els[:80]:
        try:
            out.append(f"{el.evaluate('e=>e.tagName')} name={el.get_attribute('name')} type={el.get_attribute('type')} href={el.get_attribute('href')} text={el.inner_text()[:40]!r}")
        except Exception: pass
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME)
    pg = page_of(b); pg.goto(f"{BASE}/login"); dump(pg, "login")
    login(pg, e["DEV_PATIENT_EMAIL"], e["DEV_PATIENT_PASSWORD"]); dump(pg, "portal")
    for u in ["/portal/asistente", "/portal/archivos", "/portal/comidas", "/portal/citas", "/portal/mensajes"]:
        pg.goto(BASE + u); dump(pg, u)
    s = page_of(b)
    login(s, e["DEV_ADMIN_EMAIL"], e["DEV_ADMIN_PASSWORD"]); dump(s, "consultorio")
    s.goto(BASE + "/consultorio/pacientes"); dump(s, "pacientes")
    b.close()
(QA / "recon.txt").write_text("\n".join(out), encoding="utf-8")
print("ok", len(out))
