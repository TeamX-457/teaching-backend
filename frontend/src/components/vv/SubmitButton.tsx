import { Check } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

export function SubmitButton({ state, children, loadingText, ...p }: ButtonProps & { state: "idle" | "loading" | "done"; loadingText: string }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={state !== "idle"} aria-busy={state === "loading"} {...p}>
      {state === "loading" ? (
        <span className="fade-in flex items-center gap-2.5"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{loadingText}</span>
      ) : state === "done" ? (
        <span className="fade-in flex items-center gap-2"><Check /> Done</span>
      ) : children}
    </Button>
  );
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
