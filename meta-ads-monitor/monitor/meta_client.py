"""Read-only Meta Marketing API client.

Only ever issues GET requests. There is deliberately no method for POST/DELETE, so
nothing in this package can change an ad, budget or campaign.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_VERSION = "v26.0"  # latest at time of writing; override with META_API_VERSION
TRANSIENT_CODES = {1, 2, 4, 17, 32, 341, 613}  # Meta's "unknown / try again / rate limit" codes


class MetaError(RuntimeError):
    pass


class MetaClient:
    def __init__(self, token: str | None = None, version: str | None = None, opener=None):
        self._token = token or os.environ.get("META_ACCESS_TOKEN")
        if not self._token:
            raise MetaError("META_ACCESS_TOKEN is not set (system user token with ads_read)")
        self.version = version or os.environ.get("META_API_VERSION", DEFAULT_VERSION)
        self._open = opener or urllib.request.urlopen

    def _url(self, path: str, params: dict | None) -> str:
        query = {k: json.dumps(v) if isinstance(v, (list, dict)) else v for k, v in (params or {}).items()}
        return f"https://graph.facebook.com/{self.version}/{path.lstrip('/')}?{urllib.parse.urlencode(query)}"

    def _fetch(self, url: str) -> dict:
        # Token goes in a header, never the URL, so it can't leak into logs or error messages.
        request = urllib.request.Request(url, method="GET", headers={"Authorization": f"Bearer {self._token}"})
        for attempt in range(3):
            try:
                with self._open(request, timeout=60) as response:
                    return json.load(response)
            except urllib.error.HTTPError as err:
                body = err.read().decode("utf-8", "replace")
                try:
                    detail = json.loads(body).get("error", {})
                except ValueError:
                    detail = {}
                transient = err.code >= 500 or detail.get("code") in TRANSIENT_CODES
                if transient and attempt < 2:
                    time.sleep(2 ** attempt * 5)
                    continue
                message = detail.get("message") or body[:200]
                raise MetaError(f"Meta API {err.code} (code {detail.get('code')}): {message}") from None
            except urllib.error.URLError as err:
                if attempt < 2:
                    time.sleep(2 ** attempt * 5)
                    continue
                raise MetaError(f"Could not reach Meta: {err.reason}") from None
        raise MetaError("unreachable")

    def get(self, path: str, params: dict | None = None) -> dict:
        return self._fetch(self._url(path, params))

    def get_all(self, path: str, params: dict | None = None) -> list[dict]:
        rows: list[dict] = []
        page = self.get(path, {"limit": 200, **(params or {})})
        while True:
            rows.extend(page.get("data", []))
            next_url = page.get("paging", {}).get("next")
            if not next_url:
                return rows
            page = self._fetch(next_url)
