

from db import get_connection, upsert_cinema

CINEMAS = [
    {
        "name": "Alice Cinema",
        "slug": "alice-cinema",
        "address": "209 Tuam Street, Christchurch Central City, Christchurch 8011",
        "suburb": "Christchurch Central City",
        "latitude": -43.53499946839179,
        "longitude": 172.6403065900297,
        "websiteUrl": "https://alice.co.nz/",
        "bookingUrl": "https://alice.co.nz/",
        "scrapeUrl": "https://alice.co.nz/",
    },
    {
        "name": "Hoyts EntX Christchurch",
        "slug": "entx-christchurch",
        "address": "617-649 Colombo St, Christchurch Central City, Christchurch 8011",
        "suburb": "Christchurch Central",
        "latitude": -43.534965,
        "longitude": 172.636473,
        "websiteUrl": "https://www.hoyts.co.nz/cinemas/entx-christchurch",
        "bookingUrl": "https://www.hoyts.co.nz/cinemas/entx-christchurch",
        "scrapeUrl": "https://apim-aea.hoyts.co.nz/cinemaapi-nz-live/api/sessions/CHCCIN",
    },
    {
        "name": "Hoyts Northlands",
        "slug": "hoyts-northlands",
        "address": "Main North Road, Papanui, Christchurch",
        "suburb": "Papanui",
        "latitude": -43.494317,
        "longitude": 172.609758,
        "websiteUrl": "https://www.hoyts.co.nz/cinemas/northlands",
        "bookingUrl": "https://www.hoyts.co.nz/cinemas/northlands",
        "scrapeUrl": "https://apim-aea.hoyts.co.nz/cinemaapi-nz-live/api/sessions/1004",
    },
    {
        "name": "Hoyts Riccarton",
        "slug": "hoyts-riccarton",
        "address": "129 Riccarton Road, Riccarton, Christchurch 8041",
        "suburb": "Riccarton",
        "latitude": -43.53003,
        "longitude": 172.598064,
        "websiteUrl": "https://www.hoyts.co.nz/cinemas/riccarton",
        "bookingUrl": "https://www.hoyts.co.nz/cinemas/riccarton",
        "scrapeUrl": "https://apim-aea.hoyts.co.nz/cinemaapi-nz-live/api/sessions/1005",
    },
]

def main():
    # step 1: get a DB connection
    # step 2: loop through CINEMAS and upsert each one
    # step 3: print a confirmation message
    # step 4: close the connection
    conn=get_connection()
    for cinema in CINEMAS:        
        upsert_cinema(conn, cinema)
    print(f"Upserted {len(CINEMAS)} cinemas")
    conn.close()
  

if __name__ == "__main__":
    main()