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
              <div
                key={cinema.id}
                className="p-4 border rounded"
                onClick={() => navigate(`/cinemas/${cinema.id}?movieId=${id}`)}
              >
                <h2 className="text-xl font-semibold">{cinema.name}</h2>
                <p className="text-gray-500">{cinema.suburb}</p>
                {times.map((time) => (
                  <span
                    key={time}
                    className="me-2 inline-flex items-center mt-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                  >
                    {time}
                  </span>
                ))}
              </div>
            );
          })}
      </div>
    </div>
  );
}

export default ShowtimesPage;
