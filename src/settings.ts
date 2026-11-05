export interface Settings {
  speed: number;
  offset: number;
  keys: [string, string, string, string];
}

export const SETTINGS_KEY = "bps-settings";

export const DEFAULT_SETTINGS: Settings = {
  speed: 3,
  offset: 0,
  keys: ["d", "f", "j", "k"],
};

export const KEY_OPTIONS: { value: string; label: string }[] = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => ({
    value: letter.toLowerCase(),
    label: letter,
  })),
  ..."0123456789".split("").map((digit) => ({ value: digit, label: digit })),
  { value: " ", label: "Space" },
  { value: ";", label: "Semicolon" },
  { value: ",", label: "Comma" },
  { value: ".", label: "Period" },
];

export function approachMs(speed: number): number {
  return 3600 / speed;
}

export function clampSpeed(value: number): number {
  const tenths = Math.round(value * 10);
  return Math.min(60, Math.max(10, tenths)) / 10;
}

export function clampOffset(value: number): number {
  return Math.min(200, Math.max(-200, Math.round(value)));
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, keys: [...DEFAULT_SETTINGS.keys] };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const keys = parsed.keys;
    if (!Array.isArray(keys) || keys.length !== 4 || new Set(keys).size !== 4) {
      return { ...DEFAULT_SETTINGS, keys: [...DEFAULT_SETTINGS.keys] };
    }
    const allowed = new Set(KEY_OPTIONS.map((option) => option.value));
    if (!keys.every((key) => typeof key === "string" && allowed.has(key))) {
      return { ...DEFAULT_SETTINGS, keys: [...DEFAULT_SETTINGS.keys] };
    }
    return {
      speed: clampSpeed(typeof parsed.speed === "number" ? parsed.speed : DEFAULT_SETTINGS.speed),
      offset: clampOffset(typeof parsed.offset === "number" ? parsed.offset : DEFAULT_SETTINGS.offset),
      keys: [keys[0], keys[1], keys[2], keys[3]],
    };
  } catch {
    return { ...DEFAULT_SETTINGS, keys: [...DEFAULT_SETTINGS.keys] };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function keyLabel(value: string): string {
  return KEY_OPTIONS.find((option) => option.value === value)?.label ?? value.toUpperCase();
}

export function assignKey(keys: Settings["keys"], lane: number, value: string): Settings["keys"] {
  const next: Settings["keys"] = [keys[0], keys[1], keys[2], keys[3]];
  const other = next.indexOf(value);
  if (other !== -1 && other !== lane) next[other] = next[lane];
  next[lane] = value;
  return next;
}
