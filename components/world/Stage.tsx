"use client";

import { useEffect, useRef } from "react";
import type { Engine, EngineFrame } from "./engine";
import { mysteryStudios, pagewalla, vesper } from "@/lib/content";

const STEPS = ["hand", "auto", "mysterystudios", "pagewalla", "vesper", "finale"];
// still frames shown when WebGL is unavailable or motion is reduced (rendered by the engine itself)
const POSTERS = ["hero", "hand", "auto", "mysterystudios", "pagewalla", "vesper", "finale"];

const LABELS = [
  { id: "ms", name: mysteryStudios.name, href: `#${mysteryStudios.id}` },
  { id: "pw", name: pagewalla.name, href: `#${pagewalla.id}` },
  { id: "vesper", name: vesper.name, href: `#${vesper.id}` },
] as const;

/**
 * Scroll position → story position T (0 hero … 6 finale), piecewise linear between beats.
 * A beat lands when its placard sits where the eye is: mid-screen beside the model on wide
 * screens, in the lower part of the screen under the model on tall ones.
 */
function measureAnchors(tall: boolean): number[] {
  const vh = window.innerHeight;
  const ys = [0];
  for (const s of STEPS) {
    const step = document.querySelector<HTMLElement>(`[data-step="${s}"]`);
    if (!step) return ys;
    const card = step.querySelector<HTMLElement>(".placard");
    const r = (card || step).getBoundingClientRect();
    const eye = card && tall ? 0.7 : 0.5;
    ys.push(Math.max(ys[ys.length - 1] + 1, window.scrollY + r.top + r.height / 2 - vh * eye));
  }
  return ys;
}

function progressAt(y: number, anchors: number[]): number {
  if (anchors.length < 2 || y <= anchors[0]) return 0;
  for (let i = 0; i < anchors.length - 1; i++) {
    if (y <= anchors[i + 1]) return i + (y - anchors[i]) / Math.max(1, anchors[i + 1] - anchors[i]);
  }
  return anchors.length - 1;
}

/**
 * The sticky stage behind the hero and the Work story. The sky is CSS, so the
 * page reads as finished before any WebGL arrives; the world fades in over it.
 */
