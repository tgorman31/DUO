export type ProgrammePhase = {
  id: string;
  blockId?: string;
  name: string;
  startDate: string;
  endDate: string;
  focus?: string;
  sortOrder?: number;
};

export type ProgrammeBlock = { startDate: string; endDate: string };

export function hasExplicitProgressionConflict(recommendation: { progressionTrackId?: string | null; progressionIsOverride?: boolean } | null | undefined, templateIntents: Array<{ isQualityIntent?: boolean }>) {
  return Boolean(recommendation?.progressionIsOverride && recommendation.progressionTrackId) && !templateIntents.some((intent) => intent.isQualityIntent);
}

export function addIsoDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function phaseCoverageError(phases: Array<Pick<ProgrammePhase, "startDate" | "endDate">>, block: ProgrammeBlock) {
  const ordered = [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (!ordered.length) return "At least one phase is required to cover the training block.";
  if (ordered[0].startDate !== block.startDate) return `Programme phases must start on ${block.startDate}.`;
  for (let index = 0; index < ordered.length; index += 1) {
    const phase = ordered[index];
    if (phase.startDate > phase.endDate) return "Phase start dates must be on or before their end dates.";
    if (index > 0 && phase.startDate !== addIsoDays(ordered[index - 1].endDate, 1)) return `Programme phases must be continuous: ${addIsoDays(ordered[index - 1].endDate, 1)} is not covered.`;
  }
  if (ordered.at(-1)?.endDate !== block.endDate) return `Programme phases must end on ${block.endDate}.`;
  return null;
}

export function proposePhaseSplit(phases: ProgrammePhase[], block: ProgrammeBlock, sourceId: string, startDate: string, endDate: string, newPhase: Omit<ProgrammePhase, "id" | "startDate" | "endDate"> & { id?: string }) {
  const source = phases.find((phase) => phase.id === sourceId);
  if (!source) throw new Error("Choose the phase to split.");
  if (startDate > endDate || startDate <= source.startDate || endDate > source.endDate) throw new Error("A new phase must sit inside the phase it splits.");
  const proposed = phases.map((phase) => phase.id === sourceId ? { ...phase, endDate: addIsoDays(startDate, -1) } : phase);
  proposed.push({ ...newPhase, id: newPhase.id ?? `phase-new-${Date.now()}`, blockId: source.blockId, startDate, endDate });
  const error = phaseCoverageError(proposed, block);
  if (error) throw new Error(error);
  return proposed.sort((a, b) => a.startDate.localeCompare(b.startDate)).map((phase, index) => ({ ...phase, sortOrder: index }));
}

export function proposePhaseAbsorption(phases: ProgrammePhase[], block: ProgrammeBlock, phaseId: string, absorbInto: "previous" | "next") {
  const ordered = [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const index = ordered.findIndex((phase) => phase.id === phaseId);
  if (index < 0) throw new Error("Phase not found.");
  const targetIndex = absorbInto === "previous" ? index - 1 : index + 1;
  const target = ordered[targetIndex];
  if (!target) throw new Error(`There is no ${absorbInto} phase available to absorb this date range.`);
  const proposed = ordered.filter((phase) => phase.id !== phaseId).map((phase) => phase.id === target.id
    ? { ...phase, startDate: absorbInto === "previous" ? phase.startDate : ordered[index].startDate, endDate: absorbInto === "previous" ? ordered[index].endDate : phase.endDate }
    : phase);
  const error = phaseCoverageError(proposed, block);
  if (error) throw new Error(error);
  return proposed.map((phase, nextIndex) => ({ ...phase, sortOrder: nextIndex }));
}

export function proposeBoundaryEdit(phases: ProgrammePhase[], block: ProgrammeBlock, phaseId: string, startDate: string, endDate: string) {
  const ordered = [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const index = ordered.findIndex((phase) => phase.id === phaseId);
  if (index < 0) throw new Error("Phase not found.");
  const current = ordered[index];
  const proposed = ordered.map((phase) => ({ ...phase }));
  proposed[index] = { ...current, startDate, endDate };
  if (index > 0 && startDate !== current.startDate) proposed[index - 1] = { ...proposed[index - 1], endDate: addIsoDays(startDate, -1) };
  if (index < proposed.length - 1 && endDate !== current.endDate) proposed[index + 1] = { ...proposed[index + 1], startDate: addIsoDays(endDate, 1) };
  const error = phaseCoverageError(proposed, block);
  if (error) throw new Error(error);
  return proposed.map((phase, nextIndex) => ({ ...phase, sortOrder: nextIndex }));
}

export function proposeBlockDateChange(phases: ProgrammePhase[], currentBlock: ProgrammeBlock, nextBlock: ProgrammeBlock) {
  if (nextBlock.startDate > nextBlock.endDate) throw new Error("Block start date must be on or before its end date.");
  const ordered = [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (!ordered.length) throw new Error("At least one phase is required to cover the training block.");
  const proposed = ordered.map((phase, index) => index === 0 ? { ...phase, startDate: nextBlock.startDate } : index === ordered.length - 1 ? { ...phase, endDate: nextBlock.endDate } : { ...phase });
  const error = phaseCoverageError(proposed, nextBlock);
  if (error) throw new Error(error);
  return proposed.map((phase, index) => ({ ...phase, sortOrder: index }));
}
