"""Structured snapshot of a run, for the website to draw. Same facts as the text message."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import date, datetime, timezone

from .analyse import ClientReport
from .report import _is_open_deadline, _sort_key, deadline_phrase, look_at_first, render, render_block, terms_label


def _r(value, places=2):
    return None if value is None else round(value, places)


def client_snapshot(r: ClientReport) -> dict:
    c, g, cpl = r.client, r.guarantee, r.cpl
    out = {
        "name": c.name,
        "own": c.own,
        "severity": r.severity,
        "state": "ERROR" if r.error else (g.state if g else "NONE"),
        "error": r.error,
        "lines": render_block(r),
        "deadline": deadline_phrase(r) if _is_open_deadline(r) else None,
        "deadline_days": r.deadline_days if _is_open_deadline(r) else None,
        "flags": [{"sev": f.sev, "text": f.text} for f in sorted(r.flags, key=lambda f: -f.sev)],
        "testing_ads": r.testing_ads,
        "yesterday_leads": r.yesterday_leads,
        "yesterday_spend": _r(r.yesterday_spend),
        "guarantee": None,
        "cpl": None,
    }
    if g and g.state not in ("NONE", "NOT_LIVE"):
        out["guarantee"] = {
            "terms": terms_label(c.guarantee if g.state != "FREE_TRIAL" else c.original_guarantee),
            "go_live": g.go_live.isoformat() if g.go_live else None,
            "day": g.day, "window": g.window, "required": g.required,
            "counted": g.counted, "total": g.total, "excluded": g.excluded,
            "pace": _r(g.pace, 1), "recent_rate": _r(g.recent_rate, 2), "projected": _r(g.projected, 1),
            "status": g.status, "too_early": g.too_early,
            "owed_remaining": g.owed_remaining, "spend_since": _r(g.spend_since),
            "auto_switched": g.auto_switched,
        }
    if cpl:
        out["cpl"] = {
            "days": cpl.days, "all": _r(cpl.cpl_all), "counted": _r(cpl.cpl_counted),
            "target": cpl.target, "max": cpl.max, "sev": cpl.sev, "spend": _r(cpl.spend),
        }
    return out


def build_snapshot(reports: list[ClientReport], today: date, warnings: list[str]) -> dict:
    ordered = sorted(reports, key=_sort_key)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "date": today.isoformat(),
        "look_at_first": look_at_first(ordered),
        "warnings": warnings,
        "message": render(reports, today, warnings),
        "clients": [client_snapshot(r) for r in ordered],
    }


def publish(snapshot: dict) -> None:
    """Save the snapshot to the team portal's Supabase through publish_ads_snapshot().

    Uses the public anon key plus a shared ingest key, so no powerful database key is needed.
    """
    base = os.environ["SUPABASE_URL"].strip().rstrip("/")
    anon = os.environ["SUPABASE_ANON_KEY"].strip()
    body = json.dumps(
        {"p_secret": os.environ["ADS_INGEST_KEY"].strip(), "p_date": snapshot["date"], "p_payload": snapshot}
    ).encode()
    request = urllib.request.Request(
        f"{base}/rest/v1/rpc/publish_ads_snapshot",
        data=body,
        method="POST",
        headers={"apikey": anon, "Authorization": f"Bearer {anon}", "Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(request, timeout=30).close()
    except urllib.error.HTTPError as err:
        hint = " The ADS_INGEST_KEY secret doesn't match: re-add it." if err.code in (401, 403) else ""
        raise RuntimeError(f"Saving to the website failed (HTTP {err.code}).{hint}") from None
