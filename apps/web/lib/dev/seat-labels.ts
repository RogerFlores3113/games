export function withSeatLabels(
  text: string,
  seats: ReadonlyArray<{ seatId: string; displayLabel: string }>,
): string {
  if (seats.length === 0) return text;
  const labels = new Map(seats.map((seat) => [seat.seatId, seat.displayLabel]));
  const pattern = [...labels.keys()]
    .sort((a, b) => b.length - a.length)
    .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return text.replace(new RegExp(pattern, "g"), (id) => labels.get(id) ?? id);
}
