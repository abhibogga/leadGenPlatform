from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from app.storage import RunStore


class RunStoreTests(TestCase):
    def test_run_lifecycle_and_feedback_are_persisted(self) -> None:
        with TemporaryDirectory() as directory:
            store = RunStore(Path(directory) / "test.db")
            run = store.create_run(
                {
                    "contacts": [{"name": "Jane Doe", "company": "Acme"}],
                    "agency_context": "Test context",
                }
            )
            self.assertEqual(run["status"], "queued")

            completed = store.update_run(
                run["id"],
                status="completed",
                stage="Ready",
                progress=100,
                result={"summary": "A useful pattern"},
            )
            self.assertEqual(completed["result"]["summary"], "A useful pattern")

            feedback = store.create_feedback(
                run["id"],
                outcome="found",
                contact_index=0,
                notes="Anchor appeared on page one",
            )
            self.assertEqual(feedback["run_id"], run["id"])
            self.assertEqual(store.list_runs()[0]["contact_count"], 1)
