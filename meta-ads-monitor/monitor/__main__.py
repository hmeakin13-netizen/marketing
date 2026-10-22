"""CLI: python -m monitor [run|demo|check-config|leads] ..."""
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

from . import demo as demo_mod
from .analyse import build_report, is_not_live
from .collect import fetch_account, fetch_leads, history_start
from .config import load_clients
from .deliver import CHANNELS
from .leads import LONDON, LeadStore
from .meta_client import MetaClient, MetaError
from .report import render
from .snapshot import build_snapshot, publish

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = ROOT / "config" / "clients.json"
DEFAULT_LEADS = ROOT / "data" / "leads.csv"


def cmd_run(args) -> int:
    clients = load_clients(args.config)
    today = args.today or datetime.now(LONDON).date()
    store = LeadStore(args.leads)
    meta = MetaClient()
    reports, warnings = [], []
    for client in clients:
        if is_not_live(client, today):
            reports.append(build_report(client, None, [], today))
            continue
        if not client.has_account():
            reports.append(build_report(client, None, [], today, error="ad account ID not set"))
            continue
        try:
            data = fetch_account(meta, client, today)
        except MetaError as err:
            reports.append(build_report(client, None, [], today, error=str(err)))
            continue
        if not client.own and not args.no_sync and not args.meta_counts:
            try:
                store.upsert(fetch_leads(meta, client, data, history_start(client, today)))
            except MetaError as err:
                warnings.append(f"Lead sync failed for {client.name} (using last saved log): {err}")
        reports.append(build_report(client, data, [] if client.own else store.for_client(client.name), today,
                                    meta_counts=args.meta_counts))
    store.save()
    text = render(reports, today, warnings)
    for channel in args.send:
        CHANNELS[channel](text, f"Morning check, {today:%a %-d %b}")
    if args.publish:
        publish(build_snapshot(reports, today, warnings))
        print("Published to the website.", file=sys.stderr)
    # Fail loudly (red job, GitHub emails you) if Meta couldn't be read for an account.
    return 2 if any(r.error and not r.error.startswith("ad account ID not set") for r in reports) else 0


def cmd_demo(args) -> int:
    reports, today = demo_mod.build()
    print(render(reports, today))
    return 0


def cmd_check_config(args) -> int:
    clients = load_clients(args.config)
    gaps = 0
    for c in clients:
        for gap in c.setup_gaps():
            gaps += 1
            print(f"{c.name}: {gap}")
        if c.notes:
            print(f"{c.name}: note: {c.notes}")
    print(f"{gaps} gap(s)." if gaps else "No gaps.")
    return 0


def cmd_leads(args) -> int:
    store = LeadStore(args.leads)
    if args.action == "list":
        for lead in sorted(store.for_client(args.client), key=lambda l: l.created_time)[-args.limit:]:
            mark = "x" if lead.counts else " "
            print(f"[{mark}] {lead.lead_id}  {lead.created_time:%a %d %b %H:%M}  {lead.ad_name}  {lead.label}  {lead.note}")
        return 0
    lead = store.set_counts(args.lead_id, args.action == "include", args.note or "")
    store.save()
    print(f"{lead.lead_id}: {'counts' if lead.counts else 'does NOT count'}")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="monitor", description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--leads", type=Path, default=DEFAULT_LEADS)
    sub = parser.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run", help="pull from Meta and send the morning message")
    run.add_argument("--send", nargs="+", choices=sorted(CHANNELS), default=["stdout"])
    run.add_argument("--meta-counts", action="store_true",
                     help="use Meta's own lead counts (no lead log, no exclusions); works without lead permissions")
    run.add_argument("--today", type=lambda s: datetime.strptime(s, "%Y-%m-%d").date())
    run.add_argument("--publish", action="store_true", help="save the snapshot for the website (needs SUPABASE_URL, SUPABASE_ANON_KEY, ADS_INGEST_KEY)")
    run.add_argument("--no-sync", action="store_true", help="skip pulling individual leads")
    run.set_defaults(func=cmd_run)

    sub.add_parser("demo", help="print the message for made-up data").set_defaults(func=cmd_demo)
    sub.add_parser("check-config", help="list missing settings").set_defaults(func=cmd_check_config)

    leads = sub.add_parser("leads", help="view or toggle individual leads")
    leads.add_argument("action", choices=["list", "exclude", "include"])
    leads.add_argument("--client")
    leads.add_argument("--limit", type=int, default=20)
    leads.add_argument("lead_id", nargs="?")
    leads.add_argument("--note")
    leads.set_defaults(func=cmd_leads)

    args = parser.parse_args(argv)
    if args.cmd == "leads" and args.action == "list" and not args.client:
        parser.error("leads list needs --client")
    if args.cmd == "leads" and args.action != "list" and not args.lead_id:
        parser.error("leads exclude/include needs a lead id")
    try:
        return args.func(args)
    except (MetaError, KeyError, ValueError) as err:
        print(f"error: {err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
