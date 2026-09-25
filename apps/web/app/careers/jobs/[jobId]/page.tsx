import { getJobById } from "@/lib/careers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default async function JobDetailPage({
  params,
}: {
  params: { jobId: string };
}) {
  const job = await getJobById(params.jobId);
  if (!job) notFound();

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Link href="/careers" className="text-sm text-gray-500 hover:underline mb-8 block">
        ← All Jobs
      </Link>
      
      <h1 className="text-4xl font-bold tracking-tight mb-6">{job.title}</h1>
      
      <div className="flex flex-wrap gap-3 mb-8">
        <Badge variant="secondary">{job.department}</Badge>
        <Badge variant="secondary">{job.seniority_level}</Badge>
        <Badge variant="secondary">{job.location_type}</Badge>
      </div>

      {job.salary_visible && (
        <p className="font-medium mb-6">
          {job.salary_min} – {job.salary_max} {job.salary_currency} / year
        </p>
      )}

      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-3">About the role</h2>
          <div className="text-gray-700 whitespace-pre-line">{job.job_description}</div>
        </section>

        {job.responsibilities && (
          <section>
            <h2 className="text-xl font-semibold mb-3">Responsibilities</h2>
            <div className="text-gray-700 whitespace-pre-line">{job.responsibilities}</div>
          </section>
        )}

        {job.requirements && (
          <section>
            <h2 className="text-xl font-semibold mb-3">Requirements</h2>
            <div className="text-gray-700 whitespace-pre-line">{job.requirements}</div>
          </section>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white border-t flex justify-between items-center md:static md:border-none md:p-0 md:mt-12">
        <div className="hidden md:block">
          <p className="font-medium">{job.title}</p>
          <p className="text-sm text-gray-500">{job.organizations.name}</p>
        </div>
        <Link 
          href={`/careers/apply/${job.id}`}
          className="bg-black text-white px-6 py-2 rounded-md font-medium hover:bg-gray-800 transition-colors"
        >
          Apply Now →
        </Link>
      </div>
    </div>
  );
}
