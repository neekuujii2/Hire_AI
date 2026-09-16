import { TalentSearch } from "@/components/dashboard/talent-search";

export default function TalentPoolPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Talent Pool</h1>
        <p className="mt-1 text-[13px] text-muted">
          Search and filter pre-vetted candidates across all your jobs.
        </p>
      </div>
      <TalentSearch />
    </div>
  );
}
