// Legality check for a whole RunState, for the dev sandbox: after any edit it
// answers "could the real engine have produced this?" as readable problems.

import { buildFullDeck, cardLabel } from "../deck";
import { BACKPACK_SIZE, SUPPLIES_MAX } from "../run/balance";
import { attemptOf } from "../run/attempt";
import { rulesFor } from "../run/compose";
import { campCount } from "../run/plan";
import { legsTo } from "../run/trail";
import { EVENTS } from "../content/events/registry";
import { pairingRuleFor } from "../run/stack";
import type { CampSpec } from "../run/route";
import { backpackOf } from "../run/usage";
import type { Catalog, RunState, SeatRun } from "../run/types";

function duplicates(values: readonly string[]): string[] {
  return [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
}

function counts(values: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of values) out.set(v, (out.get(v) ?? 0) + 1);
  return out;
}

function checkCrew(run: RunState, catalog: Catalog, problems: string[]): void {
  const { seatIds, seats } = run;
  if (seatIds.length < 3 || seatIds.length > 5) problems.push(`crew size: ${seatIds.length} seats, expected 3 to 5`);
  for (const id of duplicates(seatIds)) problems.push(`seat id ${id} appears more than once`);
  if (seats.length !== seatIds.length || seats.some((seat, i) => seat.seatId !== seatIds[i])) {
    problems.push("seats do not line up with seatIds in order");
  }
  // A kicked seat keeps its character and items, so it counts for uniqueness.
  const kicked = run.kicked.map((k) => k.seat);
  for (const seat of kicked) if (seatIds.includes(seat.seatId)) problems.push(`kicked seat ${seat.seatId} is still in the crew`);
  for (const id of duplicates(kicked.map((seat) => seat.seatId))) problems.push(`seat ${id} is kicked more than once`);
  const everyone = [...seats, ...kicked];
  for (const seat of everyone) {
    if (seat.characterId !== null && !Object.hasOwn(catalog.characters, seat.characterId)) {
      problems.push(`${seat.seatId}: unknown character ${seat.characterId}`);
    }
    checkItems(run, seat, catalog, problems);
    if (seat.upgradeId !== null) {
      const upgrades = seat.characterId === null ? [] : (catalog.characters[seat.characterId]?.upgrades ?? []).map((u) => u.id);
      if (!upgrades.includes(seat.upgradeId)) problems.push(`${seat.seatId}: upgrade ${seat.upgradeId} is not one of its character's`);
    }
    for (const offer of seat.offers) {
      for (const id of offer.bundles.flat()) {
        if (!Object.hasOwn(catalog.items, id)) problems.push(`${seat.seatId}: draft offer holds unknown item ${id}`);
      }
    }
  }
  const characterIds = everyone.flatMap((seat) => (seat.characterId === null ? [] : [seat.characterId]));
  for (const id of duplicates(characterIds)) problems.push(`character ${id} is held by more than one seat`);
  for (const uid of duplicates(everyone.flatMap((seat) => seat.items.map((item) => item.uid)))) problems.push(`item uid ${uid} is owned more than once`);
  // The slots come from the composed rules, which only known ids can compose.
  if (problems.length > 0) return;
  const rules = rulesFor(run, catalog);
  // At a loadout or in camp a camp rule may cut a slot (Rats), sending an
  // equipped item to a full backpack.
  const campRules = run.stage.tag === "loadout" || run.stage.tag === "camp";
  for (const seat of seats) {
    const slots = rules.itemSlots(run, seat.seatId);
    if (seat.equipped.length > slots) problems.push(`${seat.seatId}: ${seat.equipped.length} items equipped, ${slots} slots`);
    const stored = backpackOf(seat).length;
    if (!campRules && stored > BACKPACK_SIZE) problems.push(`${seat.seatId}: ${stored} items in the backpack, which holds ${BACKPACK_SIZE}`);
  }
}

/** Instances are it<n> with n below itemSerial and a known item; the
 * equipped set is owned and distinct. */
function checkItems(run: RunState, seat: SeatRun, catalog: Catalog, problems: string[]): void {
  for (const item of seat.items) {
    const serial = /^it(\d+)$/.exec(item.uid);
    if (serial === null || Number(serial[1]) >= run.itemSerial) problems.push(`${seat.seatId}: item uid ${item.uid} is not it<n> below itemSerial ${run.itemSerial}`);
    if (!Object.hasOwn(catalog.items, item.itemId)) problems.push(`${seat.seatId}: item ${item.uid} is unknown item ${item.itemId}`);
  }
  for (const uid of duplicates(seat.equipped)) problems.push(`${seat.seatId}: ${uid} is equipped twice`);
  for (const uid of seat.equipped) {
    if (!seat.items.some((item) => item.uid === uid)) problems.push(`${seat.seatId}: equipped ${uid} is not owned`);
  }
}

function checkPerSeat(run: RunState, what: string, keys: readonly string[], problems: string[]): void {
  for (const id of keys) if (!run.seatIds.includes(id)) problems.push(`${what} holds unknown seat ${id}`);
}

