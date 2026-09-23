import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, LogOut, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Badge, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { baseFor, homeFor, navFor } from "@/lib/paths";

const JOURNEY = [
  "Citizen",
  "AI",
  "Validation",
  "Cluster",
  "Match",
  "Team",
  "Industry",
  "Prototype",
  "Pilot",
  "Impact",
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [q, setQ] = useState("");
  type SearchHit = { id: string; label: string; detail?: string; type: "challenge" | "cluster" | "project" | "university" | "industry" | "faculty" | "technology" };
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const links = navFor(user?.role_id);
  const base = baseFor(user?.role_id);

  useEffect(() => {
    api<{ data: { is_read: boolean }[] }>("/api/notifications")
      .then((r) => setUnread(r.data.filter((n) => !n.is_read).length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits(null);
      return;
    }
    const t = setTimeout(() => {
      api<{
        challenges: { id: string; title: string; status: string }[];
        clusters: { id: string; title: string; district_focus?: string }[];
        projects: { id: string; title: string; stage: string }[];
        universities: { id: string; name: string }[];
        industries: { id: string; name: string; sector: string; kind: string }[];
        faculty: { id: string; full_name: string; title: string }[];
        technologies: { id: string; source_name: string; value: string; source_type: string }[];
      }>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => setHits([
          ...r.challenges.map((x) => ({ id: x.id, label: x.title, detail: x.status.replaceAll("_", " "), type: "challenge" as const })),
          ...r.clusters.map((x) => ({ id: x.id, label: x.title, detail: x.district_focus, type: "cluster" as const })),
          ...r.projects.map((x) => ({ id: x.id, label: x.title, detail: x.stage.replaceAll("_", " "), type: "project" as const })),
          ...r.universities.map((x) => ({ id: x.id, label: x.name, detail: "University", type: "university" as const })),
          ...r.industries.map((x) => ({ id: x.id, label: x.name, detail: `${x.kind} · ${x.sector}`, type: "industry" as const })),
          ...r.faculty.map((x) => ({ id: x.id, label: x.full_name, detail: x.title, type: "faculty" as const })),
          ...r.technologies.map((x) => ({ id: x.id, label: x.value, detail: `${x.source_type} · ${x.source_name}`, type: "technology" as const })),
        ]))
        .catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-72 flex-col border-r border-border/60 bg-primary text-primary-foreground shadow-2xl shadow-primary/15">
        <div className="p-6">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/civicforge-logo.png" alt="CivicForge logo" className="h-9 w-9 object-contain rounded-xl" />
            CivicForge
          </div>
          <p className="mt-3 text-xs leading-relaxed text-primary-foreground/65">Every validated challenge should have a pathway to a solution.</p>
        </div>
        <nav className="flex-1 px-3 space-y-1" aria-label="Role navigation">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive ? "bg-white/90 text-primary shadow-lg shadow-black/10" : "text-primary-foreground/70 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="m-3 rounded-xl border border-white/10 bg-white/10 p-3 text-xs text-primary-foreground/65">
          {user?.is_demo && <Badge variant="warning">Demo account</Badge>}
          <p className="mt-2 font-medium text-white">{user?.full_name}</p>
          <p className="capitalize">{user?.role_id.replaceAll("_", " ")}</p>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="bg-secondary text-secondary-foreground text-xs px-4 py-2 flex items-center justify-between gap-3">
          <span>Demo Environment — DEMO / SYNTHETIC DATA. Not official government statistics or certified ML accuracy.</span>
          <span className="hidden lg:inline opacity-80">SIH 2026 · CivicForge</span>
        </div>
        <header className="flex items-center justify-between gap-3 border-b border-border/60 bg-card/80 px-4 py-3 backdrop-blur-md">
          <div className="md:hidden font-semibold text-primary">CivicForge</div>
          <div className="hidden lg:flex flex-wrap gap-1 text-[10px] text-muted-foreground">
            {JOURNEY.map((j, i) => (
              <span key={j} className="flex items-center gap-1">
                {i > 0 && <span>→</span>}
                <span>{j}</span>
              </span>
            ))}
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search challenges, projects…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search CivicForge"
            />
            {hits && (
              <div className="absolute z-20 mt-1 w-full rounded-md border bg-card shadow-card text-sm max-h-64 overflow-auto">
                {hits.length === 0 && <p className="p-3 text-muted-foreground">No matches</p>}
                {hits.map((h) => (
                  <button
                    key={`${h.type}-${h.id}-${h.label}`}
                    type="button"
                    className="block w-full text-left px-3 py-2 hover:bg-accent"
                    onClick={() => {
                      setQ("");
                      setHits(null);
                      if (h.type === "challenge") navigate(`${base}/challenges/${h.id}`);
                      else if (h.type === "cluster") navigate(`${base}/clusters/${h.id}`);
                      else if (h.type === "project") navigate(`${base}/projects/${h.id}`);
                      else if (h.type === "industry") navigate(`${base}/industry`);
                      else navigate(`${base}/universities`);
                    }}
                  >
                    <span className="block font-medium">{h.label}</span>
                    <span className="block text-xs capitalize text-muted-foreground">{h.type}{h.detail ? ` · ${h.detail}` : ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(`${base}/notifications`)} className="relative" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-destructive text-[10px] text-white px-1">
                  {unread}
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </header>
        <nav className="md:hidden flex overflow-x-auto gap-2 border-b bg-card px-3 py-2 text-xs">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "font-semibold text-primary" : "text-muted-foreground")}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <main className="p-4 md:p-7 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function RoleHomeRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(homeFor(user?.role_id), { replace: true });
  }, [user, navigate]);
  return <p className="p-8 text-muted-foreground">Opening your workspace…</p>;
}
