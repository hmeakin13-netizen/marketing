"""Lead log. Every lead counts by default; Harry flips `counts` off for unusable ones.

CSV backend for now (data/leads.csv, gitignored: it holds names). The store is the only
thing the rest of the code touches, so swapping in Google Sheets or Supabase later
means replacing this class, not the maths.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass, replace
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

LONDON = ZoneInfo("Europe/London")
FIELDS = ["lead_id", "client", "created_time", "ad_id", "ad_name", "label", "counts", "note"]


@dataclass(frozen=True)
class Lead:
    lead_id: str
    client: str
    created_time: datetime  # timezone-aware
    ad_id: str = ""
    ad_name: str = ""
    label: str = ""
    counts: bool = True
    note: str = ""

    @property
    def created(self) -> date:
        return self.created_time.astimezone(LONDON).date()


def parse_meta_time(value: str) -> datetime:
    """Meta returns e.g. 2026-10-21T18:22:33+0000."""
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S%z")


class LeadStore:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._leads: dict[str, Lead] = {}
        if self.path.exists():
            with self.path.open(newline="") as fh:
                for row in csv.DictReader(fh):
                    self._leads[row["lead_id"]] = Lead(
                        lead_id=row["lead_id"],
                        client=row["client"],
                        created_time=datetime.fromisoformat(row["created_time"]),
                        ad_id=row["ad_id"],
                        ad_name=row["ad_name"],
                        label=row["label"],
                        counts=row["counts"].strip().upper() != "FALSE",
                        note=row["note"],
                    )

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=FIELDS)
            writer.writeheader()
            for lead in sorted(self._leads.values(), key=lambda x: x.created_time):
                writer.writerow(
                    {
                        "lead_id": lead.lead_id,
                        "client": lead.client,
                        "created_time": lead.created_time.isoformat(),
                        "ad_id": lead.ad_id,
                        "ad_name": lead.ad_name,
                        "label": lead.label,
                        "counts": "TRUE" if lead.counts else "FALSE",
                        "note": lead.note,
                    }
                )

    def upsert(self, leads: list[Lead]) -> int:
        """Add leads we haven't seen. Existing rows keep their counts/note. Returns new count."""
        added = 0
        for lead in leads:
            if lead.lead_id not in self._leads:
                self._leads[lead.lead_id] = lead
                added += 1
        return added

    def set_counts(self, lead_id: str, counts: bool, note: str = "") -> Lead:
        if lead_id not in self._leads:
            raise KeyError(f"no lead with id {lead_id}")
        updated = replace(self._leads[lead_id], counts=counts, note=note or self._leads[lead_id].note)
        self._leads[lead_id] = updated
        return updated

    def for_client(self, name: str) -> list[Lead]:
        return [l for l in self._leads.values() if l.client == name]
