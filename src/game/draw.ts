import { keyLabel } from "../settings";
import type { Engine } from "./engine";

export const PLAYFIELD_WIDTH = 400;
export const PLAYFIELD_HEIGHT = 800;
export const JUDGMENT_Y = 700;

const LANE_COLORS = ["#161616", "#1e1e1e", "#161616", "#1e1e1e"];

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  engine: Engine,
  audioMs: number,
  approach: number,
  keysDown: readonly boolean[],
  keyBindings: readonly string[],
  feedback: { grade: "perfect" | "good" | "miss"; side: "early" | "late" | null } | null,
): void {
  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(PLAYFIELD_WIDTH * dpr);
  const pixelHeight = Math.round(PLAYFIELD_HEIGHT * dpr);
  const canvas = ctx.canvas;
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  for (let lane = 0; lane < 4; lane += 1) {
    ctx.fillStyle = LANE_COLORS[lane];
    ctx.fillRect(lane * 100, 0, 100, PLAYFIELD_HEIGHT);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, PLAYFIELD_WIDTH, JUDGMENT_Y);
  ctx.clip();
  for (const note of engine.notes) drawNote(ctx, engine, note, audioMs, approach);
  ctx.restore();

  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(0, JUDGMENT_Y - 1, PLAYFIELD_WIDTH, 2);

  for (let lane = 0; lane < 4; lane += 1) {
    if (keysDown[lane]) {
      ctx.fillStyle = "#3a3a3a";
      ctx.fillRect(lane * 100, JUDGMENT_Y + 2, 100, PLAYFIELD_HEIGHT - JUDGMENT_Y - 2);
    }
    ctx.fillStyle = "#f0f0f0";
    ctx.font = "20px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(keyLabel(keyBindings[lane]), lane * 100 + 50, 750);
  }

  ctx.fillStyle = "#e8e8e8";
  ctx.font = "28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(engine.stats.combo), PLAYFIELD_WIDTH / 2, 40);

  if (feedback) {
    const label = feedback.grade === "perfect" ? "PERFECT" : feedback.grade === "good" ? "GOOD" : "MISS";
    ctx.fillStyle = feedback.grade === "good" ? "#8d8d8d" : "#f5f5f5";
    ctx.font = "22px system-ui, sans-serif";
    ctx.fillText(label, PLAYFIELD_WIDTH / 2, 664);
    if (feedback.side) {
      ctx.fillStyle = "#e8e8e8";
      ctx.font = "16px system-ui, sans-serif";
      ctx.fillText(feedback.side === "early" ? "EARLY" : "LATE", PLAYFIELD_WIDTH / 2, 636);
    }
  }
}

function drawNote(
  ctx: CanvasRenderingContext2D,
  engine: Engine,
  note: Engine["notes"][number],
  audioMs: number,
  approach: number,
): void {
  const x = note.lane * 100 + 10;
  if (note.end != null && note.ghostChartTime != null) {
    strokeBar(ctx, x, yAt(note.ghostChartTime, audioMs, approach, engine.offset), yAt(note.end, audioMs, approach, engine.offset));
    return;
  }
  if (note.end != null && note.tail === "pending") {
    const bottom = note.head === "pending" ? yAt(note.time, audioMs, approach, engine.offset) : JUDGMENT_Y;
    const top = yAt(note.end, audioMs, approach, engine.offset);
    ctx.fillStyle = "#5c5c5c";
    ctx.fillRect(x, Math.min(top, bottom), 80, Math.abs(bottom - top));
  }
  if (note.head === "pending") {
    const bottom = yAt(note.time, audioMs, approach, engine.offset);
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(x, bottom - 28, 80, 28);
  }
}

function strokeBar(ctx: CanvasRenderingContext2D, x: number, bottom: number, top: number): void {
  const y = Math.min(top, bottom);
  const height = Math.abs(bottom - top);
  if (height <= 0) return;
  ctx.strokeStyle = "#5c5c5c";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y, 78, height);
}

function yAt(chartTime: number, audioMs: number, approach: number, offset: number): number {
  const remaining = chartTime + offset - audioMs;
  return JUDGMENT_Y * (1 - remaining / approach);
}
