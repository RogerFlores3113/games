import { notFound } from "next/navigation";
import { ALL_SUITS } from "@games/rules";
import { FireworkCardBack, FireworkCardFace } from "../../../components/hanabi/FireworkCard";
import { SuitGlyph } from "../../../components/hanabi/SuitGlyph";
import { SUIT_VISUALS } from "../../../lib/suit-visuals";

const GLYPH_SIZES = [10, 12, 20, 28, 64] as const;
const RANKS = [1, 2, 3, 4, 5] as const;

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[length:var(--text-heading)] font-semibold"
      style={{ color: "var(--color-text)", lineHeight: "var(--text-heading--line-height)" }}
    >
      {children}
    </h2>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[length:var(--text-label)] font-semibold"
      style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
    >
      {children}
    </p>
  );
}

function BurstGrid() {
  return (
    <div className="flex flex-col gap-[length:var(--space-lg)]">
      <section className="flex flex-col gap-[length:var(--space-md)]">
        <Heading>Suit glyphs</Heading>
        {ALL_SUITS.map((suit) => (
          <div key={suit} className="flex items-center gap-[length:var(--space-md)]">
            <Label>{SUIT_VISUALS[suit].label}</Label>
            {GLYPH_SIZES.map((size) => (
              <SuitGlyph key={size} suit={suit} size={size} title={`${SUIT_VISUALS[suit].label} at ${size}px`} />
            ))}
          </div>
        ))}
      </section>

      {ALL_SUITS.map((suit) => (
        <section key={suit} className="flex flex-col gap-[length:var(--space-sm)]">
          <Heading>{SUIT_VISUALS[suit].label} — card faces</Heading>

          <div className="flex items-end gap-[length:var(--space-sm)]">
            <Label>64x84 (numeral body)</Label>
            {RANKS.map((rank) => (
              <FireworkCardFace key={rank} suit={suit} rank={rank} width={64} height={84} numeralSize="body" />
            ))}
          </div>

          <div className="flex items-end gap-[length:var(--space-sm)]">
            <Label>48x64, count vs numeral-only (label)</Label>
            {RANKS.map((rank) => (
              <span key={rank} className="flex gap-[length:var(--space-xs)]">
                <FireworkCardFace
                  suit={suit}
                  rank={rank}
                  width={48}
                  height={64}
                  showBurstCount
                  numeralSize="label"
                />
                <FireworkCardFace
                  suit={suit}
                  rank={rank}
                  width={48}
                  height={64}
                  showBurstCount={false}
                  numeralSize="label"
                />
              </span>
            ))}
          </div>

          <div className="flex items-end gap-[length:var(--space-sm)]">
            <Label>88x112 (own-card size)</Label>
            {RANKS.map((rank) => (
              <FireworkCardFace key={rank} suit={suit} rank={rank} width={88} height={112} numeralSize="body" />
            ))}
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-[length:var(--space-sm)]">
        <Heading>Card back</Heading>
        <div className="flex items-end gap-[length:var(--space-md)]">
          <FireworkCardBack width={88} height={112} />
          <FireworkCardBack width={64} height={84} />
        </div>
      </section>
    </div>
  );
}

/**
 * Dev-only burst-art preview (T-06.1-07): not reachable once NODE_ENV is
 * production. Renders static art only — no game/session data touches this
 * route, so it carries no identity-leak surface.
 */
export default function FireworksPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main
      className="flex flex-col gap-[length:var(--space-xl)] p-[length:var(--space-lg)]"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <Heading>Firework burst art preview (dev only)</Heading>
      <BurstGrid />

      <div className="flex flex-col gap-[length:var(--space-lg)]" style={{ filter: "grayscale(1)" }}>
        <Heading>Colour ignored (grayscale)</Heading>
        <BurstGrid />
      </div>
    </main>
  );
}
