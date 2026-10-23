"""Turn one client's settings + Meta data + lead log into a structured report."""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta, timezone

from . import guarantee as gmod
from .config import TERMS, Client
from .leads import Lead
from .model import AccountData, Ad, Day

GREEN, AMBER, RED = 0, 1, 2
TEST_SPEND = 100.0  # an ad is "still testing" until it has spent this much
CTR_DROP = 0.20
CTR_MIN_IMPRESSIONS = 1000
MIN_LOG_GAP = 2  # lead log may trail Meta by this many leads before we say so

# Meta account_status values
ACCOUNT_PROBLEMS = {
    2: ("account disabled", RED),
    3: ("payment failure (account unsettled)", RED),
    7: ("account in risk review (limited)", RED),
    8: ("payment settlement pending", AMBER),
    9: ("payment failure (grace period)", RED),
    100: ("account pending closure", RED),
    101: ("account closed", RED),
}
AD_PROBLEMS = {"DISAPPROVED": "rejected", "WITH_ISSUES": "has delivery issues"}


@dataclass
class Flag:
    sev: int
    text: str


@dataclass
class Cpl:
    days: int
    spend: float
    all_leads: int
    counted: int
    sev: int | None = None
    target: float | None = None
    max: float | None = None

    @property
    def cpl_all(self) -> float | None:
        return self.spend / self.all_leads if self.all_leads else None

    @property
    def cpl_counted(self) -> float | None:
        return self.spend / self.counted if self.counted else None


@dataclass
class ClientReport:
    client: Client
    guarantee: gmod.Guarantee | None = None
    cpl: Cpl | None = None
    flags: list[Flag] = field(default_factory=list)
    deadline_days: int | None = None
    testing_ads: int = 0
    top_frequency: float | None = None
    yesterday_leads: int = 0
    yesterday_spend: float = 0.0
    error: str | None = None

    @property
    def severity(self) -> int:
        if self.error:
            return AMBER
        sevs = [f.sev for f in self.flags]
        if self.cpl and self.cpl.sev is not None:
            sevs.append(self.cpl.sev)
        g = self.guarantee
        if g:
            if g.state == "FREE_TRIAL" and g.owed_remaining != 0:
                sevs.append(RED)
            elif g.state == "ACTIVE" and not g.too_early:
                sevs.append({"AHEAD": GREEN, "ON PACE": GREEN, "AT RISK": AMBER, "WILL MISS": RED}[g.status])
        return max(sevs, default=GREEN)


def cpl_severity(cpl: float | None, target: float | None, max_cpl: float | None) -> int | None:
    if cpl is None or target is None or max_cpl is None:
        return None
    if cpl <= target:
        return GREEN
    return AMBER if cpl <= max_cpl else RED


def _zero_lead_sev(spend: float, max_cpl: float | None) -> int | None:
    """Amber once an ad/account has spent one max-CPL with no leads, red at two."""
    if not max_cpl:
        return None
    if spend >= 2 * max_cpl:
        return RED
    return AMBER if spend >= max_cpl else None


def _in_range(leads: list[Lead], start: date, end_exclusive: date) -> list[Lead]:
    return [l for l in leads if start <= l.created < end_exclusive]


def leads_from_meta(client: Client, daily: dict[date, Day]) -> list[Lead]:
    """Stand-in lead log built from Meta's daily lead counts.

    Every lead counts except `client.excluded_leads` of them (taken from the earliest days),
    so Harry can say "one of these was an invalid number" without a lead log.
    """
    out = []
    for d in sorted(daily):
        stamp = datetime(d.year, d.month, d.day, 12, tzinfo=timezone.utc)
        out += [Lead(f"meta-{d}-{i}", client.name, stamp) for i in range(daily[d].leads)]
    skip = min(client.excluded_leads, len(out))
    return [replace(l, counts=False, note="excluded in config") if i < skip else l for i, l in enumerate(out)]


def is_not_live(client: Client, today: date) -> bool:
    if client.go_live_auto:
        return False  # decided from the data
    return client.guarantee in TERMS and (client.go_live is None or client.go_live >= today)


