"""Plain data shapes shared by the collector, the analysis and the demo."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


@dataclass
class Day:
    spend: float = 0.0
    leads: int = 0  # as counted by Meta
    impressions: int = 0
    link_clicks: int = 0


@dataclass
class Ad:
    id: str
    name: str
    effective_status: str  # ACTIVE, PAUSED, DISAPPROVED, WITH_ISSUES, ...
    spend_total: float = 0.0  # since go-live (or last 30 days if no go-live)
    leads_meta: int = 0
    spend_7d: float = 0.0
    frequency_7d: float = 0.0

    @property
    def is_active(self) -> bool:
        return self.effective_status == "ACTIVE"


@dataclass
class AccountData:
    account_status: int = 1
    disable_reason: int = 0
    daily: dict[date, Day] = field(default_factory=dict)
    ads: list[Ad] = field(default_factory=list)
    campaigns_not_spending: list[str] = field(default_factory=list)  # ACTIVE but £0 yesterday
    active_campaigns: int = 0
    today: Day | None = None  # today so far (incomplete day): shown as "+N today", never used for the pace maths

    def spend_by_day(self) -> dict[date, float]:
        return {d: v.spend for d, v in self.daily.items()}
