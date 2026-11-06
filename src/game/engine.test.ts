import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatAccuracy } from "../accuracy";
import { validateChart, type Chart } from "../chart";
import { advance, createEngine, press, release } from "./engine";

const keys = [false, false, false, false] as const;

describe("accuracy", () => {
  it("drops the third decimal instead of rounding", () => {
    expect(formatAccuracy(99286, 100000)).toBe("99.28%");
    expect(formatAccuracy(9998, 10000)).toBe("99.98%");
    expect(formatAccuracy(9999, 10000)).toBe("99.99%");
    expect(formatAccuracy(10000, 10000)).toBe("100.00%");
  });
});

describe("judgment", () => {
  it("scores the tap windows", () => {
    expect(gradeAt(0)).toMatchObject({ grade: "perfect", side: null });
    expect(gradeAt(-60).grade).toBe("perfect");
    expect(gradeAt(60).grade).toBe("perfect");
    expect(gradeAt(-130)).toMatchObject({ grade: "good", side: "early" });
    expect(gradeAt(130)).toMatchObject({ grade: "good", side: "late" });
    expect(gradeAt(-131)).toMatchObject({ grade: "miss", side: "early" });
    expect(gradeAt(-200)).toMatchObject({ grade: "miss", side: "early" });

    const early = createEngine([{ lane: 0, time: 1000 }], 0);
    expect(press(early, 0, 1000 - 201)).toBeNull();
    expect(early.notes[0].head).toBe("pending");
    expect(press(early, 0, 1000)?.grade).toBe("perfect");

    const late = createEngine([{ lane: 0, time: 1000 }], 0);
    expect(press(late, 0, 1131)).toBeNull();
    advance(late, 1131, keys);
    expect(late.notes[0].head).toBe("miss");
    expect(late.stats.combo).toBe(0);
  });

  it("keeps an earlier note when both windows are open", () => {
    const engine = createEngine(
      [
        { lane: 0, time: 1000 },
        { lane: 0, time: 1200 },
      ],
      0,
    );
    expect(press(engine, 0, 1080)?.grade).toBe("good");
    expect(engine.notes[0].head).toBe("good");
    expect(engine.notes[1].head).toBe("pending");
  });

  it("shifts the hit time by the offset", () => {
    const engine = createEngine([{ lane: 1, time: 1000 }], 100);
    expect(press(engine, 1, 1100)?.grade).toBe("perfect");
    expect(engine.stats.score).toBe(100);
  });

  it("scores a held note as two taps and ticks combo without points", () => {
    const engine = createEngine([{ lane: 0, time: 5000, end: 6500 }], 0);
    const down = [true, false, false, false] as const;
    expect(press(engine, 0, 5000)?.grade).toBe("perfect");
    advance(engine, 6460, down);
    expect(release(engine, 0, 6460)).toMatchObject({ grade: "perfect", side: null });
    expect(engine.stats.score).toBe(200);
    expect(engine.stats.perfect).toBe(2);
    expect(engine.stats.good).toBe(0);
    expect(engine.stats.combo).toBe(16);
  });

  it("treats a hold released up to 80ms early as perfect", () => {
    const onTime = createEngine([{ lane: 0, time: 5000, end: 6500 }], 0);
    press(onTime, 0, 5000);
    expect(release(onTime, 0, 6420)?.grade).toBe("perfect");

    const early = createEngine([{ lane: 0, time: 5000, end: 6500 }], 0);
    press(early, 0, 5000);
    expect(release(early, 0, 6419)?.grade).toBe("miss");
  });

  it("treats a hold released up to 200ms late as perfect", () => {
    const onTime = createEngine([{ lane: 0, time: 5000, end: 6500 }], 0);
    press(onTime, 0, 5000);
    expect(release(onTime, 0, 6700)?.grade).toBe("perfect");

    const late = createEngine([{ lane: 0, time: 5000, end: 6500 }], 0);
    press(late, 0, 5000);
    expect(release(late, 0, 6701)?.grade).toBe("good");
  });

  it("misses a hold released more than 80ms early and keeps the tick combo as the maximum", () => {
    const engine = createEngine([{ lane: 0, time: 5000, end: 6500 }], 0);
    press(engine, 0, 5000);
    advance(engine, 5200, [true, false, false, false]);
    release(engine, 0, 5200);
    expect(engine.notes[0].tail).toBe("miss");
    expect(engine.stats.score).toBe(100);
    expect(engine.stats.miss).toBe(1);
    expect(engine.stats.combo).toBe(0);
    expect(engine.stats.maxCombo).toBe(3);
    expect(engine.notes[0].ghostChartTime).toBe(5200);
  });

  it("misses the tail when the head is missed", () => {
    const engine = createEngine([{ lane: 2, time: 1000, end: 2000 }], 0);
    advance(engine, 1200, keys);
    expect(engine.notes[0].head).toBe("miss");
    expect(engine.notes[0].tail).toBe("miss");
    expect(engine.stats.miss).toBe(2);
    expect(engine.stats.score).toBe(0);
  });

  it("keeps a held tail pending through the late window, then good", () => {
    const engine = createEngine([{ lane: 0, time: 0, end: 300 }], 0);
    const down = [true, false, false, false] as const;
    press(engine, 0, 0);
    advance(engine, 500, down);
    expect(engine.notes[0].tail).toBe("pending");
    advance(engine, 501, down);
    expect(engine.notes[0].tail).toBe("good");
    expect(engine.stats.score).toBe(200);
  });
});

