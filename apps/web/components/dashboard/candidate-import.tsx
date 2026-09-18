"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";
import { useCsvImport } from "@/hooks/use-csv-import";

interface CandidateImportProps {
  jobId: string;
  onImportComplete?: () => void;
}

export function CandidateImport({ jobId, onImportComplete }: CandidateImportProps) {
  const { csvText, setCsvText, parsed, parse, importCandidates, result, loading } =
    useCsvImport(jobId);
  const [showPreview, setShowPreview] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText((event.target?.result as string) || "");
    };
    reader.readAsText(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Bulk Import Candidates
        </CardTitle>
        <CardDescription>
          Import candidates from a CSV file. Required columns: name, email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Upload CSV File</label>
          <input
            type="file"
            accept=".csv,.txt"
            onChange={handleFileUpload}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-accent/10 file:text-accent hover:file:bg-accent/20"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Or Paste CSV Data</label>
          <Textarea
            placeholder={"name,email\nJohn Doe,john@example.com\nJane Smith,jane@example.com"}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={6}
          />
        </div>

        <div className="flex gap-2">
          <Button variant="out" onClick={parse} disabled={!csvText.trim()}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Parse
          </Button>
          {parsed.length > 0 && (
            <Button
              onClick={async () => {
                await importCandidates();
                onImportComplete?.();
              }}
              disabled={loading}
            >
              {loading ? "Importing..." : `Import ${parsed.length} Candidates`}
            </Button>
          )}
        </div>

        {parsed.length > 0 && !result && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-sm font-medium">Preview: {parsed.length} candidates ready</p>
            <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
              {parsed.slice(0, 5).map((c, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {c.name} — {c.email}
                </p>
              ))}
              {parsed.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  ...and {parsed.length - 5} more
                </p>
              )}
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-ok" />
              <span className="text-sm">
                <strong>{result.imported}</strong> candidates imported successfully
              </span>
            </div>
            {result.skipped > 0 && (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {result.skipped} already exist (skipped)
                </span>
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {result.errors.map((e, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {e.email}: {e.error}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
