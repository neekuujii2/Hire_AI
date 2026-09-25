import { Html, Head, Preview, Body, Container, Text, Img, Link, Section, Heading } from "@react-email/components";
import * as React from "react";

/**
 * Utility to include the company logo and footer in every email.
 */
export const EmailLayout = ({
  logoUrl,
  children,
}: {
  logoUrl: string;
  children: React.ReactNode;
}) => (
  <Html>
    <Head />
    <Preview>{"HireAI Notification"}</Preview>
    <Body style={styles.body}>
      <Container style={styles.container}>
        {logoUrl && (
          <Img src={logoUrl} alt="Company Logo" width="120" style={styles.logo} />
        )}
        {children}
        <Section style={styles.footer}>
          <Text style={styles.footerText}>Powered by HireAI</Text>
          <Link href="{{unsubscribe_url}}" style={styles.unsubscribe}>
            Unsubscribe
          </Link>
        </Section>
      </Container>
    </Body>
  </Html>
);

/**
 * Templates for the HireAI application pipeline.
 */
export const templates = {
  APPLICATION_RECEIVED: ({ jobTitle, company, unsubscribeUrl }: any) => (
    <EmailLayout logoUrl="{{logo_url}}">
      <Section style={styles.section}>
        <Heading style={styles.h1}>We received your application — {jobTitle} at {company}</Heading>
        <Text style={styles.p}>Thank you for applying! Here’s what happens next:</Text>
        <ol style={styles.ol}>
          <li>Our AI will review your resume (usually within 1 hour).</li>
          <li>If shortlisted, you’ll receive an interview link.</li>
          <li>Our team will review the interview results and get back to you.</li>
        </ol>
        <Text style={styles.p}>We’ll keep you updated via email.</Text>
      </Section>
    </EmailLayout>
  ),

  INTERVIEW_INVITE: ({ jobTitle, interviewLink, expiryHours }: any) => (
    <EmailLayout logoUrl="{{logo_url}}">
      <Section style={styles.section}>
        <Heading style={styles.h1}>You\'ve been selected for an AI interview — {jobTitle}</Heading>
        <Text style={styles.p}>Congratulations! Click the button below to start your interview.</Text>
        <Link
          href={interviewLink}
          style={styles.button}
        >
          Start Interview
        </Link>
        <Text style={styles.small}>This link expires in {expiryHours} hours.</Text>
        <Text style={styles.p}>Tips: Find a quiet space, ensure a stable internet connection.</Text>
      </Section>
    </EmailLayout>
  ),

  INTERVIEW_REMINDER: ({ interviewLink }: any) => (
    <EmailLayout logoUrl="{{logo_url}}">
      <Section style={styles.section}>
        <Heading style={styles.h1}>Reminder: Your interview link expires in 24 hours</Heading>
        <Link href={interviewLink} style={styles.button}>
          Continue Interview
        </Link>
      </Section>
    </EmailLayout>
  ),

  APPLICATION_REJECTED: ({ company }: any) => (
    <EmailLayout logoUrl="{{logo_url}}">
      <Section style={styles.section}>
        <Heading style={styles.h1}>Update on your application — {company}</Heading>
        <Text style={styles.p}>Thank you for your interest. We have decided to move forward with other candidates.</Text>
        <Text style={styles.p}>We encourage you to apply for future openings that match your profile.</Text>
      </Section>
    </EmailLayout>
  ),

  APPLICATION_SHORTLISTED: ({ company }: any) => (
    <EmailLayout logoUrl="{{logo_url}}">
      <Section style={styles.section}>
        <Heading style={styles.h1}>Great news — you\'ve been shortlisted! {company}</Heading>
        <Text style={styles.p}>Our HR team will reach out shortly with next steps.</Text>
      </Section>
    </EmailLayout>
  ),

  HR_NEW_APPLICATION: ({ name, jobTitle, email, aiScore }: any) => (
    <EmailLayout logoUrl="{{logo_url}}">
      <Section style={styles.section}>
        <Heading style={styles.h1}>New application: {name} for {jobTitle}</Heading>
        <Text style={styles.p}>Email: {email}</Text>
        <Text style={styles.p}>AI Score: {aiScore ?? "N/A"}</Text>
        <Link href="{{profile_url}}" style={styles.button}>View Profile</Link>
      </Section>
    </EmailLayout>
  ),

  HR_INTERVIEW_COMPLETE: ({ name, jobTitle, score, recommendation }: any) => (
    <EmailLayout logoUrl="{{logo_url}}">
      <Section style={styles.section}>
        <Heading style={styles.h1}>{name} completed their AI interview — Score: {score}/100</Heading>
        <Text style={styles.p}>Recommendation: {recommendation}</Text>
        <Link href="{{scorecard_url}}" style={styles.button}>View Scorecard</Link>
      </Section>
    </EmailLayout>
  ),
};

/** Simple inline styles for responsiveness */
const styles: any = {
  body: {
    fontFamily: "Helvetica, Arial, sans-serif",
    backgroundColor: "#f9f9f9",
    margin: 0,
    padding: 0,
  },
  container: {
    backgroundColor: "#ffffff",
    margin: "40px auto",
    padding: "20px",
    maxWidth: "600px",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  logo: { display: "block", margin: "0 auto 20px" },
  section: { marginBottom: "20px" },
  h1: { fontSize: "20px", marginBottom: "10px" },
  p: { fontSize: "14px", lineHeight: "1.5", marginBottom: "10px" },
  button: {
    display: "inline-block",
    padding: "10px 20px",
    backgroundColor: "#1a73e8",
    color: "#ffffff",
    textDecoration: "none",
    borderRadius: "4px",
    marginTop: "10px",
  },
  small: { fontSize: "12px", color: "#555" },
  ol: { paddingLeft: "20px", marginBottom: "10px" },
  footer: { borderTop: "1px solid #eaeaea", paddingTop: "10px", textAlign: "center" },
  footerText: { fontSize: "12px", color: "#777" },
  unsubscribe: { fontSize: "12px", color: "#777", textDecoration: "underline" },
};

export default templates;