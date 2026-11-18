"""Ensayo del estado de producción en local: cuenta solo-admin y alta de un consultorio nuevo. Crea y borra sus cuentas."""
import json, re, time
from playwright.sync_api import sync_playwright
from common import *
import rest
STAMP = str(int(time.time())); res = {}
amail, apw = f"qa-admin-{STAMP}@example.test", f"Qa-{STAMP}-adm9"
u = rest.call("POST", "/auth/v1/admin/users", {"email": amail, "password": apw, "email_confirm": True})
rest.call("PATCH", f"/rest/v1/profiles?id=eq.{u['id']}", {"role": "nutriologo"}, prefer="return=minimal")
rest.call("POST", "/rest/v1/platform_admins", {"user_id": u["id"]}, prefer="return=minimal")
nmail, npw = f"qa-nueva-{STAMP}@example.test", f"Qa-{STAMP}-nva9"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME)
    a = page_of(b); login(a, amail, apw); a.wait_for_url(lambda x: "/login" not in x or "error" in x, timeout=120000); a.wait_for_load_state("networkidle")
    res["admin_aterriza_en"] = a.url.replace(BASE, ""); shot(a, "95-admin-solo-inicio")
    r = page_of(b); r.goto(BASE + "/registro"); r.wait_for_load_state("networkidle")
    r.fill("input[name=full_name]", "Nutrióloga Nueva QA"); r.fill("input[name=clinic]", "Consultorio QA"); r.fill("input[name=email]", nmail); r.fill("input[name=password]", npw)
    r.locator("input[name=terms]").check(); r.locator("form button[type=submit]").last.click()
    r.wait_for_url(re.compile("/registro/confirma"), timeout=120000); res["registro"] = "ok"
    b.close()
nid = rest.uid(nmail)
prof = rest.call("GET", f"/rest/v1/profiles?select=role,clinic_id&id=eq.{nid}")[0]
cid = prof["clinic_id"]
res["consultorio_nuevo"] = {
  "rol": prof["role"],
  "grupos": len(rest.call("GET", f"/rest/v1/equivalent_groups?select=id&clinic_id=eq.{cid}")),
  "horarios": len(rest.call("GET", f"/rest/v1/availability?select=id&clinic_id=eq.{cid}")),
  "material": len(rest.call("GET", f"/rest/v1/education_materials?select=id&clinic_id=eq.{cid}")),
  "ajustes_ia": len(rest.call("GET", f"/rest/v1/ai_settings?select=clinic_id&clinic_id=eq.{cid}")),
  "estado": rest.call("GET", f"/rest/v1/clinics?select=status,plan&id=eq.{cid}")[0],
}
# limpieza
rest.call("DELETE", f"/rest/v1/clinics?id=eq.{cid}")
for x in (nid, u["id"]): rest.call("DELETE", f"/auth/v1/admin/users/{x}")
res["restantes"] = [x["email"] for x in rest.users()]
(QA / "rehearsal-result.json").write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8"); print(json.dumps(res, ensure_ascii=False))
