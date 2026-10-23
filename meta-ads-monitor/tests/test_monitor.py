import io
import json
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from monitor import demo, guarantee
from monitor.analyse import AMBER, GREEN, RED, build_report, cpl_severity
from monitor.config import parse_client
from monitor.leads import Lead, LeadStore
from monitor.meta_client import MetaClient
from monitor.model import AccountData, Ad, Day
from monitor.report import render

TODAY = date(2026, 10, 22)


def client(**kw):
    base = {"name": "C", "ad_account_id": "act_1", "guarantee": "30_in_60", "go_live": "2026-10-12"}
    return parse_client({**base, **kw})


def leads_on(*days, counts=True):
    return [
        Lead(f"L{i}-{d}", "C", datetime(d.year, d.month, d.day, 12, tzinfo=timezone.utc), "ad", counts=counts)
        for i, d in enumerate(days)
    ]


def day(n):
    return TODAY - timedelta(days=n)


class Thresholds(unittest.TestCase):
    def test_max_and_target_cpl(self):
        self.assertEqual(client().max_cpl_value(), 40)
        self.assertEqual(client().target_cpl_value(), 30)
        fg = client(guarantee="25_in_30")
        self.assertEqual((fg.max_cpl_value(), fg.target_cpl_value()), (24, 18))

    def test_overrides_and_free_trial_use_original_terms(self):
        self.assertEqual(client(target_cpl=25, max_cpl=35).target_cpl_value(), 25)
        elite = client(guarantee="free_trial", original_guarantee="25_in_30")
        self.assertEqual(elite.max_cpl_value(), 24)

    def test_cpl_colours(self):
        self.assertEqual(cpl_severity(30, 30, 40), GREEN)
        self.assertEqual(cpl_severity(35, 30, 40), AMBER)
        self.assertEqual(cpl_severity(41, 30, 40), RED)
        self.assertIsNone(cpl_severity(None, 30, 40))


class GuaranteeMaths(unittest.TestCase):
    def assess(self, c, leads):
        return guarantee.assess(c, leads, {}, TODAY)

    def test_not_live_without_go_live(self):
        self.assertEqual(self.assess(client(go_live=None), []).state, "NOT_LIVE")
        self.assertEqual(self.assess(client(go_live=str(TODAY)), []).state, "NOT_LIVE")

    def test_day_and_pace(self):
        g = self.assess(client(guarantee="25_in_30", go_live="2026-10-12"), [])
        self.assertEqual(g.day, 10)
        self.assertAlmostEqual(g.pace, 25 / 30 * 10)

    def test_too_early_uses_all_time_rate(self):
        g = self.assess(client(go_live="2026-10-19"), leads_on(day(3), day(2), day(1)))
        self.assertTrue(g.too_early)
        self.assertAlmostEqual(g.recent_rate, 1.0)

    def test_recent_rate_is_last_five_days_counted_only(self):
        ls = leads_on(*[day(10)] * 5) + leads_on(day(1), day(2)) + leads_on(day(3), counts=False)
        g = self.assess(client(go_live="2026-10-02"), ls)
        self.assertEqual((g.counted, g.total, g.excluded), (7, 8, 1))
        self.assertAlmostEqual(g.recent_rate, 2 / 5)
        self.assertAlmostEqual(g.projected, 7 + 0.4 * 40)  # 40 days left of 60

    def test_status_bands(self):
        # day 20 of 60: required 30, 40 days left, nothing counted so far
        c = client(go_live="2026-10-02")
        cases = [(1.0, "AT RISK"), (0.6, "WILL MISS"), (0.75, "ON PACE")]
        # rate r over 5 days = n leads / 5; projected = counted + r * 40 vs 30
        for n, expected in [(5, "ON PACE"), (3, "AT RISK"), (1, "WILL MISS")]:
            ls = leads_on(*[day(1)] * n)
            g = self.assess(c, ls)
            projected = n + n / 5 * 40
            self.assertAlmostEqual(g.projected, projected)
            ratio = projected / 30
            want = "ON PACE" if ratio >= 1 else "AT RISK" if ratio >= 0.75 else "WILL MISS"
            self.assertEqual(g.status, want, (n, projected))

    def test_ahead_needs_counted_at_or_above_pace(self):
        c = client(go_live="2026-10-02")  # day 20: pace 10
        ls = leads_on(*[day(15)] * 10) + leads_on(*[day(1)] * 4)
        g = self.assess(c, ls)
        self.assertEqual(g.status, "AHEAD")
        g = self.assess(c, leads_on(*[day(1)] * 5))  # projected 15 + ... counted 5 < pace 10
        self.assertEqual(g.status, "ON PACE")

    def test_hit_early(self):
        g = self.assess(client(guarantee="25_in_30"), leads_on(*[day(2)] * 25))
        self.assertEqual(g.state, "HIT")

    def test_excluded_leads_do_not_count(self):
        g = self.assess(client(go_live="2026-10-02"), leads_on(*[day(1)] * 30, counts=False))
        self.assertEqual((g.state, g.counted, g.total), ("ACTIVE", 0, 30))

    def test_window_end_switches_to_free_trial(self):
        # 30_in_60 started 61 days ago with 20 counted: 10 owed from day 60
        c = client(go_live="2026-08-22")
        start = date(2026, 8, 22)
        in_window = leads_on(*[start + timedelta(days=i) for i in range(20)])
        after = leads_on(day(1))  # 21 Oct: delivered since the window ended
        spend = {day(n): 20.0 for n in range(1, 4)}
        g = guarantee.assess(c, in_window + after, spend, TODAY)
        self.assertEqual((g.state, g.auto_switched), ("FREE_TRIAL", True))
        self.assertEqual(g.trial_from, date(2026, 10, 21))
        self.assertEqual((g.owed, g.delivered_since, g.owed_remaining), (10, 1, 9))
        self.assertEqual(g.spend_since, 20.0)  # only 21 Oct onwards
        self.assertFalse(g.just_switched)

    def test_just_switched_on_the_morning_the_window_ends(self):
        g = guarantee.assess(client(go_live="2026-08-23"), [], {}, TODAY)
        self.assertTrue(g.just_switched)

    def test_manual_free_trial(self):
        c = client(guarantee="free_trial", original_guarantee="25_in_30", free_trial_from="2026-10-05", leads_owed=7)
        spend = {date(2026, 10, 5) + timedelta(days=i): 20.0 for i in range(20)}
        g = guarantee.assess(c, leads_on(day(2), day(1)), spend, TODAY)
        self.assertEqual((g.owed_remaining, g.spend_since), (5, 17 * 20.0))

    def test_free_trial_missing_inputs(self):
        g = self.assess(client(guarantee="free_trial"), [])
        self.assertIsNone(g.owed_remaining)
        self.assertIsNone(g.spend_since)