export function Stage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const postersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current!;
    const canvas = canvasRef.current!;
    const root = document.documentElement;
    const params = new URLSearchParams(window.location.search);
    const stillParam = params.get("still");
    const forceFallback = params.has("fallback");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tallQuery = window.matchMedia("(max-width: 999px), (max-aspect-ratio: 1/1)");

    let engine: Engine | null = null;
    let disposed = false;
    let anchors = measureAnchors(tallQuery.matches);
    let lastPhase = -1;
    let lastT = -1;

    const T = () => progressAt(window.scrollY, anchors);

    // ── fallback: still frames crossfading by beat ─────────────────────────
    const showStills = () => {
      root.classList.add("world-stills");
      const wrap = postersRef.current;
      if (!wrap) return;
      const orient = tallQuery.matches ? "tall" : "wide";
      wrap.querySelectorAll("img").forEach((img) => {
        const name = img.dataset.name;
        if (name && !img.getAttribute("src")) img.setAttribute("src", `/world/${name}-${orient}.webp`);
      });
      updatePosters();
    };
    const updatePosters = () => {
      const wrap = postersRef.current;
      if (!wrap || !root.classList.contains("world-stills")) return;
      const t = T();
      const idx = Math.min(POSTERS.length - 1, Math.round(t));
      wrap.querySelectorAll("img").forEach((img, i) => img.classList.toggle("on", i === idx));
    };

    // ── live frame callback: chip + labels, written straight to the DOM ────
    const onFrame = (f: EngineFrame) => {
      const chip = chipRef.current;
      if (chip) {
        const show = f.T > 0.55 && f.T < 2.7;
        chip.classList.toggle("on", show);
        const phase = f.B < 1 ? 0 : 1;
        if (phase !== lastPhase) {
          lastPhase = phase;
          chip.dataset.phase = phase ? "auto" : "hand";
        }
      }
      const vis = Math.min(1, Math.max(0, (f.T - 5.45) / 0.35));
      if (vis <= 0) {
        labelRefs.current.forEach((el) => {
          if (el && el.style.opacity !== "0") {
            el.style.opacity = "0";
            el.style.pointerEvents = "none";
            el.tabIndex = -1;
          }
        });
        return;
      }
      // place labels top-down; nudge any that would overlap one already placed
      const vw = window.innerWidth;
      const placed: { x: number; y: number; w: number }[] = [];
      const order = f.labels.map((l, i) => ({ l, i })).sort((a, b) => a.l.y - b.l.y);
      for (const { l, i } of order) {
        const el = labelRefs.current[i];
        if (!el) continue;
        const w = el.offsetWidth || 120;
        const x = Math.min(Math.max(l.x, 16 + 14), vw - w - 16 + 14);
        let y = l.y;
        for (let k = 0; k < 4; k++) {
          const hit = placed.find((p) => Math.abs(p.y - y) < 40 && x < p.x + p.w + 8 && p.x < x + w + 8);
          if (!hit) break;
          y = hit.y - 42;
        }
        placed.push({ x, y, w });
        const on = l.on;
        el.style.opacity = on ? String(vis) : "0";
        el.style.pointerEvents = on && vis > 0.6 ? "auto" : "none";
        el.tabIndex = on && vis > 0.6 ? 0 : -1;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        el.style.setProperty("--stem", `${Math.max(12, 12 + (l.y - y)).toFixed(0)}px`);
        el.style.setProperty("--stem-x", `${Math.max(8, Math.min(w - 8, 14 + (l.x - x))).toFixed(0)}px`);
      }
    };

    const onScroll = () => {
      const t = T();
      if (Math.abs(t - lastT) > 1e-4) {
        lastT = t;
        engine?.setProgress(t);
      }
      updatePosters();
    };

    let lastW = window.innerWidth;
    let lastH = window.innerHeight;
    const onResize = () => {
      anchors = measureAnchors(tallQuery.matches);
      onScroll();
      // phones resize the viewport when the URL bar moves; only rebuild buffers for real changes
      const w = window.innerWidth, h = window.innerHeight;
      if (w !== lastW || Math.abs(h - lastH) > 160) {
        lastW = w;
        lastH = h;
        engine?.resize();
      }
    };

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      engine?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    };

    const io = new IntersectionObserver((es) => engine?.setVisible(es[0].isIntersecting), { rootMargin: "64px" });
    io.observe(stage);
    const onVisibility = () => engine?.setVisible(!document.hidden);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    // fonts and images shift the layout after first paint; re-measure when they settle
    document.fonts?.ready.then(() => !disposed && onResize());
    window.addEventListener("load", onResize);

    const start = async () => {
      if (disposed) return;
      if (forceFallback || (reduced && stillParam === null)) {
        showStills();
        return;
      }
      try {
        const mod = await import("./engine");
        if (disposed) return;
        const still = stillParam !== null ? { T: Number(stillParam) || 0, time: mod.STILL_TIME } : undefined;
        if (still) root.classList.add("world-still-capture");
        engine = mod.createEngine(canvas, {
          tall: () => tallQuery.matches,
          still,
          // the hero still is already on screen; the live world takes over from that exact frame
          dollyIn: false,
          onFirstFrame: () => {
            root.classList.add("world-live");
            if (still) root.dataset.worldReady = "1";
          },
          onFrame,
          onLost: () => {
            root.classList.remove("world-live");
            engine = null;
            showStills();
          },
        });
        if (!engine) {
          showStills();
          return;
        }
        if (!still) engine.setProgress(T());
      } catch {
        showStills();
      }
    };

    // the page is readable first; the world arrives once the main thread is free
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => void start(), { timeout: 400 });
    else setTimeout(() => void start(), 200);

    return () => {
      disposed = true;
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("load", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      engine?.destroy();
      engine = null;
    };
  }, []);

  return (
    <div className="stage" ref={stageRef}>
      <div className="sky" aria-hidden="true" />
      {/* the opening frame, rendered by the engine: on screen before any WebGL starts */}
      <picture className="poster-hero">
        <source media="(max-width: 999px), (max-aspect-ratio: 1/1)" srcSet="/world/hero-tall.webp" />
        <img src="/world/hero-wide.webp" alt="" width={1600} height={1000} fetchPriority="high" decoding="async" />
      </picture>
      <div className="posters" ref={postersRef} aria-hidden="true">
        {POSTERS.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p} data-name={p} alt="" decoding="async" />
        ))}
      </div>
      <canvas className="world-gl" ref={canvasRef} aria-hidden="true" />
      <div className="status" ref={chipRef} data-phase="hand" aria-hidden="true">
        <span className="status-dot" />
        <span className="status-hand">By hand, piece by piece</span>
        <span className="status-auto">Automated</span>
      </div>
      <nav className="labels" aria-label="Work">
        {LABELS.map((l, i) => (
          <a
            key={l.id}
            className={`label label-${l.id}`}
            href={l.href}
            tabIndex={-1}
            ref={(el) => {
              labelRefs.current[i] = el;
            }}
          >
            <span className="label-dot" />
            <span>{l.name}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
