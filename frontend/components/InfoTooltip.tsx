"use client";

type InfoTooltipProps = {
  text: string;
};

export default function InfoTooltip({ text }: InfoTooltipProps) {
  return (
    <span className="group relative ml-2 inline-flex cursor-pointer items-center">
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-400 text-xs font-semibold text-slate-600">
        i
      </span>

      <span className="invisible absolute left-1/2 top-full z-20 mt-2 w-72 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal text-white opacity-0 shadow-lg transition-all duration-150 group-hover:visible group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}