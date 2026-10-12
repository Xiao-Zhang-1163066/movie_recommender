import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

// Rendered outside Layout, so there is no navbar: the button is the only way out.
function PageNotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <h1 className="text-3xl font-black mb-2" style={{ letterSpacing: "-0.03em" }}>
        Page not found
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-2)" }}>
        The page you were looking for does not exist.
      </p>
      <Button variant="lime" size="lg" className="px-8" onClick={() => navigate("/movies")}>
        Back to movies
      </Button>
    </div>
  );
}

export default PageNotFound;
