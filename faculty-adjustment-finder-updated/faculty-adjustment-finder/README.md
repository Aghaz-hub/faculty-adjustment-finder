# Faculty Adjustment Finder

A small tool for finding which faculty member is free to cover a lecture at a
given day/period, built from the weekly timetable exports (aSc Timetables
Online) for each faculty member.

## How it works

```
data/faculty_list.csv   ─┐
                          ├─▶ scripts/build_json.py ─▶ data/timetable_data.json ─▶ app/ (reads it, shows free/busy)
data/timetable_data.csv ─┘
```

- **`data/faculty_list.csv`** — the master directory (name, designation, mobile,
  email), one row per faculty member. Generated from the university's faculty
  list spreadsheet.
- **`data/timetable_data.csv`** — one row per *busy slot*: which faculty member,
  which day, which period(s), and what they're teaching. This is the file you
  edit whenever a new timetable screenshot/PDF needs to be added.
- **`data/raw_timetables/`** — put the original timetable images/PDFs here for
  reference, one file per faculty member, so the source is always at hand for
  double-checking a cell.
- **`scripts/build_json.py`** — joins the two CSVs into `data/timetable_data.json`.
  It also fuzzy-matches names between the two CSVs (handling "Dr./Ms./Mr."
  prefixes and small spelling differences) so you don't have to make the two
  files agree on formatting by hand. Run it after every CSV edit:
  ```
  python3 scripts/build_json.py
  ```
- **`app/`** — the web app itself (`index.html`, `style.css`, `script.js`).
  Plain HTML/CSS/JS, no build step, no framework. It only ever reads the
  generated JSON.

## Running it locally

Browsers block `fetch()` of local files opened directly, so serve the folder
instead of double-clicking `index.html`:

```
cd faculty-adjustment-finder
python3 -m http.server 8000
```

then open `http://localhost:8000/app/`.

## Deploying (GitHub Pages)

1. Push this repo to GitHub.
2. Settings → Pages → Deploy from branch → `main` → `/ (root)`.
3. The app will be live at `https://<user>.github.io/<repo>/app/`.

Re-run `build_json.py` and push again whenever the timetable data changes —
there's no server, so the JSON file has to be committed.

## Adding or fixing a faculty timetable

1. Drop the source image/PDF into `data/raw_timetables/`.
2. Add one row to `data/timetable_data.csv` per busy slot for that faculty
   member. Columns:

   | column | meaning |
   |---|---|
   | `faculty_name` | as written on the timetable image |
   | `day` | `Mo` / `Tu` / `We` / `Th` / `Fr` |
   | `period_start`, `period_end` | period numbers the slot occupies (labs often span two periods, e.g. 6–7) |
   | `class_section` | e.g. `CSE 3A` |
   | `subject` | e.g. `Database Management System (L)` |
   | `room` | e.g. `LAB03` |
   | `group` | batch/group label if shown, else blank |
   | `review` | `1` if the source image was unclear/overlapping text and this row needs a human to double check it, else `0` |

3. If the faculty name doesn't already match an entry in `data/faculty_list.csv`
   exactly, either fix the spelling or add a line to the `NAME_ALIASES` dict at
   the top of `scripts/build_json.py`.
4. Re-run `python3 scripts/build_json.py` and refresh the app.

## Current data status

The master list (`data/faculty_list.csv`) has 47 faculty, refreshed from
`Updated_New_Faculties.xlsx` — every faculty member now has a mobile number,
which the app displays next to their email on each card. 39 of the 47 now
have a transcribed timetable in `data/timetable_data.csv`. It was
transcribed by hand from screenshots and is a first pass — rows with
`review=1` had overlapping or unclear text in the source image and should be
checked against the original before being relied on (14 such rows right now,
concentrated in Ravi Chaturvedi's timetable). The app shows a small warning
dot on any such slot.

Name matching between the timetable screenshots and the master list works in
tiers, in `scripts/build_json.py`: exact match → manual alias → title-stripped
match → fuzzy spelling match → unique first-name match (last resort, only
used when exactly one master-list faculty shares that first name). The
updated master list confirmed two matches that were previously first-name
guesses — "Pooja Ahuja" is "Dr. Pooja Sachdeva" and "Ravi Chaturvedi" is
"Dr. Ravi Prakash" (their official emails, poojaahuja.cst@... and
raviprakashchaturvedi@..., contain the screenshot name) — so those are now
pinned as explicit aliases rather than left to the fallback. "Esha" → "Dr.
Esha Khanna", "Juhi" → "Ms. Juhi Pruthi", and "Urmila Pilania" → "Dr. Urmila"
still rely on the first-name fallback and are worth a quick human check.

Every one of the 47 master-list faculty now resolves to something — there
are no more unmatched names.

8 faculty from the master list still have no timetable image uploaded at all.

## Possible next steps

- Filter substitutes by department/subject automatically instead of a free-text keyword box.
- Track how often each faculty member has been used as a substitute, to spread adjustments fairly.
- A small "who teaches this class free right now" reverse lookup.
- Swap this hand-transcription step for OCR once there's a large enough batch of images to justify it — the current sample had enough overlapping/rotated text that manual entry was more reliable.
