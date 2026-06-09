import { Button, type buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

type ButtonProps = Omit<ComponentProps<typeof Button>, "variant" | "onClick"> &
  VariantProps<typeof buttonVariants>;

type Props = ButtonProps & {
  inList: boolean;
  onClick: (e: React.MouseEvent) => void;
};

export default function WatchlistButton({ inList, onClick, ...props }: Props) {
  return (
    <Button variant={inList ? "muted" : "lime"} onClick={onClick} {...props}>
      {inList ? "✓ In Watchlist" : "+ Watchlist"}
    </Button>
  );
}
