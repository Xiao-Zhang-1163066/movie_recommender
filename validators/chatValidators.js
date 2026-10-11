import { z } from "zod";

// POST /api/chat used to accept whatever array the client sent. Now that the
// server owns the history, the body is small enough to check properly: which
// thread this belongs to, and the one thing the user just typed.
//
// The length cap is a cost control as much as a validation rule. Every character
// here is billed by the model provider, and no genuine "what should I watch"
// question runs to 2000 characters.
const chatMessageSchema = z.object({
  // Absent on the first message of a new chat; the server creates the thread.
  conversationId: z.uuid("conversationId must be a valid UUID").optional(),
  message: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(2000, "Message must be 2000 characters or fewer"),
});

// POST /api/chat/confirm — the user accepting a mark_watched proposal.
//
// Only the id and the two optional fields. No title, no poster, no overview:
// the server resolves those from TMDB itself, so there is nothing here a
// caller could get wrong or a future TMDB correction could leave stale. It also
// keeps this schema honest — every field present is a field the user chose.
//
// status is absent on purpose rather than optional. This endpoint means one
// thing, "I watched it", and an endpoint that takes a status would be a second
// way to do what PUT /api/watchlist/:id already does.
const confirmWatchedSchema = z.object({
  // int(), not just number(): TMDB ids are integers, and 27205.5 reaching the
  // database as a Float that silently fails the lookup is a worse outcome than
  // a 400 here.
  tmdbId: z.number().int().positive("tmdbId must be a positive integer"),
  rating: z.number().int().min(1).max(10).optional(),
  // Matches ChatMessage-sized free text rather than being unbounded; notes ride
  // into get_taste_profile and get_user_watchlist results, so they are model
  // context and therefore billed.
  notes: z.string().trim().max(500, "Notes must be 500 characters or fewer").optional(),
});

export { chatMessageSchema, confirmWatchedSchema };
