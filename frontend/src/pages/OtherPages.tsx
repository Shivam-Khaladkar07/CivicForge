import { useEffect, useState, type FormEvent } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { baseFor } from "@/lib/paths";

interface Feature {
  geometry: { coordinates: [number, number] };
  properties: { id: string; title: string; district: string; status: string; category_slug: string; severity: number; project_stage?: string };
}

export function MapPage() {
  const { user } = useAuth();
  const base = baseFor(user?.role_id);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [summaries, setSummaries] = useState<{ district: string; reports: number; high_severity: number; validated: number; active_projects: number }[]>([]);
  const [district, setDistrict] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [projectStage, setProjectStage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const params = new URLSearchParams();
    if (district) params.set("district", district);
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (severity) params.set("severity", severity);
    if (projectStage) params.set("project_stage", projectStage);
    setLoading(true);
    api<{ features: Feature[]; district_summaries: typeof summaries; provenance: string }>(`/api/challenges/geojson?${params}`)
      .then((r) => { setFeatures(r.features); setSummaries(r.district_summaries); setError(""); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [district, status, category, severity, projectStage]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">Challenge map</h1>
      <p className="text-sm text-muted-foreground">
        OpenStreetMap · prototype pins near Jharkhand districts. Coordinates are illustrative, not official GIS.
      </p>
      <Card>
        <CardHeader><CardTitle className="text-base">Map filters</CardTitle><CardDescription>Filter database-backed challenge markers and linked project stages.</CardDescription></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <select aria-label="District" className="h-10 rounded-md border bg-white px-3 text-sm" value={district} onChange={(e) => setDistrict(e.target.value)}><option value="">All districts</option>{["Ranchi","Dhanbad","East Singhbhum","Deoghar","Bokaro","Hazaribagh","Dumka","Giridih","Ramgarh","Palamu"].map((d) => <option key={d}>{d}</option>)}</select>
          <select aria-label="Challenge status" className="h-10 rounded-md border bg-white px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{["submitted","ai_screened","validation_pending","needs_information","validated","rejected"].map((s) => <option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select>
          <select aria-label="Domain" className="h-10 rounded-md border bg-white px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All domains</option>{["agriculture","energy","water","healthcare","education","environment","sanitation","accessibility","urban_infra","rural_livelihoods","public_admin"].map((s) => <option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select>
          <select aria-label="Minimum severity" className="h-10 rounded-md border bg-white px-3 text-sm" value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="">Any severity</option>{[3,4,5].map((s) => <option key={s} value={s}>Severity {s}+</option>)}</select>
          <select aria-label="Project stage" className="h-10 rounded-md border bg-white px-3 text-sm" value={projectStage} onChange={(e) => setProjectStage(e.target.value)}><option value="">Any project stage</option>{["proposal","prototype","lab_testing","pilot","field_validation","deployment","impact_measurement","completed"].map((s) => <option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select>
        </CardContent>
      </Card>
      {error && <p className="text-destructive">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {summaries.map((summary) => <Card key={summary.district}><CardHeader><CardTitle className="text-base">{summary.district}</CardTitle><CardDescription>{summary.reports} reports · {summary.validated} validated</CardDescription></CardHeader><CardContent className="text-xs text-muted-foreground">{summary.high_severity} high severity · {summary.active_projects} linked active projects</CardContent></Card>)}
      </div>
      <Card>
        <CardContent className="h-[520px] p-2">
          {loading && <p className="absolute z-[500] m-3 rounded bg-white px-3 py-2 text-sm shadow">Updating markers…</p>}
          <MapContainer center={[23.6, 85.3]} zoom={7} scrollWheelZoom>
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {features.map((f) => (
              <Marker key={f.properties.id} position={[f.geometry.coordinates[1], f.geometry.coordinates[0]]}>
                <Popup>
                  <Link to={`${base}/challenges/${f.properties.id}`} className="font-medium">
                    {f.properties.title}
                  </Link>
                  <div className="text-xs">
                    {f.properties.district} · {f.properties.status} · {f.properties.category_slug} · severity {f.properties.severity}{f.properties.project_stage ? ` · ${f.properties.project_stage.replaceAll("_", " ")}` : ""}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </CardContent>
      </Card>
    </div>
  );
}

export function UniversitiesPage() {
  const [data, setData] = useState<{
    universities: { id: string; name: string; district: string }[];
    departments: { university_id: string; name: string; domain: string }[];
    laboratories: { university_id: string; name: string; capability: string }[];
    provenance: string;
  } | null>(null);
  useEffect(() => {
    api<NonNullable<typeof data>>("/api/universities").then(setData);
  }, []);
  if (!data) return <p>Loading universities…</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">University partners</h1>
      <p className="text-sm text-muted-foreground">{data.provenance}</p>
      {data.universities.map((u) => (
        <Card key={u.id}>
          <CardHeader>
            <CardTitle>{u.name}</CardTitle>
            <CardDescription>{u.district}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>
              Departments:{" "}
              {data.departments
                .filter((d) => d.university_id === u.id)
                .map((d) => `${d.name} (${d.domain})`)
                .join("; ") || "—"}
            </p>
            <p>
              Labs:{" "}
              {data.laboratories
                .filter((d) => d.university_id === u.id)
                .map((d) => `${d.name}: ${d.capability}`)
                .join("; ") || "—"}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function IndustryPage() {
  const [data, setData] = useState<{
    industries: { name: string; sector: string; district: string }[];
    startups: { name: string; focus: string }[];
    csr: { name: string; focus: string }[];
    provenance: string;
  } | null>(null);
  useEffect(() => {
    api<NonNullable<typeof data>>("/api/industry").then(setData);
  }, []);
  if (!data) return <p>Loading partners…</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">Industry, startups & CSR</h1>
      <p className="text-sm text-muted-foreground">{data.provenance}</p>
      <div className="grid md:grid-cols-3 gap-4">
        {data.industries.map((i) => (
          <Card key={i.name}>
            <CardHeader>
              <CardTitle className="text-base">{i.name}</CardTitle>
              <CardDescription>
                {i.sector} · {i.district}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
        {data.startups.map((i) => (
          <Card key={i.name}>
            <CardHeader>
              <CardTitle className="text-base">{i.name}</CardTitle>
              <CardDescription>{i.focus}</CardDescription>
            </CardHeader>
          </Card>
        ))}
        {data.csr.map((i) => (
          <Card key={i.name}>
            <CardHeader>
              <CardTitle className="text-base">{i.name}</CardTitle>
              <CardDescription>{i.focus}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function NotificationsPage() {
  const [rows, setRows] = useState<{ id: string; title: string; body: string; is_read: boolean; link_url?: string }[]>([]);
  const navigate = useNavigate();
  async function load() {
    const r = await api<{ data: typeof rows }>("/api/notifications");
    setRows(r.data);
  }
  useEffect(() => {
    load();
  }, []);
  async function open(n: (typeof rows)[number]) {
    if (!n.is_read) await api(`/api/notifications/${n.id}/read`, { method: "POST" });
    if (n.link_url) navigate(n.link_url);
    else load();
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold text-primary">Notifications</h1><Button variant="outline" size="sm" onClick={async () => { await api("/api/notifications/read-all", { method: "POST" }); load(); }}>Mark all read</Button></div>
      {rows.length === 0 && <p className="text-muted-foreground">No notifications.</p>}
      {rows.map((n) => (
        <Card key={n.id} className={`${n.is_read ? "opacity-70" : ""} cursor-pointer`} onClick={() => open(n)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") open(n); }}>
          <CardHeader>
            <CardTitle className="text-base">{n.title}</CardTitle>
            <CardDescription>{n.body}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

export function AdminPage() {
  const [settings, setSettings] = useState<{ key: string; value_json: string; description: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string; full_name: string; role_id: string; is_demo: boolean; is_active: boolean }[]>(
    []
  );
  const [audit, setAudit] = useState<{ action: string; full_name: string; detail: string; created_at: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [institutions, setInstitutions] = useState<{ id: string; name: string; district: string; website?: string; capacity: number; technologies?: string; description?: string; department_count: number; project_count: number }[]>([]);
  const [domains, setDomains] = useState<{ id: string; slug: string; name: string; challenge_count: number }[]>([]);
  const [institutionName, setInstitutionName] = useState("");
  const [institutionDistrict, setInstitutionDistrict] = useState("");
  const [domainSlug, setDomainSlug] = useState("");
  const [domainName, setDomainName] = useState("");

  useEffect(() => {
    api<{ data: typeof settings }>("/api/admin/settings").then((r) => setSettings(r.data));
    api<{ data: typeof users }>("/api/admin/users").then((r) => setUsers(r.data));
    api<{ data: typeof audit }>("/api/admin/audit").then((r) => setAudit(r.data));
    api<{ data: typeof institutions }>("/api/admin/institutions").then((r) => setInstitutions(r.data));
    api<{ data: typeof domains }>("/api/admin/domains").then((r) => setDomains(r.data));
  }, []);

  async function refreshCatalogAdmin() {
    const [institutionResult, domainResult] = await Promise.all([api<{ data: typeof institutions }>("/api/admin/institutions"), api<{ data: typeof domains }>("/api/admin/domains")]);
    setInstitutions(institutionResult.data);
    setDomains(domainResult.data);
  }

  async function createInstitution(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/admin/institutions", { method: "POST", body: JSON.stringify({ name: institutionName, district: institutionDistrict, capacity: 4 }) });
      setInstitutionName(""); setInstitutionDistrict(""); setMsg("Institution created and audit logged."); await refreshCatalogAdmin();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Institution could not be created."); }
  }

  async function editInstitution(item: (typeof institutions)[number]) {
    const name = window.prompt("Institution name", item.name);
    if (!name) return;
    const district = window.prompt("District", item.district);
    if (!district) return;
    try {
      await api(`/api/admin/institutions/${item.id}`, { method: "PUT", body: JSON.stringify({ ...item, name, district }) });
      setMsg("Institution updated and audit logged."); await refreshCatalogAdmin();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Institution could not be updated."); }
  }

  async function deleteInstitution(item: (typeof institutions)[number]) {
    if (!window.confirm(`Delete ${item.name}? Linked institutions cannot be deleted.`)) return;
    try { await api(`/api/admin/institutions/${item.id}`, { method: "DELETE" }); setMsg("Institution deleted."); await refreshCatalogAdmin(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Institution could not be deleted."); }
  }

  async function createDomain(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/admin/domains", { method: "POST", body: JSON.stringify({ slug: domainSlug, name: domainName }) });
      setDomainSlug(""); setDomainName(""); setMsg("Challenge domain created."); await refreshCatalogAdmin();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Domain could not be created."); }
  }

  async function renameDomain(item: (typeof domains)[number]) {
    const name = window.prompt("Domain display name", item.name);
    if (!name) return;
    try { await api(`/api/admin/domains/${item.id}`, { method: "PUT", body: JSON.stringify({ name }) }); setMsg("Domain updated."); await refreshCatalogAdmin(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Domain could not be updated."); }
  }

  async function deleteDomain(item: (typeof domains)[number]) {
    if (!window.confirm(`Delete ${item.name}? Used domains cannot be deleted.`)) return;
    try { await api(`/api/admin/domains/${item.id}`, { method: "DELETE" }); setMsg("Domain deleted."); await refreshCatalogAdmin(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Domain could not be deleted."); }
  }

  async function save(key: string, raw: string) {
    try {
      await api(`/api/admin/settings/${key}`, { method: "PUT", body: JSON.stringify({ value: JSON.parse(raw) }) });
      setMsg("Saved. New reports and match runs will use these weights.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  async function resetGoldenDemo() {
    if (!window.confirm("Reset the Golden Demo irrigation workflow? Unrelated records will not be deleted.")) return;
    try {
      const result = await api<{ message: string }>("/api/admin/demo/reset", { method: "POST" });
      setMsg(result.message);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Golden Demo reset failed.");
    }
  }

  async function setUserActive(id: string, isActive: boolean) {
    try {
      await api(`/api/admin/users/${id}/active`, { method: "POST", body: JSON.stringify({ is_active: isActive }) });
      setUsers((current) => current.map((item) => item.id === id ? { ...item, is_active: isActive } : item));
      setMsg(`User ${isActive ? "activated" : "disabled"}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "User status could not be changed.");
    }
  }

  async function setUserRole(id: string, roleId: string) {
    try {
      await api(`/api/admin/users/${id}/role`, { method: "POST", body: JSON.stringify({ role_id: roleId }) });
      setUsers((current) => current.map((item) => item.id === id ? { ...item, role_id: roleId } : item));
      setMsg("User role updated and audit logged.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "User role could not be changed.");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">System admin</h1>
      <p className="text-sm text-muted-foreground">Scoring weights are configuration, not a universal scientific formula.</p>
      {msg && <p className="text-sm text-secondary">{msg}</p>}
      <Card>
        <CardHeader><CardTitle className="text-base">Golden Demo</CardTitle><CardDescription>Admin-only; restores the irrigation workflow without deleting unrelated data.</CardDescription></CardHeader>
        <CardContent><Button variant="outline" onClick={resetGoldenDemo}>Reset Golden Demo</Button></CardContent>
      </Card>
      {settings.map((s) => (
        <Card key={s.key}>
          <CardHeader>
            <CardTitle className="text-base">{s.key}</CardTitle>
            <CardDescription>{s.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <WeightEditor initial={s.value_json} onSave={(raw) => save(s.key, raw)} />
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader><CardTitle>Institutions</CardTitle><CardDescription>Create and maintain demo university profiles. Records with linked work are protected from deletion.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <form className="grid gap-2 md:grid-cols-[1fr_1fr_auto]" onSubmit={createInstitution}><Input value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} minLength={3} required placeholder="Institution name" /><Input value={institutionDistrict} onChange={(e) => setInstitutionDistrict(e.target.value)} minLength={2} required placeholder="District" /><Button type="submit">Add institution</Button></form>
          {institutions.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"><span><strong>{item.name}</strong> · {item.district} · {item.department_count} departments · {item.project_count} projects</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => editInstitution(item)}>Edit</Button><Button size="sm" variant="destructive" onClick={() => deleteInstitution(item)}>Delete</Button></div></div>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Challenge domains</CardTitle><CardDescription>Domain slugs remain stable for AI rules and existing records.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <form className="grid gap-2 md:grid-cols-[1fr_1fr_auto]" onSubmit={createDomain}><Input value={domainSlug} onChange={(e) => setDomainSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))} minLength={2} required placeholder="domain_slug" /><Input value={domainName} onChange={(e) => setDomainName(e.target.value)} minLength={2} required placeholder="Display name" /><Button type="submit">Add domain</Button></form>
          {domains.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"><span><strong>{item.name}</strong> · {item.slug} · {item.challenge_count} challenges</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => renameDomain(item)}>Rename</Button><Button size="sm" variant="destructive" onClick={() => deleteDomain(item)}>Delete</Button></div></div>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
              <p>{u.full_name} · {u.email}{u.is_demo ? " · Demo account" : ""}</p>
              <div className="flex items-center gap-2">
                <select aria-label={`Role for ${u.full_name}`} className="h-9 rounded-md border bg-white px-2" value={u.role_id} onChange={(e) => setUserRole(u.id, e.target.value)}>
                  {['citizen','government','university_admin','faculty','student','industry','admin'].map((role) => <option key={role} value={role}>{role.replaceAll('_',' ')}</option>)}
                </select>
                <Button size="sm" variant={u.is_active ? "outline" : "success"} onClick={() => setUserActive(u.id, !u.is_active)}>{u.is_active ? "Disable" : "Activate"}</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1 max-h-80 overflow-auto">
          {audit.map((a, i) => (
            <p key={i}>
              {a.created_at}: {a.full_name} — {a.action} {a.detail}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function WeightEditor({ initial, onSave }: { initial: string; onSave: (raw: string) => void }) {
  const [raw, setRaw] = useState(JSON.stringify(JSON.parse(initial), null, 2));
  return (
    <div className="space-y-2">
      <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} className="font-mono text-xs" />
      <Button size="sm" onClick={() => onSave(raw)}>
        Save JSON
      </Button>
    </div>
  );
}
