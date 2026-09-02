import type { Metadata } from "next";
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
  const { code } = await params;
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
  const { code } = await params;
  return <RoomClient code={code} />;
}
