import { ability, defineCharacter, defineUpgrade } from "../source-def";

export const scout = defineCharacter({
  id: "scout",
  name: "The Scout",
  theme: "Eyes in the canopy",
  power: "Spyglass",
  text: "See a random card in a teammate's hand.",
  active: ability({
    window: "between-tricks",
    limit: { kind: "per-camp", times: 1 },
    targets: [{ kind: "hand" }],
    apply: (ctx) =>
      ctx
        .randomCards(ctx.targets[0].seatId, ctx.owner.hasUpgrade("scout.keen-eye") ? 2 : 1)
        .map((cardId) => ({ op: "reveal", cardId, audience: [ctx.self] })),
  }),
  upgrades: [
    defineUpgrade({ id: "scout.keen-eye", name: "Keen Eye", text: "Your Spyglass shows two cards." }),
    defineUpgrade({
      id: "scout.eavesdrop",
      name: "Eavesdrop",
      text: "See the card in a whisper between two teammates.",
      active: ability({
        window: "between-tricks",
        limit: { kind: "per-camp", times: 1 },
        targets: [{ kind: "whisper", which: "overheard" }],
        apply: (ctx) => [{ op: "share-reveal", whisperOrdinal: ctx.targets[0].ordinal, audience: [ctx.self] }],
      }),
    }),
  ],
});
