import { readFile } from "node:fs/promises";
import { join } from "node:path";

// « Quoi de neuf » est un document autonome (docs/whats-new.html) : on le
// sert tel quel plutôt que de le porter en React — le fichier reste la
// source unique, éditable sans toucher à l'app.
export const dynamic = "force-static";

export async function GET() {
  const html = await readFile(join(process.cwd(), "docs", "whats-new.html"), "utf8");
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
