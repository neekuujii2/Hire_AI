"use client";

import { useEffect, useState } from "react";
import { Bar, Line, Doughnut, HorizontalBar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement);

interface AnalyticsData {
  kpis: {
    total_applications: number;
    interviews_completed: number;
    avg_score: number;
    avg_time_to_hire: number;
  };
  funnel: { stage: string; count: number }[];
  applications_over_time: { applied_at: string }[];
  score_distribution: { bucket: string; count: number }[];
  jobs_performance: { job_id: string; title: string; total_applications: number; total_hired: number }[];
  source_breakdown: { source: string; count: number; percentage: number }[];
}

export default function AnalyticsPage() {
  const [range, setRange] = useState("30d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/analytics?range=${range}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [range]);

  if (loading || !data) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Hiring Analytics</h1>
        <div className="flex gap-2">
          {["30d", "90d", "12m"].map(r => (
            <Button
              key={r}
              variant={range === r ? "default" : "outline"}
              size="sm"
              onClick={() => setRange(r)}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Applications" value={data.kpis.total_applications} />
        <KpiCard title="AI Interviews Completed" value={data.kpis.interviews_completed} />
        <KpiCard title="Average AI Score" value={data.kpis.avg_score} suffix="/100" />
        <KpiCard title="Avg Time to Hire" value={data.kpis.avg_time_to_hire} suffix=" days" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Hiring Funnel</CardTitle></CardHeader>
          <CardContent>
            <HorizontalBar
              data={{
                labels: data.funnel.map(f => f.stage),
                datasets: [{
                  label: "Candidates",
                  data: data.funnel.map(f => f.count),
                  backgroundColor: data.funnel.map((_, i) =>
                    ["#3b82f6", "#60a5fa", "#93c5fd", "#fbbf24", "#34d399", "#10b981"][i % 6]
                  ),
                }],
              }}
              options={{ indexAxis: "h" as const, responsive: true }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>AI Score Distribution</CardTitle></CardHeader>
          <CardContent>
            <Bar
              data={{
                labels: data.score_distribution.map(s => s.bucket),
                datasets: [{
                  data: data.score_distribution.map(s => s.count),
                  backgroundColor: data.score_distribution.map(s =>
                    parseInt(s.bucket) < 50 ? "#ef4444" :
                    parseInt(s.bucket) < 70 ? "#f59e0b" : "#22c55e"
                  ),
                }],
              }}
              options={{ responsive: true }}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Applications Over Time</CardTitle></CardHeader>
          <CardContent>
            <Line
              data={{
                labels: data.applications_over_time.map((_, i) => `Day ${i}`),
                datasets: [{
                  label: "Applications",
                  data: data.applications_over_time.map(() => 1),
                  borderColor: "#3b82f6",
                  tension: 0.4,
                }],
              }}
              options={{ responsive: true }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Candidate Sources</CardTitle></CardHeader>
          <CardContent>
            <Doughnut
              data={{
                labels: data.source_breakdown.map(s => s.source),
                datasets: [{
                  data: data.source_breakdown.map(s => s.count),
                  backgroundColor: ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"],
                }],
              }}
              options={{ responsive: true }}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Jobs Performance</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Job Title</th>
                  <th className="text-left p-2">Applications</th>
                  <th className="text-left p-2">Avg AI Score</th>
                  <th className="text-left p-2">Shortlisted</th>
                  <th className="text-left p-2">Hired</th>
                  <th className="text-left p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs_performance.map(job => (
                  <tr key={job.job_id} className="border-b hover:bg-muted/50">
                    <td className="p-2">{job.title}</td>
                    <td className="p-2">{job.total_applications}</td>
                    <td className="p-2">—</td>
                    <td className="p-2">—</td>
                    <td className="p-2">{job.total_hired}</td>
                    <td className="p-2">
                      <Badge variant="secondary">Active</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ title, value, suffix = "" }: { title: string; value: number; suffix?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{value}{suffix}</p>
      </CardContent>
    </Card>
  );
}