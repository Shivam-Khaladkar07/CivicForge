export type RoleId =
  | "citizen"
  | "government"
  | "university_admin"
  | "faculty"
  | "student"
  | "industry"
  | "admin";

export const PERMISSIONS = [
  "challenge:create",
  "challenge:read",
  "challenge:read_all",
  "challenge:validate",
  "challenge:cluster",
  "match:recommend",
  "match:approve",
  "match:accept",
  "project:read",
  "project:write",
  "project:create",
  "irl:approve",
  "industry:offer",
  "admin:settings",
  "admin:users",
  "admin:audit",
  "demo:reset",
  "citizen:read_sensitive",
  "comment:write",
  "search:use",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role_id: RoleId;
  is_demo: boolean;
  permissions: Permission[];
}

export const PROJECT_STAGES = [
  "proposal",
  "prototype",
  "lab_testing",
  "pilot",
  "field_validation",
  "deployment",
  "impact_measurement",
  "completed",
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const IRL_LABELS: Record<number, string> = {
  1: "IRL-1 Problem Validated",
  2: "IRL-2 Solution Proposed",
  3: "IRL-3 Prototype Developed",
  4: "IRL-4 Lab Tested",
  5: "IRL-5 Community Pilot",
  6: "IRL-6 Field Validated",
  7: "IRL-7 Deployment Ready",
  8: "IRL-8 Scaled Impact",
};
