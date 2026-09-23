import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { baseFor, DISTRICTS } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Input, Label, Textarea } from "@/components/ui/form";
import { PageError } from "@/components/PageState";

const STEPS = ["Describe problem", "Add evidence", "Location", "Impact", "Review & submit"];

const GOLDEN = {
  title: "Irrigation pumps stop due to voltage fluctuations",
  description:
    "Our irrigation pump frequently stops because of voltage fluctuations, affecting crops across nearby villages. Motors overheat in the evening when the grid dips. Farmers need a maintainable stabilizer or solar-assist controller, not a complaint ticket.",
  category_slug: "agriculture",
  district: "Giridih",
  block_or_ward: "Bengabad",
  locality: "Nearby hamlets, Bengabad",
  severity: 4,
  urgency: 4,
  population_estimate: 2400,
  lat: "24.18",
  lng: "86.30",
  language: "en",
  impact_description: "Standing paddy and vegetables miss watering windows; neighbouring villages report the same pump trips.",
};

export function ChallengeWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ ...GOLDEN, title: "", description: "", impact_description: "" });

  const valid = useMemo(() => {
    if (step === 0) return form.title.length >= 8 && form.description.length >= 20;
    if (step === 3) return form.impact_description.length >= 8;
    return true;
  }, [step, form]);

  function patch(p: Partial<typeof form>) {
    setForm((f) => ({ ...f, ...p }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    setAnalyzing(true);
    try {
      const res = await api<{ id: string }>("/api/challenges", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          severity: Number(form.severity),
          urgency: Number(form.urgency),
          population_estimate: Number(form.population_estimate) || null,
          lat: Number(form.lat),
          lng: Number(form.lng),
        }),
      });
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        await api(`/api/challenges/${res.id}/media`, { method: "POST", body: fd });
      }
      navigate(`${baseFor(user?.role_id)}/challenges/${res.id}?fresh=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit");
      setAnalyzing(false);
    } finally {
      setBusy(false);
    }
  }

  if (analyzing) {
    return (
      <Card className="border-ai/30">
        <CardHeader>
          <Badge variant="ai">Demo AI Mode</Badge>
          <CardTitle className="mt-2">AI is analyzing your challenge…</CardTitle>
          <CardDescription>Language, domain, similar reports, skills, and a decision-support score. A human still decides.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {["Language understood", "Domain identified", "Related challenges searched", "Priority calculated", "Required skills extracted"].map(
            (l) => (
              <p key={l}>✓ {l}</p>
            )
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-primary">Report a societal challenge</h1>
        <p className="text-sm text-muted-foreground">
          Step {step + 1} of 5 — {STEPS[step]}. This is not a complaint ticket; describe a problem teams can work on.
        </p>
      </div>
      <ol className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-md px-2 py-1 ${i === step ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <Card>
        <CardContent className="pt-5">
          <form className="space-y-4" onSubmit={submit}>
            {step === 0 && (
              <>
                <div>
                  <Label htmlFor="title">What is the problem?</Label>
                  <Input id="title" value={form.title} onChange={(e) => patch({ title: e.target.value })} required minLength={8} />
                </div>
                <div>
                  <Label htmlFor="desc">Describe what happens, who is affected, and what a solution team should know</Label>
                  <Textarea id="desc" value={form.description} onChange={(e) => patch({ description: e.target.value })} required minLength={20} />
                </div>
                <div>
                  <Label htmlFor="lang">Language of this report</Label>
                  <select
                    id="lang"
                    className="h-10 w-full rounded-md border px-2 text-sm"
                    value={form.language}
                    onChange={(e) => patch({ language: e.target.value })}
                  >
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="nagpuri">Nagpuri</option>
                    <option value="santali">Santali</option>
                  </select>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...GOLDEN })}>
                  Fill Golden Demo (irrigation / voltage)
                </Button>
              </>
            )}
            {step === 1 && (
              <div>
                <Label htmlFor="file">Photo, PDF, or short video/audio (optional, max 25MB)</Label>
                <Input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <p className="mt-2 text-xs text-muted-foreground">Evidence improves the CivicForge Decision Support Score. Files are stored on this server.</p>
              </div>
            )}
            {step === 2 && (
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="district">District</Label>
                  <select
                    id="district"
                    className="h-10 w-full rounded-md border px-2 text-sm"
                    value={form.district}
                    onChange={(e) => patch({ district: e.target.value })}
                  >
                    {DISTRICTS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="block">Block / ward</Label>
                  <Input id="block" value={form.block_or_ward} onChange={(e) => patch({ block_or_ward: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="loc">Locality</Label>
                  <Input id="loc" value={form.locality} onChange={(e) => patch({ locality: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="cat">Primary domain (you may change; AI will also classify)</Label>
                  <select
                    id="cat"
                    className="h-10 w-full rounded-md border px-2 text-sm"
                    value={form.category_slug}
                    onChange={(e) => patch({ category_slug: e.target.value })}
                  >
                    <option value="agriculture">Agriculture</option>
                    <option value="energy">Energy</option>
                    <option value="water">Water</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="education">Education</option>
                    <option value="sanitation">Sanitation</option>
                    <option value="environment">Environment</option>
                    <option value="urban_infra">Urban infrastructure</option>
                    <option value="rural_livelihoods">Rural livelihoods</option>
                    <option value="accessibility">Accessibility</option>
                    <option value="public_admin">Public administration</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="lat">Latitude (map pin)</Label>
                  <Input id="lat" value={form.lat} onChange={(e) => patch({ lat: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="lng">Longitude</Label>
                  <Input id="lng" value={form.lng} onChange={(e) => patch({ lng: e.target.value })} />
                </div>
              </div>
            )}
            {step === 3 && (
              <>
                <div>
                  <Label htmlFor="impact">How does this affect people or livelihoods?</Label>
                  <Textarea id="impact" value={form.impact_description} onChange={(e) => patch({ impact_description: e.target.value })} />
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="pop">People / households affected (estimate)</Label>
                    <Input id="pop" type="number" min={0} value={form.population_estimate} onChange={(e) => patch({ population_estimate: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label htmlFor="urg">Urgency (1–5)</Label>
                    <Input id="urg" type="number" min={1} max={5} value={form.urgency} onChange={(e) => patch({ urgency: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label htmlFor="sev">Severity (1–5)</Label>
                    <Input id="sev" type="number" min={1} max={5} value={form.severity} onChange={(e) => patch({ severity: Number(e.target.value) })} />
                  </div>
                </div>
              </>
            )}
            {step === 4 && (
              <div className="space-y-2 text-sm">
                <p>
                  <strong>{form.title}</strong>
                </p>
                <p>{form.description}</p>
                <p>
                  {form.district} · {form.block_or_ward} · urgency {form.urgency}/5 · ~{form.population_estimate} people
                </p>
                <p className="text-muted-foreground">{form.impact_description}</p>
                {file && <p>Attachment: {file.name}</p>}
                <p className="text-ai">After submit, Demo AI Mode will classify and search related reports. A government officer must still validate.</p>
              </div>
            )}
            {error && <PageError message={error} />}
            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
              {step < 4 ? (
                <Button type="button" disabled={!valid} onClick={() => setStep((s) => s + 1)}>
                  Continue
                </Button>
              ) : (
                <Button type="submit" disabled={busy}>
                  {busy ? "Submitting…" : "Submit for analysis"}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
