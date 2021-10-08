from unittest.mock import patch

from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from rest_framework import status

from posthog.models import User
from posthog.test.base import APIBaseTest


class TestAuthenticationAPI(APIBaseTest):
    CONFIG_AUTO_LOGIN = False

    @patch("posthoganalytics.capture")
    def test_user_logs_in_with_email_and_password(self, mock_capture):
        response = self.client.post("/api/login", {"email": self.CONFIG_EMAIL, "password": self.CONFIG_PASSWORD})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), {"success": True})

        # Test that we're actually logged in
        response = self.client.get("/api/users/@me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["email"], self.user.email)

        # Assert the event was captured.
        mock_capture.assert_called_once_with(
            self.user.distinct_id, "user logged in", properties={"social_provider": ""}
        )

    @patch("posthoganalytics.capture")
    def test_user_cant_login_with_incorrect_password(self, mock_capture):

        invalid_passwords = ["1234", "abcdefgh", "testpassword1234", "😈😈😈"]

        for password in invalid_passwords:
            response = self.client.post("/api/login", {"email": self.CONFIG_EMAIL, "password": password})
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(response.json(), self.ERROR_INVALID_CREDENTIALS)

            # Assert user is not logged in
            response = self.client.get("/api/users/@me/")
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
            self.assertNotIn("email", response.json())

        # Events never get reported
        mock_capture.assert_not_called()

    @patch("posthoganalytics.capture")
    def test_user_cant_login_with_incorrect_email(self, mock_capture):

        response = self.client.post("/api/login", {"email": "user2@posthog.com", "password": self.CONFIG_PASSWORD})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json(), self.ERROR_INVALID_CREDENTIALS)

        # Assert user is not logged in
        response = self.client.get("/api/users/@me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn("email", response.json())

        # Events never get reported
        mock_capture.assert_not_called()

    def test_cant_login_without_required_attributes(self):
        required_attributes = [
            "email",
            "password",
        ]

        for attribute in required_attributes:
            body = {
                "email": self.CONFIG_EMAIL,
                "password": self.CONFIG_PASSWORD,
            }
            body.pop(attribute)

            response = self.client.post("/api/login/", body)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(
                response.json(),
                {
                    "type": "validation_error",
                    "code": "required",
                    "detail": "This field is required.",
                    "attr": attribute,
                },
            )

            # Assert user is not logged in
            response = self.client.get("/api/users/@me/")
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_endpoint_is_protected_against_brute_force_attempts(self):
        User.objects.create(email="new_user@posthog.com", password="87654321")

        # Fill the attempt limit
        with self.settings(AXES_ENABLED=True, AXES_FAILURE_LIMIT=3):
            for _ in range(0, 2):
                response = self.client.post("/api/login", {"email": "new_user@posthog.com", "password": "invalid"})
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(response.json(), self.ERROR_INVALID_CREDENTIALS)

                # Assert user is not logged in
                response = self.client.get("/api/users/@me/")
                self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

            response = self.client.post("/api/login", {"email": "new_user@posthog.com", "password": "invalid"})
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(
                response.json(),
                {
                    "type": "authentication_error",
                    "code": "too_many_failed_attempts",
                    "detail": "Too many failed login attempts. Please try again in 15 minutes.",
                    "attr": None,
                },
            )


class TestPasswordResetAPI(APIBaseTest):
    CONFIG_AUTO_LOGIN = False

    @patch("posthoganalytics.capture")
    def test_anonymous_user_can_request_password_reset(self, mock_capture):
        with self.settings(
            CELERY_TASK_ALWAYS_EAGER=True, EMAIL_HOST="localhost", SITE_URL="https://my.posthog.net",
        ):
            response = self.client.post("/api/reset", {"email": self.CONFIG_EMAIL})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), {"email": self.CONFIG_EMAIL})

        self.assertSetEqual({",".join(outmail.to) for outmail in mail.outbox}, set([self.CONFIG_EMAIL]))

        self.assertEqual(
            mail.outbox[0].subject, "Reset your PostHog password",
        )
        self.assertEqual(
            mail.outbox[0].body, "",
        )  # no plain-text version support yet

        html_message = mail.outbox[0].alternatives[0][0]  # type: ignore
        self.validate_basic_html(
            html_message, "https://my.posthog.net", preheader="Please follow the link inside to reset your password.",
        )

        link_index = html_message.find("https://my.posthog.net/reset")
        reset_link = html_message[link_index : html_message.find('"', link_index)]

        # validate reset token
        default_token_generator.check_token(self.user, reset_link.replace("https://my.posthog.net/reset/", ""))
