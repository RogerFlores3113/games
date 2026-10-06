import type { CSSProperties } from "react";
import Link from "next/link";
import type { GameId } from "@games/schema";
import { GAME_CATALOG } from "../components/game-catalog";
import { festiveFont, pixelFont } from "../components/fonts";
import { startPath } from "../lib/start-path";

/**
 * The game picker: one tile per `GAME_CATALOG` entry, each with its art,
 * its name in its own lettering, and "Play now" to its start page.
 */
export default function HomePage() {
  const games = Object.entries(GAME_CATALOG) as [GameId, (typeof GAME_CATALOG)[GameId]][];
  return (
    <main className={`${festiveFont.variable} ${pixelFont.variable} home-sky min-h-screen`}>
      <div className="mx-auto flex min-h-screen w-full max-w-[1560px] flex-col justify-center gap-[length:var(--space-xl)] px-[length:var(--space-md)] py-[length:var(--space-xl)] sm:px-[length:var(--space-xl)]">
        <header className="flex flex-col gap-[length:var(--space-sm)]">
          <p className="home-kicker">games.rogerflores.dev</p>
          <h1 className="home-title">Board games</h1>
          <p className="home-lede">Pick a game, send your friends the link, and play together.</p>
        </header>

        <ul className="game-grid">
          {games.map(([gameId, game]) => (
            <li key={gameId}>
              <article
                data-testid={`game-tile-${gameId}`}
                data-tone={game.tone}
                className="game-tile"
                style={{ "--tile-art": `url("${game.art}")` } as CSSProperties}
              >
                <div className="game-tile-art" aria-hidden="true" />
                <div className="game-tile-body">
                  <p className="game-tile-players">{game.players}</p>
                  <h2 id={`game-${gameId}`} className={`game-tile-name ${game.titleClassName}`}>
                    {game.name}
                  </h2>
                  <p className="game-tile-tagline">{game.tagline}</p>
                  <Link
                    href={startPath(gameId)}
                    aria-describedby={`game-${gameId}`}
                    className={game.tone === "trail" ? "game-tile-play trail-button" : "game-tile-play"}
                  >
                    Play now <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
