export interface ChartNote {
  lane: number;
  time: number;
  end?: number;
}

export interface Chart {
  title: string;
  recording: string;
  notes: ChartNote[];
}

export function validateChart(data: unknown, durationMs: number): Chart {
  if (!data || typeof data !== "object") {
    throw new Error("The chart file is not valid JSON.");
  }
  const record = data as { title?: unknown; recording?: unknown; notes?: unknown };
  if (typeof record.title !== "string" || record.title.trim() === "") {
    throw new Error("The chart needs a title.");
  }
  if (typeof record.recording !== "string") {
    throw new Error("The chart needs a recording name.");
  }
  if (!Array.isArray(record.notes) || record.notes.length === 0) {
    throw new Error("The chart has no notes.");
  }

  const notes: ChartNote[] = record.notes.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("A note is missing its fields.");
    const note = entry as { lane?: unknown; time?: unknown; end?: unknown };
    if (typeof note.lane !== "number" || !Number.isInteger(note.lane) || note.lane < 0 || note.lane > 3) {
      throw new Error("A note uses an unknown lane.");
    }
    if (typeof note.time !== "number" || note.time < 0 || note.time > durationMs) {
      throw new Error("A note is outside the audio.");
    }
    if (note.end == null) return { lane: note.lane, time: note.time };
    if (typeof note.end !== "number" || note.end <= note.time || note.end > durationMs) {
      throw new Error("A hold is outside the audio.");
    }
    return { lane: note.lane, time: note.time, end: note.end };
  });

  const byLane = new Map<number, ChartNote[]>();
  for (const note of notes) {
    const laneNotes = byLane.get(note.lane) ?? [];
    laneNotes.push(note);
    byLane.set(note.lane, laneNotes);
  }
  for (const laneNotes of byLane.values()) {
    laneNotes.sort((a, b) => a.time - b.time);
    for (let i = 0; i < laneNotes.length; i += 1) {
      const current = laneNotes[i];
      const next = laneNotes[i + 1];
      if (next && current.time === next.time) {
        throw new Error("Two notes share a time on the same lane.");
      }
      if (next && current.end != null && next.time <= current.end) {
        throw new Error("A hold overlaps the next note.");
      }
    }
  }

  return { title: record.title, recording: record.recording, notes };
}
