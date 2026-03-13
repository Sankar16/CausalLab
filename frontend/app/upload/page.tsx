"use client";

import { ChangeEvent, useState } from "react";

type UploadResponse = {
  message: string;
  file_id: string;
  original_filename: string;
  profile: {
    row_count: number;
    column_count: number;
    columns: string[];
    dtypes: Record<string, string>;
    missing_counts: Record<string, number>;
    preview: Record<string, string | number | null>[];
  };
};

export default function UploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<UploadResponse | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setError("");
    setResult(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please select a CSV file first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      setLoading(true);
      setError("");
      setResult(null);

      const response = await fetch("http://127.0.0.1:8000/upload/", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Upload failed.");
      }

      const data: UploadResponse = await response.json();
      setResult(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong during upload.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const previewColumns = result?.profile.columns ?? [];
  const previewRows = result?.profile.preview ?? [];

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <a href="/" className="text-sm text-slate-500 hover:text-slate-900">
          ← Back to home
        </a>

        <h1 className="mt-4 text-3xl font-bold">Upload Dataset</h1>
        <p className="mt-2 text-slate-600">
          Upload a CSV file to preview schema details and basic data quality
          information.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="mb-3 block text-sm font-medium">Choose CSV file</label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="block w-full rounded-lg border border-slate-300 p-3"
          />

          {selectedFile && (
            <p className="mt-3 text-sm text-slate-600">
              Selected file: <span className="font-medium">{selectedFile.name}</span>
            </p>
          )}

          <button
            onClick={handleUpload}
            disabled={loading}
            className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Uploading..." : "Upload and Profile"}
          </button>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
              {error}
            </div>
          )}
        </div>

        {result && (
          <div className="mt-8 space-y-6">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-emerald-800">
                Upload Successful
              </h2>
              <p className="mt-2 text-emerald-700">
                Your dataset has been uploaded and profiled successfully.
              </p>
              <a
                href={`/map-columns?file_id=${result.file_id}`}
                className="mt-4 inline-block rounded-xl bg-emerald-700 px-5 py-3 text-white transition hover:bg-emerald-600"
              >
                Continue to Column Mapping
              </a>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Upload Summary</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Original File</p>
                  <p className="mt-1 font-semibold">{result.original_filename}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Rows</p>
                  <p className="mt-1 font-semibold">{result.profile.row_count}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Columns</p>
                  <p className="mt-1 font-semibold">{result.profile.column_count}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">File ID</p>
                  <p className="mt-1 break-all text-sm font-semibold">
                    {result.file_id}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Columns and Data Types</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="px-3 py-2 font-semibold">Column</th>
                      <th className="px-3 py-2 font-semibold">Data Type</th>
                      <th className="px-3 py-2 font-semibold">Missing Values</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.profile.columns.map((column) => (
                      <tr key={column} className="border-b border-slate-100">
                        <td className="px-3 py-2">{column}</td>
                        <td className="px-3 py-2">{result.profile.dtypes[column]}</td>
                        <td className="px-3 py-2">
                          {result.profile.missing_counts[column]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Preview</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      {previewColumns.map((column) => (
                        <th key={column} className="px-3 py-2 font-semibold">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, index) => (
                      <tr key={index} className="border-b border-slate-100">
                        {previewColumns.map((column) => (
                          <td key={`${index}-${column}`} className="px-3 py-2">
                            {String(row[column] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}