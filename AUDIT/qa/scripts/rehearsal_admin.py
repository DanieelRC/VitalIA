import json, re, time
from playwright.sync_api import sync_playwright
from common import *
import rest
STAMP = str(int(time.time())); amail, apw = f"qa-admin-{STAMP}@example.test", f"Qa-{STAMP}-adm9"
u = rest.call("POST", "/auth/v1/admin/users", {"email": amail, "password": apw, "email_confirm": True})
rest.call("PATCH", f"/rest/v1/profiles?id=eq.{u['id']}", {"role": "nutriologo"}, prefer="return=minimal")
rest.call("POST", "/rest/v1/platform_admins", {"user_id": u["id"]}, prefer="return=minimal")
try:
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, executable_path=CHROME)
        a = page_of(b); login(a, amail, apw)
        a.wait_for_url(re.compile(r"/(admin|admin-2fa|login\?error)"), timeout=180000); a.wait_for_load_state("networkidle")
        print(json.dumps({"admin_aterriza_en": a.url.replace(BASE, "")})); shot(a, "95-admin-solo-inicio"); b.close()
finally:
    rest.call("DELETE", f"/auth/v1/admin/users/{u['id']}")
