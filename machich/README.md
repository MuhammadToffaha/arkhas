# 🇩🇪 Mach ich! — German A2 in 30 days

Busuu-style study app for the **Goethe-Zertifikat A2**. Offline, no ads, no account.

## 📅 The course
- **30 daily lessons** (~30 min): days 1–4 fast A1 recap → days 5–27 all A2 grammar → days 28–30 exam training + full mock
- Every lesson = 5 steps: 📚 **12 words** (German voice, slow mode, examples) → 📐 **grammar in English** + table + YouTube link → ✏️ **14 exercises** (meaning, listening, typing, fill the gap, build the sentence) → 🗣️ **speaking** (🎤 Google speech recognition scores your pronunciation %) → ✍️ **Mein Leben**

## ✍️ Mein Leben — learn by writing about YOUR life
- A personal topic every day using that day's grammar (my family, my job, my childhood, my weekend in Perfekt, my plans with werden …)
- 🔍 **Instant hints** catch typical A2 mistakes: verb after weil/dass/ob, inversion after deshalb/trotzdem, haben vs. sein in Perfekt, missing comma, lowercase nouns, age with haben, email greeting/closing, required structures, word count
- 👀 model answer · 🔊 hear your own text · 🎤 read it aloud and get a score
- 📖 **Mein Buch** — every text saved: your own German book. Plus 💭 free topic any time.

## 🔁 Remember it (like Busuu)
- **Spaced repetition** (1 → 2 → 4 → 8 → 16 → 35 days), word strength bars
- ❌ **Mistakes notebook** — every wrong answer comes back until you get it right
- 🎧 **Diktat** — hear a sentence, type it
- 📐 Grammar library (all 30 topics)

## 🏆 Goethe A2 mock exam (real format)
📖 Lesen 4 Teile (20 items, 30′) · 🎧 Hören 4 Teile read by the German voice, max 2 plays (20 items, 30′) · ✍️ Schreiben SMS + email with point checklist, hints and model (30′) · 🗣️ Sprechen 3 Teile with 🎤 (15′). Score /100, pass = 60, history kept. Each module can be trained alone.

## 🎯 Motivation
🔥 streak · ⭐ XP + level · daily goal (20/50/100 XP) · 📊 skill meters (Wortschatz, Grammatik, Hören, Sprechen, Schreiben, Lesen) · 📅 exam-date countdown · plan vs. real progress · ⏰ daily reminder at your time (only if you haven't studied yet).

## 🔧 Same as all Toffaha apps
🤫 silent auto-update once a day · 🎁 pop-up on open when a new version exists · version 1.0.N · "Designed by Muhammad Toffaha" in Settings.

> 🔇 No sound? Android Settings → Text-to-speech → install the German voice. 🎤 Speaking needs the Google app.

## 📲 Install
From **JAMA**, or download `machich.apk` from [Releases](https://github.com/MuhammadToffaha/arkhas/releases) (tag `machich-vN`).

## 🧪 Tests (run in CI before every build)
`node tests/logic.test.js` — 1200+ checks: 30 days complete, 360 words, every drill answerable, model answers pass their own checker, exam keys, SRS, streak, checker rules.
`node tests/play.test.js` — a robot student opens every step of all 30 days, finishes a lesson with all answers right, writes in Mein Leben, does flashcards / mistakes / Diktat, and passes the full mock exam.

Content: own texts written for this app (Goethe A2 format and topics), not copied from Goethe material.

Designed by Muhammad Toffaha
