import { Link } from "react-router-dom";
import type { Cinema } from "@/data/cinemas";
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
  const { id, name, suburb, screens } = cinema;
  return (
    <Link to={`/cinemas/${id}`}>
      <Card>
        <CardHeader>
          <CardTitle>{name}</CardTitle>
          <CardDescription>{suburb}</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Screens: {screens}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default CinemaCard;
