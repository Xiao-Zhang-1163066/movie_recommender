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

export { chatMessageSchema };
