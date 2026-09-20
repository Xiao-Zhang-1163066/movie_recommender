/**
 * A frozen now-showing listing for the eval suite.
 *
 * Fixed rather than read from the database on purpose. The real listing changes
 * every time the scraper runs, and a pass rate measured against a moving input
 * cannot be compared to last week's. The fixture is what makes runs comparable.
 *
 * Shape must match what getNowShowing() returns after the Phase 4 trim —
 * tmdbId, title, genres, voteAverage, and no overview. If that select changes,
 * change this too, or the evals stop testing the prompt the model really gets.
 *
 * The ids are real TMDB ids taken from the live database, so recommend_movies
 * can enrich them for real. They are obscure titles; that is realistic rather
 * than convenient, since it is what the scraper actually serves.
 */
export const NOW_SHOWING = [
  {
    tmdbId: 1596301,
    title: "Mum, I'm Alien Pregnant",
    genres: ["Horror", "Science Fiction", "Comedy"],
    voteAverage: 9,
  },
  {
    tmdbId: 1368337,
    title: "The Odyssey",
    genres: ["Adventure", "Action", "Fantasy"],
    voteAverage: 8.006,
  },
  {
    tmdbId: 1204680,
    title: "Coyote vs. Acme",
    genres: ["Comedy", "Adventure", "Family"],
    voteAverage: 7.617,
  },
  {
    tmdbId: 677558,
    title: "The Last Whale Singer",
    genres: ["Adventure", "Animation", "Family"],
    voteAverage: 7.9,
  },
  {
    tmdbId: 1380417,
    title: "By Any Means",
    genres: ["History", "Crime", "Drama"],
    voteAverage: 8.094,
  },
];

// Used by the "at least one pick is actually showing" assertion.
export const NOW_SHOWING_IDS = new Set(NOW_SHOWING.map((m) => m.tmdbId));
