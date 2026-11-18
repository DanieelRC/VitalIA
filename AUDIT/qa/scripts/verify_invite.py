"""Invitación de punta a punta con una vista previa automática (HEAD) que abre el enlace antes que el paciente.
Crea un consultorio, un nutriólogo y un paciente de prueba en Supabase LOCAL y los borra al final."""
import json, re, time, urllib.request
from playwright.sync_api import sync_playwright
from common import *
import rest
S = str(int(time.time())); res = {}
nmail, npw = f"qa-nutri-{S}@example.test", f"Qa-{S}-nut9"; pmail, ppw = f"qa-pac-{S}@example.test", f"Qa-{S}-pac9"
nu = rest.call("POST", "/auth/v1/admin/users", {"email": nmail, "password": npw, "email_confirm": True})
cid = rest.call("POST", "/rest/v1/rpc/create_clinic", {"p_owner": nu["id"], "p_name": f"Consultorio QA {S}", "p_owner_name": "Nutri QA"})
def card(page):
    page.reload(); page.wait_for_load_state("networkidle")
    return page.locator("main").get_by_text(re.compile("Cuenta activa|todavía no entra|Aún no se ha invitado|Invitación enviada")).first.inner_text()
try:
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, executable_path=CHROME)
        s = page_of(b); login(s, nmail, npw); s.wait_for_url(re.compile("/consultorio"), timeout=180000)
        s.goto(BASE + "/consultorio/pacientes/nuevo"); s.wait_for_load_state("networkidle")
        s.fill("main input[name=full_name]", "Paciente Invitado QA"); s.fill("main input[name=email]", pmail)
        inv = s.locator("main input[name=send_invite]")
        if inv.count() and inv.is_checked(): inv.uncheck()
        s.locator("main button[type=submit]").last.click(); s.wait_for_url(re.compile(r"/pacientes/[0-9a-f-]{36}$"), timeout=120000); s.wait_for_load_state("networkidle")
        s.locator("main button", has_text=re.compile("enlace", re.I)).first.click(); s.wait_for_timeout(4000)
        link = re.search(r"https?://[^\s\"'<>]*token_hash=[^\s\"'<>]+", s.content()).group(0).replace("&amp;", "&")
        link = re.sub(r"^https?://[^/]+", BASE, link)
        print("ENLACE", re.sub(r"token_hash=[^&]+", "token_hash=<…>", link), flush=True)
        # 1) Vista previa automática del cliente de correo (HEAD y GET sin cookies)
        for m in ("HEAD", "GET"):
            with urllib.request.urlopen(urllib.request.Request(link, method=m)) as r: res[f"vista_previa_{m}"] = r.status
        res["tarjeta_tras_vista_previa"] = card(s)
        # 2) El paciente abre el enlace: ve el botón y continúa
        pt = page_of(b, viewport={"width": 390, "height": 844}); pt.goto(link); pt.wait_for_load_state("networkidle"); shot(pt, "96-confirmar-invitacion")
        pt.locator("form button[type=submit]").click(); pt.wait_for_url(re.compile("/invitacion|/login"), timeout=120000)
        res["tras_continuar"] = pt.url.replace(BASE, "")
        if "/invitacion" in pt.url:
            pt.wait_for_load_state("networkidle"); res["tarjeta_antes_de_contraseña"] = card(s)
            pt.fill("input[name=password]", ppw); pt.fill("input[name=confirm]", ppw)
            if pt.locator("input[name=privacy]").count(): pt.locator("input[name=privacy]").check()
            pt.locator("form button[type=submit]").last.click(); pt.wait_for_url(re.compile("/portal"), timeout=120000)
            res["paciente_entra_a"] = pt.url.replace(BASE, ""); res["tarjeta_final"] = card(s)
        # 3) Reabrir el mismo enlace: ya usado
        pt2 = page_of(b); pt2.goto(link); pt2.wait_for_load_state("networkidle"); pt2.locator("form button[type=submit]").click()
        pt2.wait_for_url(re.compile("/login|/invitacion|/portal"), timeout=120000); res["reusar_enlace"] = pt2.url.replace(BASE, "")
        b.close()
finally:
    pu = rest.uid(pmail)
    rest.call("DELETE", f"/rest/v1/clinics?id=eq.{cid}")
    for x in (pu, nu["id"]):
        if x: rest.call("DELETE", f"/auth/v1/admin/users/{x}")
print(json.dumps(res, ensure_ascii=False, indent=1))
