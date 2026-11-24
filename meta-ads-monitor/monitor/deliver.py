"""Send the message. stdout by default; Slack and email are env-configured."""
from __future__ import annotations

import json
import os
import smtplib
import urllib.request
from email.message import EmailMessage


def to_stdout(text: str, subject: str) -> None:
    print(text)


def to_slack(text: str, subject: str) -> None:
    url = os.environ["SLACK_WEBHOOK_URL"]
    request = urllib.request.Request(
        url, data=json.dumps({"text": text}).encode(), headers={"Content-Type": "application/json"}, method="POST"
    )
    urllib.request.urlopen(request, timeout=30).close()


def to_email(text: str, subject: str) -> None:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = os.environ["SMTP_FROM"]
    message["To"] = os.environ["EMAIL_TO"]
    message.set_content(text)
    with smtplib.SMTP_SSL(os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "465"))) as smtp:
        smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        smtp.send_message(message)


CHANNELS = {"stdout": to_stdout, "slack": to_slack, "email": to_email}
