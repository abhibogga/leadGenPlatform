from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from openpyxl import Workbook

from app.main import build_import_response
from reverse_boolean import KnownContact, load_excel_contacts, validate_result


class ContactImportTests(TestCase):
    def write_workbook(self, path: Path, rows: list[list[object]]) -> None:
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Contacts"
        sheet.append(
            [
                "Person Name",
                "Company",
                "Location",
                "Website",
                "Known Title",
                "Service Purchased",
                "Success Score (1-5)",
                "Repeat Client",
                "Approx. Deal Value",
                "Why Successful",
                "Notes",
            ]
        )
        for row in rows:
            sheet.append(row)
        workbook.save(path)

    def test_extended_columns_are_loaded_and_typed(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "contacts.xlsx"
            self.write_workbook(
                path,
                [[
                    "Jane Doe",
                    "Acme Heating",
                    "Atlanta, GA",
                    "acme.example",
                    "Owner",
                    "Lead follow-up",
                    5,
                    "Yes",
                    "$12,500",
                    "Renewed twice",
                    "Referral source",
                ]],
            )

            contacts = load_excel_contacts(path)

            self.assertEqual(len(contacts), 1)
            self.assertEqual(contacts[0].success_score, 5)
            self.assertIs(contacts[0].repeat_client, True)
            self.assertEqual(contacts[0].approx_deal_value, 12_500)
            self.assertEqual(contacts[0].service_purchased, "Lead follow-up")

            response = build_import_response(contacts)
            self.assertEqual(response.ready, 1)
            self.assertEqual(response.needs_review, 0)
            self.assertEqual(response.warnings, [])

    def test_import_preview_flags_sparse_and_duplicate_rows(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "contacts.xlsx"
            self.write_workbook(
                path,
                [
                    ["Chris Tucker", "Tucker 1 Handyman", "Joplin", None],
                    ["Chris Tucker", "Tucker 1 Handyman", "Joplin", None],
                ],
            )

            response = build_import_response(load_excel_contacts(path))
            messages = [warning.message for warning in response.warnings]

            self.assertEqual(response.total, 2)
            self.assertEqual(response.ready, 0)
            self.assertEqual(response.needs_review, 2)
            self.assertTrue(any("include a state" in message for message in messages))
            self.assertTrue(any("success" in message.casefold() for message in messages))
            self.assertTrue(any("duplicate" in message.casefold() for message in messages))

    def test_invalid_success_score_identifies_the_workbook_row(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "contacts.xlsx"
            self.write_workbook(
                path,
                [["Jane Doe", "Acme", "Atlanta, GA", None, None, None, 8]],
            )

            with self.assertRaisesRegex(ValueError, r":2: Success Score must be between 1 and 5"):
                load_excel_contacts(path)

    def test_expected_anchor_is_not_treated_as_search_leakage(self) -> None:
        contact = KnownContact(name="Jane Doe", company="Acme Heating")
        result = {
            "contacts": [{
                "person_profile": {},
                "company_profile": {},
                "validation_search": {
                    "title_boolean": '"Owner" OR "President"',
                    "keyword_boolean": "HVAC",
                    "expected_anchor": "Jane Doe - Acme Heating",
                },
                "expansion_search": {},
            }]
        }

        self.assertEqual(validate_result(result, [contact]), [])
