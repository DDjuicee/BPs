import type { ChartNote } from "../chart";

export type Grade = "perfect" | "good" | "miss";
export type Side = "early" | "late" | null;

export interface Feedback {
  grade: Grade;
  side: Side;
}

export interface RuntimeNote {
  lane: number;
  time: number;
  end: number | null;
  head: "pending" | Grade;
  tail: "pending" | "none" | Grade;
  holding: boolean;
  headHitAudioMs: number | null;
  nextTickAudioMs: number | null;
  ghostChartTime: number | null;
}

export interface Stats {
  score: number;
  maxScore: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
}

export interface Engine {
  notes: RuntimeNote[];
  stats: Stats;
  offset: number;
}

export function createEngine(notes: ChartNote[], offset: number): Engine {
  return {
    offset,
    stats: {
      score: 0,
      maxScore: notes.reduce((sum, note) => sum + (note.end == null ? 100 : 200), 0),
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      good: 0,
      miss: 0,
    },
    notes: notes.map((note) => ({
      lane: note.lane,
      time: note.time,
      end: note.end ?? null,
      head: "pending",
      tail: note.end == null ? "none" : "pending",
      holding: false,
      headHitAudioMs: null,
      nextTickAudioMs: null,
      ghostChartTime: null,
    })),
  };
}

export function allResolved(engine: Engine): boolean {
  return engine.notes.every((note) => note.head !== "pending" && note.tail !== "pending");
}

export function press(engine: Engine, lane: number, audioMs: number): Feedback | null {
  let target: RuntimeNote | null = null;
  for (const note of engine.notes) {
    if (note.lane !== lane || note.head !== "pending") continue;
    const dt = audioMs - (note.time + engine.offset);
    if (dt < -150 || dt > 90) continue;
    if (!target || note.time < target.time) target = note;
  }
  if (!target) return null;

  const dt = audioMs - (target.time + engine.offset);
  const grade: Grade = dt < -90 ? "miss" : Math.abs(dt) <= 40 ? "perfect" : "good";
  const feedback = applyHead(engine, target, grade, dt);
  if (grade !== "miss" && target.tail === "pending") {
    target.holding = true;
    target.headHitAudioMs = audioMs;
    target.nextTickAudioMs = audioMs + 100;
  }
  return feedback;
}

export function release(engine: Engine, lane: number, audioMs: number): Feedback | null {
  const target = engine.notes.find((note) => note.lane === lane && note.holding && note.tail === "pending");
  if (!target || target.end == null) return null;
  const tailAt = target.end + engine.offset;
  target.holding = false;
  target.nextTickAudioMs = null;
  if (audioMs < tailAt - 40) {
    target.ghostChartTime = audioMs - engine.offset;
    return applyTail(engine, target, "miss", audioMs - tailAt);
  }
  return applyTail(engine, target, "good", audioMs - tailAt);
}

/** Resolve holds whose key has come up, then misses, ticks, and tails that reached their end. */
export function advance(engine: Engine, audioMs: number, keysDown: readonly boolean[]): Feedback | null {
  let last: Feedback | null = null;
  for (let lane = 0; lane < 4; lane += 1) {
    if (!keysDown[lane]) {
      const feedback = release(engine, lane, audioMs);
      if (feedback) last = feedback;
    }
  }

  for (const note of engine.notes) {
    if (note.head === "pending" && audioMs - (note.time + engine.offset) > 90) {
      last = applyHead(engine, note, "miss", audioMs - (note.time + engine.offset));
    }
  }

  for (const note of engine.notes) {
    if (!note.holding || note.tail !== "pending" || note.end == null || note.nextTickAudioMs == null) continue;
    const tailAt = note.end + engine.offset;
    let guard = 0;
    while (note.nextTickAudioMs != null && audioMs >= note.nextTickAudioMs && note.nextTickAudioMs < tailAt) {
      engine.stats.combo += 1;
      if (engine.stats.combo > engine.stats.maxCombo) engine.stats.maxCombo = engine.stats.combo;
      note.nextTickAudioMs += 100;
      guard += 1;
      if (guard > 10000) break;
    }
  }

  for (const note of engine.notes) {
    if (!note.holding || note.tail !== "pending" || note.end == null) continue;
    const tailAt = note.end + engine.offset;
    if (audioMs >= tailAt) {
      note.holding = false;
      note.nextTickAudioMs = null;
      last = applyTail(engine, note, "good", 0);
    }
  }

  return last;
}

export function forceResolve(engine: Engine): void {
  for (const note of engine.notes) {
    if (note.head === "pending") applyHead(engine, note, "miss", 91);
    if (note.tail === "pending") {
      note.holding = false;
      note.nextTickAudioMs = null;
      applyTail(engine, note, "miss", 0);
    }
  }
}

function applyHead(engine: Engine, note: RuntimeNote, grade: Grade, dt: number): Feedback {
  note.head = grade;
  const points = grade === "perfect" ? 100 : grade === "good" ? 50 : 0;
  applyGrade(engine.stats, grade, points);
  if (grade === "miss" && note.tail === "pending") {
    note.holding = false;
    note.nextTickAudioMs = null;
    note.tail = "miss";
    applyGrade(engine.stats, "miss", 0);
  }
  return { grade, side: grade === "perfect" ? null : sideOf(dt) };
}

function applyTail(engine: Engine, note: RuntimeNote, grade: Grade, dt: number): Feedback {
  note.tail = grade;
  const points = grade === "good" ? 100 : 0;
  applyGrade(engine.stats, grade, points);
  return { grade, side: sideOf(dt) };
}

function applyGrade(stats: Stats, grade: Grade, points: number): void {
  stats.score += points;
  if (grade === "perfect") {
    stats.perfect += 1;
    stats.combo += 1;
  } else if (grade === "good") {
    stats.good += 1;
    stats.combo += 1;
  } else {
    stats.miss += 1;
    stats.combo = 0;
  }
  if (stats.combo > stats.maxCombo) stats.maxCombo = stats.combo;
}

function sideOf(dt: number): Side {
  if (dt < 0) return "early";
  if (dt > 0) return "late";
  return null;
}
