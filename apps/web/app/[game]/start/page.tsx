import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { catalogEntry } from "../../../components/game-catalog";
import { configFieldName } from "../../../lib/create-room-form";

interface StartPageProps {
  params: Promise<{ game: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: StartPageProps): Promise<Metadata> {
  const found = catalogEntry((await params).game);
  if (!found) return {};
  return {
    title: `${found.entry.name} — Board games`,
    description: found.entry.tagline,
  };
}

/**
 * D-17: a Server Component, so the create form (and the game's settings
 * fieldset) is in the initial HTML and posts natively before any JS runs.
 */
export default async function StartPage({ params, searchParams }: StartPageProps) {
  const found = catalogEntry((await params).game);
  if (!found) notFound();
  const { gameId, entry } = found;
  const { error } = await searchParams;
  const { Start, CreateSettings } = entry;
  return (
    <Start gameId={gameId} name={entry.name} initialError={error === "create"}>
      {CreateSettings && <CreateSettings name={configFieldName(gameId)} />}
    </Start>
  );
}
