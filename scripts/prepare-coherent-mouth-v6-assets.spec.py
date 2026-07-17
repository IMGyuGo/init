#!/usr/bin/env python3
"""Focused tests for the deterministic V6 coherent-mouth packager."""

from __future__ import annotations

import base64
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np


SCRIPT_PATH = Path(__file__).with_name("prepare-coherent-mouth-v6-assets.py")
SPEC = importlib.util.spec_from_file_location("prepare_coherent_mouth_v6_assets", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot import {SCRIPT_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CoherentMouthMetricsTest(unittest.TestCase):
    def test_metrics_accept_centered_connected_partition(self) -> None:
        shape = (MODULE.CANVAS[1], MODULE.CANVAS[0])
        opening = np.zeros(shape, dtype=bool)
        opening[580:613, 470:555] = True

        teeth = np.zeros(shape, dtype=bool)
        teeth[581:588, 490:535] = True
        tongue = np.zeros(shape, dtype=bool)
        tongue[598:609, 485:540] = True
        interior = opening & ~teeth & ~tongue

        outer = np.zeros(shape, dtype=bool)
        outer[570:621, 464:560] = True
        lips = outer & ~opening
        upper_lip = lips.copy()
        upper_lip[590:, :] = False
        lower_lip = lips & ~upper_lip

        masks = {
            "mouth-interior": interior,
            "mouth-upper-teeth": teeth,
            "mouth-tongue": tongue,
            "mouth-upper-lip": upper_lip,
            "mouth-lower-lip": lower_lip,
        }
        coherent = np.zeros((shape[0], shape[1], 4), dtype=np.uint8)
        recomposed = coherent.copy()

        metrics = MODULE.measure_masks(
            masks,
            opening,
            coherent,
            recomposed,
            reference_width=101,
        )

        self.assertLessEqual(abs(metrics.center_x - 512), 2)
        self.assertGreaterEqual(metrics.width_ratio, 0.95)
        self.assertLessEqual(metrics.width_ratio, 1.05)
        self.assertLessEqual(metrics.corner_y_delta, 3)
        self.assertLessEqual(metrics.upper_lip_teeth_gap, 1)
        self.assertEqual(metrics.uncovered_opening_pixels, 0)
        self.assertEqual(metrics.tongue_outside_opening_pixels, 0)
        self.assertEqual(metrics.overlapping_semantic_pixels, 0)
        self.assertGreaterEqual(metrics.upper_teeth_height_ratio, 0.20)
        self.assertLessEqual(metrics.upper_teeth_height_ratio, 0.25)
        self.assertEqual(metrics.lower_teeth_like_pixels, 0)
        self.assertEqual(metrics.recomposition_max_channel_delta, 0)

    def test_metrics_reject_semantic_overlap(self) -> None:
        shape = (MODULE.CANVAS[1], MODULE.CANVAS[0])
        opening = np.zeros(shape, dtype=bool)
        opening[580:600, 480:544] = True
        overlap = opening.copy()
        empty = np.zeros(shape, dtype=bool)
        masks = {
            "mouth-interior": overlap,
            "mouth-upper-teeth": overlap,
            "mouth-tongue": empty,
            "mouth-upper-lip": empty,
            "mouth-lower-lip": empty,
        }
        rgba = np.zeros((shape[0], shape[1], 4), dtype=np.uint8)

        metrics = MODULE.measure_masks(masks, opening, rgba, rgba, reference_width=101)

        self.assertGreater(metrics.overlapping_semantic_pixels, 0)


class BuildPsdPathTest(unittest.TestCase):
    def test_build_psd_uses_v6_filename(self) -> None:
        asset_root = Path("D:/fixtures/assets/interviewer-rigging/custom-v6").resolve()
        with patch.object(MODULE.subprocess, "run") as run:
            MODULE.build_psd(asset_root)

        arguments = run.call_args.args[0]
        decoded_repository_root = Path(base64.b64decode(arguments[-2]).decode("utf-8"))
        decoded_asset_root = Path(base64.b64decode(arguments[-1]).decode("utf-8"))
        self.assertEqual(decoded_repository_root, SCRIPT_PATH.parent.parent.resolve())
        self.assertEqual(decoded_asset_root, asset_root)
        self.assertIn("join(assetRoot, 'manifest.json')", arguments[2])
        self.assertIn("join(assetRoot, 'interviewer-mouth-v6.psd')", arguments[2])
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
