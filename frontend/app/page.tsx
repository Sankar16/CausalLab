export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-5xl flex-col items-start px-6 py-16">
        <p className="mb-3 rounded-full bg-slate-200 px-3 py-1 text-sm font-medium">
          CausalLab
        </p>

        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Experiment Review and Treatment Effect Analysis Platform
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-slate-600">
          Upload A/B testing datasets, inspect schema quality, validate experiment
          setup, and analyze treatment impact with statistically responsible
          diagnostics.
        </p>

        <div className="mt-8">
          <a
            href="/upload"
            className="rounded-xl bg-slate-900 px-5 py-3 text-white transition hover:bg-slate-700"
          >
            Upload Dataset
          </a>
        </div>
      </div>
    </main>
  );
}