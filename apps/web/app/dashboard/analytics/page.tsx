import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="mt-1 text-[13px] text-muted">
          Interview performance metrics and hiring insights.
        </p>
      </div>
      <AnalyticsDashboard />
    </div>
  );
}
