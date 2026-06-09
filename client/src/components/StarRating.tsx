import { Star } from "lucide-react";

type Props = {
  value: number | null;
  onChange?: (v: number | null) => void;
  readonly?: boolean;
};

export function StarRating({ value, onChange, readonly = false }: Props) {
  function handleClick(star: number) {
    if (readonly || !onChange) return;
    onChange(value === star ? null : star);
  }

  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`Rate ${star} out of 10`}
          onClick={() => handleClick(star)}
          disabled={readonly}
          style={{ cursor: readonly ? "default" : "pointer", background: "none", border: "none", padding: "2px" }}
        >
          <Star
            size={14}
            fill={value !== null && star <= value ? "var(--lime)" : "transparent"}
            stroke={value !== null && star <= value ? "var(--lime)" : "var(--text-3)"}
          />
        </button>
      ))}
    </div>
  );
}
