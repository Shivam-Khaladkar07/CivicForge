import { CheckCircle2, Circle, Clock3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageError, PageLoading } from "@/components/PageState";

export interface TrackingStep {
  key: string;
  label: string;
  done?: boolean;
  current?: boolean;
  status?: "complete" | "current" | "upcoming";
  detail?: string;
  timestamp?: string | null;
}

export function TrackingTimeline({ steps, loading, error }: { steps: TrackingStep[]; loading?: boolean; error?: string }) {
  if (loading) return <PageLoading label="Loading journey status…" />;
  if (error) return <PageError message={error} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Journey tracking</CardTitle>
        <CardDescription>Live status generated from saved CivicForge records and human decisions.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-1" aria-label="CivicForge journey status">
          {steps.map((step, index) => {
            const complete = step.done || step.status === "complete";
            const current = step.current || step.status === "current";
            const Icon = complete ? CheckCircle2 : current ? Clock3 : Circle;
            return (
              <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
                {index < steps.length - 1 && <span className="absolute left-[9px] top-5 h-full w-px bg-border" aria-hidden />}
                <Icon className={`relative z-10 mt-0.5 h-5 w-5 shrink-0 bg-card ${complete ? "text-success" : current ? "text-warning" : "text-muted-foreground"}`} />
                <div>
                  <p className={`text-sm font-medium ${current ? "text-primary" : ""}`}>{step.label}</p>
                  {(step.detail || step.timestamp) && (
                    <p className="text-xs text-muted-foreground">
                      {step.detail}{step.detail && step.timestamp ? " · " : ""}{step.timestamp ? new Date(step.timestamp).toLocaleString() : ""}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
