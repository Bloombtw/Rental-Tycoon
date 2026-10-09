import { memo } from "react";
import { MISSIONS, missionProgress, type GameState } from "@rt/sim";
import { formatCents } from "../format.js";
import { missionText } from "../game/messages.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/icons.js";
import { PanelHeader } from "../ui/PanelHeader.js";
import { ProgressBar } from "../ui/ProgressBar.js";

/** The three active missions with their progress and reward (missions.md). */
export const MissionsPanel = memo(function MissionsPanel({
  game,
  onClaim,
}: {
  readonly game: GameState;
  readonly onClaim: (slot: number) => void;
}) {
  const active = game.missions.slots.flatMap((index, slot) => {
    const mission = index === null ? undefined : MISSIONS[index];
    return mission ? [{ mission, slot, index }] : [];
  });
  return (
    <section className="card panel" aria-labelledby="missions-title" data-testid="missions">
      <PanelHeader icon="check-circle" tone="money" id="missions-title" title="Missions" />
      {active.length === 0 ? (
        <p className="mission-done">Toutes les missions sont accomplies. Bravo !</p>
      ) : (
        <ul className="mission-list">
          {active.map(({ mission, index, slot }) => {
            const p = missionProgress(mission.goal, game);
            const done = p.current >= p.target;
            const current = Math.min(p.current, p.target);
            const money = mission.goal.kind === "dayRevenue" || mission.goal.kind === "cash";
            const count = money
              ? `${formatCents(current)} / ${formatCents(p.target)}`
              : `${String(current)} / ${String(p.target)}`;
            return (
              <li
                className="mission"
                key={index}
                data-done={String(done)}
                data-testid={`mission-${String(index)}`}
              >
                <div className="mission-head">
                  <span className="mission-title">{missionText(mission.goal)}</span>
                  <span className="mission-reward">
                    <Icon name="coin" size={16} />
                    {formatCents(mission.reward)}
                  </span>
                </div>
                <ProgressBar
                  value={current}
                  max={p.target}
                  label={missionText(mission.goal)}
                  tone="money"
                  thin
                />
                {done ? (
                  <Button
                    variant="money"
                    size="md"
                    icon="coin"
                    data-testid={`mission-claim-${String(slot)}`}
                    onClick={() => {
                      onClaim(slot);
                    }}
                  >
                    Récupérer +{formatCents(mission.reward)}
                  </Button>
                ) : (
                  <span className="mission-count">{count}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
});
