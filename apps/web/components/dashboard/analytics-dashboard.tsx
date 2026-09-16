"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Users, Clock, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/cn";

interface AnalyticsData {
  totalInterviews: number;
  completedInterviews: number;
  avgScore: number;
  avgMatchScore: number;
  completionRate: number;
  hireRate: number;
  proctorAlertRate: number;
  avgDurationMin: number;
  scoreDistribution: Array<{ range: string; count: number }>;
  topSkills: Array<{ name: string; avgScore: number; count: number }>;
  recentTrend: Array<{ date: string; count: number; avgScore: number }>;
  recommendationBreakdown: Record<string, number>;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color = "text-ink",
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft">
            <Icon className={cn("h-5 w-5", color)} />
          </div>
          <div>
            <p className="text-[12px] text-muted">{label}</p>
            <p className={cn("text-[20px] font-semibold", color)}>{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BarChartSimple({
  data,
  labelKey,
  valueKey,
  maxValue,
}: {
  data: Array<Record<string, any>>;
  labelKey: string;
  valueKey: string;
  maxValue?: number;
}) {
  const max = maxValue || Math.max(...data.map((d) => d[valueKey]), 1);

  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <p className="w-24 text-[11px] text-muted truncate">{d[labelKey]}</p>
          <div className="flex-1 h-4 rounded bg-line overflow-hidden">
            <div
              className="h-full rounded bg-accent"
              style={{ width: `${(d[valueKey] / max) * 100}%` }}
            />
          </div>
          <span className="w-8 text-[11px] text-right text-ink">{d[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/analytics");
      const json = await res.json();
      if (json.ok) setData(json.data);
    } catch {
      // Error handled silently.
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (!data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-16 animate-pulse rounded bg-line" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Interviews" value={data.totalInterviews} icon={Users} />
        <StatCard label="Avg Match Score" value={`${data.avgMatchScore.toFixed(0)}/100`} icon={TrendingUp} color="text-ok" />
        <StatCard label="Completion Rate" value={`${data.completionRate.toFixed(0)}%`} icon={CheckCircle} color="text-ok" />
        <StatCard label="Proctor Alerts" value={`${data.proctorAlertRate.toFixed(1)}%`} icon={AlertTriangle} color="text-accent" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[14px]">Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartSimple data={data.scoreDistribution} labelKey="range" valueKey="count" />
          </CardContent>
        </Card>

        {/* Recommendation Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[14px]">Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(data.recommendationBreakdown).map(([key, count]) => {
                const labels: Record<string, string> = {
                  strong_hire: "Strong Hire",
                  hire: "Hire",
                  maybe: "Maybe",
                  no_hire: "No Hire",
                  strong_no_hire: "Strong No Hire",
                };
                const colors: Record<string, string> = {
                  strong_hire: "bg-ok",
                  hire: "bg-ok/60",
                  maybe: "bg-accent",
                  no_hire: "bg-muted",
                  strong_no_hire: "bg-accent/60",
                };
                const total = Object.values(data.recommendationBreakdown).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? (count / total) * 100 : 0;

                return (
                  <div key={key} className="flex items-center gap-3">
                    <Badge variant="outline" className="w-24 text-[10px] justify-center">
                      {labels[key] ?? key}
                    </Badge>
                    <div className="flex-1 h-3 rounded bg-line overflow-hidden">
                      <div
                        className={cn("h-full rounded", colors[key] ?? "bg-line")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-12 text-[12px] text-right text-ink">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Top Skills */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[14px]">Top Skills Assessed</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartSimple
              data={data.topSkills.slice(0, 8)}
              labelKey="name"
              valueKey="avgScore"
              maxValue={5}
            />
          </CardContent>
        </Card>

        {/* Recent Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[14px]">Interview Trend (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartSimple data={data.recentTrend} labelKey="date" valueKey="count" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
