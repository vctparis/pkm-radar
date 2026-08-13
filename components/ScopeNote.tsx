import Link from "next/link";
import { SCOPE_LINE } from "@/lib/scope";

/** Rappel du périmètre, avec renvoi vers la page qui le détaille. */
export default function ScopeNote({ className = "" }: { className?: string }) {
  return (
    <p className={`prose-measure m-0 text-[0.78rem] leading-relaxed text-mist-500 ${className}`}>
      {SCOPE_LINE}{" "}
      <Link href="/marche" className="underline decoration-ink-500 underline-offset-4 transition-colors duration-200 hover:decoration-accent">
        Comment ces prix sont retenus
      </Link>
    </p>
  );
}