def build_report(
    client: Client,
    data: AccountData | None,
    leads: list[Lead],
    today: date,
    error: str | None = None,
    meta_counts: bool = False,
) -> ClientReport:
    if client.go_live_auto and data is not None:
        spent_days = [d for d, v in data.daily.items() if v.spend > 0]
        client = replace(client, go_live=min(spent_days) if spent_days else None)
        if client.go_live is None:
            return ClientReport(client=client, error=error, guarantee=gmod.Guarantee(state="NOT_LIVE"))
    report = ClientReport(client=client, error=error)
    if client.client_deadline:
        report.deadline_days = (client.client_deadline - today).days
    if is_not_live(client, today):
        report.guarantee = gmod.Guarantee(state="NOT_LIVE", go_live=client.go_live)
        return report
    if data is None:
        return report

    daily = data.daily
    yesterday = today - timedelta(days=1)
    spend_by_day = data.spend_by_day()
    day = daily.get(yesterday)
    report.yesterday_spend = day.spend if day else 0.0
    report.yesterday_leads = day.leads if day else 0

    # The client's own account has no lead log to maintain: Meta's count is the count.
    use_log = not client.own
    if meta_counts and use_log:
        leads = leads_from_meta(client, daily)
    report.guarantee = gmod.assess(client, leads, spend_by_day, today) if use_log else gmod.Guarantee(state="NONE")
    g = report.guarantee
    max_cpl, target = client.max_cpl_value(), client.target_cpl_value()

    report.flags += _delivery_flags(data)

    if g.state == "NOT_LIVE":
        return report

    # CPL over the last 5 days (or since go-live if newer). Own account: yesterday only.
    live_since = client.go_live or client.free_trial_from
    if client.own:
        days = 1
    else:
        days = gmod.RECENT_DAYS
        if live_since and (today - live_since).days < gmod.RECENT_DAYS and live_since < today:
            days = max((today - live_since).days, 1)
    start = today - timedelta(days=days)
    spend = sum(v for d, v in spend_by_day.items() if start <= d < today)
    if use_log:
        window_leads = _in_range(leads, start, today)
        cpl = Cpl(days, spend, len(window_leads), sum(1 for l in window_leads if l.counts))
    else:
        meta_leads = sum(v.leads for d, v in daily.items() if start <= d < today)
        cpl = Cpl(days, spend, meta_leads, meta_leads)
    cpl.target, cpl.max = target, max_cpl
    cpl.sev = cpl_severity(cpl.cpl_counted, target, max_cpl)
    report.cpl = cpl

    report.flags += _account_zero_lead(client, daily, leads, today, max_cpl, use_log)
    report.flags += _ad_flags(client, data, leads, max_cpl, use_log and not meta_counts, report)
    report.flags += _ctr_flag(daily, today)
    if use_log and not meta_counts:
        report.flags += _log_gap_flag(client, data, leads, today)
    return report


def _delivery_flags(data: AccountData) -> list[Flag]:
    flags = []
    problem = ACCOUNT_PROBLEMS.get(data.account_status)
    if problem:
        flags.append(Flag(problem[1], f"Delivery: {problem[0]}."))
    for ad in data.ads:
        if ad.effective_status in AD_PROBLEMS:
            flags.append(Flag(AMBER, f"Delivery: ad '{ad.name}' {AD_PROBLEMS[ad.effective_status]}."))
    if data.campaigns_not_spending:
        names = ", ".join(data.campaigns_not_spending[:3])
        flags.append(Flag(RED, f"Delivery: active campaign not spending yesterday ({names})."))
    return flags


def _account_zero_lead(client, daily, leads, today, max_cpl, use_log) -> list[Flag]:
    if use_log:
        lead_days = [l.created for l in leads if l.created < today]
    else:
        lead_days = [d for d, v in daily.items() if v.leads > 0]
    since = max(lead_days) if lead_days else None
    start = since + timedelta(days=1) if since else (client.go_live or min(daily, default=today))
    spent = sum(v.spend for d, v in daily.items() if start <= d < today)
    sev = _zero_lead_sev(spent, max_cpl)
    if sev is None:
        return []
    when = f"since {since:%a %-d %b}" if since else "since go-live"
    return [Flag(sev, f"No leads {when}: £{spent:,.0f} spent (max CPL £{max_cpl:,.0f}).")]


