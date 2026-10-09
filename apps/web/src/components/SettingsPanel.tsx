import { useId } from "react";
import type { AudioVolumes } from "../game/audio.js";
import { Icon } from "../ui/icons.js";
import { PanelHeader } from "../ui/PanelHeader.js";
import { NewGameButton } from "./NewGameButton.js";

const SLIDERS: readonly { kind: keyof AudioVolumes; label: string }[] = [
  { kind: "music", label: "Musique" },
  { kind: "ambience", label: "Ambiance de la ville" },
  { kind: "effects", label: "Effets (encaissement)" },
];

interface SettingsPanelProps {
  readonly muted: boolean;
  readonly volumes: AudioVolumes;
  readonly onToggleMute: () => void;
  readonly onVolume: (kind: keyof AudioVolumes, value: number) => void;
  readonly onNewGame: () => void;
}

/** Audio settings and game options (side-menu.md, sounds.md). */
export function SettingsPanel({
  muted,
  volumes,
  onToggleMute,
  onVolume,
  onNewGame,
}: SettingsPanelProps) {
  const baseId = useId();
  return (
    <>
      <section className="card panel" aria-labelledby={`${baseId}-audio`}>
        <PanelHeader icon="sound-on" tone="primary" id={`${baseId}-audio`} title="Son" />
        <button
          type="button"
          className="setting-switch"
          role="switch"
          aria-checked={!muted}
          data-testid="settings-sound"
          onClick={onToggleMute}
        >
          <Icon name={muted ? "sound-off" : "sound-on"} size={20} />
          <span className="setting-switch-label">Son {muted ? "coupé" : "activé"}</span>
          <span className="setting-switch-track" aria-hidden="true">
            <span className="setting-switch-thumb" />
          </span>
        </button>
        {SLIDERS.map(({ kind, label }) => {
          const id = `${baseId}-${kind}`;
          const pct = Math.round(volumes[kind] * 100);
          return (
            <div className="setting-slider" key={kind} data-disabled={String(muted)}>
              <label htmlFor={id}>
                {label}
                <span className="setting-value">{pct} %</span>
              </label>
              <input
                id={id}
                type="range"
                min={0}
                max={100}
                step={5}
                value={pct}
                disabled={muted}
                data-testid={`volume-${kind}`}
                onChange={(e) => {
                  onVolume(kind, Number(e.currentTarget.value) / 100);
                }}
              />
            </div>
          );
        })}
      </section>
      <NewGameButton onClick={onNewGame} />
    </>
  );
}
