/** Shared equipment matching used by recommendations and strength logging. */
export function normaliseEquipment(value: string | null | undefined) {
  const normalized = (value ?? "").toLowerCase().replace(/[()\-]/g, " ").replace(/\s+/g, " ").trim();
  const aliases: Record<string, string> = {
    "wall balls": "wall ball", "heavy sandbag": "sandbag", "sand bags": "sandbag", "dumbbells": "dumbbell",
    "flat bench": "bench flat", "bench (flat)": "bench flat", "bench": "bench flat", "smith machine": "smith machine",
    "leg press": "leg press machine", "leg curl": "leg curl machine", "leg extension": "leg extension machine",
    "battle rope": "sled", "battle ropes": "sled", "farmer carry handles": "farmer carry",
  };
  return aliases[normalized] ?? normalized;
}

export function equipmentAvailable(required: string | null | undefined, available: readonly string[]) {
  const normalized = normaliseEquipment(required);
  return !normalized || normalized === "none" || available.some((item) => normaliseEquipment(item) === normalized);
}

export function exerciseAvailable(
  primary: string | null | undefined,
  secondary: string | null | undefined,
  available: readonly string[],
) {
  return equipmentAvailable(primary, available) && equipmentAvailable(secondary, available);
}

export function resolveSessionLocationId(sessionLocationId: string | null | undefined, athleteLocationId: string | null | undefined) {
  return sessionLocationId || athleteLocationId || null;
}