class Flags(unittest.TestCase):
    def data(self, **kw):
        daily = {day(n): Day(spend=20, leads=0, impressions=2000, link_clicks=24) for n in range(1, 15)}
        return AccountData(daily=daily, **kw)

    def flags(self, c, data, leads=()):
        return build_report(c, data, list(leads), TODAY).flags

    def test_zero_leads_amber_then_red_and_small_spend_ignored(self):
        c = client(go_live="2026-10-19")  # max CPL £40, 3 days = £60 spend
        self.assertEqual([f.sev for f in self.flags(c, self.data()) if f.text.startswith("No leads")], [AMBER])
        c = client(go_live="2026-10-02")  # £400 over 20 days
        self.assertEqual([f.sev for f in self.flags(c, self.data()) if f.text.startswith("No leads")], [RED])
        c = client(go_live="2026-10-21")  # day 1: £20 < £40
        self.assertEqual([f for f in self.flags(c, self.data()) if f.text.startswith("No leads")], [])

    def test_test_rule(self):
        ads = [Ad("a", "testing", "ACTIVE", spend_total=60, leads_meta=0),
               Ad("b", "keeper", "ACTIVE", spend_total=150, leads_meta=5),
               Ad("c", "loser", "ACTIVE", spend_total=150, leads_meta=2)]
        c = client(go_live="2026-10-19")
        leads = [Lead(f"x{i}", "C", datetime(2026, 10, 20, 9, tzinfo=timezone.utc), ad_id) for i, ad_id in
                 enumerate(["b"] * 5 + ["c"] * 2)]
        text = " | ".join(f.text for f in self.flags(c, self.data(ads=ads), leads))
        self.assertIn("'testing': £60 spent, no leads (still testing)", text)
        self.assertIn("Kill 'loser'", text)  # £75 CPL > £40 max
        self.assertNotIn("keeper", text)

    def test_frequency_thresholds(self):
        c = client(go_live="2026-10-19")
        for freq, expected in [(2.9, []), (3.0, [AMBER]), (4.0, [RED])]:
            ads = [Ad("a", "ad", "ACTIVE", spend_total=10, spend_7d=10, frequency_7d=freq)]
            got = [f.sev for f in self.flags(c, self.data(ads=ads)) if f.text.startswith("Frequency")]
            self.assertEqual(got, expected, freq)

    def test_ctr_drop(self):
        daily = {}
        for n in range(1, 8):
            daily[day(n)] = Day(spend=20, leads=1, impressions=2000, link_clicks=20)   # 1.0%
        for n in range(8, 15):
            daily[day(n)] = Day(spend=20, leads=1, impressions=2000, link_clicks=30)   # 1.5%
        f = build_report(client(go_live="2026-10-19"), AccountData(daily=daily), [], TODAY).flags
        self.assertTrue(any(x.text.startswith("CTR down 33%") for x in f))

    def test_delivery(self):
        ads = [Ad("a", "bad ad", "DISAPPROVED")]
        f = self.flags(client(go_live="2026-10-19"),
                       self.data(ads=ads, account_status=3, campaigns_not_spending=["Leads"]))
        text = " | ".join(x.text for x in f)
        self.assertIn("payment failure", text)
        self.assertIn("'bad ad' rejected", text)
        self.assertIn("active campaign not spending", text)

    def test_cpl_uses_counted_leads(self):
        c = client(go_live="2026-10-02")
        ls = leads_on(day(1), day(2), day(3), day(4), counts=True)
        ls[0] = Lead(ls[0].lead_id, "C", ls[0].created_time, "ad", counts=False)
        r = build_report(c, self.data(), ls, TODAY)
        self.assertEqual((r.cpl.all_leads, r.cpl.counted), (4, 3))
        self.assertAlmostEqual(r.cpl.cpl_counted, 100 / 3)
        self.assertAlmostEqual(r.cpl.cpl_all, 25)


