"""Render the morning message: short, phone-readable, worst first, UK English and £."""
from __future__ import annotations

from datetime import date

from .analyse import AMBER, GREEN, RED, ClientReport
from .config import TERMS

DOT = {GREEN: "🟢", AMBER: "🟠", RED: "🔴"}
MAX_FLAG_LINES = 4


def money(value: float) -> str:
    return f"£{value:,.2f}"


def whole(value: float) -> str:
    return f"£{value:,.0f}"


def terms_label(key: str | None) -> str:
    if key in TERMS:
        required, window = TERMS[key]
        return f"{required} in {window}"
    return ""


def countdown(days: int) -> str:
    if days < 0:
        return f"OVERDUE by {-days} day{'s' if days < -1 else ''}"
    if days == 0:
        return "TODAY"
    return f"{days} day{'s' if days > 1 else ''}"


def deadline_phrase(report: ClientReport) -> str:
    d = report.client.client_deadline
    if report.deadline_days is None or d is None:
        return ""
    if report.deadline_days <= 0:
        return f"client deadline {countdown(report.deadline_days)}"
    return f"client deadline {d:%a} ({countdown(report.deadline_days)})"


def _is_open_deadline(r: ClientReport) -> bool:
    """A deadline only matters while there is still something to deliver."""
    g = r.guarantee
    if r.deadline_days is None:
        return False
    return not (g and (g.state == "HIT" or (g.state == "FREE_TRIAL" and g.owed_remaining == 0)))


def _sort_key(r: ClientReport):
    g = r.guarantee
    not_live = bool(g and g.state == "NOT_LIVE")
    deadline = r.deadline_days if _is_open_deadline(r) else 10_000
    return (r.client.own, not_live, deadline, -r.severity, r.client.name)


def _cpl_line(r: ClientReport) -> str | None:
    c = r.cpl
    if c is None:
        return None
    span = "yesterday" if r.client.own else f"last {c.days} day{'s' if c.days > 1 else ''}"
    if c.all_leads == 0:
        return f"No leads in the {span}: {whole(c.spend)} spent." if not r.client.own else None
    if c.counted == c.all_leads:
        text = f"CPL {money(c.cpl_all)}"
    elif c.counted == 0:
        text = f"CPL {money(c.cpl_all)} all leads, no counted leads"
    else:
        text = f"CPL {money(c.cpl_all)} all leads, {money(c.cpl_counted)} counted"
    bounds = []
    if c.target is not None:
        bounds.append(f"target {whole(c.target)}")
    if c.max is not None:
        bounds.append(f"max {whole(c.max)}")
    if bounds:
        text += f" ({', '.join(bounds)})"
    if c.sev == RED:
        text += " OVER MAX"
    elif c.sev == AMBER:
        text += " over target"
    return text + "."


def _flag_lines(r: ClientReport) -> list[str]:
    flags = sorted(r.flags, key=lambda f: -f.sev)
    lines = [f"⚠ {f.text}" for f in flags[:MAX_FLAG_LINES]]
    if len(flags) > MAX_FLAG_LINES:
        lines.append(f"+{len(flags) - MAX_FLAG_LINES} more")
    if r.testing_ads:
        lines.append(f"{r.testing_ads} ad{'s' if r.testing_ads > 1 else ''} still testing (under £100).")
    return lines


