import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { baseFor } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Input, Label, Textarea } from "@/components/ui/form";
import { PageEmpty, PageError, PageLoading } from "@/components/PageState";
import { TrackingTimeline, type TrackingStep } from "@/components/TrackingTimeline";

interface ChallengeRow {
  id: string;
  title: string;
  district: string;
  status: string;
  category_name: string;
  reporter_name: string;
  priority_score: string | number | null;
  severity: number;
  is_demo: boolean;
}

export function ChallengeListPage({ mine }: { mine?: boolean }) {
  const [rows, setRows] = useState<ChallengeRow[] | null>(null);
  const [error, setError] = useState("");
  const { has, user } = useAuth();
  const base = baseFor(user?.role_id);
  const showMine = mine ?? user?.role_id === "citizen";

  function load() {
    const q = showMine ? "?mine=1" : "";
    api<{ data: ChallengeRow[] }>(`/api/challenges${q}`)
      .then((r) => setRows(r.data))
      .catch((e) => setError(e.message));
  }
  useEffect(() => {
    load();
  }, [showMine]);

  if (error) return <PageError message={error} onRetry={load} />;
  if (!rows) return <PageLoading label="Loading challenges…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-primary">{showMine ? "My challenges" : "Challenges"}</h1>
          <p className="text-sm text-muted-foreground">DEMO / SYNTHETIC DATA — not official grievance records.</p>
        </div>
        {has("challenge:create") && (
          <Button asChild>
            <Link to={`${base}/challenges/new`}>New report</Link>
          </Button>
        )}
      </div>
      {rows.length === 0 && (
        <PageEmpty
          title="No challenges yet"
          body="When citizens submit reports, they appear here after they are stored in the database."
          action={
            has("challenge:create") ? (
              <Button asChild>
                <Link to={`${base}/challenges/new`}>Report a problem</Link>
              </Button>
            ) : null
          }
        />
      )}
      <div className="grid gap-3">
        {rows.map((c) => (
          <Link key={c.id} to={`${base}/challenges/${c.id}`}>
            <Card className="hover:border-secondary/40">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>{c.title}</CardTitle>
                  <CardDescription>
                    {c.district} · {c.category_name} · {c.reporter_name}
                  </CardDescription>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={c.status === "validated" ? "success" : c.status === "rejected" ? "destructive" : "outline"}>
                    {c.status.replaceAll("_", " ")}
                  </Badge>
                  {c.is_demo && <Badge variant="warning">DEMO / SYNTHETIC</Badge>}
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Severity {c.severity}/5
                {c.priority_score != null && (
                  <> · CivicForge Decision Support Score {Number(c.priority_score).toFixed(0)}</>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ChallengeNewPage() {
  return null;
}

export function ChallengeDetailPage() {
  const { id } = useParams();
  const { has, user } = useAuth();
  const base = baseFor(user?.role_id);
  const fresh = new URLSearchParams(useLocation().search).get("fresh") === "1";
  const [pack, setPack] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [dept, setDept] = useState("");
  const [clusterTitle, setClusterTitle] = useState("");
  const [clusterSummary, setClusterSummary] = useState("");
  const [tracking, setTracking] = useState<TrackingStep[]>([]);
  const [trackingError, setTrackingError] = useState("");
  const [informationResponse, setInformationResponse] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  async function load() {
    try {
      const [detail, journey] = await Promise.all([
        api<Record<string, unknown>>(`/api/challenges/${id}`),
        api<{ steps: TrackingStep[] }>(`/api/challenges/${id}/tracking`).catch((e) => {
          setTrackingError(e instanceof Error ? e.message : "Could not load tracking");
          return { steps: [] };
        }),
      ]);
      setPack(detail);
      setTracking(journey.steps);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  useEffect(() => {
    load();
  }, [id]);

  if (error) return <PageError message={error} onRetry={load} />;
  if (!pack) return <PageLoading label="Loading challenge…" />;
  const ch = pack.challenge as Record<string, string | number | boolean>;
  const ai = (pack.ai_analysis as Record<string, unknown>[])[0];
  const pr = (pack.priority as Record<string, unknown>[])[0];
  const similar = (pack.similar as {
    id: string;
    related_challenge_id: string;
    related_title: string;
    similarity: number;
    reason: string;
    relation_type: string;
    decision: string;
  }[]) || [];

  async function decide(decision: "validated" | "rejected" | "needs_information") {
    await api(`/api/challenges/${id}/validate`, {
      method: "POST",
      body: JSON.stringify({ decision, note, assigned_department: dept || undefined }),
    });
    load();
  }

  async function dup(reviewId: string, decision: string) {
    await api(`/api/challenges/${id}/duplicates/${reviewId}`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    load();
  }

  async function sendComment(e: FormEvent) {
    e.preventDefault();
    await api(`/api/challenges/${id}/comments`, { method: "POST", body: JSON.stringify({ body: comment }) });
    setComment("");
    load();
  }

  async function respondToInformationRequest(e: FormEvent) {
    e.preventDefault();
    try {
      const result = await api<{ message: string }>(`/api/challenges/${id}/respond`, { method: "POST", body: JSON.stringify({ response: informationResponse }) });
      setInformationResponse("");
      setActionMessage(result.message);
      await load();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "The response could not be saved.");
    }
  }

  async function createCluster(e: FormEvent) {
    e.preventDefault();
    await api("/api/clusters", {
      method: "POST",
      body: JSON.stringify({
        title: clusterTitle,
        summary: clusterSummary,
        category_id: ch.category_id,
        district_focus: ch.district,
        challenge_ids: [id],
      }),
    });
    setClusterTitle("");
    setClusterSummary("");
    load();
  }

  const skills = ai ? safeJson(ai.skills_json) : [];
  const techs = ai ? safeJson(ai.technologies_json) : [];
  const pipeline = ai ? safeJson<{ label: string; done: boolean }>(ai.pipeline_json) : [];

  return (
    <div className="space-y-4">
      {fresh && (
        <Card className="border-ai/30 bg-ai/[0.04]">
          <CardHeader>
            <Badge variant="ai">Demo AI Mode</Badge>
            <CardTitle className="text-base mt-1">Analysis complete — a human still decides</CardTitle>
          </CardHeader>
        </Card>
      )}
      <div>
        <h1 className="text-2xl font-semibold text-primary">{String(ch.title)}</h1>
        <p className="text-sm text-muted-foreground">
          {ch.district} · {ch.category_name} · {String(ch.status).replaceAll("_", " ")} · DEMO / SYNTHETIC DATA
        </p>
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Problem statement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed">
            <p>{ch.description}</p>
            {ch.impact_description && <p><strong>Impact:</strong> {String(ch.impact_description)}</p>}
            <p>
              Severity {ch.severity}/5 · Urgency {ch.urgency ?? ch.severity}/5 · Population estimate {ch.population_estimate ?? "not given"} · Language {ch.language || "en"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Human validation</CardTitle>
            <CardDescription>AI recommends. An officer decides.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {actionMessage && <p className="rounded-md bg-accent p-2 text-sm" role="status">{actionMessage}</p>}
            {has("challenge:validate") ? (
              <>
                <Label htmlFor="dept">Assign department (optional)</Label>
                <Input id="dept" value={dept} onChange={(e) => setDept(e.target.value)} placeholder="e.g. Agriculture desk" />
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Officer note" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="success" onClick={() => decide("validated")}>
                    Validate
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => decide("needs_information")}>
                    Need information
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => decide("rejected")}>
                    Reject
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Only government officers can validate. Status: {String(ch.status).replaceAll("_", " ")}</p>
                {String(ch.status) === "needs_information" && String(ch.reporter_id) === user?.id && (
                  <form className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-3" onSubmit={respondToInformationRequest}>
                    <p className="text-sm font-medium">Government requested more information</p>
                    <p className="text-xs text-muted-foreground">{String(ch.info_request || "Please clarify the report before validation.")}</p>
                    <Textarea value={informationResponse} onChange={(e) => setInformationResponse(e.target.value)} minLength={10} maxLength={2000} required placeholder="Provide the requested details" aria-label="Response to information request" />
                    <Button type="submit" size="sm">Send response for validation</Button>
                  </form>
                )}
                {ch.info_response && <p className="text-xs"><strong>Latest citizen response:</strong> {String(ch.info_response)}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <TrackingTimeline steps={tracking} error={trackingError} />
      {ai && (
        <Card className="border-ai/30 bg-ai/[0.03]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>AI intelligence</CardTitle>
              <Badge variant="ai">{String(ai.mode) === "demo" ? "Demo AI Mode" : String(ai.mode) === "demo_fallback" ? "Demo AI Fallback" : String(ai.provider)}</Badge>
            </div>
            <CardDescription>{String(ai.confidence_label)}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>{String(ai.summary)}</p>
            <p>
              Primary domain: <strong>{String(ai.category_slug)}</strong>
              {ai.secondary_slug ? <> · Secondary: <strong>{String(ai.secondary_slug)}</strong></> : null}
            </p>
            {String(ai.sub_domain || "") && <p>Sub-domain: {String(ai.sub_domain)}</p>}
            <p>Required skills: {skills.join(", ") || "—"}</p>
            <p>Suggested technologies: {techs.join(", ") || "—"}</p>
            <p>
              System confidence {Number(ai.confidence).toFixed(2)} (not measured accuracy)
            </p>
            {Boolean(ai.fallback_reason) && <p className="rounded-md border border-warning/40 bg-warning/5 p-2 text-xs"><strong>Fallback reason:</strong> {String(ai.fallback_reason)}. Deterministic Demo AI output was used so the workflow could continue.</p>}
            <ul className="text-xs text-ai space-y-1">
              {pipeline.map((p: { label: string; done: boolean }) => (
                <li key={p.label}>
                  {p.done ? "✓" : "○"} {p.label}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {pr && (
        <Card>
          <CardHeader>
            <CardTitle>CivicForge Decision Support Score {Number(pr.score).toFixed(0)} / 100</CardTitle>
            <CardDescription>{String(pr.formula_note)}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <Breakdown json={String(pr.breakdown_json)} />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Potentially related challenges</CardTitle>
          <CardDescription>Duplicate candidate versus related report — never merged without confirmation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {similar.length === 0 && <p className="text-muted-foreground">No similar reports stored yet.</p>}
          {similar.map((s) => (
            <div key={s.id} className="rounded-md border p-3">
              <Link className="font-medium hover:underline" to={`${base}/challenges/${s.related_challenge_id}`}>
                {s.related_title}
              </Link>
              <p className="text-xs text-muted-foreground">
                {s.relation_type === "duplicate_candidate" ? "DUPLICATE CANDIDATE" : "RELATED REPORT"} · {Number(s.similarity).toFixed(0)}% · {s.reason}
              </p>
              {has("challenge:cluster") && s.decision === "pending" && (
                <div className="flex gap-2 mt-2">
                  <Button size="sm" onClick={() => dup(s.id, "merge")}>
                    Merge
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => dup(s.id, "separate")}>
                    Mark separate
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => dup(s.id, "ignore")}>
                    Ignore
                  </Button>
                </div>
              )}
              {s.decision !== "pending" && <p className="text-xs mt-1">Decision: {s.decision}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
      {has("challenge:cluster") && String(ch.status) === "validated" && !ch.cluster_id && (
        <Card>
          <CardHeader><CardTitle>Form a systemic challenge cluster</CardTitle><CardDescription>Create a human-managed cluster; related reports can be assigned after review.</CardDescription></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={createCluster}>
              <Input required minLength={8} value={clusterTitle} onChange={(e) => setClusterTitle(e.target.value)} placeholder="Cluster title" />
              <Textarea required minLength={20} value={clusterSummary} onChange={(e) => setClusterSummary(e.target.value)} placeholder="Why this is systemic and what needs solving" />
              <Button type="submit">Create cluster from this report</Button>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Activity & discussion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(pack.activity as { full_name?: string; action: string; detail?: string }[]).map((a, i) => (
            <p key={i}>
              {a.full_name || "System"} — {a.action} {a.detail}
            </p>
          ))}
          {(pack.comments as { full_name: string; body: string }[]).map((c, i) => (
            <p key={`c${i}`}>
              <strong>{c.full_name}:</strong> {c.body}
            </p>
          ))}
          {has("comment:write") && (
            <form onSubmit={sendComment} className="flex gap-2 pt-2">
              <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a note" />
              <Button type="submit">Post</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function safeJson<T = string>(v: unknown): T[] {
  if (!v) return [];
  if (Array.isArray(v)) return v as T[];
  try {
    const p = JSON.parse(String(v));
    return Array.isArray(p) ? (p as T[]) : [];
  } catch {
    return [];
  }
}

function Breakdown({ json }: { json: string }) {
  try {
    const o = JSON.parse(json) as Record<string, number>;
    return (
      <ul className="grid sm:grid-cols-2 gap-1">
        {Object.entries(o).map(([k, v]) => (
          <li key={k}>
            {k.replaceAll("_", " ")}: {v}
          </li>
        ))}
      </ul>
    );
  } catch {
    return <pre className="text-xs">{json}</pre>;
  }
}
