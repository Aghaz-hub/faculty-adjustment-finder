# -*- coding: utf-8 -*-
"""
Builds data/timetable_data.json from:
  - data/faculty_list.csv     (master directory: name, designation, mobile, email)
  - data/timetable_data.csv   (long-format schedule entries, one row per busy slot)

Run this every time you add/edit a faculty timetable in the CSVs:
    python3 scripts/build_json.py

The app (app/script.js) only ever reads the generated JSON, never the CSVs.
"""
import csv
import json
import os
import re
import difflib

# Manual aliases for cases where the timetable screenshot's name doesn't
# closely match the master list (nicknames, alternate spellings, short forms).
# Left side = name as it appears in timetable_data.csv, right side = name as
# it appears in faculty_list.csv. Add to this as you transcribe more faculty.
NAME_ALIASES = {
    "Bhawna": "Ms. Bhawana Srivastava",
    "Anupriya Sharma": "Dr. Anu Priya Sharma",
    "Agha Imran": "Mr. Agha Imran Hussain",
    "Gunjan Aggarwal": "Dr. Gunjan Agarwal",
    "Narender Gautam": "Dr. Narender",
    # Pooja Ahuja / Dr. Pooja Sachdeva and Ravi Chaturvedi / Dr. Ravi Prakash
    # are resolved automatically by the first-name fallback below (each first
    # name is unique in faculty_list.csv). Add them here explicitly instead
    # if that turns out to be wrong.
}

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FACULTY_CSV = os.path.join(BASE, "data", "faculty_list.csv")
TIMETABLE_CSV = os.path.join(BASE, "data", "timetable_data.csv")
OUT_JSON = os.path.join(BASE, "data", "timetable_data.json")

# Fixed period grid, shared by every faculty timetable (aSc Timetables Online export).
PERIODS = [
    {"id": 1, "label": "1", "time": "8:10 - 9:00"},
    {"id": 2, "label": "2", "time": "9:00 - 9:50"},
    {"id": 3, "label": "3", "time": "9:50 - 10:40"},
    {"id": 4, "label": "4", "time": "10:40 - 11:30"},
    {"id": "lunch", "label": "Lunch", "time": "11:30 - 12:20", "is_break": True},
    {"id": 6, "label": "6", "time": "12:20 - 13:10"},
    {"id": 7, "label": "7", "time": "13:10 - 14:00"},
    {"id": 8, "label": "8", "time": "14:00 - 14:50"},
    {"id": 9, "label": "9", "time": "14:50 - 15:40"},
    {"id": 10, "label": "10", "time": "15:40 - 16:30"},
]
DAYS = ["Mo", "Tu", "We", "Th", "Fr"]


TITLE_RE = re.compile(r"^(dr|mr|ms|mrs|prof)\.?\s+", re.IGNORECASE)


def normalize(name):
    """Strip titles/punctuation/extra spaces and lowercase, for fuzzy matching."""
    n = TITLE_RE.sub("", name.strip())
    n = re.sub(r"[^a-z\s]", "", n.lower())
    n = re.sub(r"\s+", " ", n).strip()
    return n


def load_faculty_list():
    faculty = {}
    with open(FACULTY_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = row["name"].strip()
            faculty[name] = {
                "name": name,
                "designation": row.get("designation", "").strip(),
                "mobile": row.get("mobile", "").strip(),
                "email": row.get("email", "").strip(),
                "busy": [],
                "has_timetable": False,
            }
    return faculty


def first_name(name):
    n = normalize(name)
    return n.split()[0] if n else ""


def resolve_name(raw_name, faculty, printed_matches=None):
    """Find the matching master-list entry for a name from timetable_data.csv.
    Tries, in order: exact match -> alias table -> normalized full-name match
    -> fuzzy full-name match -> unique first-name match. Returns the key to
    use in `faculty` (creating a bare entry if nothing fits)."""
    if raw_name in faculty:
        return raw_name

    if raw_name in NAME_ALIASES and NAME_ALIASES[raw_name] in faculty:
        return NAME_ALIASES[raw_name]

    target = normalize(raw_name)
    for existing in faculty:
        if normalize(existing) == target:
            return existing

    close = difflib.get_close_matches(
        target, [normalize(n) for n in faculty], n=1, cutoff=0.82
    )
    if close:
        for existing in faculty:
            if normalize(existing) == close[0]:
                return existing

    # Last resort: match on first (given) name alone, but only if exactly one
    # master-list entry has that first name -- otherwise it's a guess, not a
    # match, and we fall through to creating a bare entry instead.
    target_first = first_name(raw_name)
    if target_first:
        candidates = [e for e in faculty if first_name(e) == target_first]
        if len(candidates) == 1:
            if printed_matches is not None and raw_name not in printed_matches:
                print(f'Matched "{raw_name}" to "{candidates[0]}" by first name only -- verify this is the same person.')
                printed_matches.add(raw_name)
            return candidates[0]

    # No match anywhere -- create a bare entry so no data is silently dropped,
    # but this should be fixed by adding a NAME_ALIASES entry or fixing the CSV.
    faculty[raw_name] = {
        "name": raw_name, "designation": "", "mobile": "", "email": "",
        "busy": [], "has_timetable": False,
    }
    return raw_name


def load_timetable(faculty):
    before_keys = set(faculty.keys())
    printed_matches = set()
    with open(TIMETABLE_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            raw_name = row["faculty_name"].strip()
            name = resolve_name(raw_name, faculty, printed_matches)

            faculty[name]["has_timetable"] = True
            faculty[name]["busy"].append({
                "day": row["day"].strip(),
                "period_start": int(row["period_start"]),
                "period_end": int(row["period_end"]),
                "class_section": row.get("class_section", "").strip(),
                "subject": row.get("subject", "").strip(),
                "room": row.get("room", "").strip(),
                "group": row.get("group", "").strip(),
                "review": row.get("review", "0").strip() == "1",
            })

    # Any key that didn't exist before load_timetable ran was created fresh,
    # meaning it never matched an entry in faculty_list.csv.
    unmatched = sorted(k for k in faculty if k not in before_keys)
    if unmatched:
        print("Note: these names in timetable_data.csv found no match in faculty_list.csv")
        print("(add an entry to NAME_ALIASES in this script, or fix the CSV):")
        for n in unmatched:
            print("  -", n)
    return faculty


def main():
    faculty = load_faculty_list()
    faculty = load_timetable(faculty)

    out = {
        "periods": PERIODS,
        "days": DAYS,
        "generated_note": "Auto-generated by scripts/build_json.py. Do not edit by hand.",
        "faculty": sorted(faculty.values(), key=lambda f: f["name"]),
    }

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    total = len(out["faculty"])
    with_tt = sum(1 for f in out["faculty"] if f["has_timetable"])
    review_count = sum(1 for f in out["faculty"] for b in f["busy"] if b["review"])
    print(f"Wrote {OUT_JSON}")
    print(f"  {total} faculty total, {with_tt} with a transcribed timetable")
    if review_count:
        print(f"  {review_count} entries flagged review=1 (verify against source image)")


if __name__ == "__main__":
    main()
