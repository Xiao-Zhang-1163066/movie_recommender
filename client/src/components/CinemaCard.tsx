import { Link } from "react-router-dom";
import type { Cinema } from "@/types/cinema";

interface CinemaCardProps {
  cinema: Cinema;
}

function CinemaCard({ cinema }: CinemaCardProps) {
  const { slug, name, suburb, websiteUrl } = cinema;
  return (
    <Link to={`/cinemas/${slug}`}>
      <div
        className="p-5 transition-colors hover:border-white/10 cursor-pointer"
        style={{
          background: "var(--surface-2)",
          borderRadius: "16px",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <p
          className="font-bold text-sm"
          style={{ letterSpacing: "-0.01em" }}
        >
          {name}
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--text-2)" }}>
          {suburb}
        </p>
        {websiteUrl && (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-block mt-3 text-xs font-semibold transition-opacity hover:opacity-70"
            style={{ color: "var(--lime)" }}
          >
            Visit website ↗
          </a>
        )}
      </div>
    </Link>
  );
}

export default CinemaCard;
