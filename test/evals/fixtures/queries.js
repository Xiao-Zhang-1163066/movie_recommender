/**
 * The eval corpus: deliberately varied question shapes, not twenty rewordings
 * of the same one. A suite that only asks "recommend me a thriller" proves the
 * agent handles that sentence, nothing more.
 *
 * `shouldRecommend` drives the main assertion:
 *   true   — recommend_movies must be called
 *   false  — it must NOT be. A bot that recommends films at a greeting is also
 *            broken, and only negative cases catch that.
 *   null   — genuinely ambiguous, so not asserted. Asserting on a case where a
 *            reasonable model could go either way manufactures flakiness and
 *            teaches the team to ignore the suite.
 */
export const QUERIES = [
  // --- vague mood -----------------------------------------------------------
  { id: "mood-cosy", text: "something cosy for a rainy night", shouldRecommend: true },
  { id: "mood-uplifting", text: "I've had a rough week, something uplifting", shouldRecommend: true },
  { id: "mood-tense", text: "I want something that will keep me on edge", shouldRecommend: true },

  // --- explicit genre -------------------------------------------------------
  { id: "genre-scifi", text: "a sci-fi film with a twist ending", shouldRecommend: true },
  { id: "genre-horror", text: "recommend a horror film that isn't too gory", shouldRecommend: true },
  { id: "genre-comedy", text: "a good comedy to watch with my parents", shouldRecommend: true },
  { id: "genre-animation", text: "something animated the kids would like", shouldRecommend: true },

  // --- comparison / anchored on another film --------------------------------
  { id: "compare-inception", text: "something like Inception but easier to follow", shouldRecommend: true },
  { id: "compare-interstellar", text: "if I loved Interstellar what should I watch?", shouldRecommend: true },

  // --- constrained ----------------------------------------------------------
  { id: "constraint-short", text: "something under two hours tonight", shouldRecommend: true },
  { id: "constraint-datenight", text: "date night, nothing too heavy", shouldRecommend: true },

  // --- showtimes / in-theatre ----------------------------------------------
  { id: "showing-week", text: "what's showing at the cinema this week?", shouldRecommend: true },
  { id: "showing-tonight", text: "is there anything worth seeing tonight?", shouldRecommend: true },

  // --- specific title lookup: a details question, not necessarily a rec ------
  { id: "lookup-title", text: "tell me about The Odyssey", shouldRecommend: null },

  // --- watchlist: should reach for the watchlist tool; whether it also
  //     recommends is a judgement call, so it is left unasserted -------------
  { id: "watchlist-read", text: "what's on my watchlist?", shouldRecommend: null },
  { id: "watchlist-add", text: "add The Odyssey to my watchlist", shouldRecommend: null },

  // --- must NOT recommend ---------------------------------------------------
  // A model that answers every prompt with film cards is as broken as one that
  // never does. These are the cases that catch over-eagerness.
  { id: "greeting", text: "hi there", shouldRecommend: false },
  { id: "thanks", text: "thanks, that's helpful!", shouldRecommend: false },
  { id: "offtopic-geography", text: "what's the capital of New Zealand?", shouldRecommend: false },
  { id: "offtopic-meta", text: "what model are you running on?", shouldRecommend: false },
];
