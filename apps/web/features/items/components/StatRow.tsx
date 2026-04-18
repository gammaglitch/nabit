import { mono } from "@/features/shared/utils/format";

export function StatRow({
  label,
  value,
  valueClass,
  href,
}: {
  label: string;
  value: string;
  valueClass?: string;
  href?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#1A1A1A] py-3">
      <span className={`${mono} shrink-0 text-[#999999]`}>{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 truncate text-right text-[14px] text-[#5B9BF6] transition-colors duration-200 hover:text-[#E8E8E8]"
        >
          {value}
        </a>
      ) : (
        <span
          className={`min-w-0 truncate text-right text-[14px] ${valueClass ?? "text-[#E8E8E8]"}`}
        >
          {value}
        </span>
      )}
    </div>
  );
}
