import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateDeclarativeArtifact } from "@/lib/playliquid/declarative-artifact";

export const dynamic = "force-dynamic";

// GET /api/packages/:id/artifact
// Returns the declarative artifact for a package — the executable
// definition that the browser Package Executor loads and interprets.
//
// For packages imported via the user-owned LLM flow, the artifact text
// is stored in the package's manifest config. This endpoint extracts it,
// validates it, and returns it as a declarative artifact.
//
// For built-in packages, there is no declarative artifact (they use
// TypeScript implementations from the dev bootstrap registry).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const pkg = await db.package.findUnique({
    where: { id },
    include: { runtimeArtifacts: true },
  });

  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });

  // Try to extract the declarative artifact from the manifest
  const manifest = JSON.parse(pkg.manifest) as { config?: { artifact?: string } };
  const artifactText = manifest?.config?.artifact;

  if (!artifactText) {
    return NextResponse.json({
      hasDeclarativeArtifact: false,
      message: "This package uses a built-in implementation (no declarative artifact).",
    });
  }

  // Validate + parse the artifact
  const validation = validateDeclarativeArtifact(artifactText);
  if (!validation.valid || !validation.artifact) {
    return NextResponse.json({
      hasDeclarativeArtifact: true,
      valid: false,
      errors: validation.errors,
      raw: artifactText,
    });
  }

  return NextResponse.json({
    hasDeclarativeArtifact: true,
    valid: true,
    artifact: validation.artifact,
    runtimeArtifacts: pkg.runtimeArtifacts.map((ra) => ({
      target: ra.target,
      format: ra.format,
      status: ra.status,
    })),
  });
}
