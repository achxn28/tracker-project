import { googleConfig, googleConnection } from "@/lib/google-connection";
import { ClientCrms } from "@/components/client-crms";

export const dynamic = "force-dynamic";
export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  let configured = false; let connected = false; let message = "";
  try { const config = googleConfig(); configured = Boolean(config); connected = Boolean(config && googleConnection(config).connected()); }
  catch { message = "The Google connection needs attention. Check your local configuration and reconnect."; }
  if (params.google === "cancelled") message = "Google connection cancelled. Your sheets were not changed.";
  if (params.google === "failed") message = "Google could not be connected. Check the callback URL and Sheets permission, then try again.";
  return <ClientCrms configured={configured} connected={connected} connectionMessage={message} />;
}
