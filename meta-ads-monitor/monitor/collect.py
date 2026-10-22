"""Pull account data and leads from Meta (read-only) into the shapes in model.py."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

from .config import Client
from .leads import LONDON, Lead, parse_meta_time
from .meta_client import MetaClient
from .model import AccountData, Ad, Day

HISTORY_DAYS = 14  # enough for week-on-week CTR
LEAD_ACTION = "lead"  # check on real data: Meta also reports onsite_conversion.lead_grouped


def _lead_count(actions: list[dict] | None) -> int:
    for action in actions or []:
        if action.get("action_type") == LEAD_ACTION:
            return int(float(action["value"]))
    return 0


def _range(since: date, until: date) -> dict:
    return {"since": since.isoformat(), "until": until.isoformat()}


def history_start(client: Client, today: date) -> date:
    anchors = [d for d in (client.go_live, client.free_trial_from) if d]
    earliest = min(anchors) if anchors else today
    return min(earliest, today - timedelta(days=HISTORY_DAYS))


def fetch_account(meta: MetaClient, client: Client, today: date) -> AccountData:
    acct = client.ad_account_id
    yesterday = today - timedelta(days=1)
    start = history_start(client, today)
    data = AccountData()

    info = meta.get(acct, {"fields": "account_status,disable_reason"})
    data.account_status = int(info.get("account_status", 1))
    data.disable_reason = int(info.get("disable_reason", 0))

    rows = meta.get_all(
        f"{acct}/insights",
        {
            "level": "account",
            "time_increment": 1,
            "time_range": _range(start, yesterday),
            "fields": "spend,impressions,inline_link_clicks,actions",
        },
    )
    for row in rows:
        data.daily[date.fromisoformat(row["date_start"])] = Day(
            spend=float(row.get("spend", 0)),
            leads=_lead_count(row.get("actions")),
            impressions=int(row.get("impressions", 0)),
            link_clicks=int(row.get("inline_link_clicks", 0)),
        )

    ads = {
        a["id"]: Ad(id=a["id"], name=a.get("name", a["id"]), effective_status=a.get("effective_status", ""))
        for a in meta.get_all(f"{acct}/ads", {"fields": "id,name,effective_status"})
    }
    ad_start = client.go_live or (today - timedelta(days=30))
    for row in meta.get_all(
        f"{acct}/insights",
        {"level": "ad", "time_range": _range(min(ad_start, yesterday), yesterday), "fields": "ad_id,spend,actions"},
    ):
        if row["ad_id"] in ads:
            ads[row["ad_id"]].spend_total = float(row.get("spend", 0))
            ads[row["ad_id"]].leads_meta = _lead_count(row.get("actions"))
    for row in meta.get_all(
        f"{acct}/insights",
        {"level": "ad", "time_range": _range(today - timedelta(days=7), yesterday), "fields": "ad_id,spend,frequency"},
    ):
        if row["ad_id"] in ads:
            ads[row["ad_id"]].spend_7d = float(row.get("spend", 0))
            ads[row["ad_id"]].frequency_7d = float(row.get("frequency", 0))
    data.ads = list(ads.values())

    campaigns = meta.get_all(f"{acct}/campaigns", {"fields": "id,name", "effective_status": ["ACTIVE"]})
    data.active_campaigns = len(campaigns)
    spent = {
        row["campaign_id"]: float(row.get("spend", 0))
        for row in meta.get_all(
            f"{acct}/insights",
            {"level": "campaign", "time_range": _range(yesterday, yesterday), "fields": "campaign_id,spend"},
        )
    }
    data.campaigns_not_spending = [c["name"] for c in campaigns if spent.get(c["id"], 0) <= 0]
    return data


def fetch_leads(meta: MetaClient, client: Client, data: AccountData, since: date) -> list[Lead]:
    """Individual leads via the leadgen API (needs leads_retrieval; see README)."""
    found: list[Lead] = []
    cutoff = int(datetime.combine(since, time.min, tzinfo=LONDON).timestamp())
    for ad in data.ads:
        rows = meta.get_all(
            f"{ad.id}/leads",
            {
                "fields": "id,created_time,field_data",
                "filtering": [{"field": "time_created", "operator": "GREATER_THAN", "value": cutoff}],
            },
        )
        for row in rows:
            fields = {f["name"]: (f.get("values") or [""])[0] for f in row.get("field_data", [])}
            found.append(
                Lead(
                    lead_id=row["id"],
                    client=client.name,
                    created_time=parse_meta_time(row["created_time"]),
                    ad_id=ad.id,
                    ad_name=ad.name,
                    label=fields.get("full_name") or fields.get("first_name", ""),
                )
            )
    return found
