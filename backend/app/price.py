"""Parse Egyptian price strings: 'EGP 12,999.00', '١٢٬٩٩٩ ج.م', '12.999 جنيه'."""
from __future__ import annotations

import re

_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
_NUM = re.compile(r"\d[\d.,\s]*")


def parse_price(raw) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw) if raw > 0 else None
    s = str(raw).translate(_DIGITS).replace("٬", ",").replace("٫", ".").replace("\xa0", " ")
    m = _NUM.search(s)
    if not m:
        return None
    num = re.sub(r"\s", "", m.group(0)).rstrip(".,")
    if "," in num and "." in num:
        # whichever comes last is the decimal separator
        if num.rfind(",") > num.rfind("."):
            num = num.replace(".", "").replace(",", ".")
        else:
            num = num.replace(",", "")
    elif "," in num:
        num = num.replace(",", "") if re.fullmatch(r"\d{1,3}(,\d{3})+", num) else num.replace(",", ".")
    elif "." in num and re.fullmatch(r"\d{1,3}(\.\d{3})+", num):
        num = num.replace(".", "")  # 12.999 = twelve thousand (thousand separator)
    try:
        v = float(num)
    except ValueError:
        return None
    return v if v > 0 else None
