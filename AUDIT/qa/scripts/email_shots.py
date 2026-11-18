import pathlib
from playwright.sync_api import sync_playwright
from common import CHROME, QA
E = QA / "emails"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME)
    for vp, tag in [({"width": 760, "height": 900}, "desktop"), ({"width": 375, "height": 800}, "movil")]:
        pg = b.new_page(viewport=vp)
        for f in sorted(E.glob("*.html")):
            pg.goto(f.as_uri()); pg.screenshot(path=str(E / f"{f.stem}-{tag}.png"), full_page=True)
            ov = pg.evaluate("document.documentElement.scrollWidth - innerWidth")
            if ov > 1: print("desborde", f.stem, tag, ov)
    b.close()
print("ok")
