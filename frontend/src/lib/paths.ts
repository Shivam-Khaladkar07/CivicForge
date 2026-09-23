import type { RoleId } from "@/lib/auth";

export function homeFor(role?: RoleId | null) {
  switch (role) {
    case "government":
      return "/government/dashboard";
    case "university_admin":
      return "/university/dashboard";
    case "faculty":
      return "/faculty/dashboard";
    case "student":
      return "/student/dashboard";
    case "industry":
      return "/industry/dashboard";
    case "admin":
      return "/admin/dashboard";
    default:
      return "/citizen/dashboard";
  }
}

export function baseFor(role?: RoleId | null) {
  return homeFor(role).replace(/\/dashboard$/, "");
}

export type NavItem = { to: string; label: string; end?: boolean };

export function navFor(role?: RoleId | null): NavItem[] {
  const b = baseFor(role);
  switch (role) {
    case "government":
      return [
        { to: `${b}/dashboard`, label: "Dashboard", end: true },
        { to: `${b}/challenges`, label: "Challenges" },
        { to: `${b}/clusters`, label: "Clusters" },
        { to: `${b}/projects`, label: "Projects" },
        { to: `${b}/map`, label: "Map" },
        { to: `${b}/analytics`, label: "Analytics" },
        { to: `${b}/notifications`, label: "Notifications" },
      ];
    case "university_admin":
      return [
        { to: `${b}/dashboard`, label: "Dashboard", end: true },
        { to: `${b}/challenges`, label: "Challenges" },
        { to: `${b}/matches`, label: "Matches" },
        { to: `${b}/projects`, label: "Projects" },
        { to: `${b}/team`, label: "Team" },
        { to: `${b}/notifications`, label: "Notifications" },
      ];
    case "faculty":
      return [
        { to: `${b}/dashboard`, label: "Dashboard", end: true },
        { to: `${b}/projects`, label: "Projects" },
        { to: `${b}/reviews`, label: "Reviews" },
        { to: `${b}/notifications`, label: "Notifications" },
      ];
    case "student":
      return [
        { to: `${b}/dashboard`, label: "Dashboard", end: true },
        { to: `${b}/projects`, label: "Projects" },
        { to: `${b}/tasks`, label: "Tasks" },
        { to: `${b}/notifications`, label: "Notifications" },
      ];
    case "industry":
      return [
        { to: `${b}/dashboard`, label: "Dashboard", end: true },
        { to: `${b}/challenges`, label: "Challenges" },
        { to: `${b}/interests`, label: "Interests" },
        { to: `${b}/collaborations`, label: "Collaborations" },
        { to: `${b}/notifications`, label: "Notifications" },
      ];
    case "admin":
      return [
        { to: `${b}/dashboard`, label: "Dashboard", end: true },
        { to: `${b}/users`, label: "Users" },
        { to: `${b}/challenges`, label: "Challenges" },
        { to: `${b}/institutions`, label: "Institutions" },
        { to: `${b}/industries`, label: "Industries" },
        { to: `${b}/settings`, label: "Settings" },
        { to: `${b}/audit`, label: "Audit" },
      ];
    default:
      return [
        { to: `${b}/dashboard`, label: "Dashboard", end: true },
        { to: `${b}/challenges`, label: "My challenges" },
        { to: `${b}/challenges/new`, label: "Report a problem" },
        { to: `${b}/notifications`, label: "Notifications" },
        { to: `${b}/profile`, label: "Profile" },
      ];
  }
}

export const DISTRICTS = [
  "Ranchi",
  "Dhanbad",
  "East Singhbhum",
  "Deoghar",
  "Bokaro",
  "Hazaribagh",
  "Dumka",
  "Giridih",
  "Ramgarh",
  "Palamu",
];
