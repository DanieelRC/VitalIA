from playwright.sync_api import sync_playwright
from common import *; import rest
e = env(); out = []
pid = rest.call("GET", f"/rest/v1/patients?select=id&user_id=eq.{rest.uid(e['DEV_PATIENT_EMAIL'])}")[0]["id"]
(QA / "dev_patient_id.txt").write_text(pid)
def dump(page, label):
    page.wait_for_load_state("networkidle")
    out.append(f"\n=== {label} {page.url}")
    for el in page.locator("main a[href], main button, main input, main textarea, main select").all()[:70]:
        try: out.append(f"{el.evaluate('e=>e.tagName')} name={el.get_attribute('name')} type={el.get_attribute('type')} href={el.get_attribute('href')} text={el.inner_text()[:50]!r}")
        except Exception: pass
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME)
    s = page_of(b); login(s, e["DEV_ADMIN_EMAIL"], e["DEV_ADMIN_PASSWORD"]); s.wait_for_url(lambda u: "/login" not in u)
    for u in ["", "/expediente", "/plan", "/pagos"]:
        s.goto(f"{BASE}/consultorio/pacientes/{pid}{u}"); dump(s, u or "detalle")
    pg = page_of(b); login(pg, e["DEV_PATIENT_EMAIL"], e["DEV_PATIENT_PASSWORD"]); pg.wait_for_url(lambda u: "/login" not in u)
    pg.goto(BASE + "/portal/asistente"); dump(pg, "asistente")
    b.close()
(QA / "recon2.txt").write_text("\n".join(out), encoding="utf-8"); print("ok")
