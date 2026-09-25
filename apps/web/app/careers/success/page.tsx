import { getJobById } from "@/lib/careers";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

export default async function ApplicationSuccessPage({
  searchParams,
}: {
  searchParams: { jobId?: string; name?: string };
}) {
  const jobId = searchParams.jobId;
  const name = searchParams.name || "there";
  if (!jobId) notFound();

  const job = await getJobById(jobId);
  if (!job) notFound();

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
      </div>

      <h1 className="text-3xl font-bold tracking-tight mb-2">
        Application Submitted!
      </h1>
      <p className="text-gray-600 mb-8">
        Hi {name}, your application for <strong>{job.title}</strong> at{" "}
        <strong>{job.organizations.name}</strong> has been received.
      </p>

      <div className="text-left bg-gray-50 rounded-lg p-6 mb-8">
        <h2 className="font-semibold mb-4">What happens next</h2>
        <ol className="space-y-3 text-gray-700">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-sm flex items-center justify-center">
              1
            </span>
            Our AI will review your resume (usually within 1 hour)
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-sm flex items-center justify-center">
              2
            </span>
            If shortlisted, you'll receive an email with your interview link
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-sm flex items-center justify-center">
              3
            </span>
            Complete your AI interview at your own pace
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-sm flex items-center justify-center">
              4
            </span>
            Our team reviews results and gets back to you
          </li>
        </ol>
      </div>

      <p className="text-sm text-gray-500 mb-8">
        Questions? Contact {job.organizations.email || "our hiring team"}
      </p>

      <Link
        href="/careers"
        className="inline-block bg-black text-white px-6 py-2 rounded-md font-medium hover:bg-gray-800 transition-colors"
      >
        View All Open Roles
      </Link>
    </div>
  );
}