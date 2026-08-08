import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapPackage } from "@/lib/playliquid/mappers";
import { contentHash } from "@/lib/playliquid/hashing";
import type { Family } from "@/lib/playliquid/types";

export const dynamic = "force-dynamic";

// GET /api/packages?family=&q=
export async function GET(req: NextRequest) {
  const family = req.nextUrl.searchParams.get("family");
  const q = req.nextUrl.searchParams.get("q")?.toLowerCase();

  const where: Record<string, unknown> = {};
  if (family && family !== "all") where.family = family;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { displayName: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const packages = await db.package.findMany({
    where,
    include: { provides: true, requires: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(packages.map(mapPackage));
}

// POST /api/packages — register a new Package in the Registry.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const name: string = body.name;
  const displayName: string = body.displayName ?? name;
  const description: string = body.description ?? "";
  const family: Family = body.family ?? "building";
  const version: string = body.version ?? "1.0.0";
  const license: string = body.license ?? "MIT";
  const capabilities: string[] = body.capabilities ?? [];
  const provides: Array<{ name: string; family?: string; description?: string }> = body.provides ?? [];
  const requires: Array<{ name: string; family?: string; description?: string }> = body.requires ?? [];
  const manifest = body.manifest ?? { entrypoint: "index.js", runtime: "simulator" };
  const specification = body.specification ?? { name };

  const hash = contentHash({ name, version, specification, manifest });

  const existing = await db.package.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json(
      { error: `Package "${name}" already exists in the registry` },
      { status: 409 }
    );
  }

  const pkg = await db.package.create({
    data: {
      name,
      displayName,
      description,
      family,
      version,
      hash,
      manifest: JSON.stringify(manifest),
      specification: JSON.stringify(specification),
      artifactUri: `memory://${hash}`,
      provenance: JSON.stringify({
        generator: "human",
        generatedAt: new Date().toISOString(),
        source: "manual registration",
      }),
      certification: JSON.stringify({
        signed: false,
        level: "basic",
        by: "playliquid-api",
        checks: ["specification-valid"],
      }),
      license,
      capabilities: JSON.stringify(capabilities),
      provides: {
        create: provides.map((p) => ({
          name: p.name,
          family: p.family ?? "general",
          version: "1.0.0",
          direction: "provides",
          schema: JSON.stringify({}),
          description: p.description ?? "",
        })),
      },
      requires: {
        create: requires.map((r) => ({
          name: r.name,
          family: r.family ?? "general",
          version: "1.0.0",
          direction: "requires",
          schema: JSON.stringify({}),
          description: r.description ?? "",
        })),
      },
    },
    include: { provides: true, requires: true },
  });
  return NextResponse.json(mapPackage(pkg), { status: 201 });
}
