import LandingForm from "./LandingForm";

/**
 * D-17: the page itself is a Server Component so the form it renders exists
 * in the initial HTML before any JS has run — `LandingForm`'s `<form
 * method="post" action="/api/room">` works from that very first paint.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { error } = await searchParams;
  const initialError = error === "create";
  return <LandingForm initialError={initialError} />;
}
