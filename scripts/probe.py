# Temporary: fetch candidate coupon sites from the GitHub runner (open internet) and save them for inspection.
import os, re, sys, urllib.request
URLS = sys.argv[1:]
os.makedirs("probe", exist_ok=True)
for i, u in enumerate(URLS):
    try:
        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36", "Accept-Language": "ar,en;q=0.8"})
        html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
        open(f"probe/{i:02d}.html", "w").write(f"<!-- {u} -->\n" + html)
        print("OK", len(html), u)
    except Exception as e:
        open(f"probe/{i:02d}.err", "w").write(f"{u}\n{e}")
        print("ERR", u, e)