describe("test chart", () => {
  const chart = loadTestChart();

  it("matches the generated audio", () => {
    expect(chart.title).toBe("Test");
    expect(chart.notes.length).toBeGreaterThan(0);
  });

  it("can be played perfectly", () => {
    const engine = createEngine(chart.notes, 0);
    const planned = chart.notes.flatMap((note) => {
      const events: { t: number; lane: number; kind: "press" | "up" }[] = [
        { t: note.time, lane: note.lane, kind: "press" },
      ];
      if (note.end != null) events.push({ t: note.end, lane: note.lane, kind: "up" });
      return events;
    });
    planned.sort((a, b) => a.t - b.t || (a.kind === "up" ? -1 : 1));

    const held = [false, false, false, false];
    let cursor = -1;
    for (const event of planned) {
      if (event.t !== cursor) {
        advance(engine, event.t, held);
        cursor = event.t;
      }
      if (event.kind === "press") {
        const feedback = press(engine, event.lane, event.t);
        expect(feedback?.grade).not.toBe("miss");
        held[event.lane] = true;
      } else {
        held[event.lane] = false;
      }
    }
    advance(engine, 20000, [false, false, false, false]);

    expect(engine.stats.miss).toBe(0);
    expect(engine.stats.score).toBe(engine.stats.maxScore);
    expect(formatAccuracy(engine.stats.score, engine.stats.maxScore)).toBe("100.00%");
    expect(engine.stats.maxCombo).toBe(54);
  });

  it("misses everything when no keys are pressed", () => {
    const engine = createEngine(chart.notes, 0);
    advance(engine, 20000, [false, false, false, false]);
    const holds = chart.notes.filter((note) => note.end != null).length;
    expect(engine.stats.miss).toBe(chart.notes.length + holds);
    expect(engine.stats.score).toBe(0);
  });
});

function gradeAt(dt: number) {
  const engine = createEngine([{ lane: 0, time: 1000 }], 0);
  const feedback = press(engine, 0, 1000 + dt);
  if (!feedback) throw new Error("Expected a judgment.");
  return feedback;
}

function loadTestChart(): Chart {
  const json: unknown = JSON.parse(readFileSync("public/chart.json", "utf8"));
  const wav = readFileSync("public/audio.wav");
  const samples = wav.readUInt32LE(40) / 2;
  const durationMs = (samples / 44100) * 1000;
    return validateChart(json, durationMs);
}
