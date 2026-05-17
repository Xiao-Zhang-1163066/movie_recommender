from db import (
    get_connection, get_cinema_id, ensure_system_user,
    fetch_tmdb_movie, find_or_create_movie, replace_sessions, to_utc
)
from cinemas import alice

def run_alice(conn):
    cinema_id = get_cinema_id(conn, 'alice-cinema')
    system_user_id = ensure_system_user(conn)

    print("Scraping Alice Cinema...")
    raw_sessions = alice.scrape()
    print(f"  Found {len(raw_sessions)} raw sessions")

    sessions_with_ids = []
    seen = {}  # cache movie lookups — don't call TMDB twice for the same movie

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

        sessions_with_ids.append({
            **session,
            'movieId': movie_id,
            'startsAt': to_utc(session['startsAt']),
        })

    replace_sessions(conn, cinema_id, sessions_with_ids)
    print(f"  Wrote {len(sessions_with_ids)} sessions to DB")

if __name__ == '__main__':
    conn = get_connection()
    try:
        run_alice(conn)
    finally:
        conn.close()
