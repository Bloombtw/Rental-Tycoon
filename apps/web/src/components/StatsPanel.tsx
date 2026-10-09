import type { DayRecord, ModelStat } from "@rt/sim";
import { formatCents } from "../format.js";
import { CAR_MODEL_LABELS } from "../game/messages.js";

const CASH_DAYS = 30;
const BAR_DAYS = 14;
const W = 320;
const H = 120;
const PAD = 8;

/** Finite number for display math (NaN / Infinity become 0). */
function num(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function modelLabel(key: string): string {
  if (key === "other") return "Autres";
  const label = (CAR_MODEL_LABELS as Readonly<Record<string, string | undefined>>)[key];
  return label ?? "Autres";
}

export interface StatRow {
  readonly key: string;
  readonly label: string;
  readonly rentals: number;
  readonly revenue: number;
  readonly average: number;
}

/** Model rows sorted by revenue (desc), with a guarded average per rental. */
export function modelRows(stats: Readonly<Record<string, ModelStat>>): StatRow[] {
  return Object.entries(stats)
    .map(([key, s]) => {
      const rentals = Math.max(0, Math.trunc(num(s.rentals)));
      const revenue = Math.max(0, Math.trunc(num(s.revenue)));
      return {
        key,
        label: modelLabel(key),
        rentals,
        revenue,
        average: rentals > 0 ? Math.trunc(revenue / rentals) : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || a.label.localeCompare(b.label, "fr"));
}

/** Cash line points for the last 30 days. */
export function cashPoints(history: readonly DayRecord[]): { x: number; y: number }[] {
  const days = history.slice(-CASH_DAYS);
  const vals = days.map((d) => num(d.cash));
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min;
  return vals.map((v, i) => ({
    x: days.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (days.length - 1),
    y: span > 0 ? H - PAD - ((v - min) / span) * (H - 2 * PAD) : H / 2,
  }));
}

export function StatsPanel({
  history,
  modelStats,
}: {
  readonly history: readonly DayRecord[];
  readonly modelStats: Readonly<Record<string, ModelStat>>;
}) {
  if (history.length === 0) {
    return (
      <p className="stats-empty" data-testid="stats-empty">
        Les statistiques arrivent après ta première journée.
      </p>
    );
  }
  const pts = cashPoints(history);
  const last = history[history.length - 1];
  const bars = history.slice(-BAR_DAYS);
  const barMax = Math.max(
    1,
    ...bars.flatMap((d) => [Math.max(0, num(d.revenue)), Math.max(0, num(d.costs))]),
  );
  const slot = (W - 2 * PAD) / bars.length;
  const bw = Math.max(2, slot / 2 - 2);
  const bh = (v: number) => (Math.max(0, num(v)) / barMax) * (H - 2 * PAD);
  const rows = modelRows(modelStats);
  return (
    <div className="stats-panel" data-testid="stats-panel">
      <section className="stats-card">
        <h3>
          Trésorerie <strong data-testid="stats-cash">{formatCents(num(last?.cash ?? 0))}</strong>
        </h3>
        <svg viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label="Trésorerie, 30 jours">
          <polyline
            fill="none"
            stroke="var(--c-primary-500)"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          />
          {pts.map((p, i) => (
            <circle
              key={i}
              data-testid="stats-point"
              cx={p.x}
              cy={p.y}
              r={3}
              fill="var(--c-primary-700)"
            />
          ))}
        </svg>
      </section>
      <section className="stats-card">
        <h3>Revenus et coûts (14 j)</h3>
        <svg viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label="Revenus et coûts">
          <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="var(--c-hairline)" />
          {bars.map((d, i) => {
            const x = PAD + i * slot;
            return (
              <g key={d.day}>
                <rect
                  data-testid="stats-bar"
                  x={x}
                  y={H - PAD - bh(d.revenue)}
                  width={bw}
                  height={bh(d.revenue)}
                  rx={2}
                  fill="var(--c-money-500)"
                />
                <rect
                  data-testid="stats-bar"
                  x={x + bw + 1}
                  y={H - PAD - bh(d.costs)}
                  width={bw}
                  height={bh(d.costs)}
                  rx={2}
                  fill="var(--c-danger-500)"
                />
              </g>
            );
          })}
        </svg>
        <p className="stats-legend">
          <span style={{ color: "var(--c-money-700)" }}>● Revenus</span>{" "}
          <span style={{ color: "var(--c-danger-700)" }}>● Coûts</span>
        </p>
      </section>
      <section className="stats-card">
        <h3>Par modèle</h3>
        {rows.length === 0 ? (
          <p className="stats-empty">Aucune location pour l&apos;instant.</p>
        ) : (
          <table className="stats-table" data-testid="stats-table">
            <thead>
              <tr>
                <th scope="col">Modèle</th>
                <th scope="col">Locations</th>
                <th scope="col">Revenus</th>
                <th scope="col">Moy.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} data-testid="stats-row">
                  <th scope="row">{r.label}</th>
                  <td>{r.rentals}</td>
                  <td>{formatCents(r.revenue)}</td>
                  <td>{formatCents(r.average)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
