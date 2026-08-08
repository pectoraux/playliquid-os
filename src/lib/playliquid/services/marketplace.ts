// ════════════════════════════════════════════════════════════════
// MARKETPLACE SERVICE — Publication, Discovery, Versioning
// ════════════════════════════════════════════════════════════════
//
// Phase N: Real registry/marketplace. A package can have multiple
// published versions. Each version is immutable: version string,
// content hash, artifact URI, changelog, certification, license.
//
// Contracts fulfilled:
//   - marketplace.publish: publish a new version (certify + version bump)
//   - marketplace.search: browse by family, certification, popularity
//   - marketplace.resolve: semver resolution ("^1.0.0", "~1.2.0", "latest")
//   - marketplace.license: SPDX license enforcement (reject unknown licenses)
//
// The OS provides this; packages are published, versioned, discovered,
// and consumed through it. Never LLM-re-implemented.

import { db } from "@/lib/db";
import { contentHash } from "../hashing";
import { certifyArtifact } from "../certification";

export interface PublishedVersion {
  id: string;
  packageId: string;
  packageName: string;
  version: string;
  hash: string;
  artifactUri: string;
  changelog: string;
  license: string;
  certification: Record<string, unknown>;
  status: string;
  publishedBy: string;
  downloadCount: number;
  createdAt: Date;
}

function mapVersion(v: any): PublishedVersion {
  return {
    id: v.id,
    packageId: v.packageId,
    packageName: v.package?.name ?? "",
    version: v.version,
    hash: v.hash,
    artifactUri: v.artifactUri,
    changelog: v.changelog,
    license: v.license,
    certification: (() => { try { return JSON.parse(v.certification); } catch { return {}; } })(),
    status: v.status,
    publishedBy: v.publishedBy,
    downloadCount: v.downloadCount,
    createdAt: v.createdAt,
  };
}

// ── Valid SPDX licenses (enforcement) ────────────────────────────
const VALID_LICENSES = new Set([
  "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MPL-2.0",
  "GPL-2.0", "GPL-3.0", "LGPL-2.1", "LGPL-3.0", "AGPL-3.0", "Unlicense",
  "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "Proprietary",
]);

export function isValidLicense(license: string): boolean {
  return VALID_LICENSES.has(license);
}

export function listValidLicenses(): string[] {
  return Array.from(VALID_LICENSES).sort();
}

// ── Publish a new version ────────────────────────────────────────
// Creates a new PackageVersion (immutable). If the package doesn't
// exist, creates it. If it does, bumps the version. Certifies the
// artifact at publish time. Rejects duplicate versions.
export async function publishVersion(params: {
  packageName: string;
  displayName?: string;
  description?: string;
  family: string;
  version: string;
  artifact: unknown; // the declarative or executable artifact
  changelog?: string;
  license?: string;
  publishedBy?: string;
  capabilities?: string[];
}): Promise<{ version: PublishedVersion; certification: Record<string, unknown> }> {
  const {
    packageName, displayName, description, family, version, artifact,
    changelog, license = "MIT", publishedBy = "anonymous", capabilities = [],
  } = params;

  // License enforcement
  if (!isValidLicense(license)) {
    throw new Error(`invalid license: ${license}. Valid: ${listValidLicenses().join(", ")}`);
  }

  // Semver format check
  if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version)) {
    throw new Error(`invalid semver: ${version}. Expected: X.Y.Z`);
  }

  // Certify the artifact at publish time
  const certResult = certifyArtifact(artifact, packageName);
  if (!certResult.certified) {
    throw new Error(`artifact certification failed: ${certResult.record.certificationEvidence.errors.join("; ")}`);
  }

  const hash = contentHash({ packageName, version, artifact });
  const artifactUri = `playliquid://${packageName}/${version}/${hash.slice(0, 16)}`;

  // Find or create the package
  const pkg = await db.package.upsert({
    where: { name: packageName },
    update: {
      displayName: displayName ?? undefined,
      description: description ?? undefined,
      family,
      license,
      capabilities: JSON.stringify(capabilities),
      hash, // update the "latest" hash
      certification: JSON.stringify(certResult.record), // update latest cert
      version, // update the "latest" version
      artifactUri,
    },
    create: {
      name: packageName,
      displayName: displayName ?? packageName,
      description: description ?? "",
      family,
      version,
      hash,
      manifest: JSON.stringify({ entrypoint: "declarative", runtime: "playliquid-web" }),
      specification: JSON.stringify({ name: packageName }),
      artifactUri,
      provenance: JSON.stringify({ generator: "marketplace", publishedBy, publishedAt: new Date().toISOString() }),
      certification: JSON.stringify(certResult.record),
      license,
      capabilities: JSON.stringify(capabilities),
    },
  });

  // Check for duplicate version
  const existing = await db.packageVersion.findUnique({
    where: { packageId_version: { packageId: pkg.id, version } },
  });
  if (existing) {
    throw new Error(`version ${version} already published for ${packageName}`);
  }

  // Create the immutable version
  const pkgVersion = await db.packageVersion.create({
    data: {
      packageId: pkg.id,
      version,
      hash,
      artifactUri,
      changelog: changelog ?? "",
      license,
      certification: JSON.stringify(certResult.record),
      status: "published",
      publishedBy,
    },
    include: { package: { select: { name: true } } },
  });

  return {
    version: mapVersion(pkgVersion),
    certification: certResult.record,
  };
}

