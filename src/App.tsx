import { useEffect, useRef, useState } from "react";
import { validateChart, type Chart } from "./chart";
import { mountGame, type Assets, type GameHandle, type ResultStats } from "./game/session";
import {
  KEY_OPTIONS,
  assignKey,
  clampOffset,
  clampSpeed,
  loadSettings,
  saveSettings,
  type Settings,
} from "./settings";

type Screen = "start" | "settings" | "loading" | "play" | "result";

export function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [screen, setScreen] = useState<Screen>("start");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState("");
  const [assets, setAssets] = useState<Assets | null>(null);
  const [playId, setPlayId] = useState(0);
  const [result, setResult] = useState<ResultStats | null>(null);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  const start = async () => {
    setError("");
    setDetail("");
    setScreen("loading");
    const ctx = new AudioContext();
    await ctx.resume();
    try {
      const loaded = await loadAssets(ctx);
      setAssets((current) => {
        if (current) void current.ctx.close();
        return loaded;
      });
      setPlayId((id) => id + 1);
      setScreen("play");
    } catch (caught) {
      await ctx.close();
      setError("Couldn't load this chart.");
      setDetail(caught instanceof Error ? caught.message : "");
      setScreen("start");
    }
  };

  return (
    <main className="column">
      {screen === "start" || screen === "loading" ? (
        <section className="screen">
          <h1>BPs</h1>
          <button type="button" onClick={start} disabled={screen === "loading"}>
            {screen === "loading" ? "Loading" : "Play"}
          </button>
          <button type="button" onClick={() => setScreen("settings")} disabled={screen === "loading"}>
            Settings
          </button>
          {error ? <p className="muted">{error}</p> : null}
          {detail && detail !== error ? <p className="muted">{detail}</p> : null}
        </section>
      ) : null}

      {screen === "settings" ? (
        <SettingsScreen
          settings={settings}
          onChange={updateSettings}
          onBack={() => setScreen("start")}
        />
      ) : null}

      {screen === "play" && assets ? (
        <PlayScreen
          key={playId}
          assets={assets}
          settings={settings}
          onResult={(next) => {
            setResult(next);
            setScreen("result");
          }}
          onQuit={() => setScreen("start")}
        />
      ) : null}

      {screen === "result" && result ? (
        <ResultScreen
          result={result}
          onRetry={() => {
            setPlayId((id) => id + 1);
            setScreen("play");
          }}
          onBack={() => setScreen("start")}
        />
      ) : null}
    </main>
  );
}

function SettingsScreen({
  settings,
  onChange,
  onBack,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onBack: () => void;
}) {
  const [offsetText, setOffsetText] = useState(String(settings.offset));

  const commitOffset = () => {
    if (!/^-?\d+$/.test(offsetText.trim())) {
      setOffsetText(String(settings.offset));
      return;
    }
    const offset = clampOffset(Number(offsetText));
    setOffsetText(String(offset));
    onChange({ ...settings, offset });
  };

  const stepOffset = (delta: number) => {
    const current = /^-?\d+$/.test(offsetText.trim()) ? Number(offsetText) : settings.offset;
    const offset = clampOffset(current + delta);
    setOffsetText(String(offset));
    onChange({ ...settings, offset });
  };

  return (
    <section className="screen">
      <h2>Settings</h2>
      <label>
        Speed
        <div className="stepper">
          <button
            type="button"
            onClick={() => onChange({ ...settings, speed: clampSpeed((Math.round(settings.speed * 10) - 1) / 10) })}
          >
            −
          </button>
          <div className="value">{settings.speed.toFixed(1)}</div>
          <button
            type="button"
            onClick={() => onChange({ ...settings, speed: clampSpeed((Math.round(settings.speed * 10) + 1) / 10) })}
          >
            +
          </button>
        </div>
      </label>
      <label>
        Offset
        <div className="stepper">
          <button type="button" onClick={() => stepOffset(-1)}>
            −
          </button>
          <input
            aria-label="Offset"
            value={offsetText}
            onChange={(event) => setOffsetText(event.target.value)}
            onBlur={commitOffset}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitOffset();
              }
            }}
            onWheel={(event) => event.currentTarget.blur()}
          />
          <button type="button" onClick={() => stepOffset(1)}>
            +
          </button>
        </div>
      </label>
      {settings.keys.map((key, lane) => (
        <label key={lane}>
          {`Lane ${lane + 1}`}
          <select
            value={key}
            onChange={(event) => onChange({ ...settings, keys: assignKey(settings.keys, lane, event.target.value) })}
          >
            {KEY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button type="button" onClick={onBack}>
        Back
      </button>
    </section>
  );
}

function PlayScreen({
  assets,
  settings,
  onResult,
  onQuit,
}: {
  assets: Assets;
  settings: Settings;
  onResult: (result: ResultStats) => void;
  onQuit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const onResultRef = useRef(onResult);
  const onQuitRef = useRef(onQuit);
  const [paused, setPaused] = useState(false);
  onResultRef.current = onResult;
  onQuitRef.current = onQuit;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = mountGame({
      canvas,
      assets,
      settings,
      onResult: (next) => onResultRef.current(next),
      onQuit: () => onQuitRef.current(),
      onPauseChange: setPaused,
    });
    handleRef.current = handle;
    return () => handle.destroy();
  }, [assets, settings]);

  return (
    <>
      <canvas ref={canvasRef} width={400} height={800} />
      {paused ? (
        <div className="pause">
          <h2>Paused</h2>
          <button type="button" onClick={() => handleRef.current?.resume()}>
            Resume
          </button>
          <button type="button" onClick={() => handleRef.current?.quit()}>
            Quit
          </button>
        </div>
      ) : null}
    </>
  );
}

function ResultScreen({
  result,
  onRetry,
  onBack,
}: {
  result: ResultStats;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <section className="screen">
      <h2>{result.title}</h2>
      <div className="stats">
        <span>Score</span>
        <span>{result.score}</span>
        <span>Accuracy</span>
        <span>{result.accuracy}</span>
        <span>Max Combo</span>
        <span>{result.maxCombo}</span>
        <span>PERFECT</span>
        <span>{result.perfect}</span>
        <span>GOOD</span>
        <span>{result.good}</span>
        <span>MISS</span>
        <span>{result.miss}</span>
      </div>
      <div className="row">
        <button type="button" onClick={onRetry}>
          Retry
        </button>
        <button type="button" onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
}

async function loadAssets(ctx: AudioContext): Promise<Assets> {
  const [chartResponse, audioResponse] = await Promise.all([
    fetch("/chart.json", { cache: "no-store" }),
    fetch("/audio.wav", { cache: "no-store" }),
  ]);
  if (!chartResponse.ok || !audioResponse.ok) {
    throw new Error("Couldn't load this chart.");
  }
  const json: unknown = await chartResponse.json();
  const bytes = await audioResponse.arrayBuffer();
  const audio = await ctx.decodeAudioData(bytes.slice(0));
  let chart: Chart;
  try {
    chart = validateChart(json, audio.duration * 1000);
  } catch (caught) {
    throw new Error(caught instanceof Error ? caught.message : "Couldn't load this chart.");
  }
  return { ctx, chart, audio };
}
