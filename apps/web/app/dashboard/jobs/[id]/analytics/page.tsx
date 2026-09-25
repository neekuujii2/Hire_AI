"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { Bar, Line, HorizontalBar } from "react-chartjs-2";
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
import Link from "next/link";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement);

interface JobAnalyticsData {
  job: {
    id: string;
    title: string;
    department: string;
    status: string;
    daysSincePosted: number;
    total_applications: number;
    total_hired: number;
  };
  funnel: { stage: string; count: number }[];
  leaderboard: { name: string; email: string; score: number; status: string; applied_at: string }[];
  timeline: { date: string; count: number }[];
  screening_insights: {
    common_matched_skills: { skill: string; count: number }[];
    common_missing_skills: { skill: string; count: number }[];
  };
  interview_completion: { invited: number; completed: number; rate: number };
}

export default function JobAnalyticsPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<JobAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/jobs/${params.id}/analytics`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading || !data) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link href="/dashboard/analytics" className="text-sm text-muted-foreground hover:underline">
          ← Back to Analytics
        </Link>
        <h1 className="text-2xl font-bold mt-2">{data.job.title}</h1>
        <div className="flex gap-2 mt-2">
          <Badge variant="secondary">{data.job.department}</Badge>
          <Badge variant="outline">{data.job.status}</Badge>
          <span className="text-sm text-muted-foreground">
            Posted {data.job.daysSincePosted} days ago
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Applications</p>
            <p className="text-2xl font-bold">{data.job.total_applications}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Interview Completion</p>
            <p className="text-2xl font-bold">{data.interview_completion.rate}%</p>
            <p className="text-xs text-muted-foreground">
              {data.interview_completion.completed} of {data.interview_completion.invited} invited
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Hired</p>
            <p className="text-2xl font-bold">{data.job.total_hired}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Funnel</CardTitle></CardHeader>
          <CardContent>
            <HorizontalBar
              data={{
                labels: data.funnel.map(f => f.stage),
                datasets: [{
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
          <CardHeader><CardTitle>Applications Over Time</CardTitle></CardHeader>
          <CardContent>
            <Line
              data={{
                labels: data.timeline.map(t => t.date),
                datasets: [{
                  label: "Applications",
                  data: data.timeline.map(t => t.count),
                  borderColor: "#3b82f6",
                  backgroundColor: "rgba(59,130,246,0.1)",
                  fill: true,
                  tension: 0.4,
                }],
              }}
              options={{ responsive: true }}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Score Leaderboard</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Score</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Applied</th>
                  <th className="text-left p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboard.map((c, i) => (
                  <tr key={i} className="border-b hover:bg-muted/50">
                    <td className="p-2">{c.name}</td>
                    <td className="p-2">
                      <Badge variant={c.score >= 70 ? "default" : c.score >= 50 ? "secondary" : "destructive"}>
                        {c.score}
                      </Badge>
                    </td>
                    <td className="p-2">{c.status}</td>
                    <td className="p-2">{new Date(c.applied_at).toLocaleDateString()}</td>
                    <td className="p-2">
                      <Button variant="ghost" size="sm">View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Common Matched Skills</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.screening_insights.common_matched_skills.map(s => (
                <Badge key={s.skill} variant="default">{s.skill} ({s.count})</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Common Missing Skills</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.screening_insights.common_missing_skills.map(s => (
                <Badge key={s.skill} variant="outline">{s.skill} ({s.count})</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}