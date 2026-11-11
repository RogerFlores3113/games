import { defineEvent } from "./event-def";

/** Out of the pool (EVENT_POOL): an event with no effect, for tests and the dev panel. */
export const blankEvent = defineEvent({ id: "event", name: "Quiet trail", text: "Nothing happens here." });

export const abandonedCamp = defineEvent({
  id: "abandoned-camp",
  name: "Abandoned camp",
  text: "Someone left in a hurry. The crew finds 3 coins in the ashes.",
  effect: { kind: "coins", coins: 3 },
});

export const freshSpring = defineEvent({
  id: "fresh-spring",
  name: "Fresh spring",
  text: "Clean water to refill the canteens: the crew regains 1 supply. With supplies full, it finds 2 coins instead.",
  effect: { kind: "supplies", supplies: 1, elseCoins: 2 },
});

export const droppedPack = defineEvent({
  id: "dropped-pack",
  name: "Dropped pack",
  text: "A pack lies by the trail. Each explorer with room takes a random common item from it.",
  effect: { kind: "common-item" },
});
