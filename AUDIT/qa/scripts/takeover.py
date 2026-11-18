"""Prueba de toma de cuenta entre consultorios vía «Enlace de invitación» (createInviteLink → recovery). Solo local."""
import json, re, time
from playwright.sync_api import sync_playwright
from common import *
import rest
e = env(); STAMP = str(int(time.time())); res = {}
mail2 = f"qa-victima-{STAMP}@example.test"; pw2 = f"Qa-{STAMP}-x9"
u = rest.call("POST", "/auth/v1/admin/users", {"email": mail2, "password": pw2, "email_confirm": True})
clinic2 = rest.call("POST", "/rest/v1/rpc/create_clinic", {"p_owner": u["id"], "p_name": f"Consultorio Victima {STAMP}", "p_owner_name": "Victima"})
rest.call("POST", "/rest/v1/patients", {"full_name": f"Secreto de la victima {STAMP}", "email": f"pac-victima-{STAMP}@example.test", "clinic_id": clinic2})
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME)
    s = page_of(b); login(s, e["DEV_ADMIN_EMAIL"], e["DEV_ADMIN_PASSWORD"]); s.wait_for_url(lambda x: "/login" not in x)
    s.goto(f"{BASE}/consultorio/pacientes/nuevo"); s.wait_for_load_state("networkidle")
    s.fill("main input[name=full_name]", "Paciente Senuelo"); s.fill("main input[name=email]", mail2)
    inv = s.locator("main input[name=send_invite]")
    if inv.count() and inv.is_checked(): inv.uncheck()
    s.locator("main button[type=submit]").last.click(); s.wait_for_url(re.compile(r"/pacientes/[0-9a-f-]{36}$"), timeout=90000); s.wait_for_load_state("networkidle")
    decoy = s.url.split("/")[-1]
    s.locator("main button", has_text=re.compile("enlace", re.I)).first.click(); s.wait_for_timeout(4000)
    html = s.content(); m = re.search(r"https?://[^\s\"'<>]*token_hash=[^\s\"'<>]+", html)
    link = m.group(0).replace("&amp;", "&") if m else None
    res["enlace_tipo"] = re.search(r"type=(\w+)", link).group(1) if link else None
    res["mensaje"] = None if link else s.inner_text("main")[:2000]
    res["mensaje"] = next((l for l in (res["mensaje"] or "").splitlines() if "pertenece" in l or "activó" in l or "No se pudo" in l), None)
    shot(s, "82-takeover-bloqueado")
    shot(s, "80-takeover-enlace")
    if link:
        v = page_of(b); v.goto(link.replace("http://localhost:3000", BASE)); v.wait_for_load_state("networkidle")
        res["aterriza_en"] = v.url.replace(BASE, "")
        v.goto(BASE + "/consultorio/pacientes"); v.wait_for_load_state("networkidle")
        body = v.inner_text("body"); res["ve_pacientes_de_la_victima"] = f"Secreto de la victima {STAMP}" in body
        res["url_final"] = v.url.replace(BASE, ""); shot(v, "81-takeover-sesion-victima")
    legit_mail = f"qa-legit-{STAMP}@example.test"
    s.goto(f"{BASE}/consultorio/pacientes/nuevo"); s.wait_for_load_state("networkidle")
    s.fill("main input[name=full_name]", "Paciente Legitimo"); s.fill("main input[name=email]", legit_mail)
    inv = s.locator("main input[name=send_invite]")
    if inv.count() and inv.is_checked(): inv.uncheck()
    s.locator("main button[type=submit]").last.click(); s.wait_for_url(re.compile(r"/pacientes/[0-9a-f-]{36}$"), timeout=90000); s.wait_for_load_state("networkidle")
    legit = s.url.split("/")[-1]; kinds = []
    for i in range(2):
        s.locator("main button", has_text=re.compile("enlace", re.I)).first.click(); s.wait_for_timeout(4000)
        mm = re.search(r"token_hash=[^\s\"'<>]+?type=(\w+)|type=(invite|recovery)", s.content())
        kinds.append((mm.group(1) or mm.group(2)) if mm else "ERROR: " + " | ".join(a.inner_text() for a in s.locator("main [role=alert], main .text-danger, main div").filter(has_text=re.compile("enlace|correo|cuenta", re.I)).all()[-1:]))
        shot(s, f"83-legitimo-enlace-{i}")
        res.setdefault("estado_tarjeta", []).append(s.locator("main").get_by_text(re.compile("Invitación enviada|Aún no se ha invitado|Cuenta activa")).first.inner_text())
        s.reload(); s.wait_for_load_state("networkidle")
    res["legitimo_tipos"] = kinds
    b.close()
lu = rest.uid(legit_mail)
rest.call("DELETE", f"/rest/v1/patients?id=eq.{legit}")
if lu: rest.call("DELETE", f"/auth/v1/admin/users/{lu}")
rest.call("DELETE", f"/rest/v1/patients?id=eq.{decoy}")
rest.call("DELETE", f"/rest/v1/patients?clinic_id=eq.{clinic2}")
rest.call("DELETE", f"/rest/v1/clinics?id=eq.{clinic2}")
rest.call("DELETE", f"/auth/v1/admin/users/{u['id']}")
(QA / "takeover-after-fix.json").write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8"); print(res)
