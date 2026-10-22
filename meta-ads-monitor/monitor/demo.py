"""Worked example that mirrors the build brief. Used by `python -m monitor demo` and the tests."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from .analyse import ClientReport, build_report
from .config import parse_client
from .leads import Lead
from .model import AccountData, Ad, Day

TODAY = date(2026, 10, 22)


def _lead(i: int, client: str, day: date, ad: str, counts: bool = True) -> Lead:
    return Lead(f"{client[:2]}{i}", client, datetime(day.year, day.month, day.day, 12, tzinfo=timezone.utc), ad, ad, "", counts)


def _days(start: date, spends: list[float], leads: list[int] | None = None, imps: int = 2000, ctr: float = 0.012):
    leads = leads or [0] * len(spends)
    return {
        start + timedelta(days=i): Day(spend=s, leads=l, impressions=imps, link_clicks=int(imps * ctr))
        for i, (s, l) in enumerate(zip(spends, leads))
    }


def build() -> tuple[list[ClientReport], date]:
    cfg = {
        "Apex-Leads": dict(guarantee="none", own=True),
        "FG Landscaping": dict(guarantee="25_in_30", go_live="2026-10-12"),
        "Dreamy Landscapes": dict(guarantee="30_in_60", go_live="2026-10-19"),
        "Elite Roofing": dict(guarantee="free_trial", original_guarantee="25_in_30", free_trial_from="2026-10-05",
                              leads_owed=7, client_deadline="2026-10-23"),
        "Efficient Roofing": dict(guarantee="30_in_60"),
    }
    clients = {n: parse_client({"name": n, "ad_account_id": "act_1", **c}) for n, c in cfg.items()}
    reports = []

    # Apex-Leads: 9 leads yesterday on £52.20
    own = AccountData(daily=_days(TODAY - timedelta(days=14), [50.0] * 13 + [52.2], [8] * 13 + [9]))
    reports.append(build_report(clients["Apex-Leads"], own, [], TODAY))

    # FG: 8 counted by day 10, only 2 in the last 5 days, frequency 3.4, £15.50/day
    fg_dates = [date(2026, 10, 12), date(2026, 10, 13), date(2026, 10, 14), date(2026, 10, 15), date(2026, 10, 15),
                date(2026, 10, 16), date(2026, 10, 18), date(2026, 10, 20)]
    fg_leads = [_lead(i, "FG Landscaping", d, "fg-1") for i, d in enumerate(fg_dates)]
    fg = AccountData(
        daily=_days(date(2026, 10, 8), [15.5] * 14, [0, 0, 0, 0, 1, 1, 1, 2, 0, 1, 0, 1, 0, 0]),
        ads=[Ad("fg-1", "Garden transformation", "ACTIVE", spend_total=155, leads_meta=8, spend_7d=108, frequency_7d=3.4),
             Ad("fg-2", "Patio before/after", "ACTIVE", spend_total=45, spend_7d=45, frequency_7d=1.8)],
    )
    reports.append(build_report(clients["FG Landscaping"], fg, fg_leads, TODAY))

    # Dreamy: day 3, 3 leads (1 excluded), £36.81 spent
    dr_leads = [_lead(0, "Dreamy Landscapes", date(2026, 10, 19), "dr-1"),
                _lead(1, "Dreamy Landscapes", date(2026, 10, 20), "dr-1", counts=False),
                _lead(2, "Dreamy Landscapes", date(2026, 10, 21), "dr-1")]
    dr = AccountData(
        daily=_days(date(2026, 10, 19), [12.0, 12.31, 12.5], [1, 1, 1]),
        ads=[Ad("dr-1", "Lawn makeover", "ACTIVE", spend_total=36.81, leads_meta=3, spend_7d=36.81, frequency_7d=1.2)],
    )
    reports.append(build_report(clients["Dreamy Landscapes"], dr, dr_leads, TODAY))

    # Elite: free trial since 5 Oct, 2 leads delivered since, £20/day
    el_leads = [_lead(0, "Elite Roofing", date(2026, 10, 10), "el-1"), _lead(1, "Elite Roofing", date(2026, 10, 17), "el-1")]
    el = AccountData(
        daily=_days(date(2026, 10, 8), [20.0] * 14, [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]),
        ads=[Ad("el-1", "Roof repair offer", "ACTIVE", spend_total=340, leads_meta=2, spend_7d=140, frequency_7d=2.1)],
    )
    reports.append(build_report(clients["Elite Roofing"], el, el_leads, TODAY))

    reports.append(build_report(clients["Efficient Roofing"], None, [], TODAY))
    return reports, TODAY
