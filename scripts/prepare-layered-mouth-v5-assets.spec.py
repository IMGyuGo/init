#!/usr/bin/env python3
"""Focused regression tests for the deterministic V5 mouth packager."""

from __future__ import annotations

import base64
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).with_name("prepare-layered-mouth-v5-assets.py")
SPEC = importlib.util.spec_from_file_location("prepare_layered_mouth_v5_assets", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot import {SCRIPT_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class BuildPsdPathTest(unittest.TestCase):
    def test_build_psd_passes_the_requested_asset_root(self) -> None:
        asset_root = Path("D:/fixtures/assets/interviewer-rigging/custom-v5").resolve()
        with patch.object(MODULE.subprocess, "run") as run:
            MODULE.build_psd(asset_root)

        arguments = run.call_args.args[0]
        decoded_repository_root = Path(base64.b64decode(arguments[-2]).decode("utf-8"))
        decoded_asset_root = Path(base64.b64decode(arguments[-1]).decode("utf-8"))
        self.assertEqual(decoded_repository_root, SCRIPT_PATH.parent.parent.resolve())
        self.assertEqual(decoded_asset_root, asset_root)
        self.assertIn("join(assetRoot, 'manifest.json')", arguments[2])
        self.assertIn("join(assetRoot, 'interviewer-mouth-v5.psd')", arguments[2])
        self.assertTrue(run.call_args.kwargs["check"])

    def test_transient_windows_write_error_is_retried(self) -> None:
        attempts = 0

        def operation() -> str:
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise OSError(22, "transient invalid argument")
            return "written"

        with patch.object(MODULE.time, "sleep") as sleep:
            self.assertEqual(MODULE.retry_windows_write(operation), "written")

        self.assertEqual(attempts, 2)
        sleep.assert_called_once()


if __name__ == "__main__":
    unittest.main()
