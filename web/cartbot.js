/*
 * 🛒 Arkhas cart bot — injected by the app into its own (signed-in) store page to press "Add to cart".
 * Runs inside an invisible WebView that shares cookies with the "Store accounts" sign-in screen,
 * so the item lands in the user's real Amazon / noon / Jumia cart (the same cart the store app shows).
 * Reports back through ArkCart.result(json). Lives in web/ so selectors can be fixed with a git push.
 * Inputs set by the app before this runs: window.__ARK_STORE ("amazon"|"noon"|"jumia"), window.__ARK_CLICKED (bool).
 */
(function () {
  if (window.__arkCartRan) return;
  window.__arkCartRan = 1;
  var store = window.__ARK_STORE || "";
  var sent = false;
  function R(status, msg) {
    if (sent) return; sent = true;
    try { ArkCart.result(JSON.stringify({ status: status, msg: msg || "", url: location.href })); } catch (e) {}
  }
  var BTN_TXT = /(add\s*to\s*(cart|basket|bag))|((أضف|اضف|إضافة|اضافة|أضِف)\s*(إلى|الى|ل|لل)?\s*(ال)?(عربة|العربه|عربه|السلة|سلة|سله)(\s*التسوق)?)/i;
  var OK_TXT = /(added\s*to\s*(your\s*)?(cart|basket|bag))|(added\s*successfully)|(product\s*added)|(item\s*added)|(تمت?\s*(ال)?(إضافة|اضافة))|(أضيفت?\s)|(تم\s*اضافه)/i;
  var SIGNIN_PATH = /\/ap\/signin|\/ap\/register|\/customer\/account\/login|\/login|\/signin|\/auth/i;
  var DONE_PATH = /smart-wagon|\/huc\/|\/gp\/cart|\/cart\/?(\?|$)|added-to-cart/i;
  var SEL = {
    amazon: ["#add-to-cart-button", "input[name='submit.add-to-cart']", "button[name='submit.add-to-cart']",
      "#add-to-cart-button-ubb", "#mobileAddToCart", "input[name='submit.addToCart']", "[data-action='add-to-cart'] input"],
    noon: ["button[data-qa='btn-add-to-cart']", "button[data-qa*='add-to-cart' i]", "button[data-qa*='addToCart' i]",
      "button[class*='addToCart' i]", "button[class*='AddToCart']", "button[aria-label*='add to cart' i]"],
    jumia: ["button.add.btn._prim", "form[action*='cart'] button[type='submit']", "button[data-track-onclick*='addToCart' i]",
      "button.-fw._prim", "button[aria-label*='add to cart' i]"]
  };
  function visible(e) {
    if (!e || e.disabled || e.getAttribute("aria-disabled") === "true") return false;
    var r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function label(e) { return ((e.value || "") + " " + (e.textContent || "") + " " + (e.getAttribute("aria-label") || "")).replace(/\s+/g, " ").trim().slice(0, 80); }
  function findBtn() {
    var list = SEL[store] || [];
    for (var i = 0; i < list.length; i++) {
      var all = document.querySelectorAll(list[i]);
      for (var j = 0; j < all.length; j++) if (visible(all[j])) return all[j];
    }
    var c = document.querySelectorAll("button, input[type=submit], input[type=button], a[role=button], [role=button], span.a-button-inner input");
    for (var k = 0; k < c.length; k++) if (visible(c[k]) && BTN_TXT.test(label(c[k])) && !/buy now|اشتر/i.test(label(c[k]))) return c[k];
    return null;
  }
  function cartCount() {
    var n = -1;
    var els = document.querySelectorAll("#nav-cart-count, #nav-mobile-cart-count, [id*='cart-count' i], [class*='cartCount' i], [class*='cart-count' i], [class*='CartCount'], [data-qa*='cart' i] span, a[href*='/cart'] span, a[href*='cart'] [class*='badge' i], #ci");
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || "").replace(/[^\d٠-٩]/g, "").replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); });
      var v = parseInt(t, 10);
      if (!isNaN(v) && v < 1000 && v > n) n = v;
    }
    return n;
  }
  function bodyText() { return document.body ? (document.body.innerText || document.body.textContent || "").slice(0, 30000) : ""; }
  function signedOut() {
    if (SIGNIN_PATH.test(location.pathname)) return true;
    if (store === "amazon") {
      var g = document.querySelector("#nav-logobar-greeting, #nav-link-accountList-nav-line-1, #nav-greeting-name");
      return !!(g && /sign\s*in|تسجيل الدخول/i.test(g.textContent || ""));
    }
    return false;
  }
  var t0 = Date.now(), clickedAt = window.__ARK_CLICKED ? Date.now() : 0, before = -1, okBefore = false, tries = 0;
  function tick() {
    if (sent) return;
    if (!clickedAt) {
      if (signedOut()) return R("signin");
      var b = findBtn();
      if (b) {
        before = cartCount(); okBefore = OK_TXT.test(bodyText());
        try { ArkCart.clicked(); } catch (e) {}
        try { b.scrollIntoView({ block: "center" }); } catch (e) {}
        b.click(); clickedAt = Date.now(); tries++;
      } else if (Date.now() - t0 > 16000) return R("nobutton");
    } else {
      var c = cartCount();
      if (before >= 0 && c > before) return R("ok", String(c));
      if (DONE_PATH.test(location.pathname + location.search)) return R("ok", c >= 0 ? String(c) : "");
      if (!okBefore && OK_TXT.test(bodyText())) return R("ok", c >= 0 ? String(c) : "");
      if (SIGNIN_PATH.test(location.pathname)) return R("signin");
      // a size / colour must be picked first -> the user does it on the page
      if (/please\s*select|select\s*(a\s*)?(size|variation|option)|اختر\s*(المقاس|الحجم|اللون)/i.test(bodyText()) && Date.now() - clickedAt > 2500) return R("pick");
      if (Date.now() - clickedAt > 9000) return R("unsure");
    }
    setTimeout(tick, 500);
  }
  if (window.__ARK_CLICKED && (DONE_PATH.test(location.pathname + location.search) || OK_TXT.test(bodyText()))) return R("ok");
  tick();
})();
