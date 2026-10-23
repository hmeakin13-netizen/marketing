"""Guarantee maths. Pure functions: no API calls, so they are easy to test."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from .config import Client
from .leads import Lead

RECENT_DAYS = 5
AT_RISK_FLOOR = 0.75


@dataclass
class Guarantee:
    state: str  # NONE | NOT_LIVE | ACTIVE | HIT | FREE_TRIAL
    required: int | None = None
    window: int | None = None
    go_live: date | None = None
    day: int = 0
    days_left: int = 0
    total: int = 0
    counted: int = 0
    pace: float = 0.0
    recent_rate: float = 0.0
    projected: float = 0.0
    status: str = ""  # AHEAD | ON PACE | AT RISK | WILL MISS (ACTIVE only)
    too_early: bool = False
    # free trial (set explicitly, or switched automatically when a window ends short)
    auto_switched: bool = False
    just_switched: bool = False
    trial_from: date | None = None
    owed: int | None = None
    delivered_since: int = 0
    owed_remaining: int | None = None
    spend_since: float | None = None
    today_leads: int = 0  # leads so far today (incomplete day), shown on top of `counted`

    @property
    def excluded(self) -> int:
        return self.total - self.counted


def _between(leads: list[Lead], start: date, end_exclusive: date) -> list[Lead]:
    return [l for l in leads if start <= l.created < end_exclusive]


def _counted(leads: list[Lead]) -> int:
    return sum(1 for l in leads if l.counts)


def assess(client: Client, leads: list[Lead], daily_spend: dict[date, float], today: date) -> Guarantee:
    """`leads` are this client's leads; `daily_spend` maps date -> account spend.

    Everything runs to the end of yesterday: today's numbers are incomplete at breakfast.
    """
    if client.guarantee == "none":
        return Guarantee(state="NONE")
    if client.guarantee == "free_trial":
        g = Guarantee(state="FREE_TRIAL", trial_from=client.free_trial_from, owed=client.leads_owed)
        terms = client.terms()
        if terms:
            g.required, g.window = terms
        return _fill_free_trial(g, leads, daily_spend, today)

    required, window = client.terms()
    go_live = client.go_live
    if go_live is None or go_live >= today:
        return Guarantee(state="NOT_LIVE", required=required, window=window, go_live=go_live)

    day = (today - go_live).days  # full days of data: go-live 12 Oct, today 22 Oct -> day 10
    window_end = go_live + timedelta(days=window)
    in_window = _between(leads, go_live, min(today, window_end))
    counted = _counted(in_window)
    g = Guarantee(
        state="ACTIVE",
        required=required,
        window=window,
        go_live=go_live,
        day=min(day, window),
        days_left=max(window - day, 0),
        total=len(in_window),
        counted=counted,
        pace=required / window * min(day, window),
    )

    if counted >= required:
        g.state = "HIT"
        return g

    if day >= window:
        # Window over, guarantee missed: Apex-Leads keeps working for free until it's delivered.
        g.state = "FREE_TRIAL"
        g.auto_switched = True
        g.just_switched = day == window
        g.trial_from = window_end
        g.owed = required - counted
        return _fill_free_trial(g, leads, daily_spend, today)

    g.too_early = day < RECENT_DAYS
    if g.too_early:
        g.recent_rate = counted / day
    else:
        recent = _between(leads, today - timedelta(days=RECENT_DAYS), today)
        g.recent_rate = _counted(recent) / RECENT_DAYS
    g.projected = counted + g.recent_rate * g.days_left

    if g.projected >= required:
        g.status = "AHEAD" if counted >= g.pace else "ON PACE"
    elif g.projected >= AT_RISK_FLOOR * required:
        g.status = "AT RISK"
    else:
        g.status = "WILL MISS"
    return g


def _fill_free_trial(g: Guarantee, leads: list[Lead], daily_spend: dict[date, float], today: date) -> Guarantee:
    if g.trial_from is not None:
        since = _between(leads, g.trial_from, today)
        g.delivered_since = _counted(since)
        g.spend_since = sum(v for d, v in daily_spend.items() if g.trial_from <= d < today)
    if g.owed is not None:
        g.owed_remaining = max(g.owed - g.delivered_since, 0)
    return g
