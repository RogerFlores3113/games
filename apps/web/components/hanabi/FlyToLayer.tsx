"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { HanabiView } from "@games/rules";
import { flyToEventsForTransition, type FlyToEvent } from "../../lib/hanabi-flyto-logic";
import { FireworkCardFace } from "./FireworkCard";

export interface FlyToLayerProps {
  game: HanabiView;
  reconnecting: boolean;
  /** useHandDrag's `droppedCardIdsRef` (D-21 dragger exception): a card id
   * in this set is the viewer's OWN drop and never gets a ghost — consumed
   * ids are removed from the set here so a later, unrelated drop of a
   * different card is never accidentally suppressed. */
  suppressedCardIds: MutableRefObject<Set<string>>;
}

interface Ghost {
  key: string;
  event: FlyToEvent;
  left: number;
  top: number;
  dx: number;
  dy: number;
}

const GHOST_WIDTH = 48;
const GHOST_HEIGHT = 64;
const GHOST_LIFETIME_MS = 500;

function stackSelector(suit: string): string {
  return `[data-testid="played-stack-${suit}"]`;
}

/** D-21/D-23/T-06.1-40: a departing card's ghost, mounted with `from`'s
 * rect and transitioned (CSS, `.fly-to-ghost`) to `to`'s rect on the next
 * animation frame, then removed after a fixed lifetime — the removal timer
 * is cleared on unmount so no ghost accumulates past a component tree
 * teardown (T-06.1-40). */
function GhostCard({ ghost, onDone }: { ghost: Ghost; onDone: (key: string) => void }) {
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMoved(true));
    const timer = setTimeout(() => onDone(ghost.key), GHOST_LIFETIME_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost.key]);

  return (
    <span
      data-testid="fly-to-ghost"
      className="fly-to-ghost absolute"
      style={{
        left: ghost.left,
        top: ghost.top,
        transform: moved ? `translate(${ghost.dx}px, ${ghost.dy}px)` : "translate(0px, 0px)",
        opacity: moved ? 0 : 1,
      }}
    >
      {/* D-23/T-06.1-39: identity comes only from the public history entry
          — never own-hand DOM. exposeSuit stays false (history already made
          this card's identity public; no need for the identity data-glyph
          marker this component doesn't otherwise use). */}
      <FireworkCardFace suit={ghost.event.suit} rank={ghost.event.rank} width={GHOST_WIDTH} height={GHOST_HEIGHT} />
    </span>
  );
}

/**
 * D-21/D-23: a fixed, pointer-events-none overlay that flies a departing
 * card's ghost from its vacated slot to the matching stack/discard pile on
 * every screen except the dragging player's own drop (T-06.1-39). Renders
 * no flow height (UI-11 1280x720 no-scroll fit has ~1px of headroom) and
 * never replays on load/reconnect/catch-up (D-29 analogue): the baseline is
 * `null` until the first non-reconnecting commit, and is reset to `null`
 * again the moment `reconnecting` becomes true.
 */
export function FlyToLayer({ game, reconnecting, suppressedCardIds }: FlyToLayerProps) {
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const rectsRef = useRef<Map<string, DOMRect>>(new Map());
  const prevHistoryRef = useRef<HanabiView["history"] | null>(null);

  const removeGhost = useCallback((key: string) => {
    setGhosts((prev) => prev.filter((g) => g.key !== key));
  }, []);

  useEffect(() => {
    if (reconnecting) prevHistoryRef.current = null;
  }, [reconnecting]);

  useLayoutEffect(() => {
    const prevHistory = prevHistoryRef.current;

    if (!reconnecting && prevHistory !== null) {
      const events = flyToEventsForTransition(prevHistory, game.history, suppressedCardIds.current);
      if (events.length > 0) {
        // The suppression set is a one-shot "this was MY drop" marker — once
        // consumed here, remove it so a future unrelated event for the same
        // (recycled) card id is never wrongly suppressed.
        for (const event of events) suppressedCardIds.current.delete(event.cardId);

        const reduceMotion =
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (!reduceMotion) {
          const newGhosts: Ghost[] = [];
          for (const event of events) {
            const from = rectsRef.current.get(event.cardId);
            if (!from) continue;
            const destEl = document.querySelector(
              event.destination === "stack" ? stackSelector(event.suit) : '[data-testid="discard-pile"]',
            );
            if (!destEl) continue;
            const to = destEl.getBoundingClientRect();
            const fromCenterX = from.left + from.width / 2;
            const fromCenterY = from.top + from.height / 2;
            const toCenterX = to.left + to.width / 2;
            const toCenterY = to.top + to.height / 2;
            newGhosts.push({
              key: `${event.cardId}-${prevHistory.length}`,
              event,
              left: fromCenterX - GHOST_WIDTH / 2,
              top: fromCenterY - GHOST_HEIGHT / 2,
              dx: toCenterX - fromCenterX,
              dy: toCenterY - fromCenterY,
            });
          }
          if (newGhosts.length > 0) {
            setGhosts((prev) => [...prev, ...newGhosts]);
          }
        }
      }
    }

    // Re-snapshot every own/teammate card slot for the NEXT transition's
    // source rects — must happen every commit, not just live ones, so the
    // rect captured is always "where the card was just before it left".
    const nextRects = new Map<string, DOMRect>();
    document.querySelectorAll<HTMLElement>("[data-card-id]").forEach((el) => {
      const id = el.getAttribute("data-card-id");
      if (id) nextRects.set(id, el.getBoundingClientRect());
    });
    document.querySelectorAll<HTMLElement>('[data-testid^="other-hand-card-"]').forEach((el) => {
      const testid = el.getAttribute("data-testid") ?? "";
      const id = testid.slice("other-hand-card-".length);
      if (id) nextRects.set(id, el.getBoundingClientRect());
    });
    rectsRef.current = nextRects;
    prevHistoryRef.current = game.history;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  return (
    <div data-testid="fly-to-layer" aria-hidden="true" className="pointer-events-none fixed inset-0 z-20">
      {ghosts.map((ghost) => (
        <GhostCard key={ghost.key} ghost={ghost} onDone={removeGhost} />
      ))}
    </div>
  );
}
