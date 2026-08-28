/** Shared equipment matching used by recommendations and strength logging. */
export function normaliseEquipment(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[()\-]/g, " ").replace(/\s+/g, " ").trim();
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