class MetaCounts(unittest.TestCase):
    def test_meta_counts_mode_drives_guarantee_without_a_lead_log(self):
        daily = {day(n): Day(spend=20, leads=1, impressions=2000, link_clicks=24) for n in range(1, 11)}
        data = AccountData(daily=daily, ads=[Ad("a", "ad", "ACTIVE", spend_total=200, leads_meta=10)])
        r = build_report(client(go_live="2026-10-12"), data, [], TODAY, meta_counts=True)
        self.assertEqual(r.guarantee.counted, 10)
        self.assertEqual([f for f in r.flags if "no leads" in f.text.lower()], [])


    def test_excluded_leads_do_not_count_but_still_show_in_the_total(self):
        daily = {day(n): Day(spend=20, leads=1, impressions=2000, link_clicks=24) for n in range(1, 4)}
        data = AccountData(daily=daily, ads=[Ad("a", "ad", "ACTIVE", spend_total=60, leads_meta=3)])
        r = build_report(client(go_live="2026-10-12", excluded_leads=1), data, [], TODAY, meta_counts=True)
        self.assertEqual((r.guarantee.counted, r.guarantee.total, r.guarantee.excluded), (2, 3, 1))
        self.assertIn("2 of 30 counted (3 total, 1 excluded)", render([r], TODAY))


    def test_todays_leads_show_on_top_without_changing_the_pace_maths(self):
        daily = {day(n): Day(spend=20, leads=1, impressions=2000, link_clicks=24) for n in range(1, 4)}
        data = AccountData(daily=daily, today=Day(spend=8, leads=2), ads=[Ad("a", "ad", "ACTIVE", spend_total=60, leads_meta=3)])
        base = build_report(client(go_live="2026-10-12"), AccountData(daily=daily, ads=data.ads), [], TODAY, meta_counts=True)
        r = build_report(client(go_live="2026-10-12"), data, [], TODAY, meta_counts=True)
        self.assertEqual(r.guarantee.today_leads, 2)
        self.assertEqual((r.guarantee.counted, r.guarantee.projected), (base.guarantee.counted, base.guarantee.projected))
        self.assertIn("(+2 today)", render([r], TODAY))


class AutoGoLive(unittest.TestCase):
    def test_go_live_is_first_day_of_spend(self):
        daily = {day(n): Day(spend=20, leads=1 if n % 2 else 0) for n in range(1, 21)}
        daily[day(25)] = Day(spend=0)  # a zero-spend day before launch doesn't count
        r = build_report(client(go_live="auto", guarantee="25_in_30"), AccountData(daily=daily), [], TODAY, meta_counts=True)
        self.assertEqual(r.client.go_live, day(20))
        self.assertEqual((r.guarantee.state, r.guarantee.day, r.guarantee.counted), ("ACTIVE", 20, 10))

    def test_no_spend_means_not_live(self):
        r = build_report(client(go_live="auto"), AccountData(daily={day(1): Day(spend=0)}), [], TODAY, meta_counts=True)
        self.assertEqual(r.guarantee.state, "NOT_LIVE")


