import { formatAccuracy } from "../accuracy";
import type { Chart } from "../chart";
import { approachMs, type Settings } from "../settings";
import { advance, allResolved, createEngine, forceResolve, press, release, type Engine, type Feedback } from "./engine";
import { drawFrame } from "./draw";

export interface Assets {
  ctx: AudioContext;
  chart: Chart;
  audio: AudioBuffer;
}

export interface ResultStats {
  title: string;
  score: number;
  accuracy: string;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
}

export interface GameHandle {
  destroy: () => void;
  resume: () => void;
  quit: () => void;
}

export function mountGame(options: {
  canvas: HTMLCanvasElement;
  assets: Assets;
  settings: Settings;
  onResult: (result: ResultStats) => void;
  onQuit: () => void;
  onPauseChange: (paused: boolean) => void;
}): GameHandle {
  const { canvas, assets, settings, onResult, onQuit, onPauseChange } = options;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Couldn't load this chart.");

  const engine: Engine = createEngine(assets.chart.notes, settings.offset);
  const travel = approachMs(settings.speed);
  const durationMs = assets.audio.duration * 1000;
  const keysDown = [false, false, false, false];
  let feedback: Feedback | null = null;
  let feedbackUntil = 0;
  let finished = false;
  let destroyed = false;
  let paused = false;
  let frozenAudioMs = 0;
  let judging = true;
  let resumeTarget: number | null = null;
  let anchorCtx = assets.ctx.currentTime;
  let anchorAudioMs = -travel;
  let source: AudioBufferSourceNode | null = null;
  let raf = 0;

  const now = (): number => {
    if (paused) return frozenAudioMs;
    return (assets.ctx.currentTime - anchorCtx) * 1000 + anchorAudioMs;
  };

  const remember = (next: Feedback | null, audioMs: number) => {
    if (!next) return;
    feedback = next;
    feedbackUntil = audioMs + 500;
  };

  const stopSource = () => {
    if (!source) return;
    try {
      source.onended = null;
      source.stop();
    } catch {
      // The buffer may not have started yet.
    }
    source.disconnect();
    source = null;
  };

  const scheduleAudio = (whenAudioMs: number, bufferOffsetMs: number) => {
    stopSource();
    const delaySec = (whenAudioMs - now()) / 1000;
    const node = assets.ctx.createBufferSource();
    node.buffer = assets.audio;
    node.connect(assets.ctx.destination);
    const offsetSec = Math.min(Math.max(0, bufferOffsetMs) / 1000, Math.max(0, assets.audio.duration - 0.001));
    node.start(assets.ctx.currentTime + Math.max(0, delaySec), offsetSec);
    source = node;
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    stopSource();
    cancelAnimationFrame(raf);
    const { stats } = engine;
    onResult({
      title: assets.chart.title,
      score: stats.score,
      accuracy: formatAccuracy(stats.score, stats.maxScore),
      maxCombo: stats.maxCombo,
      perfect: stats.perfect,
      good: stats.good,
      miss: stats.miss,
    });
  };

  const pause = () => {
    if (paused || finished) return;
    frozenAudioMs = now();
    if (judging) advance(engine, frozenAudioMs, keysDown);
    paused = true;
    judging = false;
    resumeTarget = null;
    feedback = null;
    stopSource();
    onPauseChange(true);
  };

  const resume = () => {
    if (!paused || finished || destroyed) return;
    paused = false;
    onPauseChange(false);
    anchorCtx = assets.ctx.currentTime;
    anchorAudioMs = frozenAudioMs - travel;
    resumeTarget = frozenAudioMs;
    judging = false;
    const audioAt = Math.max(0, frozenAudioMs);
    scheduleAudio(audioAt, audioAt);
  };

  const quit = () => {
    if (finished || destroyed) return;
    finished = true;
    stopSource();
    cancelAnimationFrame(raf);
    onQuit();
  };

  const tick = () => {
    if (destroyed || finished) return;
    const audioMs = now();
    if (!paused && resumeTarget != null && audioMs >= resumeTarget) {
      const sampleAt = resumeTarget;
      resumeTarget = null;
      judging = true;
      remember(advance(engine, sampleAt, keysDown), sampleAt);
    }
    if (!paused && judging) {
      remember(advance(engine, audioMs, keysDown), audioMs);
      if (audioMs >= durationMs + 150) forceResolve(engine);
      if (allResolved(engine) && audioMs >= durationMs) {
        finish();
        return;
      }
    }
    const visibleFeedback = feedback && audioMs <= feedbackUntil ? feedback : null;
    drawFrame(context, engine, audioMs, travel, keysDown, settings.keys, visibleFeedback);
    raf = requestAnimationFrame(tick);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (destroyed || finished) return;
    if (event.repeat) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (paused) resume();
      else pause();
      return;
    }
    const lane = settings.keys.indexOf(normalizeKey(event.key));
    if (lane === -1) return;
    event.preventDefault();
    keysDown[lane] = true;
    if (!paused && judging) {
      const audioMs = now();
      remember(advance(engine, audioMs, keysDown), audioMs);
      remember(press(engine, lane, audioMs), audioMs);
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    const lane = settings.keys.indexOf(normalizeKey(event.key));
    if (lane === -1) return;
    event.preventDefault();
    if (destroyed || finished || paused || !judging) {
      keysDown[lane] = false;
      return;
    }
    const audioMs = now();
    remember(advance(engine, audioMs, keysDown), audioMs);
    keysDown[lane] = false;
    remember(release(engine, lane, audioMs), audioMs);
  };

  const onVisibility = () => {
    if (document.hidden) pause();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("visibilitychange", onVisibility);
  void assets.ctx.resume();
  scheduleAudio(0, 0);
  raf = requestAnimationFrame(tick);

  return {
    resume,
    quit,
    destroy: () => {
      destroyed = true;
      finished = true;
      stopSource();
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

function normalizeKey(key: string): string {
  if (key === " " || key === ";" || key === "," || key === ".") return key;
  if (/^[a-zA-Z0-9]$/.test(key)) return key.toLowerCase();
  return key;
}
