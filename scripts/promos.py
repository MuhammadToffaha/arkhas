"""
🎟️ Promo codes for Egypt — runs daily on GitHub Actions (open internet), writes web/promos.json.
The app shows that file in its "أكواد" tab; nothing runs on a server.

Source: yajny.com Egypt (ar-eg) — every store page lists its coupon codes in the HTML
(<a class="show-code-btn" data-id=CODE data-name=STORE data-logo=… data-link=… data-date=…>).
"""
import datetime, html, json, re, sys, urllib.parse, urllib.request

BASE = "https://yajny.com"
UA = {"User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36",
      "Accept-Language": "ar,en;q=0.8"}
EXTRA_STORES = ["noon-egypt", "jumia-egypt", "amazon", "shein", "waffarha", "rayashop", "defacto", "hm-egypt",
                "2b", "newbalance", "bath-body-works-egypt", "american-eagle-egypt", "Kenzz-eg"]


def get(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")


def attrs(tag):
    return {k: html.unescape((a if a else b).strip()) for k, a, b in re.findall(r'data-([a-z]+)=(?:"([^"]*)"|\'([^\']*)\')', tag)}


def text(s):
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()


def parse(page, url, today):
    out = []
    for m in re.finditer(r'<a\s+class="[^"]*show-code-btn[^"]*"(.*?)>', page, re.S):
        d = attrs(m.group(1))
        code = d.get("id", "")
        if not code or "+" in code or "`" in code or len(code) > 40:
            continue                      # JS templates, not real codes
        before = page[max(0, m.start() - 3000):m.start()]
        title = d.get("title") or d.get("promo") or ""
        if not title:
            t = re.findall(r'class="coupon-title"[^>]*>(.*?)</span>', before, re.S)
            title = text(t[-1]) if t else ""
        expires = ""
        if d.get("date"):
            try: expires = datetime.datetime.strptime(d["date"].replace(" ", ""), "%b%d,%Y").date().isoformat()
            except ValueError: pass
        if not expires:
            e = re.findall(r'coupon-expiry-countdown[^>]*>[^<]*?(\d+)\s*(?:يوم|أيام|ايام|days?)', before)
            if e: expires = (today + datetime.timedelta(days=int(e[-1]))).isoformat()
        used = re.findall(r'coupon-usage-count[^>]*>[^<]*?(\d+)', before)
        out.append({"store": d.get("name", "").strip(), "logo": d.get("logo", ""), "link": d.get("link", ""),
                    "code": code.strip(), "title": title.strip(), "expires": expires,
                    "used": int(used[-1]) if used else 0, "page": url, "source": "yajny"})
    return out


def main(path):
    today = datetime.date.today()
    pages = [f"{BASE}/ar-eg", f"{BASE}/ar-eg/coupons"]
    try:
        home = get(pages[0]) + get(pages[1])
    except Exception as e:
        print(f"::warning::home failed {e}"); home = ""
    print(f"::notice::home bytes {len(home)}")
    slugs = set(EXTRA_STORES)
    slugs |= {html.unescape(s) for s in re.findall(r'https://yajny\.com/ar-eg/store/([^"\'#?]+)', home)}
    slugs = sorted(s for s in slugs if "+" not in s)[:80]
    found, ok = [], 0
    found += parse(home, pages[1], today)
    for s in slugs:
        url = f"{BASE}/ar-eg/store/{urllib.request.quote(urllib.parse.unquote(s).strip(), safe='-_')}"
        try:
            found += parse(get(url), url, today); ok += 1
        except Exception as e:
            print(f"::warning::skip {url} {e}")
    # one row per store+code, keep the richest
    best = {}
    for c in found:
        if c["expires"] and c["expires"] < today.isoformat():
            continue
        if not c.get("store"):
            continue
        # Egypt only: drop codes for Saudi / UAE / global sites listed on the same pages
        blob = (c.get("link", "") + " " + c.get("title", "")).lower()
        if re.search(r"\.sa\b|\.sa/|//ae\.|//uae\.|\.ae/|/world/|السعودية|الإمارات|ريال|درهم|\bsar\b|\baed\b", blob):
            continue
        k = (c["store"], c["code"].upper())
        if k not in best or len(c["title"]) > len(best[k]["title"]) or (c["expires"] and not best[k]["expires"]):
            best[k] = {**best.get(k, {}), **{x: y for x, y in c.items() if y}}
    codes = sorted(best.values(), key=lambda c: (c.get("store", ""), -c.get("used", 0)))
    if not codes:
        print(f"::error::no codes found ({len(found)} raw, {ok}/{len(slugs)} pages) — keeping the old file"); return 1
    json.dump({"updated": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z", "country": "eg",
               "sources": ["yajny.com/ar-eg"], "codes": codes}, open(path, "w"), ensure_ascii=False, indent=1)
    print(f"::notice::{len(codes)} codes from {len({c['store'] for c in codes})} stores ({ok}/{len(slugs)} pages)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "web/promos.json"))
