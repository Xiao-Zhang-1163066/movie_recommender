import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

// Step 1: create the Gemini provider using GEMINI_API_KEY from process.env
const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * POST /chat
 * Body: { messages: [{ role, content }] }
 */
export const chat = async (req, res, next) => {
  try {
    // Step 2: pull messages out of req.body
    const { messages } = req.body;
    // Step 3: call generateText — pass the model and the messages
    const text = await generateText({
      model: google("gemini-2.5-flash"),
      messages,
    });
    // Step 4: send back the response text as JSON
    res.json({ text });
  } catch (err) {
    next(err);
  }
};
