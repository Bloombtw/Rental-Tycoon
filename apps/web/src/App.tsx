import { createGame } from "@rt/sim";
import { formatCents } from "./format.js";

export function App() {
  const game = createGame(1);
  return (
    <main className="app">
      <h1>Rental Tycoon</h1>
      <p>
        Jour {game.day} · {formatCents(game.cash)}
      </p>
    </main>
  );
}
