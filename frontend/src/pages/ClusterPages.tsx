import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { baseFor } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/form";

interface Cluster {
  id: string;
  title: string;
  summary: string;
  district_focus: string;
  status: string;
  category_name: string;
  challenge_count: number;
}

export function ClusterListPage() {
  const [rows, setRows] = useState<Cluster[]>([]);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const base = baseFor(user?.role_id);
  useEffect(() => {
    api<{ data: Cluster[] }>("/api/clusters")
      .then((r) => setRows(r.data))
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <p className="text-destructive">{error}</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">Challenge clusters</h1>
      <p className="text-sm text-muted-foreground">Related reports grouped for a single innovation brief (prototype).</p>
      {rows.map((c) => (
        <Link key={c.id} to={`${base}/clusters/${c.id}`}>
          <Card className="mb-3 hover:border-secondary/40">
            <CardHeader>
              <div className="flex justify-between gap-2">
                <CardTitle>{c.title}</CardTitle>
                <Badge>{c.status}</Badge>
              </div>
              <CardDescription>
                {c.category_name} · {c.district_focus} · {c.challenge_count} reports
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{c.summary}</CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export function ClusterDetailPage() {
  const { id } = useParams();
  const { has, user } = useAuth();
  const base = baseFor(user?.role_id);
  const [pack, setPack] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setPack(await api(`/api/clusters/${id}`));
  }
  useEffect(() => {
    load().catch(console.error);
  }, [id]);

  if (!pack) return <p>Loading cluster…</p>;
  const cluster = pack.cluster as Record<string, string>;
  const matches = pack.matches as {
    id: string;
    university_name: string;
    match_score: number;
    status: string;
    institution_status?: string;
    university_district: string;
    breakdown_json?: string;
  }[];
  const explanations = pack.explanations as { match_id: string; reason: string; evidence: string }[];
  const stats = pack.stats as { reports: number; villages: number; districts: string[]; affected_population: number } | undefined;

  async function recommend() {
    setBusy(true);
    await api(`/api/clusters/${id}/recommend-matches`, { method: "POST" });
    await load();
    setBusy(false);
  }

  async function decide(matchId: string, decision: "approved" | "rejected") {
    await api(`/api/clusters/matches/${matchId}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    await load();
  }

  async function institution(matchId: string, decision: "accepted" | "declined") {
    await api(`/api/clusters/matches/${matchId}/institution`, {
      method: "POST",
      body: JSON.stringify({ decision, note: "University workspace decision" }),
    });
    await load();
  }

  async function createProject() {
    setBusy(true);
    await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        cluster_id: id,
        title: `Project: ${cluster.title}`.slice(0, 160),
        summary: cluster.summary || "University-led innovation project created after human-approved match and institutional acceptance.",
      }),
    });
    await load();
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">{cluster.title}</h1>
      <p className="text-sm text-muted-foreground">{cluster.summary}</p>
      {stats && (
        <p className="text-sm">
          <strong>SYSTEMIC CHALLENGE CLUSTER</strong> — {stats.reports} reports · {stats.villages} districts/areas · affected population estimate {stats.affected_population} (DEMO / SYNTHETIC)
        </p>
      )}
      {has("project:create") && (
        <Button size="sm" onClick={createProject} disabled={busy}>
          Create project from this cluster
        </Button>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Member challenges</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(pack.challenges as { id: string; title: string; district: string; status: string }[]).map((c) => (
            <Link key={c.id} to={`${base}/challenges/${c.id}`} className="block hover:underline">
              {c.title} — {c.district} ({c.status})
            </Link>
          ))}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">University matches</h2>
        {has("match:recommend") && (
          <Button onClick={recommend} disabled={busy} size="sm">
            {busy ? "Scoring…" : "Recompute recommendations"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Match scores use admin-configurable weights. Assignment requires a human approve action.
      </p>
      {matches.map((m) => (
        <Card key={m.id}>
          <CardHeader>
            <div className="flex justify-between gap-2">
              <CardTitle className="text-base">{m.university_name}</CardTitle>
              <Badge variant={m.status === "approved" ? "success" : "outline"}>
                {m.status} · institution {m.institution_status || "pending"} · score {Number(m.match_score).toFixed(0)}
              </Badge>
            </div>
            <CardDescription>{m.university_district} (demo institutional profile)</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {explanations
              .filter((e) => e.match_id === m.id)
              .map((e) => (
                <p key={e.reason}>
                  <strong>{e.reason}:</strong> {e.evidence}
                </p>
              ))}
            {has("match:approve") && m.status === "recommended" && (
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="success" onClick={() => decide(m.id, "approved")}>
                  Approve assignment
                </Button>
                <Button size="sm" variant="outline" onClick={() => decide(m.id, "rejected")}>
                  Reject
                </Button>
              </div>
            )}
            {has("match:accept") && m.status === "approved" && (m.institution_status || "pending") === "pending" && (
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="success" onClick={() => institution(m.id, "accepted")}>
                  University accept
                </Button>
                <Button size="sm" variant="outline" onClick={() => institution(m.id, "declined")}>
                  Decline with reason
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
