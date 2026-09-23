import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { baseFor } from "@/lib/paths";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/form";
import { PageEmpty, PageError, PageLoading } from "@/components/PageState";
import { Button } from "@/components/ui/button";

function useWorkspace<T>(path: string) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ data: T[] }>(path).then((r) => setRows(r.data)).catch((e) => setError(e.message));
  }, [path]);
  return { rows, error };
}

export function StudentTasksPage() {
  const { user } = useAuth();
  const base = baseFor(user?.role_id);
  const { rows, error } = useWorkspace<{ id: string; title: string; status: string; milestone_title: string; project_id: string; project_title: string; stage: string; due_date?: string }>("/api/projects/workspace/tasks");
  if (error) return <PageError message={error} />;
  if (!rows) return <PageLoading label="Loading assigned tasks…" />;
  return <Workspace title="My tasks" description="Only tasks assigned to you are shown. Open a project to update work or submit evidence." empty="No tasks are assigned to you.">
    {rows.map((row) => <Link key={row.id} to={`${base}/projects/${row.project_id}`}><Card className="hover:border-secondary/40"><CardHeader><div className="flex justify-between gap-3"><CardTitle className="text-base">{row.title}</CardTitle><Badge variant={row.status === "done" ? "success" : row.status === "review" ? "warning" : "outline"}>{row.status.replaceAll("_", " ")}</Badge></div><CardDescription>{row.project_title} · {row.milestone_title}</CardDescription></CardHeader>{row.due_date && <CardContent className="text-xs text-muted-foreground">Due {new Date(row.due_date).toLocaleDateString()}</CardContent>}</Card></Link>)}
  </Workspace>;
}

export function FacultyReviewsPage() {
  const { user } = useAuth();
  const base = baseFor(user?.role_id);
  const { rows, error } = useWorkspace<{ id: string; title: string; evidence: string; status: string; project_id: string; project_title: string; submitted_by?: string }>("/api/projects/workspace/reviews");
  if (error) return <PageError message={error} />;
  if (!rows) return <PageLoading label="Loading review queue…" />;
  return <Workspace title="Faculty review queue" description="Review submitted IRL evidence inside the relevant project workspace." empty="No evidence currently needs review.">
    {rows.map((row) => <Link key={row.id} to={`${base}/projects/${row.project_id}`}><Card className="hover:border-secondary/40"><CardHeader><div className="flex justify-between gap-3"><CardTitle className="text-base">{row.title}</CardTitle><Badge variant={row.status === "approved" ? "success" : row.status === "submitted" ? "warning" : "outline"}>{row.status.replaceAll("_", " ")}</Badge></div><CardDescription>{row.project_title} · submitted by {row.submitted_by || "team member"}</CardDescription></CardHeader><CardContent className="text-sm text-muted-foreground">{row.evidence}</CardContent></Card></Link>)}
  </Workspace>;
}

export function UniversityTeamPage() {
  const { user } = useAuth();
  const base = baseFor(user?.role_id);
  const { rows, error } = useWorkspace<{ id: string; title: string; stage: string; member_count: number; mentor_count: number; open_tasks: number }>("/api/projects/workspace/team");
  if (error) return <PageError message={error} />;
  if (!rows) return <PageLoading label="Loading university teams…" />;
  return <Workspace title="University teams" description="Staff projects, assign mentors, and monitor open work." empty="No university-led project teams yet.">
    {rows.map((row) => <Link key={row.id} to={`${base}/projects/${row.id}`}><Card className="hover:border-secondary/40"><CardHeader><div className="flex justify-between gap-3"><CardTitle className="text-base">{row.title}</CardTitle><Badge>{row.stage.replaceAll("_", " ")}</Badge></div><CardDescription>{row.member_count} team members · {row.mentor_count} mentors · {row.open_tasks} open tasks</CardDescription></CardHeader></Card></Link>)}
  </Workspace>;
}