// ── Search the marketplace ──────────────────────────────────────
export async function searchMarketplace(params: {
  query?: string;
  family?: string;
  certificationLevel?: string; // "none" | "basic" | "verified" | "certified"
  sortBy?: "recent" | "downloads" | "name";
  limit?: number;
  offset?: number;
}): Promise<{ packages: Array<any>; total: number }> {
  const { query, family, certificationLevel, sortBy = "recent", limit = 50, offset = 0 } = params;

  const where: Record<string, unknown> = {};
  if (family && family !== "all") where.family = family;
  if (query) {
    where.OR = [
      { name: { contains: query } },
      { displayName: { contains: query } },
      { description: { contains: query } },
    ];
  }

  const orderBy: Record<string, string> =
    sortBy === "downloads" ? { versions: "desc" } :
    sortBy === "name" ? { name: "asc" } :
    { createdAt: "desc" };

  const [packages, total] = await Promise.all([
    db.package.findMany({
      where,
      include: {
        versions: { orderBy: { version: "desc" }, take: 1 },
        provides: true,
        requires: true,
        _count: { select: { versions: true } },
      },
      orderBy: sortBy === "downloads" ? { createdAt: "desc" } : orderBy as any,
      take: limit,
      skip: offset,
    }),
    db.package.count({ where }),
  ]);

  // Filter by certification level (post-query, since it's in JSON)
  let filtered = packages.map((p) => {
    const cert = (() => { try { return JSON.parse(p.certification); } catch { return {}; } })();
    const latestVersion = p.versions[0];
    return {
      id: p.id,
      name: p.name,
      displayName: p.displayName,
      description: p.description,
      family: p.family,
      license: p.license,
      certificationLevel: cert.certificationLevel ?? cert.level ?? "none",
      latestVersion: latestVersion?.version ?? p.version,
      latestHash: latestVersion?.hash ?? p.hash,
      versionCount: p._count.versions,
      downloadCount: p.versions.reduce((sum: number, v: any) => sum + (v.downloadCount ?? 0), 0),
    };
  });

  if (certificationLevel) {
    filtered = filtered.filter((p) => p.certificationLevel === certificationLevel);
  }

  return { packages: filtered, total: certificationLevel ? filtered.length : total };
}

// ── Semver resolution ───────────────────────────────────────────
// Supports: "latest", "1.2.3" (exact), "^1.0.0" (compatible), "~1.2.0" (patch)
export async function resolveVersion(
  packageName: string,
  versionRange: string = "latest"
): Promise<PublishedVersion | null> {
  const pkg = await db.package.findUnique({
    where: { name: packageName },
    include: {
      versions: { where: { status: "published" }, orderBy: { version: "desc" } },
    },
  });
  if (!pkg || pkg.versions.length === 0) return null;

  if (versionRange === "latest") {
    return mapVersion(pkg.versions[0]);
  }

  // Exact version
  if (/^\d+\.\d+\.\d+$/.test(versionRange)) {
    const exact = pkg.versions.find((v) => v.version === versionRange);
    return exact ? mapVersion(exact) : null;
  }

  // Compatible: ^1.0.0 → any 1.x.x >= 1.0.0
  const caretMatch = versionRange.match(/^\^(\d+)\.(\d+)\.(\d+)$/);
  if (caretMatch) {
    const [, major, minor, patch] = caretMatch.map(Number);
    const compatible = pkg.versions.find((v) => {
      const [vMaj, vMin, vPat] = v.version.split(".").map(Number);
      return vMaj === major && (vMin > minor || (vMin === minor && vPat >= patch));
    });
    return compatible ? mapVersion(compatible) : null;
  }

  // Patch: ~1.2.0 → any 1.2.x >= 1.2.0
  const tildeMatch = versionRange.match(/^~(\d+)\.(\d+)\.(\d+)$/);
  if (tildeMatch) {
    const [, major, minor, patch] = tildeMatch.map(Number);
    const compatible = pkg.versions.find((v) => {
      const [vMaj, vMin, vPat] = v.version.split(".").map(Number);
      return vMaj === major && vMin === minor && vPat >= patch;
    });
    return compatible ? mapVersion(compatible) : null;
  }

  return null;
}

// ── List all versions of a package ──────────────────────────────
export async function listVersions(packageName: string): Promise<PublishedVersion[]> {
  const pkg = await db.package.findUnique({
    where: { name: packageName },
    include: {
      versions: { orderBy: { version: "desc" } },
    },
  });
  if (!pkg) return [];
  return pkg.versions.map(mapVersion);
}

// ── Increment download count ────────────────────────────────────
export async function recordDownload(versionId: string): Promise<void> {
  await db.packageVersion.update({
    where: { id: versionId },
    data: { downloadCount: { increment: 1 } },
  });
}

// ── Deprecate / yank a version ──────────────────────────────────
export async function setVersionStatus(versionId: string, status: "deprecated" | "yanked" | "published"): Promise<PublishedVersion> {
  const v = await db.packageVersion.update({
    where: { id: versionId },
    data: { status },
    include: { package: { select: { name: true } } },
  });
  return mapVersion(v);
}
