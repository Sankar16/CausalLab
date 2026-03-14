"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";

type UploadResponse = {
  file_id: string;
  filename?: string;
  row_count?: number;
  column_count?: number;
};

const SAMPLE_DATASETS = [
    {
      title: "Clean A/B Test",
      filename: "clean_ab_data.csv",
      description:
        "A clean two-group experiment for the standard happy-path demo.",
    },
    {
      title: "Messy A/B Test",
      filename: "messy_ab_test_dataset.csv",
      description:
        "Includes duplicates, missing values, and messy labels to demonstrate Data Readiness and Safe Fixes.",
    },
    {
      title: "Flawed Experiment",
      filename: "flawed_ab_data.csv",
      description:
        "A problematic experiment designed to surface trust risks and diagnostic warnings.",
    },
    {
      title: "Marketing Experiment",
      filename: "marketing_AB.csv",
      description:
        "A realistic business-facing A/B test example for conversion and reporting workflows.",
    },
    {
      title: "Core A/B Dataset",
      filename: "ab_data.csv",
      description:
        "A standard A/B dataset for significance testing and baseline experiment analysis.",
    },
  ];

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sampleLoading, setSampleLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const uploadFileToBackend = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_BASE_URL}/upload/`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let message = "Upload failed.";
      try {
        const err = await response.json();
        message = err.detail || message;
      } catch {
        // ignore JSON parse failure
      }
      throw new Error(message);
    }

    const data: UploadResponse = await response.json();
    if (!data.file_id) {
      throw new Error("Upload succeeded but file_id was missing.");
    }

    router.push(`/map-columns?file_id=${encodeURIComponent(data.file_id)}`);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleManualUpload = async () => {
    if (!selectedFile) {
      setError("Please choose a CSV file first.");
      return;
    }

    try {
      setUploading(true);
      setError("");
      await uploadFileToBackend(selectedFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong during upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleLoadSample = async (filename: string) => {
    try {
      setSampleLoading(filename);
      setError("");

      const response = await fetch(`/sample-datasets/${filename}`);
      if (!response.ok) {
        throw new Error(`Could not load sample dataset: ${filename}`);
      }

      const blob = await response.blob();
      const file = new File([blob], filename, { type: "text/csv" });

      await uploadFileToBackend(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong loading the sample dataset.");
    } finally {
      setSampleLoading(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">Upload Dataset</h1>
        <p className="mt-2 text-slate-600">
          Upload a CSV file to preview schema details and basic data quality information.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Upload Your CSV</h2>

          <div className="mt-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="block w-full rounded-lg border border-slate-300 bg-white p-3"
            />
          </div>

          {selectedFile && (
            <div className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
              <span className="font-medium">Selected file:</span> {selectedFile.name}
            </div>
          )}

          <button
            onClick={handleManualUpload}
            disabled={uploading}
            className="mt-4 rounded-xl bg-slate-900 px-5 py-3 text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {uploading ? "Uploading..." : "Upload and Profile"}
          </button>
        </div>

        <div className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-blue-900">Try a Sample Dataset</h2>
          <p className="mt-2 text-blue-800">
            Use one of these built-in datasets to explore CausalLab without preparing your own file.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {SAMPLE_DATASETS.map((sample) => (
              <div key={sample.filename} className="rounded-xl bg-white p-4 shadow-sm">
                <h3 className="font-semibold">{sample.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{sample.description}</p>
                <button
                  onClick={() => handleLoadSample(sample.filename)}
                  disabled={sampleLoading !== null}
                  className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm text-white transition hover:bg-blue-600 disabled:opacity-60"
                >
                  {sampleLoading === sample.filename ? "Loading..." : "Load Sample"}
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}