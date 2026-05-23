import { cn } from "@/lib/utils";

interface DatePickerProps {
  selected: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  availableDates?: string[]; // YYYY-MM-DD; when provided, only these dates are shown
}

const TZ = "Pacific/Auckland";

const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const tomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
};

// Build the label for a YYYY-MM-DD string without timezone shift.
// We construct the Date from year/month/day directly so the local clock
// doesn't accidentally roll the date back by 12 hours.
const dateLabel = (dateStr: string): string => {
  if (dateStr === todayStr()) return "TODAY";
  if (dateStr === tomorrowStr()) return "TOMORROW";
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day)
    .toLocaleDateString("en-NZ", {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
    .toUpperCase();
};

const dateFormatter = (date: Date): string =>
  date.toLocaleDateString("en-CA", { timeZone: TZ });

export default function DatePicker({
  selected,
  onChange,
  availableDates,
}: DatePickerProps) {
  const today = todayStr();

  // If a curated list is provided (session dates for the selected movie),
  // show only those — filtered to today-or-later, sorted ascending.
  // Otherwise fall back to seven consecutive days from today.
  const dates: string[] =
    availableDates && availableDates.length > 0
      ? [...availableDates].filter((d) => d >= today).sort()
      : Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() + i);
          return dateFormatter(d);
        });

  return (
    <div className="flex gap-2 overflow-x-auto py-2">
      {dates.map((dateStr) => {
        const isActive = dateStr === selected;
        return (
          <button
            key={dateStr}
            onClick={() => onChange(dateStr)}
            className={cn(
              "rounded px-4 py-2 text-sm font-semibold whitespace-nowrap",
              isActive ? "bg-red-500 text-white" : "bg-gray-800 text-gray-400",
            )}
          >
            {dateLabel(dateStr)}
          </button>
        );
      })}
    </div>
  );
}
