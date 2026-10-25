/** Suggests a key from a name: "In review" -> "in_review". Matches the Key rule in contracts. */
export const toKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+|_+$/g, '')
    .slice(0, 40);
