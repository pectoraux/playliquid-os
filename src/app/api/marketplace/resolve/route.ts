import { NextRequest, NextResponse } from "next/server";
import { resolveVersion, recordDownload } from "@/lib/playliquid/services/marketplace";

export const dynamic = "force-dynamic";

// GET /api/marketplace/resolve?name=@scope/pkg&range=^1.0.0
// Resolves a semver range to a specific published version.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  const range = url.searchParams.get("range") ?? "latest";
  const download = url.searchParams.get("download") === "true";
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const version = await resolveVersion(name, range);
  if (!version) {
    return NextResponse.json({ error: `no version matching ${range} for ${name}` }, { status: 404 });
  }
  if (download) {
    await recordDownload(version.id);
  }
  return NextResponse.json({ name, range, resolved: version });
}
