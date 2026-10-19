"""Arabic / English text normalization and bilingual query expansion."""
from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from pathlib import Path

import yaml

_TASHKEEL = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")  # harakat + tatweel
_ARABIC_CHARS = re.compile(r"[؀-ۿ]")
_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_LETTERS = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي"})
_NON_WORD = re.compile(r"[^\w\s]+", re.UNICODE)

DICT_PATH = Path(__file__).parent / "data" / "synonyms.yaml"


def is_arabic(text: str) -> bool:
    return bool(_ARABIC_CHARS.search(text or ""))


def normalize(text: str) -> str:
    """Lower-case, unify Arabic letter variants, strip diacritics, unify digits."""
    if not text:
        return ""
    t = unicodedata.normalize("NFKC", text)
    t = _TASHKEEL.sub("", t)
    t = t.translate(_DIGITS).translate(_LETTERS).lower()
    t = _NON_WORD.sub(" ", t)
    # split glued Arabic/latin/digits: "ايفون15" -> "ايفون 15"
    t = re.sub(r"(?<=[؀-ۿ])(?=[a-z0-9])|(?<=[a-z0-9])(?=[؀-ۿ])", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def tokens(text: str) -> list[str]:
    return [w for w in normalize(text).split() if w]


@lru_cache(maxsize=1)
def _synonym_groups() -> list[set[str]]:
    """Each group = words meaning the same thing in Arabic/English (normalized)."""
    raw = yaml.safe_load(DICT_PATH.read_text(encoding="utf-8")) or {}
    groups: list[set[str]] = []
    for en, variants in raw.items():
        g = {normalize(str(en))} | {normalize(str(v)) for v in (variants or [])}
        groups.append({x for x in g if x})
    return groups


@lru_cache(maxsize=1)
def _lookup() -> dict[str, set[str]]:
    idx: dict[str, set[str]] = {}
    for g in _synonym_groups():
        for w in g:
            idx.setdefault(w, set()).update(g)
    return idx


def equivalents(token: str) -> set[str]:
    """All known spellings/translations of one token (including itself)."""
    t = normalize(token)
    return _lookup().get(t, set()) | {t}


def translate_query(query: str, to_arabic: bool) -> str:
    """Word-by-word swap using the synonym dictionary (multi-word phrases first)."""
    q = normalize(query)
    idx = _lookup()
    # phrases (e.g. "washing machine") replaced before single words
    phrases = sorted((k for k in idx if " " in k), key=len, reverse=True)
    out = q
    for p in phrases:
        if re.search(rf"\b{re.escape(p)}\b", out):
            out = re.sub(rf"\b{re.escape(p)}\b", "\x00" + _pick(idx[p], to_arabic) + "\x00", out)
    words = []
    for part in re.split(r"(\x00[^\x00]*\x00)", out):
        if part.startswith("\x00"):
            words.append(part.strip("\x00"))
            continue
        for w in part.split():
            words.append(_pick(idx[w], to_arabic) if w in idx else w)
    return " ".join(words).strip()


@lru_cache(maxsize=1)
def _order() -> dict[str, int]:
    """Position of each spelling in synonyms.yaml — first listed = preferred."""
    raw = yaml.safe_load(DICT_PATH.read_text(encoding="utf-8")) or {}
    order: dict[str, int] = {}
    i = 0
    for en, variants in raw.items():
        for w in [en, *(variants or [])]:
            order.setdefault(normalize(str(w)), i)
            i += 1
    return order


def _pick(group: set[str], arabic: bool) -> str:
    o = _order()
    cands = sorted((g for g in group if is_arabic(g) == arabic), key=lambda g: (o.get(g, 1e9), g))
    return cands[0] if cands else sorted(group)[0]


def query_variants(query: str) -> list[str]:
    """Original query + its translation into the other language (deduped)."""
    q = query.strip()
    other = translate_query(q, to_arabic=not is_arabic(q))
    out = [q]
    if other and normalize(other) != normalize(q):
        out.append(other)
    return out
