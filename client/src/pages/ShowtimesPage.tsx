import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cinemas } from "@/data/cinemas";
import { sessions } from "@/data/sessions";
import DatePicker from "@/components/DatePicker";
import { Button } from "@/components/ui/button";

function ShowtimesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState<string>(today);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Select a Cinema</h1>

      <DatePicker selected={selectedDate} onChange={setSelectedDate} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cinemas
          .filter((cinema) => {
            const times = sessions[cinema.id]?.[id!]?.[selectedDate] ?? [];
            return times.length > 0;
          })
          .map((cinema) => {
            const times = sessions[cinema.id]?.[id!]?.[selectedDate] ?? [];

            return (
              <div key={cinema.id} className="p-4 border rounded">
                <h2 className="text-xl font-semibold">{cinema.name}</h2>
                <p className="text-gray-500">{cinema.suburb}</p>
                {times.map((time) => (
                  <Button
                    key={time}
                    variant="outline"
                    size="xs"
                    className="mr-2 mt-2"
                    onClick={() =>
                      navigate(
                        `/cinemas/${cinema.id}?movieId=${id}&time=${time}`,
                      )
                    }
                  >
                    {time}
                  </Button>
                ))}
              </div>
            );
          })}
      </div>
    </div>
  );
}

export default ShowtimesPage;