def _ad_flags(client, data, leads, max_cpl, use_log, report) -> list[Flag]:
    flags: list[Flag] = []
    per_ad_all: dict[str, int] = {}
    per_ad_counted: dict[str, int] = {}
    for lead in leads:
        per_ad_all[lead.ad_id] = per_ad_all.get(lead.ad_id, 0) + 1
        per_ad_counted[lead.ad_id] = per_ad_counted.get(lead.ad_id, 0) + (1 if lead.counts else 0)

    worst_freq: Ad | None = None
    for ad in data.ads:
        if not ad.is_active:
            continue
        all_leads = per_ad_all.get(ad.id, 0) if use_log else ad.leads_meta
        counted = per_ad_counted.get(ad.id, 0) if use_log else ad.leads_meta
        if max_cpl:
            if ad.spend_total < TEST_SPEND:
                report.testing_ads += 1
                sev = _zero_lead_sev(ad.spend_total, max_cpl) if all_leads == 0 else None
                if sev is not None:
                    flags.append(Flag(sev, f"Ad '{ad.name}': £{ad.spend_total:,.0f} spent, no leads (still testing)."))
            else:
                cpl = ad.spend_total / counted if counted else None
                if cpl is None:
                    flags.append(Flag(RED if ad.spend_total >= 2 * max_cpl else AMBER,
                                      f"Kill '{ad.name}': £{ad.spend_total:,.0f} spent, no leads."))
                elif cpl > max_cpl:
                    flags.append(Flag(AMBER, f"Kill '{ad.name}': CPL £{cpl:,.2f} on £{ad.spend_total:,.0f} spent (max £{max_cpl:,.0f})."))
        if ad.spend_7d > 0 and (worst_freq is None or ad.frequency_7d > worst_freq.frequency_7d):
            worst_freq = ad

    if worst_freq:
        report.top_frequency = worst_freq.frequency_7d
        if worst_freq.frequency_7d >= client.frequency_red:
            sev = RED
        elif worst_freq.frequency_7d >= client.frequency_amber:
            sev = AMBER
        else:
            sev = None
        if sev is not None:
            flags.append(Flag(sev, f"Frequency {worst_freq.frequency_7d:.1f} on '{worst_freq.name}' (creative fatigue risk)."))
    return flags


def _ctr_flag(daily, today) -> list[Flag]:
    def ctr(start: date, end: date) -> tuple[float | None, int]:
        rows = [v for d, v in daily.items() if start <= d < end]
        impressions = sum(v.impressions for v in rows)
        clicks = sum(v.link_clicks for v in rows)
        return (clicks / impressions if impressions else None), impressions

    this_ctr, this_imp = ctr(today - timedelta(days=7), today)
    prev_ctr, prev_imp = ctr(today - timedelta(days=14), today - timedelta(days=7))
    if not this_ctr or not prev_ctr or min(this_imp, prev_imp) < CTR_MIN_IMPRESSIONS:
        return []
    drop = 1 - this_ctr / prev_ctr
    if drop > CTR_DROP:
        return [Flag(AMBER, f"CTR down {drop:.0%} week on week ({prev_ctr:.2%} to {this_ctr:.2%}).")]
    return []


def _log_gap_flag(client, data, leads, today) -> list[Flag]:
    start = client.go_live or client.free_trial_from
    if not start:
        return []
    meta_total = sum(v.leads for d, v in data.daily.items() if start <= d < today)
    logged = len(_in_range(leads, start, today))
    if meta_total - logged >= MIN_LOG_GAP:
        return [Flag(AMBER, f"Lead log is {meta_total - logged} short of Meta's count ({logged} vs {meta_total}). Check lead sync.")]
    return []
