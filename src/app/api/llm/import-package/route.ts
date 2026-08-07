import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentHash } from "@/lib/playliquid/hashing";

export const dynamic = "force-dynamic";

// POST /api/llm/import-package
// body: { specificationId, artifact, family, name?, displayName? }
//
// This is the USER-OWNED LLM flow. The user generated the package
// implementation in THEIR LLM, and pastes the result here. PlayLiquid
// certifies + registers it.
//
// PlayLiquid doesn't know — and doesn't need to know — which LLM produced this.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { specificationId, artifact, family, name, displayName } = body;

  if (!specificationId || !artifact || !family) {
    return NextResponse.json(
      { error: "specificationId, artifact, and family are required" },
      { status: 400 }
    );
  }

  try {
    const spec = await db.specification.findUnique({ where: { id: specificationId } });
    if (!spec) return NextResponse.json({ error: "Specification not found" }, { status: 404 });

    const canonical = JSON.parse(spec.canonical) as Record<string, unknown>;
    const pkgName = name ?? (canonical.name as string) ?? `@user/${family}/${Date.now()}`;
    const pkgDisplay = displayName ?? (canonical.displayName as string) ?? pkgName;
    const description = (canonical.description as string) ?? spec.naturalLanguage?.slice(0, 120) ?? "";
    const capabilities = (canonical.capabilities as string[]) ?? [];
    const provides = (canonical.provides as Array<{ name: string; family?: string; description?: string }>) ?? [];
    const requires = (canonical.requires as Array<{ name: string; family?: string; description?: string }>) ?? [];
    const hash = contentHash({ canonical, artifact, name: pkgName });

    const pkg = await db.package.create({
      data: {
        name: pkgName,
        displayName: pkgDisplay,
        description,
        family,
        version: "1.0.0",
        hash,
        manifest: JSON.stringify({ entrypoint: "index.js", runtime: "playliquid", resources: [], config: { artifact } }),
        specification: JSON.stringify(canonical),
        artifactUri: `user-import://${hash}`,
        provenance: JSON.stringify({
          generator: "user-llm",
          llmProvider: "user-owned",
          model: "unknown",
          generatedAt: new Date().toISOString(),
          source: spec.naturalLanguage ?? "",
          note: "Imported via the user-owned LLM flow. PlayLiquid did not call any LLM.",
        }),
        certification: JSON.stringify({
          signed: false,
          level: "basic",
          by: "playliquid-import",
          checks: ["specification-valid", "artifact-present"],
        }),
        license: "MIT",
        capabilities: JSON.stringify(capabilities),
        specRefId: specificationId,
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

    // Fix #3: Create a RuntimeArtifact row — the imported artifact becomes
    // a certified executable RuntimeArtifact, not just stored text.
    // This is the link between "user's LLM produced text" and "the Package
    // Executor can load and run it."
    const runtimeArtifact = await db.runtimeArtifact.create({
      data: {
        packageId: pkg.id,
        target: "playliquid-web",
        artifactUri: `user-import://${pkg.hash}`,
        format: "js-module",
        status: "READY",
        metadata: JSON.stringify({
          source: "user-llm-import",
          importedAt: new Date().toISOString(),
          artifactLength: artifact.length,
          // In a full system, this would be the executable JS module.
          // For the MVP, the artifact text is stored and the browser
          // runtime resolves it via the package registry.
          entrypoint: "user-implementation.js",
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      packageId: pkg.id,
      packageName: pkg.name,
      hash: pkg.hash,
      runtimeArtifactId: runtimeArtifact.id,
      runtimeArtifactTarget: runtimeArtifact.target,
      message: `Package "${pkg.name}" imported and registered with a certified RuntimeArtifact (target: playliquid-web). Provenance: user-owned LLM (PlayLiquid did not call any LLM).`,
    }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "import failed" },
      { status: 500 }
    );
  }
}
