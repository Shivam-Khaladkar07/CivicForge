import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/form";
import { PageEmpty, PageError, PageLoading } from "@/components/PageState";

type PublicChallenge = { id: string; title: string; district: string; status: string; category_name: string; description?: string };

export function AboutPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-14 space-y-6">
      <p className="text-sm font-semibold text-secondary">CivicForge — Jharkhand</p>
      <h1 className="text-3xl font-semibold text-primary">Every validated societal challenge deserves a pathway to a solution.</h1>
      <p className="max-w-3xl leading-relaxed text-muted-foreground">
        CivicForge is a government, university, and industry collaboration platform. It turns community-reported problems into human-validated innovation projects with transparent AI decision support, accountable approvals, and separately reported predicted and verified impact.
      </p>
      <Card>
        <CardContent className="pt-5 text-sm leading-7">
          Citizen → AI intelligence → human validation → systemic cluster → university match → team → industry offer → prototype → pilot → deployment → impact.
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Demo Environment: public records are synthetic prototype data, never official government statistics.</p>
    </main>
  );
}

export function PublicChallengesPage() {
  const [rows, setRows] = useState<PublicChallenge[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ data: PublicChallenge[] }>("/api/public/challenges").then((r) => setRows(r.data)).catch((e) => setError(e.message));
  }, []);
  if (error) return <main className="mx-auto max-w-5xl px-4 py-10"><PageError message={error} /></main>;
  if (!rows) return <main className="mx-auto max-w-5xl px-4 py-10"><PageLoading label="Loading public innovation register…" /></main>;
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 space-y-4">
      <div><h1 className="text-3xl font-semibold text-primary">Public innovation register</h1><p className="text-sm text-muted-foreground">Validated, non-sensitive demo challenges only.</p></div>
      {rows.length === 0 ? <PageEmpty title="No public challenges yet" body="Validated non-sensitive challenges will appear here." /> : rows.map((c) => (
        <Link key={c.id} to={`/challenge/${c.id}`}><Card className="mb-3 hover:border-secondary/40"><CardHeader><div className="flex justify-between gap-3"><CardTitle>{c.title}</CardTitle><Badge variant="success">validated</Badge></div><CardDescription>{c.district} · {c.category_name}</CardDescription></CardHeader></Card></Link>
      ))}
    </main>
  );
}

export function PublicChallengePage() {
  const { id } = useParams();
  const [data, setData] = useState<PublicChallenge | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<{ challenge: PublicChallenge }>(`/api/public/challenges/${id}`).then((r) => setData(r.challenge)).catch((e) => setError(e.message)); }, [id]);
  if (error) return <main className="mx-auto max-w-3xl px-4 py-10"><PageError message={error} /></main>;
  if (!data) return <main className="mx-auto max-w-3xl px-4 py-10"><PageLoading /></main>;
  return <main className="mx-auto max-w-3xl px-4 py-10 space-y-4"><Link className="text-sm underline" to="/challenges">Back to register</Link><h1 className="text-3xl font-semibold text-primary">{data.title}</h1><p className="text-sm text-muted-foreground">{data.district} · {data.category_name} · DEMO / SYNTHETIC DATA</p><Card><CardContent className="pt-5 leading-7">{data.description}</CardContent></Card></main>;
}
