"""Pull open bids from shared portals and agency bid pages into the `bids` table.

Adapters (pick with --platform, default: all):
  civicplus   CivicPlus "Bids.aspx" pages. One extractor covers many small WA/OR/ID cities.
  opengov     OpenGov Procurement portals (procurement.opengov.com/portal/<code>), e.g. Pierce County.
  oregonbuys  OregonBuys open-bid search (statewide OR, plus local agencies that post there).

Sources come from data/sources.seed.json plus data/agencies/*.json, chosen by `platform`
(civicplus also matches any procurement_url containing "Bids.aspx").

Output follows docs/bid-data-model.md. With --dry-run (default when no secret key is set)
rows are written to data/bids.pulled.json. Otherwise they are upserted to Supabase on
`source_url` using SUPABASE_URL and SUPABASE_SECRET_KEY from the environment.

Usage:
  python scripts/pull_bids.py --platform civicplus --limit 20 --dry-run
  SUPABASE_URL=... SUPABASE_SECRET_KEY=... python scripts/pull_bids.py
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
UA = "BidAnalytics/0.1 (hackathon; finds public bids for small vendors)"
TIMEOUT = 25

# Plain work types matching the intake chips. Keyword match on title + description.
CATEGORY_WORDS = {
    "paving": ["paving", "asphalt", "overlay", "chip seal", "pavement"],
    "concrete": ["concrete", "sidewalk", "curb", "ada ramp"],
    "landscaping": ["landscap", "mowing", "tree ", "trees", "irrigation", "grounds maint"],
    "janitorial": ["janitorial", "custodial", "cleaning services"],
    "snow_removal": ["snow", "de-icing", "deicing"],
    "roofing": ["roof"],
    "painting": ["painting", "paint "],
    "electrical": ["electrical", "lighting", "generator"],
    "plumbing": ["plumbing", "water main", "sewer", "storm drain", "culvert"],
    "hvac": ["hvac", "mechanical", "boiler", "heating"],
    "construction": ["construction", "renovation", "remodel", "improvement", "replacement"],
    "fencing": ["fence", "fencing"],
    "it": ["software", "network", "it services", "computer", "cyber"],
    "vehicles": ["vehicle", "truck", "fleet"],
    "consulting": ["consult", "engineering services", "design services", "study"],
}

BID_TYPES = [("rfq", r"\bRFQ\b|request for qualifications|request for quotes?"),
             ("rfp", r"\bRFP\b|request for proposals?"),
             ("rfi", r"\bRFI\b|request for information"),
             ("itb", r"\bITB\b|\bIFB\b|invitation (to|for) bids?"),
             ("small_works", r"small works"),
             ("roster", r"\broster\b")]

DATE_RE = re.compile(r"(\d{1,2}/\d{1,2}/\d{4})(?:\s+(\d{1,2}:\d{2})\s*([AP]M))?", re.I)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def parse_date(text):
    """First m/d/yyyy [h:mm AM] in text -> ISO string (Pacific offset assumed)."""
    m = DATE_RE.search(text or "")
    if not m:
        return None
    d = datetime.strptime(m.group(1), "%m/%d/%Y")
    if m.group(2):
        t = datetime.strptime(f"{m.group(2)} {m.group(3).upper()}", "%I:%M %p")
        d = d.replace(hour=t.hour, minute=t.minute)
    return d.strftime("%Y-%m-%dT%H:%M:00-07:00")


def classify(text):
    low = (text or "").lower()
    cats = [c for c, words in CATEGORY_WORDS.items() if any(w in low for w in words)]
    bid_type = next((t for t, pat in BID_TYPES if re.search(pat, text or "", re.I)), "other")
    return cats, bid_type


def base_row(source, title, url, **kw):
    cats, bid_type = classify(f"{title} {kw.get('description') or ''}")
    row = {
        "source_id": source["id"],
        "agency": source["name"] if source["agency_type"] != "platform" else kw.pop("agency", None) or source["name"],
        "title": title.strip(),
        "source_url": url,
        "bid_type": bid_type,
        "status": "open",
        "categories": cats,
        "state": source["state"] if source["state"] in ("WA", "OR", "ID") else None,
        "county": source.get("county"),
        "city": source.get("city"),
        "lat": source.get("lat"),
        "lng": source.get("lng"),
        "last_checked": now_iso(),
    }
    kw.pop("agency", None)
    row.update({k: v for k, v in kw.items() if v is not None})
    return row


def get(url):
    r = requests.get(url, headers={"User-Agent": UA}, timeout=TIMEOUT)
    r.raise_for_status()
    return r.text


# --- CivicPlus Bids.aspx -----------------------------------------------------------

def civicplus_url(source):
    url = source.get("procurement_url") or ""
    if "bids.aspx" in url.lower():
        return url
    home = source.get("homepage_url") or url
    if not home:
        return None
    p = urlparse(home)
    return f"{p.scheme}://{p.netloc}/Bids.aspx"


def pull_civicplus(source):
    url = civicplus_url(source)
    if not url:
        return []
    soup = BeautifulSoup(get(url), "html.parser")
    rows, seen = [], set()
    for a in soup.find_all("a", href=re.compile(r"bidID=\d+", re.I)):
        href = urljoin(url, a["href"])
        title = a.get_text(" ", strip=True)
        if not title or href in seen or title.lower() in ("more", "read on", "view"):
            continue
        seen.add(href)
        box = (a.find_parent(class_=re.compile("listItemsRow", re.I))
               or a.find_parent(class_=re.compile("bidItem", re.I)) or a.parent.parent)
        text = box.get_text(" ", strip=True) if box else ""
        if re.search(r"\b(closed|awarded|cancel)", text, re.I) and not re.search(r"\bopen\b", text, re.I):
            continue
        closes = re.search(r"Closes?:?\s*(.{0,40})", text, re.I)
        number = re.search(r"Bid (?:No\.?|Number|#):?\s*([\w\-./]+)", text, re.I)
        rows.append(base_row(source, title, href,
                             deadline=parse_date(closes.group(1)) if closes else None,
                             solicitation_number=number.group(1) if number else None,
                             extraction_method="html",
                             raw={"listing_url": url, "text": text[:1000]}))
    return rows


# --- OpenGov Procurement -----------------------------------------------------------

def opengov_code(source):
    m = re.search(r"procurement\.opengov\.com/portal/(?:embed/)?([\w-]+)", source.get("procurement_url") or "")
    return m.group(1) if m else None


def pull_opengov(source):
    """The portal is a JS app, so render it in a headless browser and read project links."""
    code = opengov_code(source)
    if not code:
        return []
    from playwright.sync_api import sync_playwright
    url = f"https://procurement.opengov.com/portal/{code}?status=open"
    rows = []
    with sync_playwright() as p:
        page = p.chromium.launch().new_page(user_agent=UA)
        page.goto(url, wait_until="networkidle", timeout=60000)
        for link in page.query_selector_all(f"a[href*='/portal/{code}/projects/']"):
            title = (link.inner_text() or "").strip()
            href = urljoin(url, link.get_attribute("href"))
            if not title or any(r["source_url"] == href for r in rows):
                continue
            card = link.evaluate_handle("e => e.closest('tr, li, [class*=project]') || e.parentElement")
            text = card.inner_text() if card else ""
            due = re.search(r"Due:?\s*(.{0,40})", text, re.I)
            rows.append(base_row(source, title.splitlines()[0], href,
                                 deadline=parse_date(due.group(1)) if due else None,
                                 extraction_method="html",
                                 raw={"listing_url": url, "text": text[:1000]}))
    return rows


# --- OregonBuys ---------------------------------------------------------------------

OREGONBUYS_SEARCH = "https://oregonbuys.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true"


def pull_oregonbuys(source, max_pages=10):
    """OregonBuys (Periscope BSO) is a JSF form: open the search, submit it, read the table."""
    from playwright.sync_api import sync_playwright
    rows = []
    with sync_playwright() as p:
        page = p.chromium.launch().new_page(user_agent=UA)
        page.goto(OREGONBUYS_SEARCH, wait_until="networkidle", timeout=60000)
        btn = page.query_selector("button:has-text('Search'), input[value='Search']")
        if btn:
            btn.click()
            page.wait_for_load_state("networkidle")
        for _ in range(max_pages):
            table = page.query_selector("table[id*='bidSearchResult'], table.ui-datatable-table, table[role='grid']")
            if not table:
                break
            headers = [h.inner_text().strip().lower() for h in table.query_selector_all("thead th")]
            for tr in table.query_selector_all("tbody tr"):
                cells = [c.inner_text().strip() for c in tr.query_selector_all("td")]
                if len(cells) < 3:
                    continue
                rec = dict(zip(headers, cells))
                link = tr.query_selector("a[href*='bidDetail'], a")
                href = urljoin(OREGONBUYS_SEARCH, link.get_attribute("href")) if link else None
                number = rec.get("bid solicitation #") or cells[0]
                if not href or href.startswith("javascript"):
                    href = f"https://oregonbuys.gov/bso/external/bidDetail.sdo?docId={number}&external=true"
                rows.append(base_row(source, rec.get("description") or number, href,
                                     agency=rec.get("organization name"),
                                     solicitation_number=number,
                                     deadline=parse_date(rec.get("bid opening date", "")),
                                     contact_name=rec.get("buyer"),
                                     extraction_method="html",
                                     raw=rec))
            nxt = page.query_selector("a.ui-paginator-next:not(.ui-state-disabled)")
            if not nxt:
                break
            nxt.click()
            page.wait_for_load_state("networkidle")
    # Platform rows carry no location; agency-level geocoding is the matcher's fallback.
    return rows


ADAPTERS = {"civicplus": pull_civicplus, "opengov": pull_opengov, "oregonbuys": pull_oregonbuys}


def load_sources():
    rows = json.load(open(ROOT / "data" / "sources.seed.json"))
    for f in sorted((ROOT / "data" / "agencies").glob("*.json")):
        data = json.load(open(f))
        if isinstance(data, list):
            rows += data
        else:  # wa_procurement_fixes.json
            by_id = {r["id"]: r for r in rows}
            for u in data.get("updates", []):
                if u["id"] in by_id:
                    by_id[u["id"]].update(u)
            rows += data.get("new", [])
    return rows


def adapter_for(source):
    plat = (source.get("platform") or "").lower()
    url = (source.get("procurement_url") or "").lower()
    if plat == "oregonbuys":
        return "oregonbuys"
    if plat == "opengov" or "procurement.opengov.com" in url:
        return "opengov"
    if plat == "civicplus" or "bids.aspx" in url:
        return "civicplus"
    return None


def upsert(rows):
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/bids?on_conflict=source_url"
    key = os.environ["SUPABASE_SECRET_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
               "Prefer": "resolution=merge-duplicates,return=minimal"}
    for i in range(0, len(rows), 200):
        r = requests.post(url, headers=headers, data=json.dumps(rows[i:i + 200]), timeout=60)
        if r.status_code >= 300:
            sys.exit(f"Supabase upsert failed {r.status_code}: {r.text[:500]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--platform", choices=sorted(ADAPTERS), action="append")
    ap.add_argument("--state", choices=["WA", "OR", "ID"])
    ap.add_argument("--limit", type=int, help="max sources per platform")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    dry = args.dry_run or not os.environ.get("SUPABASE_SECRET_KEY")

    wanted = set(args.platform or ADAPTERS)
    todo = {}
    for s in load_sources():
        name = adapter_for(s)
        if name in wanted and (not args.state or s["state"] == args.state):
            todo.setdefault(name, []).append(s)

    found, errors = [], []
    for name, sources in todo.items():
        for s in sources[: args.limit]:
            try:
                rows = ADAPTERS[name](s)
                print(f"{name:10} {s['id']:45} {len(rows):3} open bids")
                found += rows
            except Exception as e:  # keep going; one dead page shouldn't stop the crawl
                errors.append({"source_id": s["id"], "adapter": name, "error": str(e)[:300]})
                print(f"{name:10} {s['id']:45} ERROR {str(e)[:120]}")

    dedup = {r["source_url"]: r for r in found}
    rows = list(dedup.values())
    print(f"{len(rows)} bids from {sum(len(v[: args.limit]) for v in todo.values())} sources, {len(errors)} errors")
    if dry:
        out = ROOT / "data" / "bids.pulled.json"
        out.write_text(json.dumps({"bids": rows, "errors": errors}, indent=2) + "\n")
        print(f"dry run: wrote {out.relative_to(ROOT)}")
    else:
        upsert(rows)
        print("upserted to Supabase")


if __name__ == "__main__":
    main()
