import requests
from datetime import datetime, timezone

API_BASE = "https://apim-aea.hoyts.co.nz/cinemaapi-nz-live/api"
BOOKING_BASE = "https://www.hoyts.co.nz"

FORMAT_MAP = {
    "STANDARD": "Standard",
    "LUX": "Lux",
    "XTREME": "Xtremescreen",
}


def scrape(cinema_id):
    movie_lookup = _fetch_movies()
    sessions = _fetch_sessions(cinema_id)

    result = []
    for s in sessions:
        if s["disabled"]:
            continue
        title = movie_lookup.get(s["movieId"])
        if not title:
            continue
        result.append({
            "movieTitle": title,
            "movieSlug": s["movieId"],
            # utcDate is a real UTC datetime on this endpoint — use it directly
            # instead of converting the local date ourselves
            "startsAt": datetime.fromisoformat(s["utcDate"]).astimezone(timezone.utc).replace(tzinfo=None),
            "format": FORMAT_MAP.get(s["typeId"], s["typeId"]),
            "bookingUrl": BOOKING_BASE + s["link"],
            "sourceSessionId": str(s["id"]),
        })
    return result


def _fetch_movies():
    r = requests.get(f"{API_BASE}/movies")
    r.raise_for_status()
    # vistaId is the same ID used in session.movieId — build a lookup so we
    # can resolve a title from a session without making per-movie requests
    return {m["vistaId"]: m["name"] for m in r.json()}


def _fetch_sessions(cinema_id):
    r = requests.get(f"{API_BASE}/sessions/{cinema_id}")
    r.raise_for_status()
    return r.json()
