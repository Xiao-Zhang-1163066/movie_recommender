import { cn } from "@/lib/utils";

interface DatePickerProps {
  selected: string; // YYYY-MM-DD
  onChange: (date: string) => void;
}

// generate dates array:
const dates = Array.from({ length: 7 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return d;
});

// helper to get YYYY-MM-DD string from a Date:
const dateFormatter = (date: Date): string => date.toISOString().split("T")[0];

// helper to get button label:
const dateLabel = (date: Date, index: number) => {
  if (index === 0) return "TODAY";
  if (index === 1) return "TOMORROW";
  return date
    .toLocaleDateString("en-NZ", {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
    .toUpperCase();
};
export default function DatePicker({ selected, onChange }: DatePickerProps) {
  return (
    <div className="flex gap-2 overflow-x-auto py-2">
      {dates.map((date, i) => {
        const dateStr = dateFormatter(date);
        const isActive = dateStr === selected;
        return (
          <button
            key={dateStr}
            onClick={
              // TODO: call onChange with dateStr
              () => onChange(dateStr)
            }
            className={cn(
              "rounded px-4 py-2 text-sm font-semibold whitespace-nowrap",
              isActive ? "bg-red-500 text-white" : "bg-gray-800 text-gray-400",
            )}
          >
            {dateLabel(date, i)}
          </button>
        );
      })}
    </div>
  );
}
