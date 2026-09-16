"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

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

const ACCENT = "#4338ca";
const NAVY = "#17171a";
const MUTED = "#73737b";
const LINE = "#e7e3da";
const OK = "#15803d";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: NAVY,
  },
  header: {
    backgroundColor: NAVY,
    padding: 30,
    marginBottom: 30,
    borderRadius: 4,
  },
  headerTitle: {
    color: "white",
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  headerSubtitle: {
    color: "#9a9aa1",
    fontSize: 10,
  },
  headerConfidential: {
    color: ACCENT,
    fontSize: 9,
    marginTop: 8,
    fontFamily: "Helvetica-Bold",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingBottom: 4,
  },
  label: {
    fontSize: 9,
    color: MUTED,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  value: {
    fontSize: 11,
    color: NAVY,
    marginBottom: 6,
  },
  scoreHero: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 4,
  },
  scoreNumber: {
    fontSize: 36,
    fontFamily: "Helvetica-Bold",
    color: ACCENT,
    marginRight: 12,
  },
  scoreMeta: {
    flex: 1,
  },
  scoreGrade: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
  },
  scoreLabel: {
    fontSize: 9,
    color: MUTED,
    marginTop: 2,
  },
  competencyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  competencyName: {
    width: 120,
    fontSize: 10,
    color: NAVY,
  },
  competencyBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: LINE,
    borderRadius: 4,
    marginRight: 8,
  },
  competencyBarFill: {
    height: 8,
    backgroundColor: ACCENT,
    borderRadius: 4,
  },
  competencyScore: {
    width: 30,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    textAlign: "right",
  },
  bullet: {
    flexDirection: "row",
    marginBottom: 4,
  },
  bulletDot: {
    width: 8,
    fontSize: 10,
    color: ACCENT,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    color: NAVY,
    lineHeight: 1.4,
  },
  transcriptTurn: {
    marginBottom: 8,
  },
  transcriptRole: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  transcriptText: {
    fontSize: 10,
    color: NAVY,
    lineHeight: 1.4,
  },
  proctorEvent: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 6,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 2,
    marginBottom: 4,
  },
  proctorType: {
    fontSize: 10,
    color: NAVY,
  },
  proctorTime: {
    fontSize: 9,
    color: MUTED,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: MUTED,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 10,
  },
});

function scoreGrade(score: number): string {
  if (score >= 4.5) return "A+";
  if (score >= 4.0) return "A";
  if (score >= 3.5) return "B+";
  if (score >= 3.0) return "B";
  if (score >= 2.5) return "C+";
  if (score >= 2.0) return "C";
  return "D";
}

function recommendationLabel(score: number): string {
  if (score >= 4.0) return "Strong Yes";
  if (score >= 3.0) return "Yes";
  if (score >= 2.0) return "Maybe";
  return "No";
}

const EVENT_LABELS: Record<string, string> = {
  tab_switch: "Tab switch detected",
  no_face_visible: "Face not visible",
  multiple_faces: "Multiple people detected",
  copy_paste: "Copy-paste attempt",
  screen_share_attempt: "Screen sharing blocked",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function ScorecardPDF({ data }: { data: ReportData }) {
  const { candidate, job, scorecard, transcript, proctorEvents } = data;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Interview Report</Text>
          <Text style={styles.headerSubtitle}>
            {job.title} · {formatDate(candidate.interviewDate)}
          </Text>
          <Text style={styles.headerConfidential}>CONFIDENTIAL — For internal use only</Text>
        </View>

        {/* Candidate Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Candidate Information</Text>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{candidate.name}</Text>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{candidate.email}</Text>
          <Text style={styles.label}>Position</Text>
          <Text style={styles.value}>{job.title}</Text>
          <Text style={styles.label}>Interview Date</Text>
          <Text style={styles.value}>{formatDate(candidate.interviewDate)}</Text>
        </View>

        {/* Overall Score */}
        {scorecard && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Overall Score</Text>
            <View style={styles.scoreHero}>
              <Text style={styles.scoreNumber}>{scorecard.overall_score.toFixed(1)}</Text>
              <View style={styles.scoreMeta}>
                <Text style={styles.scoreGrade}>{scoreGrade(scorecard.overall_score)}</Text>
                <Text style={styles.scoreLabel}>
                  {recommendationLabel(scorecard.overall_score)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Competency Breakdown */}
        {scorecard && scorecard.competency_scores.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Competency Breakdown</Text>
            {scorecard.competency_scores.map((c, i) => (
              <View key={i} style={styles.competencyRow}>
                <Text style={styles.competencyName}>{c.competency}</Text>
                <View style={styles.competencyBarBg}>
                  <View
                    style={[
                      styles.competencyBarFill,
                      { width: `${(c.score / 5) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.competencyScore}>{c.score.toFixed(1)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* AI Summary */}
        {scorecard && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI Assessment</Text>
            <Text style={styles.value}>{scorecard.summary}</Text>
          </View>
        )}

        {/* Strengths */}
        {scorecard && scorecard.strengths.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Strengths</Text>
            {scorecard.strengths.map((s, i) => (
              <View key={i} style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{s}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Areas for Improvement */}
        {scorecard && scorecard.weaknesses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Areas for Improvement</Text>
            {scorecard.weaknesses.map((w, i) => (
              <View key={i} style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{w}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Proctoring Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Proctoring Summary</Text>
          {proctorEvents.length === 0 ? (
            <Text style={styles.value}>No issues detected</Text>
          ) : (
            proctorEvents.map((e, i) => (
              <View key={i} style={styles.proctorEvent}>
                <Text style={styles.proctorType}>
                  {EVENT_LABELS[e.event_type] ?? e.event_type}
                </Text>
                <Text style={styles.proctorTime}>
                  Warning {e.warning_number} · {e.severity}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Generated by HireAI · Confidential — for internal use only
        </Text>
      </Page>
    </Document>
  );
}
