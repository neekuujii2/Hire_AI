"use client";

import { pdf } from "@react-pdf/renderer";
import { ScorecardPDF } from "./scorecard-pdf";

interface ReportData {
  candidate: {
    name: string;
    email: string;
    interviewDate: string;
  };
  job: { title: string };
  scorecard: {
    overall_score: number;
    competency_scores: Array<{
      competency: string;
      score: number;
      evidence: string;
      level: string;
    }>;
    strengths: string[];
    weaknesses: string[];
    summary: string;
  } | null;
  transcript: Array<{ role: string; text: string }>;
  proctorEvents: Array<{
    event_type: string;
    warning_number: number;
    severity: string;
    occurred_at: string;
  }>;
}

export async function generateScorecardPDF(data: ReportData): Promise<Blob> {
  const doc = <ScorecardPDF data={data} />;
  return pdf(doc).toBlob();
}
