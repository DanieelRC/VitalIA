"""Acceso REST a Supabase LOCAL con service role (solo para preparar datos de prueba)."""
import json, urllib.request
from common import env
E = env(); URL = E["NEXT_PUBLIC_SUPABASE_URL"]; KEY = E["SUPABASE_SERVICE_ROLE_KEY"]
def call(method, path, body=None, prefer="return=representation"):
    req = urllib.request.Request(URL + path, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Prefer": prefer})
    try:
        with urllib.request.urlopen(req) as r: t = r.read().decode(); return json.loads(t) if t else None
    except urllib.error.HTTPError as e: return {"error": e.code, "body": e.read().decode()[:300]}
def users():
    return call("GET", "/auth/v1/admin/users?per_page=1000")["users"]
def uid(email): return next((u["id"] for u in users() if (u.get("email") or "").lower() == email.lower()), None)
