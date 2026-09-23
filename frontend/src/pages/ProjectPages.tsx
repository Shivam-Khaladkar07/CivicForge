import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { baseFor } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Input, Label, Textarea } from "@/components/ui/form";
import { TrackingTimeline, type TrackingStep } from "@/components/TrackingTimeline";

interface ProjectRow {
  id: string;
  title: string;
  stage: string;
  university_name: string;
  cluster_title: string;
}

interface ProjectDirectory {
  students: { id: string; full_name: string; email: string }[];
  faculty: { id: string; user_id: string | null; full_name: string; title: string }[];
}

export function ProjectListPage() {
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const base = baseFor(user?.role_id);
  useEffect(() => {
    api<{ data: ProjectRow[] }>("/api/projects")
      .then((r) => setRows(r.data))
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <p className="text-destructive">{error}</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">Innovation projects</h1>
      <p className="text-sm text-muted-foreground">Execution after a human-approved university match.</p>
      {rows.length === 0 && <p>No projects yet.</p>}
      {rows.map((p) => (
        <Link key={p.id} to={`${base}/projects/${p.id}`}>
          <Card className="mb-3 hover:border-secondary/40">
            <CardHeader>
              <div className="flex justify-between">
                <CardTitle>{p.title}</CardTitle>
                <Badge variant="secondary">{p.stage.replaceAll("_", " ")}</Badge>
              </div>
              <CardDescription>
                {p.university_name} · {p.cluster_title}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams();
  const { has, user } = useAuth();
  const [pack, setPack] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState("");
  const [notice, setNotice] = useState("");
  const [evidence, setEvidence] = useState("");
  const [directory, setDirectory] = useState<ProjectDirectory>({ students: [], faculty: [] });
  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] = useState("student researcher");
  const [mentorId, setMentorId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskMilestone, setTaskMilestone] = useState("");
  const [actionError, setActionError] = useState("");
  const [tracking, setTracking] = useState<TrackingStep[]>([]);
  const [prototypeName, setPrototypeName] = useState("");
  const [prototypeDescription, setPrototypeDescription] = useState("");
  const [testPrototype, setTestPrototype] = useState("");
  const [testName, setTestName] = useState("");
  const [testResult, setTestResult] = useState("");
  const [pilotLocation, setPilotLocation] = useState("");
  const [pilotBeneficiaries, setPilotBeneficiaries] = useState("");
  const [impactName, setImpactName] = useState("");
  const [impactUnit, setImpactUnit] = useState("households");
  const [impactPredicted, setImpactPredicted] = useState("");
  const [impactVerified, setImpactVerified] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");

  async function load() {
    const [project, people, journey] = await Promise.all([
      api<Record<string, unknown>>(`/api/projects/${id}`),
      api<ProjectDirectory>("/api/projects/directory/people").catch(() => ({ students: [], faculty: [] })),
      api<{ steps: TrackingStep[] }>(`/api/projects/${id}/tracking`).catch(() => ({ steps: [] })),
    ]);
    setPack(project);
    setDirectory(people);
    setTracking(journey.steps);
  }
  useEffect(() => {
    load().catch(console.error);
  }, [id]);

  if (!pack) return <p>Loading project…</p>;
  const p = pack.project as Record<string, string>;
  const canStaff = user?.role_id === "university_admin" || user?.role_id === "admin";
  const canCreateTask = canStaff || user?.role_id === "faculty";
  const canManageExecution = canStaff || user?.role_id === "faculty";
  const impact = pack.impact as {
    name: string;
    unit: string;
    predicted_value: number | null;
    verified_value: number | null;
    verification_note: string | null;
  }[];

  async function send(e: FormEvent) {
    e.preventDefault();
    await api(`/api/projects/${id}/messages`, { method: "POST", body: JSON.stringify({ body: msg }) });
    setMsg("");
    load();
  }

  async function offer(kind: string) {
    await api(`/api/projects/${id}/offers`, {
      method: "POST",
      body: JSON.stringify({
        kind,
        organization_name: "Demo industry desk",
        amount_inr: 100000,
        expertise: "Field operations",
        interest_type: "collaboration",
        notes: "Prototype offer from the industry demo account",
      }),
    });
    load();
  }

  async function updateTask(taskId: string, status: string) {
    await api(`/api/projects/${id}/tasks/${taskId}`, { method: "POST", body: JSON.stringify({ status }) });
    setNotice("Task status saved.");
    load();
  }

  async function addMember(e: FormEvent) {
    e.preventDefault();
    if (!memberId) return;
    setActionError("");
    try {
      await api(`/api/projects/${id}/team`, { method: "POST", body: JSON.stringify({ user_id: memberId, role_in_team: memberRole }) });
      setMemberId("");
      setNotice("Team member added and notified.");
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not add team member.");
    }
  }

  async function addMentor(e: FormEvent) {
    e.preventDefault();
    if (!mentorId) return;
    setActionError("");
    try {
      await api(`/api/projects/${id}/mentors`, { method: "POST", body: JSON.stringify({ faculty_id: mentorId, notes: "Assigned from university project workspace" }) });
      setMentorId("");
      setNotice("Faculty mentor assigned and notified.");
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not assign mentor.");
    }
  }

  async function createTask(e: FormEvent) {
    e.preventDefault();
    if (!taskMilestone || !taskTitle) return;
    setActionError("");
    try {
      await api(`/api/projects/${id}/tasks`, {
        method: "POST",
        body: JSON.stringify({ milestone_id: taskMilestone, title: taskTitle, assignee_id: taskAssignee || null, notes: "Created from university project workspace" }),
      });
      setTaskTitle("");
      setTaskAssignee("");
      setNotice("Task created and assignee notified.");
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not create task.");
    }
  }

  async function createPrototype(e: FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      await api(`/api/projects/${id}/prototypes`, { method: "POST", body: JSON.stringify({ name: prototypeName, description: prototypeDescription, status: "in_lab" }) });
      setPrototypeName(""); setPrototypeDescription("");
    }, "Prototype record created.");
  }

  async function createTest(e: FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      await api(`/api/projects/${id}/tests`, { method: "POST", body: JSON.stringify({ prototype_id: testPrototype, name: testName, result: testResult, notes: "Submitted through the project workspace" }) });
      setTestName(""); setTestResult("");
    }, "Test result saved.");
  }

  async function createPilot(e: FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      await api(`/api/projects/${id}/pilots`, { method: "POST", body: JSON.stringify({ location: pilotLocation, status: "planned", beneficiaries_estimate: Number(pilotBeneficiaries) || null }) });
      setPilotLocation(""); setPilotBeneficiaries("");
    }, "Pilot plan created.");
  }

  async function createImpact(e: FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      await api(`/api/projects/${id}/impact`, { method: "POST", body: JSON.stringify({ name: impactName, unit: impactUnit, predicted_value: impactPredicted === "" ? null : Number(impactPredicted), verified_value: impactVerified === "" ? null : Number(impactVerified), verification_note: impactVerified === "" ? "Predicted impact only — verification pending." : "Verified value entered by an authorized project reviewer." }) });
      setImpactName(""); setImpactPredicted(""); setImpactVerified("");
    }, "Impact metric saved with predicted and verified values separated.");
  }

  async function uploadDocument(e: FormEvent) {
    e.preventDefault();
    if (!documentFile) return;
    await runAction(async () => {
      const form = new FormData();
      form.append("file", documentFile);
      form.append("title", documentTitle || documentFile.name);
      form.append("doc_type", "project_evidence");
      await api(`/api/projects/${id}/documents`, { method: "POST", body: form });
      setDocumentFile(null); setDocumentTitle("");
    }, "Project document uploaded.");
  }

  async function updateMilestone(milestoneId: string, status: string) {
    await runAction(() => api(`/api/projects/${id}/milestones/${milestoneId}`, { method: "POST", body: JSON.stringify({ status }) }), "Milestone status saved.");
  }

  async function decideCollaboration(collaborationId: string, status: string) {
    await runAction(() => api(`/api/projects/${id}/collaborations/${collaborationId}/decide`, { method: "POST", body: JSON.stringify({ status }) }), `Collaboration ${status}.`);
  }

  async function runAction(action: () => Promise<unknown>, success: string) {
    setActionError("");
    try {
      await action();
      setNotice(success);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The action could not be completed.");
    }
  }

  async function advanceStage() {
    const order = ["proposal", "prototype", "lab_testing", "pilot", "field_validation", "deployment", "impact_measurement", "completed"];
    const current = order.indexOf(String(p.stage));
    if (current < 0 || current === order.length - 1) return;
    await api(`/api/projects/${id}/stage`, { method: "POST", body: JSON.stringify({ stage: order[current + 1] }) });
    setNotice(`Project advanced to ${order[current + 1].replaceAll("_", " ")}.`);
    load();
  }

  async function submitIrl(e: FormEvent) {
    e.preventDefault();
    const level = Math.min(8, Number(p.irl_level || 1) + 1);
    await api(`/api/projects/${id}/irl`, { method: "POST", body: JSON.stringify({ level, evidence }) });
    setEvidence("");
    setNotice(`IRL-${level} evidence submitted for faculty review.`);
    load();
  }

  async function reviewIrl(recordId: string, status: "approved" | "changes_requested") {
    await api(`/api/projects/${id}/irl/${recordId}/review`, { method: "POST", body: JSON.stringify({ status }) });
    setNotice(`IRL evidence ${status.replaceAll("_", " ")}.`);
    load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-primary">{p.title}</h1>
        <p className="text-sm text-muted-foreground">
          Stage: {p.stage.replaceAll("_", " ")} · {p.university_name} · Prototype project
        </p>
      </div>
      <Card>
        <CardContent className="pt-5 text-sm">{p.summary}</CardContent>
      </Card>
      <TrackingTimeline steps={tracking} />
      <Card>
        <CardHeader><CardTitle>Lifecycle & Innovation Readiness</CardTitle><CardDescription>Every transition is persisted, permission-checked, and logged.</CardDescription></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Current stage: <Badge variant="secondary">{String(p.stage).replaceAll("_", " ")}</Badge> · Current IRL: <Badge variant="ai">IRL-{String(p.irl_level || 1)}</Badge></p>
          {notice && <p className="text-success" role="status">{notice}</p>}
          {canManageExecution && String(p.stage) !== "completed" && <Button size="sm" onClick={() => runAction(advanceStage, "Project advanced to the next approved stage.")}>Advance to next allowed stage</Button>}
          {(pack.irl as { id: string; level: number; title: string; evidence: string; status: string; submitter?: string; reviewer?: string }[]).map((r) => (
            <div key={r.id} className="rounded border p-3"><p className="font-medium">{r.title} · {r.status}</p><p className="text-muted-foreground">{r.evidence}</p><p className="text-xs text-muted-foreground">Submitted by {r.submitter || "team member"}{r.reviewer ? ` · reviewed by ${r.reviewer}` : ""}</p>{has("irl:approve") && r.status === "submitted" && <div className="mt-2 flex gap-2"><Button size="sm" variant="success" onClick={() => reviewIrl(r.id, "approved")}>Approve</Button><Button size="sm" variant="outline" onClick={() => reviewIrl(r.id, "changes_requested")}>Request changes</Button></div>}</div>
          ))}
          {(user?.role_id === "student" || user?.role_id === "admin") && <form className="flex gap-2" onSubmit={submitIrl}><Input value={evidence} onChange={(e) => setEvidence(e.target.value)} minLength={8} required placeholder="Evidence for next IRL (prototype file, test note, field observation)" /><Button type="submit">Submit IRL evidence</Button></form>}
        </CardContent>
      </Card>
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Multidisciplinary team</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {(pack.members as { full_name: string; role_in_team: string }[]).map((m) => (
              <p key={m.full_name}>
                {m.full_name} — {m.role_in_team}
              </p>
            ))}
            {(pack.mentors as { full_name: string; faculty_title: string }[]).map((m) => (
              <p key={m.full_name}>
                Mentor: {m.full_name} ({m.faculty_title})
              </p>
            ))}
            {canStaff && (
              <div className="mt-4 space-y-3 border-t pt-3">
                <p className="font-medium">Assign people</p>
                <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={addMember}>
                  <select aria-label="Student team member" className="h-10 rounded-md border border-input bg-white px-3 text-sm" value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
                    <option value="">Select student</option>
                    {directory.students.map((student) => <option key={student.id} value={student.id}>{student.full_name}</option>)}
                  </select>
                  <Input aria-label="Team role" value={memberRole} onChange={(e) => setMemberRole(e.target.value)} required />
                  <Button type="submit" size="sm">Add student</Button>
                </form>
                <form className="grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={addMentor}>
                  <select aria-label="Faculty mentor" className="h-10 rounded-md border border-input bg-white px-3 text-sm" value={mentorId} onChange={(e) => setMentorId(e.target.value)} required>
                    <option value="">Select faculty mentor</option>
                    {directory.faculty.map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.full_name} — {faculty.title}</option>)}
                  </select>
                  <Button type="submit" size="sm" variant="outline">Assign mentor</Button>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {(pack.milestones as { id: string; title: string; status: string }[]).map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                <p>
                <Badge variant={m.status === "done" ? "success" : m.status === "in_progress" ? "warning" : "outline"}>
                  {m.status.replaceAll("_", " ")}
                </Badge>{" "}
                {m.title}
                </p>
                {canManageExecution && <div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => updateMilestone(m.id, "in_progress")}>Start</Button><Button size="sm" variant="outline" onClick={() => updateMilestone(m.id, "review")}>Review</Button><Button size="sm" variant="success" onClick={() => updateMilestone(m.id, "done")}>Complete</Button></div>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Prototype & tests</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {(pack.prototypes as { id: string; name: string; description: string; status: string }[]).map((pr) => (
            <div key={pr.name}>
              <p className="font-medium">
                {pr.name} <Badge>{pr.status}</Badge>
              </p>
              <p className="text-muted-foreground">{pr.description}</p>
            </div>
          ))}
          {(pack.tests as { name: string; result: string; notes: string }[]).map((t) => (
            <p key={t.name}>
              <strong>{t.name}:</strong> {t.result} <span className="text-muted-foreground">({t.notes})</span>
            </p>
          ))}
          {has("project:write") && <form className="mt-3 grid gap-2 rounded-md border p-3 md:grid-cols-2" onSubmit={createPrototype}><Input value={prototypeName} onChange={(e) => setPrototypeName(e.target.value)} placeholder="Prototype name" minLength={4} required /><Input value={prototypeDescription} onChange={(e) => setPrototypeDescription(e.target.value)} placeholder="What was built or submitted" minLength={10} required /><Button type="submit" className="md:col-span-2">Add prototype evidence</Button></form>}
          {has("project:write") && (pack.prototypes as { id: string }[]).length > 0 && <form className="mt-3 grid gap-2 rounded-md border p-3 md:grid-cols-3" onSubmit={createTest}><select className="h-10 rounded-md border bg-white px-3 text-sm" value={testPrototype} onChange={(e) => setTestPrototype(e.target.value)} required><option value="">Choose prototype</option>{(pack.prototypes as { id: string; name: string }[]).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Input value={testName} onChange={(e) => setTestName(e.target.value)} placeholder="Test name" minLength={3} required /><Input value={testResult} onChange={(e) => setTestResult(e.target.value)} placeholder="Observed result" minLength={3} required /><Button type="submit" variant="outline" className="md:col-span-3">Save test result</Button></form>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Tasks</CardTitle><CardDescription>Team work is stored against project milestones.</CardDescription></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {canCreateTask && (
            <form className="mb-3 grid gap-2 rounded-md border bg-muted/30 p-3 md:grid-cols-[1.4fr_1fr_1fr_auto]" onSubmit={createTask}>
              <Input aria-label="Task title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title" minLength={3} required />
              <select aria-label="Task milestone" className="h-10 rounded-md border border-input bg-white px-3 text-sm" value={taskMilestone} onChange={(e) => setTaskMilestone(e.target.value)} required>
                <option value="">Choose milestone</option>
                {(pack.milestones as { id: string; title: string }[]).map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}
              </select>
              <select aria-label="Task assignee" className="h-10 rounded-md border border-input bg-white px-3 text-sm" value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)}>
                <option value="">Unassigned</option>
                {directory.students.map((student) => <option key={student.id} value={student.id}>{student.full_name}</option>)}
              </select>
              <Button type="submit">Create task</Button>
            </form>
          )}
          {actionError && <p className="text-destructive" role="alert">{actionError}</p>}
          {(pack.tasks as { id: string; title: string; status: string; notes?: string }[]).map((t) => <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2"><span><Badge variant={t.status === "done" ? "success" : t.status === "review" ? "warning" : "outline"}>{t.status.replaceAll("_", " ")}</Badge> {t.title}</span>{has("project:write") && <div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => updateTask(t.id, "in_progress")}>Start</Button><Button size="sm" variant="outline" onClick={() => updateTask(t.id, "review")}>Request review</Button><Button size="sm" variant="success" onClick={() => updateTask(t.id, "done")}>Done</Button></div>}</div>)}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pilot</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {(pack.pilots as { location: string; status: string; beneficiaries_estimate: number }[]).map((pi) => (
            <p key={pi.location}>
              {pi.location} — {pi.status} · estimated households {pi.beneficiaries_estimate} (predicted scale)
            </p>
          ))}
          {canManageExecution && <form className="mt-3 grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={createPilot}><Input value={pilotLocation} onChange={(e) => setPilotLocation(e.target.value)} placeholder="Pilot location" minLength={4} required /><Input value={pilotBeneficiaries} onChange={(e) => setPilotBeneficiaries(e.target.value)} type="number" min={0} placeholder="Estimated beneficiaries" /><Button type="submit">Plan pilot</Button></form>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Industry / CSR collaboration</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {(pack.funding as { organization_name: string; amount_inr: number; status: string; notes: string }[]).map((f) => (
            <p key={f.organization_name}>
              Funding: ₹{f.amount_inr.toLocaleString("en-IN")} from {f.organization_name} ({f.status}) — {f.notes}
            </p>
          ))}
          {(pack.mentorship as { from_name: string; expertise: string; status: string }[]).map((m) => (
            <p key={m.from_name}>
              Mentorship: {m.from_name} — {m.expertise} ({m.status})
            </p>
          ))}
          {(pack.collaborations as { id: string; full_name: string; offer_type: string; notes: string; status: string }[]).map((c) => <div key={c.id} className="rounded border p-2"><p><strong>{c.full_name}</strong> offered {c.offer_type} — {c.notes} <Badge variant={c.status === "active" || c.status === "completed" ? "success" : "outline"}>{c.status}</Badge></p>{canManageExecution && c.status === "expressed" && <div className="mt-2 flex gap-2"><Button size="sm" variant="success" onClick={() => decideCollaboration(c.id, "approved")}>Approve offer</Button><Button size="sm" variant="outline" onClick={() => decideCollaboration(c.id, "rejected")}>Decline</Button></div>}{canManageExecution && c.status === "approved" && <Button className="mt-2" size="sm" onClick={() => decideCollaboration(c.id, "active")}>Start collaboration</Button>}</div>)}
          {(pack.industry_requests as { id: string; partner_name: string; request_type: string; message: string; status: string; response_note?: string }[] || []).map((request) => <div key={request.id} className="rounded border p-2 text-sm"><p><strong>Request to {request.partner_name}</strong> · {request.request_type} <Badge variant={request.status === "accepted" ? "success" : request.status === "requested" ? "warning" : "outline"}>{request.status}</Badge></p><p className="text-muted-foreground">{request.message}</p>{request.response_note && <p className="mt-1">Partner response: {request.response_note}</p>}</div>)}
          {has("industry:offer") && (
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={() => offer("funding")}>
                Propose funding
              </Button>
              <Button size="sm" variant="outline" onClick={() => offer("mentorship")}>
                Offer mentorship
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Impact — predicted vs verified</CardTitle>
          <CardDescription>Never treat a predicted number as an audited result.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={impact.map((i) => ({
                name: i.name,
                predicted: Number(i.predicted_value ?? 0),
                verified: Number(i.verified_value ?? 0),
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="predicted" fill="#94a3b8" name="Predicted" />
              <Bar dataKey="verified" fill="#15803d" name="Verified" />
            </BarChart>
          </ResponsiveContainer>
          </div>
          <ul className="text-sm space-y-1">
            {impact.map((i) => (
              <li key={i.name}>
                {i.name} ({i.unit}): predicted {i.predicted_value ?? "—"} · verified {i.verified_value ?? "not yet"} —{" "}
                {i.verification_note}
              </li>
            ))}
          </ul>
          {canManageExecution && <form className="mt-4 grid gap-2 rounded-md border p-3 md:grid-cols-4" onSubmit={createImpact}><Input value={impactName} onChange={(e) => setImpactName(e.target.value)} placeholder="Metric, e.g. farms served" required /><Input value={impactUnit} onChange={(e) => setImpactUnit(e.target.value)} placeholder="Unit" required /><Input value={impactPredicted} onChange={(e) => setImpactPredicted(e.target.value)} type="number" step="any" placeholder="Predicted value" /><Input value={impactVerified} onChange={(e) => setImpactVerified(e.target.value)} type="number" step="any" placeholder="Verified value (optional)" /><Button type="submit" className="md:col-span-4">Save impact metric</Button></form>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Team messages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm mb-3">
            {(pack.messages as { full_name: string; body: string }[]).map((m, i) => (
              <p key={i}>
                <strong>{m.full_name}:</strong> {m.body}
              </p>
            ))}
          </div>
          {has("project:write") && (
            <form onSubmit={send} className="flex gap-2">
              <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write to the team" />
              <Button type="submit">Send</Button>
            </form>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Documents and evidence</CardTitle><CardDescription>Project files are validated and stored against this project.</CardDescription></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {(pack.documents as { id: string; title: string; url: string; doc_type: string }[]).length === 0 && <p className="text-muted-foreground">No project documents uploaded.</p>}
          {(pack.documents as { id: string; title: string; url: string; doc_type: string }[]).map((document) => <a key={document.id} href={document.url} target="_blank" rel="noreferrer" className="block rounded border p-2 hover:bg-accent"><strong>{document.title}</strong><span className="block text-xs text-muted-foreground">{document.doc_type.replaceAll("_", " ")}</span></a>)}
          {has("project:write") && <form className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={uploadDocument}><Input value={documentTitle} onChange={(e) => setDocumentTitle(e.target.value)} placeholder="Document title" /><Input type="file" accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)} required /><Button type="submit">Upload</Button></form>}
        </CardContent>
      </Card>
    </div>
  );
}

export function ImpactPage() {
  const { user } = useAuth();
  const base = baseFor(user?.role_id);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  useEffect(() => {
    api<{ data: ProjectRow[] }>("/api/projects").then((r) => setProjects(r.data));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">Measured impact</h1>
      <p className="text-sm text-muted-foreground">
        Open a project to compare predicted vs verified metrics. This page lists active innovation projects only
        (prototype data).
      </p>
      {projects.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle>
              <Link to={`${base}/projects/${p.id}`} className="hover:underline">
                {p.title}
              </Link>
            </CardTitle>
            <CardDescription>Stage {p.stage.replaceAll("_", " ")}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