function checkSpecIndex(run: RunState, what: string, index: number, problems: string[]): void {
  const count = run.plan === null ? 0 : campCount(run.plan);
  if (!Number.isInteger(index) || index < 1 || index > count) problems.push(`${what} is camp ${index}, outside the plan's camps 1 to ${count}`);
}

/** The location and weather are registered defs of their kinds, and no
 * "never" pairing keeps them apart. */
function checkSpec(what: string, spec: CampSpec, catalog: Catalog, problems: string[]): void {
  const kindOf = (id: string) => (Object.hasOwn(catalog.mods, id) ? catalog.mods[id]!.kind : null);
  if (kindOf(spec.location) !== "location") problems.push(`${what}: ${spec.location} is not a location`);
  if (kindOf(spec.weather) !== "weather") problems.push(`${what}: ${spec.weather} is not a weather`);
  if (pairingRuleFor(spec.location, spec.weather, catalog)?.result === "never") problems.push(`${what}: ${spec.location} never has ${spec.weather}`);
}

function checkSpecs(run: RunState, catalog: Catalog, problems: string[]): void {
  const stage = run.stage;
  if (stage.tag === "loadout" || stage.tag === "camp") checkSpec("the loadout or camp", stage.camp, catalog, problems);
  if (stage.tag === "shop" && stage.camp !== null) checkSpec("the shop's camp", stage.camp, catalog, problems);
  if (stage.tag === "event" && !Object.hasOwn(EVENTS, stage.event)) problems.push(`the event ${stage.event} is not a known event`);
  if (stage.tag === "route") {
    for (const option of stage.options) {
      checkSpec(`route ${option.id}`, option.next, catalog, problems);
      if (!Number.isInteger(option.reroll) || option.reroll < 0) problems.push(`route ${option.id}: reroll must be a non-negative whole number, got ${option.reroll}`);
      const swap = option.swapBoss;
      if (swap === null) continue;
      const planned = run.plan?.bosses.find((b) => b.at === swap.at);
      if (planned === undefined || planned.tier === "temple" || swap.at < option.next.index) problems.push(`route ${option.id}: swaps the boss of camp ${swap.at}, not an animal or disaster boss camp ahead`);
      else if (!Object.hasOwn(catalog.mods, swap.modId) || catalog.mods[swap.modId]!.kind !== planned.tier) problems.push(`route ${option.id}: swaps in ${swap.modId}, not a${planned.tier === "animal" ? "n animal" : " disaster"} boss`);
    }
  }
  for (const boss of run.plan?.bosses ?? []) {
    if (boss.modId !== null && !Object.hasOwn(catalog.mods, boss.modId)) problems.push(`the ${boss.tier} boss at camp ${boss.at} is unknown mod ${boss.modId}`);
    else if (boss.modId !== null && catalog.mods[boss.modId]!.kind !== boss.tier) problems.push(`the ${boss.tier} boss at camp ${boss.at} is ${boss.modId}, a ${catalog.mods[boss.modId]!.kind}`);
  }
  for (const effect of stage.tag === "camp" ? stage.attempt.effects : []) {
    const origin = effect.origin;
    if (origin.kind === "seat" && !run.seatIds.includes(origin.seatId)) problems.push(`an effect names unknown seat ${origin.seatId}`);
    if (origin.kind === "mod" && !Object.hasOwn(catalog.mods, origin.modId)) problems.push(`an effect names unknown mod ${origin.modId}`);
  }
  if (stage.tag !== "camp") return;
  const loaded = stage.attempt.loaded;
  for (const id of Object.keys(loaded?.objectives ?? {})) {
    if (!stage.attempt.camp.objectives.some((o) => o.id === id)) problems.push(`loaded dice decide objective ${id}, which is not in this camp`);
  }
  for (const key of Object.keys(loaded?.rolls ?? {})) {
    const [modId = "", strength] = key.split(":");
    if (!Object.hasOwn(catalog.mods, modId) || (strength !== "full" && strength !== "half")) problems.push(`loaded dice pin ${key}, a roll of no known camp modifier`);
  }
}

