import { useState } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { PendingWatch } from "./types";

/**
 * The confirmation step in front of the agent's one write.
 *
 * `mark_watched` is read-only — it resolves the film and hands back a proposal,
 * and nothing reaches the database until this card is accepted. So this card is
 * the whole safeguard, which drives two decisions below.
 *
 * First, it has to name the film. The agent's prose is not enough: a model that
 * misread "I want to watch Dune" as "I watched Dune" will narrate its mistake
 * just as fluently as a correct action. The title and poster here are resolved
 * server-side from TMDB by id, never supplied by the model, so what the card
 * shows is what the write will record.
 *
 * Second, neither button is the default. There is no auto-focus and no
 * Enter-to-confirm: a card that appears mid-stream while someone is typing
 * their next message must not be able to collect a keystroke meant for the
 * composer.
 */
export default function ConfirmWatchCard({
  pending,
  onConfirm,
  onDismiss,
}: {
  pending: PendingWatch;
  // Resolves to the saved title, or an error message to show in place of the
  // buttons. The hook owns the request; this component owns the waiting state.
  onConfirm: () => Promise<{ ok: true; title: string } | { ok: false; message: string }>;
  onDismiss: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    // Guard rather than only disabling the button: a double-click can fire
    // twice before React re-renders. The write is an upsert so a duplicate is
    // harmless to the data, but it would still spend a TMDB lookup and could
    // land two toasts.
    if (saving) return;
    setSaving(true);
    setError(null);
    const result = await onConfirm();
    // On success the hook drops this card from the list, so this component is
    // about to unmount and there is no state worth settling.
    if (!result.ok) {
      setError(result.message);
      setSaving(false);
    }
  }

  const ratingLabel =
    pending.rating === null ? null : `${pending.rating}/10`;

  return (
    <Card size="sm" className="mt-3 w-full max-w-md">
      <CardContent className="flex gap-3">
        {pending.posterUrl && (
          <img
            src={pending.posterUrl}
            alt=""
            // Decorative: the title is right beside it as real text, so
            // announcing the poster twice would only add noise for a screen
            // reader.
            className="h-20 w-[3.4rem] shrink-0 rounded object-cover"
          />
        )}
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">Mark as watched?</p>
          {/* The film is the decision, so it is the loudest thing on the card. */}
          <p className="font-semibold break-words">{pending.title}</p>
          {ratingLabel && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              Your rating: {ratingLabel}
            </p>
          )}
          {pending.notes && (
            // Shown because it is about to be stored on the user's own row, and
            // the model wrote it from their words — so it is theirs to correct.
            <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs italic">
              “{pending.notes}”
            </p>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-2 pb-3">
        {error && (
          // Replaces nothing — the buttons stay, because a failed save is worth
          // retrying and dismissing the card would lose what it was trying to do.
          <p className="text-destructive text-xs">{error}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={handleConfirm} disabled={saving}>
            {saving ? "Saving…" : "Yes, I watched it"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss} disabled={saving}>
            No
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
