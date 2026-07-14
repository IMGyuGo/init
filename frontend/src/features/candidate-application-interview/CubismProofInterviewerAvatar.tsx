"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createCubismProofRenderer, type CubismProofRenderer } from "./CubismProofRuntime";

type CubismProofStatus = "loading" | "ready" | "fallback";

export interface CubismProofInterviewerAvatarProps {
  mouthOpen: number;
  reducedMotion: boolean;
  className?: string;
}

function clampMouthOpen(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function CubismProofInterviewerAvatar({
  mouthOpen,
  reducedMotion,
  className = "",
}: CubismProofInterviewerAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<CubismProofRenderer | null>(null);
  const renderedMouthOpen = reducedMotion ? 0 : clampMouthOpen(mouthOpen);
  const mouthOpenRef = useRef(renderedMouthOpen);
  const [status, setStatus] = useState<CubismProofStatus>("loading");
  const [error, setError] = useState("");
  const [diagnostic, setDiagnostic] = useState("");

  mouthOpenRef.current = renderedMouthOpen;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let renderer: CubismProofRenderer | null = null;

    void createCubismProofRenderer(canvas, mouthOpenRef.current)
      .then((nextRenderer) => {
        if (cancelled) {
          nextRenderer.release();
          return;
        }
        renderer = nextRenderer;
        rendererRef.current = nextRenderer;
        setDiagnostic(JSON.stringify(nextRenderer.diagnostic));
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Cubism proof model failed to load");
        setStatus("fallback");
      });

    return () => {
      cancelled = true;
      renderer?.release();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setMouthOpen(renderedMouthOpen);
  }, [renderedMouthOpen]);

  return (
    <div
      className={["cubism-proof-avatar", className].filter(Boolean).join(" ")}
      data-cubism-diagnostic={diagnostic}
      data-cubism-error={error}
      data-cubism-model-status={status}
      data-cubism-mouth-open={renderedMouthOpen}
      data-cubism-proof-avatar="true"
    >
      <Image
        alt=""
        aria-hidden="true"
        className="cubism-proof-avatar__base"
        draggable={false}
        height={1536}
        loading="eager"
        src="/assets/interviewer-cubism/v4-deformation-proof/interviewer-v4-deformation-proof-base.png"
        unoptimized
        width={1024}
      />
      <canvas aria-label="Cubism V4 면접관 변형 proof 모델" ref={canvasRef} />
    </div>
  );
}
