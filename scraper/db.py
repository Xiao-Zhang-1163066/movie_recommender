import os
import uuid
import psycopg2
import psycopg2.extras
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

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
