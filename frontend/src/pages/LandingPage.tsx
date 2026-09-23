import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Landmark, University, Factory, Sparkles, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  ["Citizen report", "A resident files a societal challenge with place, severity, and evidence."],
  ["Demo AI analysis", "Keyword classification, summary, and embeddings. Labeled Demo AI Mode."],
  ["Human validation", "Panchayat/ULB officer accepts or rejects. AI never auto-validates."],
  ["Challenge cluster", "Related reports become one innovation brief."],
  ["University match", "Configurable scores recommend campuses; an officer approves assignment."],
  ["Team + industry", "Students, faculty, CSR, and startups collaborate."],
  ["Prototype → pilot", "Lab tests, field pilots, then a deployment playbook."],
  ["Measured impact", "Predicted and verified metrics are shown separately."],
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground text-xs px-4 py-2 text-center">
        Demo Environment — SIH 2026 prototype. Synthetic Jharkhand scenarios, not official records.
      </div>
      <header className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/civicforge-logo.png" alt="CivicForge logo" className="h-10 w-10 object-contain rounded-xl" />
          <div><p className="text-sm font-bold tracking-tight text-primary">CivicForge — Jharkhand</p>
          <p className="text-xs text-muted-foreground">Government of Jharkhand · SIH 2026 prototype</p></div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/register">Report a challenge</Link>
          </Button>
        </div>
      </header>
      <section className="hero-grid relative overflow-hidden max-w-6xl mx-auto my-4 rounded-3xl border border-border/60 bg-card/50 px-6 py-12 md:px-12 md:py-16 grid md:grid-cols-2 gap-10 items-center shadow-card">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-secondary/10 px-3 py-1.5 text-sm text-secondary font-semibold"><Sparkles className="h-4 w-4" /> From community problems to deployable solutions</p>
          <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight leading-[1.08] text-primary">
            Not a complaint portal. A path from validated problems to collaborative innovation.
          </h1>
          <p className="mt-4 text-muted-foreground">
            Citizens surface education, health, water, livelihoods, and infrastructure challenges. Universities and
            industry turn approved clusters into prototypes, pilots, and measured impact.
          </p>
          <div className="mt-6 flex gap-3">
            <Button asChild>
              <Link to="/login">
                Open the platform <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/login">Use a demo account</Link>
            </Button>
          </div>
        </div>
        <Card className="relative overflow-hidden border-border bg-card/90">
          <div className="h-1.5 bg-gradient-to-r from-primary via-[#C85C22] to-secondary" />
          <CardHeader>
            <CardTitle>Who the platform connects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-accent/60">
              <Landmark className="h-4 w-4 text-secondary mt-0.5" /> Citizens and panchayat/ULB officers (validate, cluster)
            </p>
            <p className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-accent/60">
              <University className="h-4 w-4 text-secondary mt-0.5" /> Universities, faculty mentors, student teams
            </p>
            <p className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-accent/60">
              <Factory className="h-4 w-4 text-secondary mt-0.5" /> Industry, startups, CSR funding and labs
            </p>
            <p className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-accent/60">
              <CheckCircle2 className="h-4 w-4 text-success mt-0.5" /> Human-in-the-loop for every high-impact decision
            </p>
          </CardContent>
        </Card>
      </section>
      <section className="max-w-6xl mx-auto px-4 pt-10 pb-16">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-secondary">A connected journey</p><h2 className="mt-1 text-2xl font-bold text-primary">From one report to real-world impact</h2></div><p className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4 text-secondary" /> Built for local action</p></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map(([t, d], i) => (
          <Card key={t} className="group transition-transform duration-200 hover:-translate-y-1">
            <CardHeader>
              <span className="mb-2 grid h-7 w-7 place-items-center rounded-lg bg-secondary/10 text-xs font-bold text-secondary">{String(i + 1).padStart(2, "0")}</span><CardTitle className="text-sm">{t}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{d}</CardContent>
          </Card>
        ))}</div>
      </section>
    </div>
  );
}
