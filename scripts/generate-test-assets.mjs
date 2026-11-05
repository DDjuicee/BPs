import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const sampleRate = 44100;
const durationMs = 14000;
const notes = [
  { lane: 0, time: 2000 },
  { lane: 1, time: 2500 },
  { lane: 2, time: 3000 },
  { lane: 3, time: 3500 },
  { lane: 0, time: 4000 },
  { lane: 3, time: 4000 },
  { lane: 1, time: 4500 },
  { lane: 2, time: 4500 },
  { lane: 0, time: 5000, end: 6500 },
  { lane: 3, time: 5200 },
  { lane: 3, time: 5400 },
  { lane: 3, time: 5600 },
  { lane: 3, time: 5800 },
  { lane: 3, time: 6000 },
  { lane: 1, time: 7000 },
  { lane: 1, time: 7250 },
  { lane: 1, time: 7500 },
  { lane: 1, time: 7750 },
  { lane: 0, time: 8500 },
  { lane: 1, time: 8500 },
  { lane: 2, time: 8500 },
  { lane: 3, time: 8500 },
  { lane: 2, time: 9000, end: 10200 },
  { lane: 0, time: 11000 },
  { lane: 1, time: 11500 },
  { lane: 2, time: 12000 },
  { lane: 3, time: 12500 },
];

const pitches = [660, 880, 1100, 1320];
const samples = new Float64Array(Math.round((durationMs / 1000) * sampleRate));

for (const note of notes) {
  addBlip(note.time, pitches[note.lane], 0.85);
  if (note.end != null) {
    addTone(note.time, note.end, pitches[note.lane] / 2, 0.16);
    addBlip(note.end, pitches[note.lane], 0.6);
  }
}

const wav = encodeWav(samples, sampleRate);
const root = path.resolve(import.meta.dirname, "..");
await mkdir(path.join(root, "public"), { recursive: true });
await writeFile(path.join(root, "public", "audio.wav"), wav);
await writeFile(
  path.join(root, "public", "chart.json"),
  `${JSON.stringify({ title: "Test", recording: "Local test tone", notes }, null, 2)}\n`,
);

function addBlip(atMs, frequency, gain) {
  const start = Math.floor((atMs / 1000) * sampleRate);
  const length = Math.floor(0.03 * sampleRate);
  for (let i = 0; i < length && start + i < samples.length; i += 1) {
    const envelope = Math.exp(-i / (0.008 * sampleRate));
    samples[start + i] += Math.sin((2 * Math.PI * frequency * i) / sampleRate) * envelope * gain;
  }
}

function addTone(fromMs, toMs, frequency, gain) {
  const start = Math.floor((fromMs / 1000) * sampleRate);
  const end = Math.floor((toMs / 1000) * sampleRate);
  for (let i = start; i < end && i < samples.length; i += 1) {
    const edge = Math.min(i - start, end - i, Math.floor(0.01 * sampleRate));
    const envelope = Math.min(1, edge / Math.floor(0.01 * sampleRate));
    samples[i] += Math.sin((2 * Math.PI * frequency * (i - start)) / sampleRate) * envelope * gain;
  }
}

function encodeWav(channel, rate) {
  const dataSize = channel.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < channel.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, channel[i]));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  return buffer;
}
