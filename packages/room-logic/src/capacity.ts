/**
 * Decides whether a hall can admit one more person.
 *
 * `admittedCount` must count only people who were already admitted, not connections that are
 * merely open. Counting open connections would reject everyone when many arrive at once, because
 * each joiner would see all the others.
 *
 * @param admittedCount - People already admitted to the hall.
 * @param maxPlayers - The hall's capacity.
 */
export function hasSpace(admittedCount: number, maxPlayers: number): boolean {
  return admittedCount < maxPlayers;
}
