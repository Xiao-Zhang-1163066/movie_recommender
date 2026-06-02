export default function WatchlistButton({
  inList,
  onClick,
}: {
  inList: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={inList}
      className="mt-2 w-full py-1.5 text-xs font-bold rounded-full transition-opacity"
      style={
        inList
          ? {
              background: "var(--chip-bg)",
              color: "var(--text-2)",
              cursor: "not-allowed",
            }
          : { background: "var(--lime)", color: "#000" }
      }
    >
      {inList ? "In Watchlist" : "+ Watchlist"}
    </button>
  );
}
