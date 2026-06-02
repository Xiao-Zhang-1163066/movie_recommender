import type { ReactNode } from "react";

export default function MovieGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-14">
      {children}
    </div>
  );
}
