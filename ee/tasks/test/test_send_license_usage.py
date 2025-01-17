from unittest.mock import patch
from uuid import uuid4

import posthoganalytics
from freezegun import freeze_time

from ee.api.test.base import LicensedTestMixin
from ee.clickhouse.models.event import create_event
from ee.clickhouse.util import ClickhouseDestroyTablesMixin
from ee.models.license import License
from ee.tasks.send_license_usage import send_license_usage
from posthog.models import organization
from posthog.models.team import Team
from posthog.test.base import APIBaseTest


def _create_event(**kwargs):
    kwargs.update({"event_uuid": uuid4()})
    create_event(**kwargs)


class SendLicenseUsageTest(LicensedTestMixin, ClickhouseDestroyTablesMixin, APIBaseTest):
    @freeze_time("2021-10-10T23:01:00Z")
    @patch("requests.post")
    def test_send_license_usage(self, mock_post):
        team2 = Team.objects.create(organization=self.organization)
        _create_event(event="$pageview", team=self.team, distinct_id=1, timestamp="2021-10-08T14:01:01Z")
        _create_event(event="$pageview", team=self.team, distinct_id=1, timestamp="2021-10-09T12:01:01Z")
        _create_event(event="$pageview", team=self.team, distinct_id=1, timestamp="2021-10-09T13:01:01Z")
        _create_event(
            event="$$internal_metrics_shouldnt_be_billed",
            team=self.team,
            distinct_id=1,
            timestamp="2021-10-09T13:01:01Z",
        )
        _create_event(event="$pageview", team=team2, distinct_id=1, timestamp="2021-10-09T14:01:01Z")
        _create_event(event="$pageview", team=self.team, distinct_id=1, timestamp="2021-10-10T14:01:01Z")

        send_license_usage()

        mock_post.assert_called_once_with(
            "https://license.posthog.com/licenses/usage",
            data={"date": "2021-10-09", "key": self.license.key, "events_count": 3},
        )

    @freeze_time("2021-10-10T23:01:00Z")
    @patch("posthoganalytics.capture")
    @patch("ee.tasks.send_license_usage.sync_execute", side_effect=Exception())
    def test_send_license_error(self, mock_post, mock_capture):
        team2 = Team.objects.create(organization=self.organization)
        _create_event(event="$pageview", team=self.team, distinct_id=1, timestamp="2021-10-08T14:01:01Z")
        _create_event(event="$pageview", team=self.team, distinct_id=1, timestamp="2021-10-09T12:01:01Z")
        _create_event(event="$pageview", team=self.team, distinct_id=1, timestamp="2021-10-09T13:01:01Z")
        _create_event(
            event="$$internal_metrics_shouldnt_be_billed",
            team=self.team,
            distinct_id=1,
            timestamp="2021-10-09T13:01:01Z",
        )
        _create_event(event="$pageview", team=team2, distinct_id=1, timestamp="2021-10-09T14:01:01Z")
        _create_event(event="$pageview", team=self.team, distinct_id=1, timestamp="2021-10-10T14:01:01Z")

        send_license_usage()
        mock_capture.assert_called_once_with(
            self.user.distinct_id, "send license usage data error", {"error": "", "date": "2021-10-09"}
        )


class SendLicenseUsageNoLicenseTest(APIBaseTest):
    @freeze_time("2021-10-10T23:01:00Z")
    @patch("requests.post")
    def test_no_license(self, mock_post):
        # Same test, we just don't include the LicensedTestMixin so no license
        _create_event(event="$pageview", team=self.team, distinct_id=1, timestamp="2021-10-08T14:01:01Z")
        _create_event(event="$pageview", team=self.team, distinct_id=1, timestamp="2021-10-09T12:01:01Z")
        _create_event(event="$pageview", team=self.team, distinct_id=1, timestamp="2021-10-09T13:01:01Z")
        _create_event(event="$pageview", team=self.team, distinct_id=1, timestamp="2021-10-09T14:01:01Z")
        _create_event(event="$pageview", team=self.team, distinct_id=1, timestamp="2021-10-10T14:01:01Z")

        send_license_usage()

        self.assertEqual(mock_post.call_count, 0)