def render_block(r: ClientReport) -> list[str]:
    c, g = r.client, r.guarantee
    if r.error:
        return [f"⚠ {c.name}: couldn't read Meta data ({r.error})"]
    if g and g.state == "NOT_LIVE":
        when = f" (go-live {g.go_live:%a %-d %b})" if g.go_live else ""
        return [f"⚪ {c.name}: not live yet{when}"]

    if c.own:
        cpl = r.cpl
        dot = f"{DOT[cpl.sev]} " if cpl and cpl.sev is not None else ""
        head = f"{dot}{c.name} (own): {r.yesterday_leads} lead{'s' if r.yesterday_leads != 1 else ''} yesterday"
        if r.yesterday_leads:
            head += f", CPL {money(r.yesterday_spend / r.yesterday_leads)}"
        elif r.yesterday_spend:
            head += f", {whole(r.yesterday_spend)} spent"
        if c.target_cpl_value() is not None:
            head += f" (target {whole(c.target_cpl_value())})"
        return [head + "."] + _flag_lines(r)

    dot = "⏰" if _is_open_deadline(r) else DOT[r.severity]
    deadline = deadline_phrase(r) if _is_open_deadline(r) else ""
    lines: list[str] = []

    if g.state == "FREE_TRIAL":
        label = f"FREE TRIAL{' (switched from ' + terms_label(c.original_guarantee) + ')' if g.auto_switched else ''}"
        lines.append(", ".join(p for p in (f"{dot} {c.name}", label, deadline) if p))
        if g.just_switched:
            lines.append(f"Window ended without {g.required} leads ({g.counted} counted). Switched to free trial today.")
        if g.owed_remaining is None:
            owed = "Leads owed: not set."
        elif g.owed_remaining == 0:
            owed = "All owed leads delivered."
        else:
            owed = f"{g.owed_remaining} lead{'s' if g.owed_remaining != 1 else ''} still owed."
        if g.spend_since is None:
            spend = "Spend since window ended: not known (set free_trial_from)."
        else:
            spend = f"Spend since window ended {whole(g.spend_since)}."
        lines.append(f"{owed} {spend}")
    elif g.state == "HIT":
        lines.append(f"{dot} {c.name}, day {g.day}/{g.window} ({terms_label(c.guarantee)})")
        lines.append(f"Guarantee hit: {g.counted} of {g.required} counted.")
    else:  # ACTIVE
        head = f"{dot} {c.name}, day {g.day}/{g.window} ({terms_label(c.guarantee)})"
        lines.append(", ".join(p for p in (head, deadline) if p))
        counted = f"{g.counted} of {g.required} counted"
        if g.today_leads:
            counted += f" (+{g.today_leads} today)"
        if g.excluded:
            counted += f" ({g.total} total, {g.excluded} excluded)"
        verdict = "Too early to call." if g.too_early else (
            f"Recent rate {g.recent_rate:.1f}/day, projected ~{g.projected:.0f}. {g.status}."
        )
        lines.append(f"{counted}. Pace line {g.pace:.1f}. {verdict}")

    cpl = _cpl_line(r)
    if cpl:
        lines.append(cpl)
    return lines + _flag_lines(r)


def _reason(r: ClientReport) -> str:
    g = r.guarantee
    if _is_open_deadline(r):
        when = "today" if r.deadline_days == 0 else (
            "overdue" if r.deadline_days < 0 else "tomorrow" if r.deadline_days == 1 else f"in {r.deadline_days} days"
        )
        return f"deadline {when}"
    if g and g.state == "FREE_TRIAL" and g.owed_remaining:
        return f"{g.owed_remaining} leads owed"
    if g and g.state == "ACTIVE" and not g.too_early and g.status in ("WILL MISS", "AT RISK"):
        return g.status
    reds = [f for f in r.flags if f.sev == RED]
    return reds[0].text.split(":")[0].rstrip(".") if reds else "red flags"


def look_at_first(reports: list[ClientReport]) -> str:
    picks = []
    for r in reports:
        if r.client.own or r.error or (r.guarantee and r.guarantee.state == "NOT_LIVE"):
            continue
        if _is_open_deadline(r) or r.severity == RED:
            picks.append(f"{r.client.name.split()[0]} ({_reason(r)})")
    return "Look at first: " + (", then ".join(picks[:3]) + "." if picks else "nothing urgent.")


def render(reports: list[ClientReport], today: date, warnings: list[str] | None = None) -> str:
    ordered = sorted(reports, key=_sort_key)
    out = [f"MORNING CHECK, {today:%a %-d %b}", ""]
    for r in ordered:
        out += render_block(r) + [""]
    for w in warnings or []:
        out.append(f"⚠ {w}")
    if warnings:
        out.append("")
    out.append(look_at_first(ordered))
    return "\n".join(out)
