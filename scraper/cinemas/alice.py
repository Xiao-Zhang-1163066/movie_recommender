import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime

BASE_URL = "https://alice.co.nz"

def scrape():
    # entry point — fetches all sessions currently listed on Alice Cinema's website
    response = requests.get(BASE_URL)
    soup = BeautifulSoup(response.text, 'html.parser')
    movie_slugs = _get_movie_slugs(soup)

    sessions = []
    for title, slug in movie_slugs:
        sessions.extend(_scrape_movie_sessions(title, slug))
    return sessions

def _get_movie_slugs(soup):
    # movie titles on the homepage are inside <h3> tags, each linking to /movies/<slug>/
    slugs = []
    for h3 in soup.find_all('h3'):
        a = h3.find('a')
        if not a:
            continue
        href = a.get('href', '')
        match = re.search(r'/movies/([^/]+)/', href)
        if not match:
            continue
        slug = match.group(1)
        title = a.get_text(strip=True)
        slugs.append((title, slug))
    return slugs

def _scrape_movie_sessions(title, slug):
    url = f"{BASE_URL}/movies/{slug}/"
    response = requests.get(url)
    soup = BeautifulSoup(response.text, 'html.parser')

    sessions = []
    current_date_str = None

    # the page has no wrapper element grouping each date with its sessions —
    # they are flat siblings. we walk all h5 and <a> tags in document order:
    # an h5 sets the current date; every booking <a> after it belongs to that date.
    for tag in soup.find_all(['h5', 'a']):
        if tag.name == 'h5':
            current_date_str = tag.get_text(strip=True)
        elif tag.name == 'a' and current_date_str:
            href = tag.get('href', '')
            # skip nav links and other <a> tags — only Veezi purchase links are sessions
            if 'veezi.com/purchase/' not in href:
                continue

            time_str = tag.get_text(strip=True).replace('Book Seats', '').strip()
            if not time_str:
                continue

            starts_at = _parse_datetime(current_date_str, time_str)
            if not starts_at:
                continue

            # the session ID is embedded in the Veezi booking URL: /purchase/42003?siteToken=...
            id_match = re.search(r'/purchase/(\d+)', href)
            source_session_id = id_match.group(1) if id_match else None

            sessions.append({
                'movieTitle': title,
                'movieSlug': slug,
                'startsAt': starts_at,
                'format': 'Standard',
                'bookingUrl': href,
                'sourceSessionId': source_session_id,
            })

    return sessions

def _parse_datetime(date_str, time_str):
    # date_str looks like "Sun 17th, May" — strip the ordinal suffix before parsing
    clean_date = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', date_str)
    year = datetime.now().year
    try:
        return datetime.strptime(f"{clean_date} {year} {time_str}", "%a %d, %b %Y %I:%M %p")
    except ValueError:
        # return None so the caller can skip this session rather than crash the whole run
        return None