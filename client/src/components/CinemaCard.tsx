import { Link } from "react-router-dom";
import type { Cinema } from "@/types/cinema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
interface CinemaCardProps {
  cinema: Cinema;
}
function CinemaCard({ cinema }: CinemaCardProps) {
  const { slug, name, suburb, websiteUrl } = cinema;
  return (
    <Link to={`/cinemas/${slug}`}>
      <Card>
        <CardHeader>
          <CardTitle>{name}</CardTitle>
          <CardDescription>{suburb}</CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            Visit website
          </a>
        </CardContent>
      </Card>
    </Link>
  );
}

export default CinemaCard;
