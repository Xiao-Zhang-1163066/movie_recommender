import os
import uuid
import requests
import psycopg2
import psycopg2.extras
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from dotenv import load_dotenv

load_dotenv()

TMDB_API_KEY = os.getenv('TMDB_API_KEY')
TMDB_BASE = 'https://api.themoviedb.org/3'
TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

def get_connection():
    DATABASE_URL = os.getenv('DATABASE_URL')
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL environment variable not set")
    return psycopg2.connect(DATABASE_URL)

def upsert_cinema(conn, cinema: dict):
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute("""
        INSERT INTO "Cinema" (
            "id", "name", "slug", "address", "suburb",
            "latitude", "longitude",
            "websiteUrl", "bookingUrl", "scrapeUrl",
            "updatedAt"
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (slug) DO UPDATE SET
            "name"       = EXCLUDED."name",
            "address"    = EXCLUDED."address",
            "suburb"     = EXCLUDED."suburb",
            "latitude"   = EXCLUDED."latitude",
            "longitude"  = EXCLUDED."longitude",
            "websiteUrl" = EXCLUDED."websiteUrl",
            "bookingUrl" = EXCLUDED."bookingUrl",
            "scrapeUrl"  = EXCLUDED."scrapeUrl",
            "updatedAt"  = EXCLUDED."updatedAt"
    """, (
        str(uuid.uuid4()),
        cinema['name'],
        cinema['slug'],
        cinema['address'],
        cinema['suburb'],
        cinema['latitude'],
        cinema['longitude'],
        cinema['websiteUrl'],
        cinema['bookingUrl'],
        cinema['scrapeUrl'],
        datetime.now(timezone.utc),
    ))
    conn.commit()

def get_cinema_id(conn, slug):
    # look up the cinema's internal UUID by its slug (e.g. "alice-cinema")
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute('SELECT id FROM "Cinema" WHERE slug = %s', (slug,))
    row = cursor.fetchone()
    if not row:
        raise ValueError(f"Cinema not found: {slug}")
    return row['id']

def ensure_system_user(conn):
    # Movie.createdBy is a required FK — the scraper needs a user to own movies it creates.
    # We use a fixed system account rather than a real user.
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    email = 'system@movie-mate.internal'
    cursor.execute('SELECT id FROM "User" WHERE email = %s', (email,))
    row = cursor.fetchone()
    if row:
        return row['id']
    user_id = str(uuid.uuid4())
    cursor.execute(
        'INSERT INTO "User" (id, name, email, password) VALUES (%s, %s, %s, %s)',
        # password value can never match a bcrypt hash, so this account can never log in
        (user_id, 'System', email, 'SYSTEM_USER_NOT_FOR_LOGIN')
    )
    conn.commit()
    return user_id

def fetch_tmdb_movie(title):
    # step 1: search by title → get the TMDB ID of the top result
    r = requests.get(f'{TMDB_BASE}/search/movie', params={'api_key': TMDB_API_KEY, 'query': title})
    results = r.json().get('results', [])
    if not results:
        return None
    tmdb_id = results[0]['id']

    # step 2: fetch full details — search results only include genre IDs, not names or runtime
    r2 = requests.get(f'{TMDB_BASE}/movie/{tmdb_id}', params={'api_key': TMDB_API_KEY})
    movie = r2.json()
    release_year = int(movie['release_date'][:4]) if movie.get('release_date') else datetime.now().year
    return {
        'tmdbId': tmdb_id,
        'title': movie['title'],
        'overview': movie.get('overview'),
        'releaseYear': release_year,
        'genres': [g['name'] for g in movie.get('genres', [])],
        'runtime': movie.get('runtime'),
        'voteAverage': movie.get('vote_average'),
        'posterUrl': f"{TMDB_IMAGE_BASE}{movie['poster_path']}" if movie.get('poster_path') else None,
    }

def find_or_create_movie(conn, tmdb_data, system_user_id):
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute("""
      INSERT INTO "Movie" (id, title, overview, "releaseYear", genres, runtime,
   "voteAverage", "posterUrl", "createdBy", "tmdbId")
      VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
      ON CONFLICT ("tmdbId") DO UPDATE SET
          title           = EXCLUDED.title,
          overview        = EXCLUDED.overview,
          "releaseYear"   = EXCLUDED."releaseYear",
          genres          = EXCLUDED.genres,
          runtime         = EXCLUDED.runtime,
          "voteAverage"   = EXCLUDED."voteAverage",
          "posterUrl"     = EXCLUDED."posterUrl"
      RETURNING id
  """, (
      str(uuid.uuid4()),
      tmdb_data['title'],
      tmdb_data.get('overview'),
      tmdb_data['releaseYear'],
      tmdb_data['genres'],
      tmdb_data.get('runtime'),
      tmdb_data.get('voteAverage'),
      tmdb_data.get('posterUrl'),
      system_user_id,
      tmdb_data['tmdbId'],
  ))
    row = cursor.fetchone()
    conn.commit()
    return row['id']

def to_utc(naive_dt, tz_str='Pacific/Auckland'):
    # Alice Cinema times are NZ local time — attach the timezone then convert to UTC for storage.
    # strip tzinfo at the end because Postgres TIMESTAMP (without timezone) expects naive datetimes.
    local_dt = naive_dt.replace(tzinfo=ZoneInfo(tz_str))
    return local_dt.astimezone(timezone.utc).replace(tzinfo=None)

def replace_sessions(conn, cinema_id, sessions):
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    # delete all future sessions for this cinema before re-inserting fresh ones.
    # this "replace on refresh" pattern is simpler than per-row upsert and keeps the
    # DB in sync with whatever the website currently shows.
    cursor.execute('DELETE FROM "Session" WHERE "cinemaId" = %s AND "startsAt" > %s', (cinema_id, now))
    for s in sessions:
        cursor.execute("""
            INSERT INTO "Session" (id, "cinemaId", "movieId", "startsAt", format, "bookingUrl", "sourceSessionId")
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            str(uuid.uuid4()),
            cinema_id,
            s['movieId'],
            s['startsAt'],
            s['format'],
            s['bookingUrl'],
            s['sourceSessionId'],
        ))
    conn.commit()
