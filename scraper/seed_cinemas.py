

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