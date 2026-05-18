from db import (
    get_connection, get_cinema_id, ensure_system_user,
    fetch_tmdb_movie, find_or_create_movie, replace_sessions, to_utc
)
from cinemas import alice, hoyts


def _run_cinema(conn, cinema_slug, raw_sessions, tz='Pacific/Auckland'):
    cinema_id = get_cinema_id(conn, cinema_slug)
    system_user_id = ensure_system_user(conn)

    sessions_with_ids = []
    seen = {}  # cache TMDB lookups — don't call TMDB twice for the same movie

    for session in raw_sessions:
        slug = session['movieSlug']

        if slug not in seen:
            tmdb_data = fetch_tmdb_movie(session['movieTitle'])
            if not tmdb_data:
                print(f"  TMDB: not found for '{session['movieTitle']}' — skipping")
                seen[slug] = None
            else:
                movie_id = find_or_create_movie(conn, tmdb_data, system_user_id)
                seen[slug] = movie_id
                print(f"  Movie: {session['movieTitle']} → {movie_id}")

        movie_id = seen[slug]
        if not movie_id:
            continue

        # tz=None means the scraper already returned UTC — skip conversion
        starts_at = to_utc(session['startsAt'], tz) if tz else session['startsAt']
        sessions_with_ids.append({
            **session,
            'movieId': movie_id,
            'startsAt': starts_at,
        })

    replace_sessions(conn, cinema_id, sessions_with_ids)
    print(f"  Wrote {len(sessions_with_ids)} sessions to DB")


def run_alice(conn):
    print("Scraping Alice Cinema...")
    raw_sessions = alice.scrape()
    print(f"  Found {len(raw_sessions)} raw sessions")
    _run_cinema(conn, 'alice-cinema', raw_sessions)


def run_hoyts(conn, cinema_slug, cinema_id, label):
    print(f"Scraping {label}...")
    raw_sessions = hoyts.scrape(cinema_id)
    print(f"  Found {len(raw_sessions)} raw sessions")
    _run_cinema(conn, cinema_slug, raw_sessions, tz=None)


if __name__ == '__main__':
    conn = get_connection()
    try:
        run_alice(conn)
        run_hoyts(conn, 'entx-christchurch', 'CHCCIN', 'Hoyts EntX Christchurch')
        run_hoyts(conn, 'hoyts-northlands', '1004', 'Hoyts Northlands')
        run_hoyts(conn, 'hoyts-riccarton', '1005', 'Hoyts Riccarton')
    finally:
        conn.close()