function checkRunFields(run: RunState, problems: string[]): void {
  if (!Number.isInteger(run.supplies) || run.supplies < 0 || run.supplies > SUPPLIES_MAX) problems.push(`supplies must be a whole number from 0 to ${SUPPLIES_MAX}, got ${run.supplies}`);
  if (!Number.isInteger(run.purse) || run.purse < 0) problems.push(`the purse must be a non-negative whole number, got ${run.purse}`);
  if (!Number.isInteger(run.itemSerial) || run.itemSerial < 0) problems.push(`itemSerial must be a non-negative whole number, got ${run.itemSerial}`);
  const stage = run.stage;
  if ((run.plan === null) !== (stage.tag === "muster")) problems.push(stage.tag === "muster" ? "a run in muster has no plan yet" : `a run at ${stage.tag} needs a plan`);
  if (run.plan !== null) for (const entry of run.history) checkSpecIndex(run, "a history entry", entry.camp, problems);
  switch (stage.tag) {
    case "muster":
      checkPerSeat(run, "the ballots", Object.keys(stage.ballots), problems);
      checkPerSeat(run, "the lock-in list", Object.keys(stage.locked), problems);
      for (const seatId of Object.keys(stage.locked)) {
        const seat = run.seats.find((s) => s.seatId === seatId);
        if (seat !== undefined && (seat.characterId === null || !Object.hasOwn(stage.ballots, seatId))) problems.push(`${seatId} is locked in without a character and a ballot`);
      }
      break;
    case "route":
      checkPerSeat(run, "the ballots", Object.keys(stage.ballots), problems);
      break;
    case "shop":
    case "loadout":
    case "event":
      checkPerSeat(run, "the ready list", Object.keys(stage.ready), problems);
      break;
  }
  if (stage.tag === "loadout" || stage.tag === "camp") checkSpecIndex(run, "the loadout or camp", stage.camp.index, problems);
  if (stage.tag === "route") for (const option of stage.options) checkSpecIndex(run, `route ${option.id}`, option.next.index, problems);
  if (stage.tag === "shop" || stage.tag === "draft" || stage.tag === "event") checkSpecIndex(run, `the ${stage.tag}'s next camp`, stage.next, problems);
  if (run.plan !== null && (stage.tag === "shop" || stage.tag === "draft" || stage.tag === "event") && !legsTo(run.plan.length, stage.next).includes(stage.tag)) {
    problems.push(`a ${run.plan.length} run has no ${stage.tag} before camp ${stage.next}`);
  }
  if (stage.tag === "shop" && stage.camp !== null && stage.camp.index !== stage.next) problems.push(`the shop before camp ${stage.next} holds camp ${stage.camp.index}'s spec`);
}

function checkCamp(run: RunState, problems: string[]): void {
  const camp = attemptOf(run)?.camp;
  if (camp === undefined) return;
  const sameSeats = camp.seatIds.length === run.seatIds.length && camp.seatIds.every((id, i) => id === run.seatIds[i]);
  if (!sameSeats) problems.push("camp seats differ from the run's seats");

  const handSeats = camp.hands.map((h) => h.seatId);
  if (handSeats.length !== run.seatIds.length || run.seatIds.some((id) => !handSeats.includes(id)) || duplicates(handSeats).length > 0) {
    problems.push(`hands cover [${handSeats.join(", ")}], expected exactly [${run.seatIds.join(", ")}]`);
  }

  const plays = [...camp.completedTricks.flatMap((t) => t.plays), ...camp.currentTrick.plays];
  for (const play of plays) {
    if (!run.seatIds.includes(play.seatId)) problems.push(`trick play by unknown seat ${play.seatId}`);
  }

  const cards = [...camp.hands.flatMap((h) => h.cards), ...plays.map((p) => p.card), ...camp.discards.map((d) => d.card)];
  for (const id of duplicates(cards.map((c) => c.id))) problems.push(`card id ${id} appears more than once`);

  const have = counts([...cards.map((c) => cardLabel(c.identity)), ...camp.removedCards.map(cardLabel)]);
  const expected = counts(buildFullDeck().map(cardLabel));
  for (const [label, want] of expected) {
    const got = have.get(label) ?? 0;
    if (got !== want) problems.push(`card conservation: ${label} appears ${got} times, expected ${want}`);
  }

  for (const id of duplicates(camp.objectives.map((o) => o.id))) problems.push(`objective id ${id} appears more than once`);
  for (const o of camp.objectives) {
    if (o.ownerSeatId !== null && !run.seatIds.includes(o.ownerSeatId)) problems.push(`objective ${o.id} is owned by unknown seat ${o.ownerSeatId}`);
  }

  // A hallucination's cards went back to their hands, so they are counted
  // there; the record only has to name cards and seats of this camp.
  const dealt = new Set(cards.map((c) => c.id));
  const usedIndices = new Set(camp.completedTricks.map((t) => t.index));
  for (const voided of camp.voidedTricks) {
    if (usedIndices.has(voided.index) || voided.index >= camp.currentTrick.index) problems.push(`hallucination at trick ${voided.index + 1} shares its index with another trick`);
    usedIndices.add(voided.index);
    for (const play of voided.plays) {
      if (!run.seatIds.includes(play.seatId)) problems.push(`hallucination at trick ${voided.index + 1} names unknown seat ${play.seatId}`);
      if (!dealt.has(play.card.id)) problems.push(`hallucination at trick ${voided.index + 1} names card ${play.card.id}, not in this camp`);
    }
  }
}

/** Readable problems with `run`; `[]` means it is legal. */
export function checkRunState(run: RunState, catalog: Catalog): string[] {
  const problems: string[] = [];
  // Specs first: the crew's slot check composes rules over the stack.
  checkSpecs(run, catalog, problems);
  checkCrew(run, catalog, problems);
  checkRunFields(run, problems);
  checkCamp(run, problems);
  return problems;
}