class Report(unittest.TestCase):
    def setUp(self):
        reports, today = demo.build()
        self.text = render(reports, today)

    def test_brief_example_lines(self):
        for line in [
            "MORNING CHECK, Thu 22 Oct",
            "⏰ Elite Roofing, FREE TRIAL, client deadline Fri (1 day)",
            "2 of 30 counted (3 total, 1 excluded). Pace line 1.5. Too early to call.",
            "CPL £12.27 all leads, £18.41 counted (target £30, max £40).",
            "⚪ Efficient Roofing: not live yet",
            "Apex-Leads (own): 9 leads yesterday, CPL £5.80 (target £5).",
            "Look at first: Elite (deadline tomorrow), then FG (WILL MISS).",
        ]:
            self.assertIn(line, self.text)

    def test_order_deadline_first_own_and_not_live_last(self):
        pos = {n: self.text.index(n) for n in ["Elite", "FG Landscaping", "Dreamy", "Efficient", "Apex-Leads (own)"]}
        self.assertEqual(sorted(pos, key=pos.get), ["Elite", "FG Landscaping", "Dreamy", "Efficient", "Apex-Leads (own)"])

    def test_phone_length(self):
        self.assertLess(len(self.text.splitlines()), 40)


class Snapshot(unittest.TestCase):
    def test_snapshot_is_json_and_worst_first(self):
        from monitor.snapshot import build_snapshot
        reports, today = demo.build()
        snap = json.loads(json.dumps(build_snapshot(reports, today, [])))
        names = [c["name"] for c in snap["clients"]]
        self.assertEqual(names[0], "Elite Roofing")
        self.assertEqual(names[-1], "Apex-Leads")
        fg = next(c for c in snap["clients"] if c["name"] == "FG Landscaping")
        self.assertEqual((fg["guarantee"]["counted"], fg["guarantee"]["required"], fg["guarantee"]["status"]), (8, 25, "WILL MISS"))
        self.assertIn("MORNING CHECK", snap["message"])


class Tracker(unittest.TestCase):
    def test_ad_daily_rows_from_insights(self):
        from monitor.collect import fetch_ad_daily

        class FakeMeta:
            def get_all(self, path, params):
                self.params = params
                return [{"ad_id": "1", "ad_name": "A", "date_start": "2026-10-21", "spend": "12.5",
                         "impressions": "900", "inline_link_clicks": "14", "frequency": "1.4",
                         "actions": [{"action_type": "lead", "value": "2"}]}]

        meta = FakeMeta()
        data = AccountData(ads=[Ad("1", "A", "ACTIVE")])
        rows = fetch_ad_daily(meta, client(), data, TODAY, 3)
        self.assertEqual(rows[0]["leads"], 2)
        self.assertEqual((rows[0]["spend"], rows[0]["status"], rows[0]["client_name"]), (12.5, "ACTIVE", "C"))
        self.assertEqual(meta.params["time_range"], {"since": "2026-10-19", "until": "2026-10-21"})
        self.assertEqual(meta.params["time_increment"], 1)


class Store(unittest.TestCase):
    def test_round_trip_keeps_exclusions_across_resync(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "leads.csv"
            store = LeadStore(path)
            lead = leads_on(day(1))[0]
            store.upsert([lead])
            store.set_counts(lead.lead_id, False, "wrong number")
            store.save()
            again = LeadStore(path)
            self.assertEqual(again.upsert([lead]), 0)  # re-sync must not reset the toggle
            self.assertFalse(again.for_client("C")[0].counts)
            self.assertEqual(again.for_client("C")[0].note, "wrong number")


class ReadOnlyClient(unittest.TestCase):
    def test_only_get_and_token_not_in_url(self):
        seen = []

        def opener(request, timeout=0):
            seen.append(request)
            page = {"data": [{"id": len(seen)}]}
            if len(seen) == 1:
                page["paging"] = {"next": "https://graph.facebook.com/v26.0/act_1/ads?after=x"}
            return io.BytesIO(json.dumps(page).encode())

        meta = MetaClient(token="SECRET", opener=opener)
        rows = meta.get_all("act_1/ads", {"fields": "id", "effective_status": ["ACTIVE"]})
        self.assertEqual(len(rows), 2)
        for request in seen:
            self.assertEqual(request.get_method(), "GET")
            self.assertNotIn("SECRET", request.full_url)
        self.assertEqual(seen[0].get_header("Authorization"), "Bearer SECRET")
        self.assertIn("/v26.0/", seen[0].full_url)

    def test_no_write_methods_exist(self):
        self.assertFalse([m for m in dir(MetaClient) if m.lstrip("_") in {"post", "delete", "put", "update"}])


if __name__ == "__main__":
    unittest.main()
