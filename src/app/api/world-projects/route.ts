import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapWorldProject } from "@/lib/playliquid/mappers";
import type { WorldTheme } from "@/lib/playliquid/types";

export const dynamic = "force-dynamic";

// GET /api/world-projects
export async function GET() {
  const projects = await db.worldProject.findMany({
    include: {
      specification: true,
      builds: {
        include: {
          packages: { include: { package: { include: { provides: true, requires: true } } } },
          nodes: true,
          entities: { include: { package: { include: { provides: true, requires: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(projects.map(mapWorldProject));
}

// POST /api/world-projects
export async function POST(req: NextRequest) {
  const body = await req.json();
  const name: string = body.name;
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const slug: string = body.slug ?? slugify(name);
  const description: string = body.description ?? "";
  const theme: WorldTheme = body.theme ?? defaultTheme();
  const rules: Record<string, unknown> = body.rules ?? {};
  const contributors: string[] = body.contributors ?? ["@you"];

  const existing = await db.worldProject.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: `Slug "${slug}" is taken` }, { status: 409 });
  }

  const project = await db.worldProject.create({
    data: {
      name,
      slug,
      description,
      theme: JSON.stringify(theme),
      rules: JSON.stringify(rules),
      packageManifest: JSON.stringify([]),
      contributors: JSON.stringify(contributors),
    },
    include: {
      specification: true,
      builds: {
        include: {
          packages: { include: { package: { include: { provides: true, requires: true } } } },
          nodes: true,
          entities: { include: { package: { include: { provides: true, requires: true } } } },
        },
      },
    },
  });
  return NextResponse.json(mapWorldProject(project), { status: 201 });
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function defaultTheme(): WorldTheme {
  return {
    era: "contemporary",
    artDirection: "stylized-realistic",
    scale: "city",
    coordinateSystem: "cartesian-meters",
    architectureLanguage: "mixed",
    materialLanguage: "mixed",
    lighting: "daylight",
    colorLanguage: "balanced",
    technologyLevel: "modern",
    allowedFamilies: [],
    preferredFamilies: [],
    excludedFamilies: [],
  };
}
