"""Settings: one entry per client, loaded from config/clients.json."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

TERMS = {"30_in_60": (30, 60), "25_in_30": (25, 30)}  # (leads required, window days)
GUARANTEES = ("30_in_60", "25_in_30", "free_trial", "none")
PLACEHOLDER_ACCOUNT = "act_REPLACE_ME"
TARGET_SHARE_OF_MAX = 0.75


@dataclass(frozen=True)
class Client:
    name: str
    ad_account_id: str
    guarantee: str
    go_live: date | None = None
    go_live_auto: bool = False  # go-live = first day the account spent money
    daily_budget: float = 20.0
    target_cpl: float | None = None
    max_cpl: float | None = None
    client_deadline: date | None = None
    # free_trial only: leads owed as at free_trial_from, and the terms they were sold on
    leads_owed: int | None = None
    free_trial_from: date | None = None
    original_guarantee: str | None = None
    own: bool = False
    frequency_amber: float = 3.0
    frequency_red: float = 4.0
    notes: str = ""

    def terms(self) -> tuple[int, int] | None:
        key = self.guarantee if self.guarantee in TERMS else self.original_guarantee
        return TERMS.get(key or "")

    def max_cpl_value(self) -> float | None:
        if self.max_cpl is not None:
            return self.max_cpl
        terms = self.terms()
        if terms is None:
            return None
        required, window = terms
        return round(self.daily_budget * window / required, 2)

    def target_cpl_value(self) -> float | None:
        if self.target_cpl is not None:
            return self.target_cpl
        max_cpl = self.max_cpl_value()
        return None if max_cpl is None else round(max_cpl * TARGET_SHARE_OF_MAX, 2)

    def has_account(self) -> bool:
        return self.ad_account_id.startswith("act_") and self.ad_account_id != PLACEHOLDER_ACCOUNT

    def setup_gaps(self) -> list[str]:
        gaps = []
        if not self.has_account():
            gaps.append("ad_account_id not set")
        if self.guarantee in TERMS and self.go_live is None and not self.go_live_auto:
            gaps.append("go_live not set (shown as 'not live')")
        if self.guarantee == "free_trial":
            if self.leads_owed is None:
                gaps.append("leads_owed not set")
            if self.free_trial_from is None:
                gaps.append("free_trial_from not set (spend since window ended unknown)")
            if self.original_guarantee is None and self.max_cpl is None:
                gaps.append("original_guarantee not set (no CPL max/target)")
        return gaps


def _date(value, field: str, name: str) -> date | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name}: {field} must be YYYY-MM-DD, got {value!r}") from None


def parse_client(raw: dict) -> Client:
    name = raw.get("name")
    if not name:
        raise ValueError("every client needs a name")
    guarantee = raw.get("guarantee")
    if guarantee not in GUARANTEES:
        raise ValueError(f"{name}: guarantee must be one of {', '.join(GUARANTEES)}")
    original = raw.get("original_guarantee")
    if original is not None and original not in TERMS:
        raise ValueError(f"{name}: original_guarantee must be one of {', '.join(TERMS)}")
    account = raw.get("ad_account_id") or PLACEHOLDER_ACCOUNT
    if not account.startswith("act_"):
        raise ValueError(f"{name}: ad_account_id must look like act_1234567890")
    return Client(
        name=name,
        ad_account_id=account,
        guarantee=guarantee,
        go_live=None if raw.get("go_live") == "auto" else _date(raw.get("go_live"), "go_live", name),
        go_live_auto=raw.get("go_live") == "auto",
        daily_budget=float(raw.get("daily_budget", 20)),
        target_cpl=raw.get("target_cpl"),
        max_cpl=raw.get("max_cpl"),
        client_deadline=_date(raw.get("client_deadline"), "client_deadline", name),
        leads_owed=raw.get("leads_owed"),
        free_trial_from=_date(raw.get("free_trial_from"), "free_trial_from", name),
        original_guarantee=original,
        own=bool(raw.get("own", False)),
        frequency_amber=float(raw.get("frequency_amber", 3)),
        frequency_red=float(raw.get("frequency_red", 4)),
        notes=raw.get("notes", ""),
    )


def load_clients(path: str | Path) -> list[Client]:
    data = json.loads(Path(path).read_text())
    clients = [parse_client(raw) for raw in data["clients"]]
    names = [c.name for c in clients]
    if len(set(names)) != len(names):
        raise ValueError("client names must be unique")
    return clients
