import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { parseRoomCodeParam } from "../../../lib/room-code";
import { RoomClient } from "./RoomClient";

interface RoomPageParams {
  code: string;
}

interface RoomPageProps {
  params: Promise<RoomPageParams>;
}

/**
 * Server-rendered OpenGraph metadata for the shared link — "click a link"
 * is the entire product entry point, so the preview a friend sees before
 * clicking matters (CLAUDE.md § "Next.js vs Plain Vite SPA").
 */
export async function generateMetadata({ params }: RoomPageProps): Promise<Metadata> {
  const { code: raw } = await params;
  const parsed = parseRoomCodeParam(raw);
  if (parsed.kind === "invalid") {
    return { title: "Room not found — games.rogerflores.dev" };
  }
  const { code } = parsed;
  return {
    title: `Join room ${code} — games.rogerflores.dev`,
    description: `Click to join room ${code}. No account, no download — just a name.`,
    openGraph: {
      title: `Join room ${code}`,
      description: `Click to join room ${code} on games.rogerflores.dev.`,
    },
  };
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { code: raw } = await params;
  // CR-02: normalize before anything dials the Worker — a lowercase code
  // redirects to its canonical form, anything else is a 404.
  const parsed = parseRoomCodeParam(raw);
  if (parsed.kind === "invalid") notFound();
  if (parsed.kind === "redirect") redirect(`/room/${parsed.code}`);
  return <RoomClient code={parsed.code} />;
}
