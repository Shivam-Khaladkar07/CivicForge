import { IRL_LABELS, PROJECT_STAGES, type ProjectStage } from "../types.js";

const NEXT: Record<ProjectStage, ProjectStage | null> = {
  proposal: "prototype",
  prototype: "lab_testing",
  lab_testing: "pilot",
  pilot: "field_validation",
  field_validation: "deployment",
  deployment: "impact_measurement",
  impact_measurement: "completed",
  completed: null,
};

export function assertTransition(from: string, to: string) {
  const f = from as ProjectStage;
  const t = to as ProjectStage;
  if (!PROJECT_STAGES.includes(f) || !PROJECT_STAGES.includes(t)) {
    throw new Error("Unknown project stage.");
  }
  if (t === f) return;
  if (NEXT[f] !== t) {
    throw new Error(`Cannot move from ${f} to ${t}. Next allowed stage is ${NEXT[f] ?? "none (completed)"}.`);
  }
}

export function irlLabel(level: number) {
  return IRL_LABELS[level] ?? `IRL-${level}`;
}

export function stageToSuggestedIrl(stage: string): number {
  const map: Record<string, number> = {
    proposal: 2,
    prototype: 3,
    lab_testing: 4,
    pilot: 5,
    field_validation: 6,
    deployment: 7,
    impact_measurement: 8,
    completed: 8,
  };
  return map[stage] ?? 1;
}