export function IndustryCollaborationsPage() {
  const { user } = useAuth();
  const base = baseFor(user?.role_id);
  type Collaboration = { id: string; offer_type: string; notes: string; status: string; project_id: string; project_title: string; stage: string };
  type IndustryRequest = { id: string; request_type: string; message: string; status: string; project_id: string; project_title: string; stage: string; partner_name: string; requested_by_name: string; response_note?: string };
  const [rows, setRows] = useState<Collaboration[] | null>(null);
  const [requests, setRequests] = useState<IndustryRequest[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    try {
      const [collaborationResult, requestResult] = await Promise.all([
        api<{ data: Collaboration[] }>("/api/projects/workspace/collaborations"),
        api<{ data: IndustryRequest[] }>("/api/projects/workspace/industry-requests"),
      ]);
      setRows(collaborationResult.data);
      setRequests(requestResult.data);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load industry work."); }
  }
  useEffect(() => { load(); }, []);
  async function decide(request: IndustryRequest, status: "accepted" | "declined") {
    try {
      await api(`/api/projects/${request.project_id}/industry-requests/${request.id}/decision`, { method: "POST", body: JSON.stringify({ status, response_note: status === "accepted" ? "We are available to discuss scope and approval conditions." : "We cannot support this request at present." }) });
      setNotice(`Request ${status}.`);
      await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : "The response could not be saved."); }
  }
  if (error) return <PageError message={error} />;
  if (!rows || !requests) return <PageLoading label="Loading collaboration requests…" />;
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold text-primary">Industry collaboration desk</h1><p className="text-sm text-muted-foreground">University requests and your offers require explicit approval. No request guarantees funding.</p></div>
    {notice && <p className="rounded-md bg-accent p-2 text-sm" role="status">{notice}</p>}
    <section className="space-y-3"><h2 className="text-lg font-semibold">Requests from universities</h2>{requests.length === 0 ? <PageEmpty title="No university requests" body="New support requests will appear here." /> : requests.map((request) => <Card key={request.id}><CardHeader><div className="flex justify-between gap-3"><CardTitle className="text-base">{request.project_title}</CardTitle><Badge variant={request.status === "accepted" ? "success" : request.status === "requested" ? "warning" : "outline"}>{request.status}</Badge></div><CardDescription>{request.request_type} · requested by {request.requested_by_name}</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><p>{request.message}</p>{request.response_note && <p className="text-muted-foreground">Response: {request.response_note}</p>}<div className="flex flex-wrap gap-2">{request.status === "requested" && <><Button size="sm" variant="success" onClick={() => decide(request,"accepted")}>Accept for discussion</Button><Button size="sm" variant="outline" onClick={() => decide(request,"declined")}>Decline</Button></>}<Button size="sm" variant="ghost" asChild><Link to={`${base}/projects/${request.project_id}`}>Open project</Link></Button></div></CardContent></Card>)}</section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Offers submitted by you</h2>{rows.length === 0 ? <PageEmpty title="No offers submitted" body="Discover a suitable project and submit an offer when ready." /> : rows.map((row) => <Link key={row.id} to={`${base}/projects/${row.project_id}`}><Card className="hover:border-secondary/40"><CardHeader><div className="flex justify-between gap-3"><CardTitle className="text-base">{row.project_title}</CardTitle><Badge variant={row.status === "active" || row.status === "completed" ? "success" : "outline"}>{row.status}</Badge></div><CardDescription>{row.offer_type} · project stage {row.stage.replaceAll("_", " ")}</CardDescription></CardHeader><CardContent className="text-sm text-muted-foreground">{row.notes}</CardContent></Card></Link>)}</section>
  </div>;
}

function Workspace({ title, description, empty, children }: { title: string; description: string; empty: string; children: ReactNode }) {
  const count = Array.isArray(children) ? children.length : children ? 1 : 0;
  return <div className="space-y-4"><div><h1 className="text-2xl font-semibold text-primary">{title}</h1><p className="text-sm text-muted-foreground">{description}</p></div>{count === 0 ? <PageEmpty title={empty} body="New work will appear here when it is saved in CivicForge." /> : <div className="grid gap-3">{children}</div>}</div>;
}
