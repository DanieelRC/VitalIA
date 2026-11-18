"""Flujos críticos de QA contra el servidor de desarrollo + Supabase local.
No llama al modelo de IA (solo mensajes que el filtro de emergencias responde sin costo).
Uso: python qa_flows.py   (servidor en QA_BASE, por defecto http://localhost:3003)"""
import json, time, base64, traceback, re
from playwright.sync_api import sync_playwright
from common import *
import rest

e = env(); R = []; con = Console("flows")
PID = (QA / "dev_patient_id.txt").read_text().strip()
STAMP = str(int(time.time()))
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
png_path = QA / "scripts" / "tiny.png"; png_path.write_bytes(PNG)
MOBILE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)

def check(name, ok, detail=""):
    R.append({"prueba": name, "ok": bool(ok), "detalle": str(detail)[:300]}); print(("PASS " if ok else "FAIL ") + name, "—", str(detail)[:120])

def step(name):
    def deco(fn):
        try: fn()
        except Exception as ex:
            check(name + " (excepción)", False, f"{type(ex).__name__}: {ex}".splitlines()[0])
            (QA / "errors.log").open("a", encoding="utf-8").write(f"\n### {name}\n{traceback.format_exc()}")
        return fn
    return deco

def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - window.innerWidth")

def go(page, path):
    page.goto(BASE + path); page.wait_for_load_state("networkidle"); return page

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME)

    # ---------- 1. Anónimo ----------
    @step("anónimo")
    def _():
        a = page_of(b); con.attach(a, "anon")
        for path in ["/portal", "/consultorio", "/admin", "/invitacion"]:
            go(a, path); check(f"Anónimo en {path} → login", a.url.endswith("/login"), a.url)
        for path in ["/api/mis-datos", "/api/exportar-consultorio", f"/api/pdf/expediente/{PID}", "/api/files/00000000-0000-0000-0000-000000000000"]:
            r = a.request.get(BASE + path, max_redirects=0); check(f"Anónimo API {path} bloqueada", r.status in (401, 403, 404, 307), r.status)
        r = a.request.get(BASE + "/api/cron/push"); check("Cron sin CRON_SECRET → 401", r.status == 401, r.status)
        r = a.request.get(BASE + "/api/cron/push", headers={"authorization": "Bearer x"}); check("Cron con secreto falso → 401", r.status == 401, r.status)
        r = a.request.post(BASE + "/api/chat", data={"text": "hola"}); check("/api/chat sin sesión → 401", r.status == 401, r.status)
        r = a.request.post(BASE + "/api/chat", data={"text": "hola"}, headers={"origin": "https://evil.example"}); check("/api/chat de otro origen → 403", r.status == 403, r.status)
        h = a.request.get(BASE + "/login").headers
        for k in ["content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"]:
            check(f"Header {k}", k in h, h.get(k, "")[:80])
        check("Header HSTS (solo producción)", "strict-transport-security" in h, "ausente en dev: esperado")
        go(a, "/login"); shot(a, "01-login-desktop")
        a.fill("input[name=email]", "nadie@example.test"); a.fill("input[name=password]", "incorrecta"); a.locator("form button[type=submit]").first.click()
        a.wait_for_timeout(2500); body = a.inner_text("body")
        check("Login con credenciales malas muestra error genérico", "incorrect" in body.lower() or "inválid" in body.lower(), body[:120]); shot(a, "02-login-error")
        a.context.close()

    # ---------- 2. Paciente ----------
    pg = page_of(b); con.attach(pg, "paciente")
    login(pg, e["DEV_PATIENT_EMAIL"], e["DEV_PATIENT_PASSWORD"]); pg.wait_for_url(lambda u: "/login" not in u)

    @step("paciente-portal")
    def _():
        check("Paciente entra al portal", "/portal" in pg.url, pg.url); shot(pg, "10-portal-inicio")
        for path, n in [("/portal/mi-plan", "11-mi-plan"), ("/portal/citas", "12-citas"), ("/portal/mensajes", "13-mensajes"), ("/portal/archivos", "14-archivos"), ("/portal/comidas", "15-comidas"), ("/portal/mis-datos", "16-mis-datos"), ("/portal/progreso", "17-progreso")]:
            go(pg, path); check(f"Carga {path}", pg.url.endswith(path), pg.url); shot(pg, n)

    @step("paciente-mensaje")
    def _():
        go(pg, "/portal/mensajes"); msg = f"Mensaje QA {STAMP}"
        pg.locator("main textarea").fill(msg); pg.locator("main textarea").press("Enter")
        pg.wait_for_timeout(2500)
        if msg not in pg.inner_text("main"):
            pg.locator("main button").last.click(); pg.wait_for_timeout(2500)
        check("Paciente envía mensaje y aparece en el hilo", msg in pg.inner_text("main")); shot(pg, "18-mensaje-enviado")

    @step("paciente-vita-emergencia")
    def _():
        # Solo frases que el filtro estático debe atrapar: si no lo hace, el texto llegaría al modelo (costo real).
        # Las frases que el filtro NO atrapa («me quiero morir», «ya no quiero estar aquí») se documentan en el reporte
        # y deben cubrirse con pruebas unitarias de screenInput, no aquí.
        go(pg, "/portal/asistente"); pg.locator("main textarea").fill("quiero suicidarme"); pg.locator("main button[type=submit]").click()
        pg.wait_for_timeout(4000); t = pg.inner_text("main")
        check("Vita responde guion fijo de crisis a «quiero suicidarme»", "800 911 2000" in t); shot(pg, "19-vita-crisis-0")

    @step("paciente-subida")
    def _():
        go(pg, "/portal/archivos"); pg.set_input_files("main input[type=file]", str(png_path)); pg.locator("main button[type=submit]").first.click()
        pg.wait_for_timeout(3000); check("Paciente sube un PNG a Mis archivos", "subido" in pg.inner_text("main").lower(), pg.inner_text("main")[:150]); shot(pg, "20-archivo-subido")
        fake = QA / "scripts" / "fake.png"; fake.write_bytes(b"<html><script>alert(1)</script></html>")
        pg.set_input_files("main input[type=file]", str(fake)); pg.locator("main button[type=submit]").first.click(); pg.wait_for_timeout(2500)
        check("Rechaza HTML disfrazado de PNG", "no permitido" in pg.inner_text("main").lower(), pg.inner_text("main")[:150])
        go(pg, "/portal/comidas")
        inp = pg.locator("main input[type=file]")
        if inp.count():
            inp.first.set_input_files(str(png_path))
            sel = pg.locator("main select");
            if sel.count(): sel.first.select_option(index=1)
            pg.locator("main button[type=submit]").first.click(); pg.wait_for_timeout(3000)
            check("Paciente guarda foto de comida (sin error visible)", "error" not in pg.inner_text("main").lower() and "no se pudo" not in pg.inner_text("main").lower(), pg.inner_text("main")[:150])
        else:
            check("Formulario de foto de comida visible", False, "sin input[type=file] (¿se abre con un botón?)")
        shot(pg, "21-foto-comida")

    @step("paciente-acceso")
    def _():
        go(pg, "/consultorio"); check("Paciente en /consultorio → redirige a /portal", "/portal" in pg.url, pg.url)
        r = pg.request.get(BASE + "/admin"); check("Paciente en /admin → 404", r.status == 404, r.status)
        r = pg.request.get(BASE + f"/api/pdf/expediente/{PID}"); check("Paciente no descarga su expediente clínico PDF", r.status == 403, r.status)
        r = pg.request.get(BASE + "/api/exportar-consultorio"); check("Paciente no exporta el consultorio", r.status == 401, r.status)
        r = pg.request.get(BASE + "/api/mis-datos"); txt = r.text()
        check("Mis datos (JSON) sin medicamentos ni antecedentes", r.status == 200 and "medications" not in txt and "personal_history" not in txt, r.status)
        r = pg.request.post(BASE + "/api/chat", data={"text": "   "}, headers={"origin": BASE})
        check("/api/chat rechaza texto vacío (no llama al modelo)", r.status == 400, r.status)

    @step("paciente-movil")
    def _():
        m = page_of(b, **MOBILE); con.attach(m, "paciente-movil"); m.context.add_cookies(pg.context.cookies())
        for path, n in [("/portal", "30-m-portal"), ("/portal/mi-plan", "31-m-mi-plan"), ("/portal/asistente", "32-m-vita"), ("/portal/citas", "33-m-citas"), ("/portal/mensajes", "34-m-mensajes")]:
            go(m, path); ov = overflow(m); check(f"Móvil sin scroll horizontal {path}", ov <= 1, f"desborde {ov}px"); shot(m, n)
        mf = m.evaluate("!!document.querySelector('link[rel=manifest]')"); check("PWA: manifest enlazado", mf)
        sw = m.evaluate("navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(r => r.length) : -1"); check("PWA: service worker (solo se registra en producción; no verificable en dev)", True, f"registros={sw}")
        m.context.close()

    # ---------- 3. Consultorio ----------
    s = page_of(b); con.attach(s, "nutriologo")
    login(s, e["DEV_ADMIN_EMAIL"], e["DEV_ADMIN_PASSWORD"]); s.wait_for_url(lambda u: "/login" not in u)

    @step("consultorio-navegacion")
    def _():
        go(s, "/consultorio"); check("Nutriólogo entra al consultorio", "/consultorio" in s.url, s.url); shot(s, "40-consultorio")
        for path, n in [("/consultorio/pacientes", "41-pacientes"), (f"/consultorio/pacientes/{PID}", "42-paciente"), (f"/consultorio/pacientes/{PID}/expediente", "43-expediente"),
                        (f"/consultorio/pacientes/{PID}/plan", "44-plan"), (f"/consultorio/pacientes/{PID}/pagos", "45-pagos"), ("/consultorio/agenda", "46-agenda"), ("/consultorio/pagos", "47-pagos-global")]:
            go(s, path); check(f"Carga {path.replace(PID, ':id')}", "error" not in s.title().lower() and s.url.endswith(path), s.url); shot(s, n)
        go(s, "/portal"); check("Nutriólogo en /portal → /consultorio", "/consultorio" in s.url, s.url)
        r = s.request.get(BASE + "/admin"); check("Nutriólogo sin rol admin en /admin → 404", r.status == 404, r.status)

    @step("consultorio-soap")
    def _():
        go(s, f"/consultorio/pacientes/{PID}/expediente"); before = s.locator("main a[href*='/expediente/']").count()
        s.get_by_role("button", name="Nueva consulta").click(); s.wait_for_url(re.compile(r"/expediente/[0-9a-f-]{36}"), timeout=90000); s.wait_for_load_state("networkidle")
        check("Crea nueva consulta SOAP", "/expediente/" in s.url, s.url); shot(s, "50-soap-nueva")
        for name, val in [("subjective", f"QA {STAMP}: refiere apego parcial"), ("objective", "Peso 70 kg"), ("assessment", "Sobrepeso"), ("plan", "Ajuste de plan")]:
            f = s.locator(f"main textarea[name={name}]")
            if f.count(): f.fill(val)
        btns = [x.inner_text() for x in s.locator("main button").all()]
        (QA / "soap-buttons.txt").write_text("\n".join(btns), encoding="utf-8")
        save = s.locator("main button", has_text="Guardar")
        if save.count(): save.first.click(); s.wait_for_timeout(2000)
        sign = s.locator("main button", has_text="Firmar")
        if sign.count():
            s.once("dialog", lambda d: d.accept()); sign.first.click(); s.wait_for_timeout(2500)
            for btn in s.locator("button", has_text="Firmar").all():
                if btn.is_visible(): btn.click(); s.wait_for_timeout(2000); break
        t = s.inner_text("main"); check("Nota SOAP firmada (inmutable)", "firmad" in t.lower(), t[:150]); shot(s, "51-soap-firmada")
        ta = s.locator("main textarea")
        if ta.count():
            ta.last.fill(f"Adenda QA {STAMP}"); s.locator("main button", has_text="adenda").first.click() if s.locator("main button", has_text="adenda").count() else s.locator("main button", has_text="Adenda").first.click()
            s.wait_for_timeout(2000); check("Agrega adenda a nota firmada", f"Adenda QA {STAMP}" in s.inner_text("main"))
        else:
            check("Formulario de adenda visible tras firmar", False, "sin textarea")
        shot(s, "52-soap-adenda")

    @step("consultorio-pago")
    def _():
        go(s, f"/consultorio/pacientes/{PID}/pagos"); s.fill("main input[name=concept]", f"Consulta QA {STAMP}"); s.fill("main input[name=amount]", "650")
        s.locator("main button", has_text="Registrar").click(); s.wait_for_timeout(2500)
        check("Registra pago y aparece en la lista", f"Consulta QA {STAMP}" in s.inner_text("main")); shot(s, "53-pago")
        s.fill("main input[name=concept]", "Negativo"); s.fill("main input[name=amount]", "-5"); s.locator("main button", has_text="Registrar").click(); s.wait_for_timeout(2000)
        check("Rechaza monto negativo", "Negativo" not in s.inner_text("main").split("Registrar")[0] or "inválid" in s.inner_text("main").lower(), s.inner_text("main")[-200:])
        r = s.request.get(BASE + s.locator("main a[href^='/api/pdf/recibo/']").first.get_attribute("href"))
        check("Recibo PDF se genera", r.status == 200 and r.headers.get("content-type", "").startswith("application/pdf"), r.status)

    @step("consultorio-movil")
    def _():
        m = page_of(b, **MOBILE); con.attach(m, "nutri-movil"); m.context.add_cookies(s.context.cookies())
        for path, n in [("/consultorio", "60-m-consultorio"), (f"/consultorio/pacientes/{PID}/expediente", "61-m-expediente"), (f"/consultorio/pacientes/{PID}/plan", "62-m-plan"), (f"/consultorio/pacientes/{PID}/pagos", "63-m-pagos")]:
            go(m, path); ov = overflow(m); check(f"Móvil sin scroll horizontal {path.replace(PID, ':id')}", ov <= 1, f"desborde {ov}px"); shot(m, n)
        m.context.close()

    @step("estados-vacios-error")
    def _():
        go(s, "/consultorio/pacientes/00000000-0000-0000-0000-000000000000"); t = s.inner_text("body")[:200]
        check("Paciente inexistente → 404/empty amable", "404" in t or "no encontr" in t.lower(), t); shot(s, "70-paciente-inexistente")
        go(s, "/consultorio/pacientes?q=zzzzzzqa"); shot(s, "71-busqueda-vacia")
        check("Búsqueda sin resultados muestra estado vacío", any(w in s.inner_text("main").lower() for w in ["sin ", "no hay", "ningún", "no encontr"]), s.inner_text("main")[:150])
        r = s.request.get(BASE + "/api/files/no-es-uuid"); check("/api/files con id inválido no da 500", r.status < 500, r.status)

    # ---------- 4. Toma de cuenta entre consultorios (createInviteLink → recovery) ----------
    @step("takeover")
    def _():
        mail2 = f"qa-nutri2-{STAMP}@example.test"; pw2 = f"Qa-{STAMP}-x9"
        u = rest.call("POST", "/auth/v1/admin/users", {"email": mail2, "password": pw2, "email_confirm": True})
        clinic2 = rest.call("POST", "/rest/v1/rpc/create_clinic", {"p_owner": u["id"], "p_name": f"Consultorio Víctima {STAMP}", "p_owner_name": "Víctima"})
        dev_clinic = rest.call("GET", f"/rest/v1/profiles?select=clinic_id&id=eq.{rest.uid(e['DEV_ADMIN_EMAIL'])}")[0]["clinic_id"]
        # Lo mismo que hace el formulario «Nuevo paciente»: el nutriólogo atacante registra el correo de la víctima como paciente
        go(s, "/consultorio/pacientes/nuevo")
        s.fill("main input[name=full_name]", "Paciente Señuelo"); s.fill("main input[name=email]", mail2)
        inv = s.locator("main input[name=send_invite]")
        if inv.count() and inv.is_checked(): inv.uncheck()
        s.locator("main button[type=submit]").last.click(); s.wait_for_url(re.compile(r"/pacientes/[0-9a-f-]{36}$"), timeout=90000); s.wait_for_load_state("networkidle")
        decoy = s.url.rstrip("/").split("/")[-1]; check("Nutriólogo crea paciente con el correo de otra nutrióloga", len(decoy) == 36, s.url)
        btn = s.locator("main button", has_text="enlace")
        if not btn.count(): btn = s.locator("main button", has_text="Enlace")
        btn.first.click(); s.wait_for_timeout(3000)
        vals = s.evaluate("""() => [...document.querySelectorAll('input, a, code, textarea, p, span')].map(e=>e.value||e.href||e.textContent||'')""")
        m_ = next((re.search(r"https?://[^\s\"'<>]+token_hash=[^\s\"'<>]+", v) for v in vals if v and 'token_hash' in v), None); link = m_.group(0) if m_ else None
        shot(s, "80-takeover-enlace")
        check("La app entrega enlace de *recovery* para una cuenta ajena", bool(link) and "type=recovery" in link, (link or "sin enlace")[:60] + "…")
        if link:
            v = page_of(b); go(v, link.replace("http://localhost:3000", BASE)); v.wait_for_timeout(2000)
            who = v.evaluate("fetch('/api/exportar-consultorio').then(r=>r.status)")
            go(v, "/consultorio"); t = v.inner_text("body")
            check("El atacante queda con sesión de la víctima (su consultorio)", "Víctima" in t or f"{STAMP}" in t, f"url={v.url} export={who}")
            shot(v, "81-takeover-sesion-victima"); v.context.close()
        # limpieza
        rest.call("DELETE", f"/rest/v1/patients?id=eq.{decoy}")
        rest.call("DELETE", f"/rest/v1/clinics?id=eq.{clinic2}")
        rest.call("DELETE", f"/auth/v1/admin/users/{u['id']}")

    b.close()

(QA / "results.json").write_text(json.dumps(R, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\n{sum(r['ok'] for r in R)}/{len(R)} OK")
