# Temporary: try Google Lens upload from the runner and save what comes back (for building photo search).
import json, os, time, urllib.parse, urllib.request, uuid, http.cookiejar
os.makedirs("probe", exist_ok=True)
UA = "Mozilla/5.0 (Linux; Android 14; SM-A556E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"
cj = http.cookiejar.CookieJar()
class NoRedir(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj), NoRedir)
def get(u, data=None, headers=None):
    r = urllib.request.Request(u, data=data, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", **(headers or {})})
    try:
        resp = op.open(r, timeout=40); return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
# a product photo from Wikimedia Commons
q = json.loads(get("https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=JBL%20headphones&srnamespace=6&format=json&srlimit=1")[2])
name = q["query"]["search"][0]["title"]
st, h, img = get("https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(name[5:]) + "?width=800")
if st in (301, 302): st, h, img = get(h["Location"] if h.get("Location", "").startswith("http") else "https:" + h["Location"])
log = {"image": name, "img_status": st, "img_bytes": len(img)}
b = uuid.uuid4().hex
body = (f"--{b}\r\nContent-Disposition: form-data; name=\"encoded_image\"; filename=\"p.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n").encode() + img + f"\r\n--{b}--\r\n".encode()
for i, url in enumerate([f"https://lens.google.com/v3/upload?hl=en&gl=EG&re=df&stcs={int(time.time()*1000)}&ep=gsbubb",
                         f"https://lens.google.com/upload?ep=ccm&s=&st={int(time.time()*1000)}"]):
    st, h, data = get(url, body, {"Content-Type": f"multipart/form-data; boundary={b}", "Referer": "https://lens.google.com/", "Origin": "https://lens.google.com"})
    loc = h.get("Location") or h.get("location")
    log[f"up{i}"] = {"status": st, "location": loc, "len": len(data)}
    open(f"probe/up{i}.html", "wb").write(data)
    hop = 0
    while loc and hop < 5:
        u = urllib.parse.urljoin(url, loc); st, h, data = get(u); loc = h.get("Location") or h.get("location"); hop += 1
        log[f"up{i}_hop{hop}"] = {"url": u[:300], "status": st, "location": (loc or "")[:300], "len": len(data)}
        open(f"probe/up{i}_hop{hop}.html", "wb").write(data)
json.dump(log, open("probe/log.json", "w"), indent=1)
print(json.dumps(log, indent=1))
