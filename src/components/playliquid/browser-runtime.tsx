"use client";

// ════════════════════════════════════════════════════════════════
// PLAYLIQUID 3D WEB RUNTIME — Three.js Package Executor
// ════════════════════════════════════════════════════════════════
//
// The world is now 3D. The browser runtime uses Three.js as the render
// adapter. Packages still issue engine-agnostic draw commands through
// RenderContext — the ThreeRenderContext adapter translates them to
// Three.js meshes.
//
// The browser runtime is still GENERIC — it doesn't know what an avatar,
// building, or player is. It loads declarative artifacts and executes
// them through the PackageExecutor.

import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Monitor, Play, Pause, Crosshair, Box, Anchor, Radio, Cpu, Terminal,
  Shield, ShieldCheck, Users, Wifi, Zap, Layers,
} from "lucide-react";
import * as THREE from "three";
import type {
  KernelContext, PackageInstance, PackageImplementation, RenderContext, DrawOpts, TextOpts, DrawOpts3D,
} from "@/lib/playliquid/package-abi";
import { artifactLoader } from "@/lib/playliquid/packages";
import { validateDeclarativeArtifact, createDeclarativeImplementation } from "@/lib/playliquid/declarative-artifact";
import { ResourceGuard } from "@/lib/playliquid/resource-guard";
import { DEFAULT_LIMITS } from "@/lib/playliquid/certification";

// ── Scene types ───────────────────────────────────────────────────
interface SceneEntity {
  id: string; name: string;
  package: { name: string; family: string; displayName: string } | null;
  position: { x: number; y: number; z: number };
  components: string[]; state: Record<string, unknown>;
  artifact: { target: string; format: string; artifactUri: string } | null;
  declarativeArtifact: string | null;
}
interface WorldScene {
  world: { id: string; name: string; slug: string; buildVersion: number; buildHash: string };
  anchors: Array<{ id: string; semanticId: string; displayName: string; global: { x: number; y: number; z: number }; type: string }>;
  entities: SceneEntity[];
  capabilities: Array<{ layer: string; capability: string; rules: unknown[] }>;
  runtime: { adapter: string; theme: string; coordinateSystem: string; protocolVersion: string };
  nodes: Array<{ id: string; host: string; status: string }>;
}
interface AuthoritativeEntity {
  position: { x: number; y: number; z: number };
  state: Record<string, unknown>;
}
interface SessionInfo { sessionId: string; name: string; connectedAt: number; }

// ── ThreeRenderContext: translates draw commands to Three.js meshes ──
class ThreeRenderContext implements RenderContext {
  public screenX = 0; public screenY = 0;
  public scale = 1; public selected = false;

  private currentMesh: THREE.Mesh | null = null;
  private currentGroup: THREE.Group;

  constructor(
    private scene: THREE.Scene,
    public worldX: number,
    public worldY: number,
    public worldZ: number,
    private meshCache: Map<string, THREE.Mesh>,
    private entityId: string,
  ) {
    this.currentGroup = new THREE.Group();
    this.currentGroup.position.set(worldX, worldY, worldZ);
  }

  // 3D commands
  drawBox(w: number, h: number, d: number, opts: DrawOpts3D): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color: opts.color,
      emissive: opts.emissive ?? new THREE.Color(opts.color).multiplyScalar(0.2),
      metalness: opts.metalness ?? 0.3,
      roughness: opts.roughness ?? 0.7,
      transparent: opts.opacity !== undefined && opts.opacity < 1,
      opacity: opts.opacity ?? 1,
      wireframe: opts.wireframe ?? false,
    });
    this.currentMesh = new THREE.Mesh(geo, mat);
    this.currentGroup.add(this.currentMesh);
  }

  drawSphere(r: number, opts: DrawOpts3D): void {
    const geo = new THREE.SphereGeometry(r, 24, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: opts.color,
      emissive: opts.emissive ?? new THREE.Color(opts.color).multiplyScalar(0.3),
      metalness: opts.metalness ?? 0.3,
      roughness: opts.roughness ?? 0.7,
      transparent: opts.opacity !== undefined && opts.opacity < 1,
      opacity: opts.opacity ?? 1,
      wireframe: opts.wireframe ?? false,
    });
    this.currentMesh = new THREE.Mesh(geo, mat);
    this.currentGroup.add(this.currentMesh);
  }

  drawCylinder(rt: number, rb: number, h: number, opts: DrawOpts3D): void {
    const geo = new THREE.CylinderGeometry(rt, rb, h, 16);
    const mat = new THREE.MeshStandardMaterial({ color: opts.color, emissive: opts.emissive });
    this.currentMesh = new THREE.Mesh(geo, mat);
    this.currentGroup.add(this.currentMesh);
  }

  drawCone(r: number, h: number, opts: DrawOpts3D): void {
    const geo = new THREE.ConeGeometry(r, h, 16);
    const mat = new THREE.MeshStandardMaterial({ color: opts.color, emissive: opts.emissive });
    this.currentMesh = new THREE.Mesh(geo, mat);
    this.currentGroup.add(this.currentMesh);
  }

  drawMesh(_vertices: number[], _indices: number[], _opts: DrawOpts3D): void { /* future */ }
  setPosition(x: number, y: number, z: number): void { this.currentGroup.position.set(x, y, z); }
  setRotation(x: number, y: number, z: number): void { this.currentGroup.rotation.set(x, y, z); }
  setScale(s: number): void { this.currentGroup.scale.setScalar(s); }
  drawText3D?(_x: number, _y: number, _z: number, _text: string, _opts: TextOpts): void { /* future: sprite text */ }

  // 2D commands (no-ops in 3D mode — the text renderer uses these)
  drawRect(): void {}
  drawCircle(): void {}
  drawLine(): void {}
  drawText(): void {}
  drawPath(): void {}
  pushTransform(): void {}
  popTransform(): void {}

  // Called by the executor after render() to commit the group to the scene
  commit(): THREE.Group {
    return this.currentGroup;
  }
}

// ── Capability cache ──────────────────────────────────────────────
const capabilityCache = new Map<string, { granted: boolean; action: string }>();

interface BrowserRuntimeProps { buildId: string | null; }

export function BrowserRuntime({ buildId }: BrowserRuntimeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<WorldScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [renderer, setRenderer] = useState<"3d" | "text">("3d");
  const [textOutput, setTextOutput] = useState("");
  const [tickCount, setTickCount] = useState(0);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [transport, setTransport] = useState<"websocket" | "sse">("sse");
  const [wsPort, setWsPort] = useState<number>(3002);

  const sceneRef = useRef<WorldScene | null>(null);
  const authStateRef = useRef<Map<string, AuthoritativeEntity>>(new Map());
  const packageInstancesRef = useRef<Map<string, PackageInstance>>(new Map());
  const eventHandlersRef = useRef<Map<string, Array<(p: Record<string, unknown>) => void>>>(new Map());
  const threeSceneRef = useRef<THREE.Scene | null>(null);
  const threeRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const threeCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const entityGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const animationRef = useRef<number>(0);
  const keysRef = useRef<Record<string, boolean>>({});
  const cameraAngleRef = useRef({ theta: 0, phi: 0.6, distance: 40 });
  const socketRef = useRef<Socket | null>(null);
  const transportRef = useRef<"websocket" | "sse">("sse");
  const sessionIdRef = useRef<string | null>(null);
  // Phase L: shared audit log for all ResourceGuards (capability + kill events)
  const auditLogRef = useRef<Array<{ timestamp: number; entityId: string; event: string; details: Record<string, unknown> }>>([]);

  // Fetch scene
  useEffect(() => {
    if (!buildId) return;
    let cancelled = false;
    async function fetchScene() {
      try {
        const res = await fetch(`/api/runtime/${buildId}/scene`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as WorldScene;
        if (!cancelled) { setScene(data); sceneRef.current = data; setError(null); }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load scene"); }
    }
    fetchScene();
  }, [buildId]);

  // Keep sessionIdRef synced (for transport-aware mutation helpers)
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { transportRef.current = transport; }, [transport]);

  // ── Shared message handler (identical for WS + SSE) ─────────────
  // G1.2: both transports emit the SAME JSON. One handler, two pipes.
  const handleTransportMessage = useCallback((raw: string) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "snapshot") {
        const map = new Map<string, AuthoritativeEntity>();
        for (const e of (msg.entities as Array<{ entityId: string; position: { x: number; y: number; z: number }; state: Record<string, unknown> }>)) {
          map.set(e.entityId, { position: e.position, state: e.state });
        }
        authStateRef.current = map;
        setSessions(msg.sessions ?? []);
      } else if (msg.type === "state") {
        authStateRef.current.set(msg.entityId, { position: msg.position, state: msg.state });
      } else if (msg.type === "event") {
        if (msg.event === "session.join" || msg.event === "session.leave") {
          // For WS transport the session list comes in the snapshot/ack;
          // for SSE we fetch it. Both paths keep sessions in sync.
          if (transportRef.current === "sse") {
            fetch(`/api/runtime/${buildId}/session`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "list" }),
            }).then(r => r.json()).then(data => setSessions(data.sessions ?? [])).catch(() => {});
          }
        }
        if (msg.event === "entity.remove") {
          authStateRef.current.delete(msg.entityId);
          entityGroupsRef.current.delete(msg.entityId);
        }
      } else if (msg.type === "handoff") {
        // Phase I: the entity crossed a zone boundary. Switch to the
        // target node's WS port. The session ID is preserved — no
        // re-authentication. The new node already has the entity (it
        // was forwarded by the control plane's handoff coordinator).
        const newWsPort = msg.toNodeWsPort as number;
        const handoffSessionId = msg.sessionId as string | undefined;
        if (typeof newWsPort === "number" && newWsPort > 0) {
          // Preserve the session ID across the handoff
          if (handoffSessionId) {
            setSessionId(handoffSessionId);
            sessionIdRef.current = handoffSessionId;
          }
          // Switch to the new node's WS port (triggers the WS effect to
          // reconnect via the wsPort dependency)
          setWsPort(newWsPort);
          setTransport("websocket");
        }
      }
    } catch { /* parse error */ }
  }, [buildId]);

  // ── WebSocket transport (primary) ───────────────────────────────
  // G1.2: socket.io to the World Node's WS port via the gateway
  // (XTransformPort). Bidirectional: join/move/mutate are emits, not
  // HTTP POSTs. Falls back to SSE if the World Node WS is unreachable.
  useEffect(() => {
    if (!buildId || transport !== "websocket") return;
    const sock = io(`/?XTransformPort=${wsPort}`, {
      transports: ["websocket", "polling"],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      timeout: 4000,
    });
    socketRef.current = sock;

    sock.on("connect", () => {
      setConnected(true);
      // Phase I: if we already have a sessionId (e.g. after a handoff),
      // do NOT re-join — the target node already has our entity. Just
      // connect and receive the snapshot (which includes our entity).
      const existingSid = sessionIdRef.current;
      if (existingSid) {
        // Session already exists (handoff or reconnect) — no new avatar
        return;
      }
      // Fresh join — spawn a new avatar
      sock.emit("session:join", { name: `Player-${Math.random().toString(36).slice(2, 6)}` }, (ack: unknown) => {
        const a = ack as { ok?: boolean; sessionId?: string; sessions?: SessionInfo[] };
        if (a?.ok && a.sessionId) {
          setSessionId(a.sessionId);
          sessionIdRef.current = a.sessionId;
          setSessions(a.sessions ?? []);
        }
      });
    });
    sock.on("disconnect", () => setConnected(false));
    sock.on("message", (data: string) => handleTransportMessage(data));

    return () => {
      // Phase I: do NOT emit session:leave on cleanup if this is a
      // handoff (the entity was already transferred). Only leave on
      // full unmount (buildId change).
      sock.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [buildId, transport, wsPort, handleTransportMessage]);

  // ── SSE transport (fallback) ────────────────────────────────────
  // Join session + stream. Used when transport === "sse" (default) or
  // when the World Node WS is not running.
  useEffect(() => {
    if (!buildId || transport !== "sse") return;
    fetch(`/api/runtime/${buildId}/session`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", name: `Player-${Math.random().toString(36).slice(2, 6)}` }),
    }).then(r => r.json()).then(data => {
      setSessionId(data.sessionId);
      setSessions(data.sessions ?? []);
    }).catch(() => {});
    return () => {
      if (sessionIdRef.current) {
        fetch(`/api/runtime/${buildId}/session`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "leave", sessionId: sessionIdRef.current }),
        }).catch(() => {});
      }
    };
  }, [buildId, transport]);

  useEffect(() => {
    if (!buildId || transport !== "sse") return;
    const es = new EventSource(`/api/runtime/${buildId}/stream`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => handleTransportMessage(ev.data);
    return () => { es.close(); setConnected(false); };
  }, [buildId, transport, handleTransportMessage]);

  // Real Kernel capability enforcement
  const invokeCapabilityReal = useCallback(async (entityId: string, capability: string) => {
    const cacheKey = `${entityId}:${capability}`;
    if (capabilityCache.has(cacheKey)) return capabilityCache.get(cacheKey)!;
    const s = sceneRef.current;
    if (!s) return { granted: false, action: "deny" as const };
    try {
      const res = await fetch("/api/capabilities/negotiate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: s.entities.find((e) => e.id === entityId)?.package?.name, worldProjectId: s.world.id }),
      });
      if (!res.ok) return { granted: false, action: "deny" as const };
      const data = await res.json();
      const effective = (data.effective as Array<{ capability: string; granted: boolean; action: string }>) ?? [];
      const result = effective.find((e) => e.capability === capability);
      const final = result ? { granted: result.granted, action: result.action as "allow" | "deny" | "limit" } : { granted: false, action: "deny" as const };
      capabilityCache.set(cacheKey, final);
      return final;
    } catch { return { granted: false, action: "deny" as const }; }
  }, []);

  // G1.2: transport-aware mutation. WS emits; SSE falls back to HTTP POST.
  function sendMutate(entityId: string, mutation: { positionPatch?: { x: number; y: number; z: number }; statePatch?: Record<string, unknown> }) {
    if (!buildId) return;
    const sock = socketRef.current;
    if (sock && transportRef.current === "websocket" && sock.connected) {
      sock.emit("entity:mutate", { entityId, ...mutation });
    } else {
      fetch(`/api/runtime/${buildId}/mutate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId, ...mutation }),
      }).catch(() => {});
    }
  }

  function createKernelContext(entity: SceneEntity): KernelContext {
    return {
      entityId: entity.id, entityName: entity.name,
      getPosition: () => authStateRef.current.get(entity.id)?.position ?? entity.position,
      requestMovement: (delta) => sendMutate(entity.id, { positionPatch: delta }),
      getState: () => authStateRef.current.get(entity.id)?.state ?? entity.state,
      setState: (patch) => sendMutate(entity.id, { statePatch: patch }),
      emit: (event, payload) => { (eventHandlersRef.current.get(event) ?? []).forEach((h) => h(payload)); },
      on: (event, handler) => {
        if (!eventHandlersRef.current.has(event)) eventHandlersRef.current.set(event, []);
        eventHandlersRef.current.get(event)!.push(handler);
      },
      invokeCapability: async (capability) => {
        const result = await invokeCapabilityReal(entity.id, capability);
        return result;
      },
      requestService: async () => ({ ok: true }),
      log: () => {},
    };
  }

  // Initialize package instances
  useEffect(() => {
    if (!scene) return;
    for (const entity of scene.entities) {
      if (!entity.package || packageInstancesRef.current.has(entity.id)) continue;
      let impl: PackageImplementation | null = null;
      if (entity.declarativeArtifact) {
        const v = validateDeclarativeArtifact(entity.declarativeArtifact);
        if (v.valid && v.artifact) impl = createDeclarativeImplementation(v.artifact);
      }
      if (!impl) impl = artifactLoader.resolveByName(entity.package.name, entity.package.family);
      if (impl) {
        const ctx = createKernelContext(entity);
        const rawInst = impl.createInstance();
        // Phase L: wrap in ResourceGuard to enforce certification limits at runtime
        const inst = new ResourceGuard(rawInst, entity.id, DEFAULT_LIMITS, 42, auditLogRef.current);
        inst.initialize(ctx, { name: entity.package.name, displayName: entity.package.displayName, family: entity.package.family, version: "1.0.0", specification: {}, capabilities: impl.capabilities, provides: [], requires: [] });
        inst.mount();
        packageInstancesRef.current.set(entity.id, inst);
      }
    }
    // SSE entities
    const sceneIds = new Set(scene.entities.map((e) => e.id));
    for (const [entityId, auth] of authStateRef.current.entries()) {
      if (sceneIds.has(entityId) || packageInstancesRef.current.has(entityId)) continue;
      const da = (auth.state.declarativeArtifact as string) ?? null;
      if (!da) continue;
      const v = validateDeclarativeArtifact(da);
      if (!v.valid || !v.artifact) continue;
      const impl = createDeclarativeImplementation(v.artifact);
      const entityLike: SceneEntity = { id: entityId, name: (auth.state.name as string) ?? "Entity", package: { name: v.artifact.name, family: v.artifact.family, displayName: v.artifact.displayName }, position: auth.position, components: [], state: auth.state, artifact: null, declarativeArtifact: da };
      const ctx = createKernelContext(entityLike);
      const rawInst = impl.createInstance();
      // Phase L: wrap in ResourceGuard to enforce certification limits at runtime
      const inst = new ResourceGuard(rawInst, entityId, DEFAULT_LIMITS, 42, auditLogRef.current);
      inst.initialize(ctx, { name: v.artifact.name, displayName: v.artifact.displayName, family: v.artifact.family, version: "1.0.0", specification: {}, capabilities: impl.capabilities, provides: [], requires: [] });
      inst.mount();
      packageInstancesRef.current.set(entityId, inst);
    }
  }, [scene, createKernelContext, buildId, invokeCapabilityReal]);

  // WASD movement (3D: X/Z plane)
  useEffect(() => {
    if (!buildId || !sessionId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      keysRef.current[e.key.toLowerCase()] = true;
    }
    function onKeyUp(e: KeyboardEvent) { keysRef.current[e.key.toLowerCase()] = false; }
    const moveInterval = setInterval(() => {
      const keys = keysRef.current;
      let dx = 0, dz = 0, dy = 0;
      const speed = 1.5;
      if (keys["w"]) dz -= speed;
      if (keys["s"]) dz += speed;
      if (keys["a"]) dx -= speed;
      if (keys["d"]) dx += speed;
      if (keys[" "]) dy += speed; // space = up
      if (keys["shift"]) dy -= speed; // shift = down
      if (dx === 0 && dz === 0 && dy === 0) return;
      // G1.2: WS primary, SSE/HTTP fallback for player movement
      const sock = socketRef.current;
      if (sock && transportRef.current === "websocket" && sock.connected) {
        sock.emit("player:move", { sessionId, deltaX: dx, deltaZ: dz });
      } else {
        fetch(`/api/runtime/${buildId}/move-player`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, deltaX: dx, deltaZ: dz }),
        }).catch(() => {});
      }
    }, 50);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); clearInterval(moveInterval); };
  }, [buildId, sessionId]);

  // Auto-tick
  useEffect(() => {
    if (!buildId || !connected) return;
    const interval = setInterval(() => {
      fetch(`/api/runtime/${buildId}/tick`, { method: "POST" }).then(r => r.json()).then(() => setTickCount(c => c + 1)).catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [buildId, connected]);

  // ── 3D Render loop (Three.js) ────────────────────────────────────
  useEffect(() => {
    if (renderer !== "3d" || !scene || !mountRef.current) return;

    // Setup Three.js
    const mount = mountRef.current;
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    const threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(0x0a0a0b);
    threeScene.fog = new THREE.Fog(0x0a0a0b, 50, 200);
    threeSceneRef.current = threeScene;

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 500);
    threeCameraRef.current = camera;

    const renderer3d = new THREE.WebGLRenderer({ antialias: true });
    renderer3d.setSize(w, h);
    renderer3d.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer3d.domElement);
    threeRendererRef.current = renderer3d;

    // Lighting
    const ambient = new THREE.AmbientLight(0x404060, 1.5);
    threeScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(20, 30, 20);
    threeScene.add(dirLight);
    const hemiLight = new THREE.HemisphereLight(0x4488ff, 0x080820, 0.5);
    threeScene.add(hemiLight);

    // Grid floor
    const grid = new THREE.GridHelper(200, 40, 0x4eeab8, 0x1a2a3a);
    grid.position.y = -0.1;
    threeScene.add(grid);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x0d1117, roughness: 0.9, metalness: 0.1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    threeScene.add(ground);

    // Spatial anchors as markers
    for (const a of scene.anchors) {
      const anchorGeo = new THREE.RingGeometry(1, 1.5, 16);
      const anchorMat = new THREE.MeshBasicMaterial({ color: 0x4eeab8, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
      const anchorMesh = new THREE.Mesh(anchorGeo, anchorMat);
      anchorMesh.position.set(a.global.x, 0, a.global.z);
      anchorMesh.rotation.x = -Math.PI / 2;
      threeScene.add(anchorMesh);
    }

    // Mouse controls
    let mouseDown = false;
    let lastMouse = { x: 0, y: 0 };
    function onMouseDown(e: MouseEvent) { mouseDown = true; lastMouse = { x: e.clientX, y: e.clientY }; }
    function onMouseUp() { mouseDown = false; }
    function onMouseMove(e: MouseEvent) {
      if (!mouseDown) return;
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      cameraAngleRef.current.theta -= dx * 0.01;
      cameraAngleRef.current.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, cameraAngleRef.current.phi - dy * 0.01));
      lastMouse = { x: e.clientX, y: e.clientY };
    }
    function onWheel(e: WheelEvent) {
      cameraAngleRef.current.distance = Math.max(10, Math.min(100, cameraAngleRef.current.distance + e.deltaY * 0.05));
    }
    mount.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    mount.addEventListener("wheel", onWheel);

    // Render loop
    let running = true;
    const loop = () => {
      if (!running) return;
      const s = sceneRef.current;
      if (s) {
        // Clear old entity groups
        for (const [, group] of entityGroupsRef.current) {
          threeScene.remove(group);
        }
        entityGroupsRef.current.clear();

        // Update + render all entities
        const allEntities = [
          ...s.entities.map((e) => ({ id: e.id, position: authStateRef.current.get(e.id)?.position ?? e.position })),
          ...Array.from(authStateRef.current.entries())
            .filter(([id]) => !s.entities.some((e) => e.id === id))
            .map(([id, auth]) => ({ id, position: auth.position })),
        ];

        for (const entity of allEntities) {
          const inst = packageInstancesRef.current.get(entity.id);
          if (!inst) continue;

          // Update
          inst.update(16);

          // Render via ThreeRenderContext
          const rc = new ThreeRenderContext(threeScene, entity.position.x, entity.position.y, entity.position.z, entityGroupsRef.current, entity.id);
          rc.selected = selectedEntity === entity.id;
          inst.render(rc);
          const group = rc.commit();
          group.position.set(entity.position.x, entity.position.y, entity.position.z);
          threeScene.add(group);
          entityGroupsRef.current.set(entity.id, group);
        }

        // Camera orbit
        const cam = cameraAngleRef.current;
        camera.position.x = Math.sin(cam.theta) * Math.cos(cam.phi) * cam.distance;
        camera.position.y = Math.sin(cam.phi) * cam.distance;
        camera.position.z = Math.cos(cam.theta) * Math.cos(cam.phi) * cam.distance;
        camera.lookAt(0, 0, 0);
      }

      renderer3d.render(threeScene, camera);
      animationRef.current = requestAnimationFrame(loop);
    };
    loop();

    // Resize handler
    function onResize() {
      if (!mount || !renderer3d || !camera) return;
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer3d.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      cancelAnimationFrame(animationRef.current);
      mount.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      mount.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      if (mount.contains(renderer3d.domElement)) mount.removeChild(renderer3d.domElement);
      renderer3d.dispose();
    };
  }, [scene, renderer, selectedEntity]);

  // Text renderer
  useEffect(() => {
    if (renderer !== "text" || !scene) return;
    const interval = setInterval(() => {
      const s = sceneRef.current;
      if (!s) return;
      const lines: string[] = [];
      lines.push("═══ PlayLiquid Text Runtime (3D adapter) ═══");
      lines.push(`World: ${s.world.name} v${s.world.buildVersion}`);
      lines.push(`${connected ? "● connected" : "○ disconnected"} · ${sessions.length} players · tick #${tickCount}`);
      lines.push("");
      for (const entity of s.entities) {
        const auth = authStateRef.current.get(entity.id);
        const pos = auth?.position ?? entity.position;
        lines.push(`[${entity.id.slice(0, 8)}] ${entity.name} (${entity.package?.family ?? "?"})`);
        lines.push(`  3D pos: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);
      }
      setTextOutput(lines.join("\n"));
    }, 500);
    return () => clearInterval(interval);
  }, [scene, renderer, connected, sessions, tickCount]);

  if (!buildId) return <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">Select a World Build to run.</div>;
  if (error) return <div className="flex h-64 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/[0.04] text-sm text-rose-300">Runtime error: {error}</div>;
  if (!scene) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading world scene…</div>;

  const loadedCount = packageInstancesRef.current.size;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"><Monitor className="mr-1 h-3 w-3" />PlayLiquid 3D Runtime</Badge>
        <Badge variant="outline" className={`font-mono text-[9px] ${connected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"}`}><Wifi className="mr-1 h-2.5 w-2.5" />{connected ? "connected" : "disconnected"}</Badge>
        <Badge variant="outline" className={`font-mono text-[9px] ${transport === "websocket" ? "border-violet-500/30 bg-violet-500/10 text-violet-300" : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"}`}>{transport === "websocket" ? "WS" : "SSE"}</Badge>
        <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 font-mono text-[9px] text-sky-300"><Users className="mr-1 h-2.5 w-2.5" />{sessions.length} player{sessions.length === 1 ? "" : "s"}</Badge>
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 font-mono text-[9px] text-amber-300"><Cpu className="mr-1 h-2.5 w-2.5" />{loadedCount} instances</Badge>
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300"><Zap className="mr-1 h-2.5 w-2.5" />tick #{tickCount}</Badge>
        <span className="ml-auto text-xs text-muted-foreground">{scene.world.name} · v{scene.world.buildVersion}</span>
        <Select value={renderer} onValueChange={(v) => setRenderer(v as "3d" | "text")}>
          <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3d">3D (Three.js)</SelectItem>
            <SelectItem value="text">Text adapter</SelectItem>
          </SelectContent>
        </Select>
        <Select value={transport} onValueChange={(v) => setTransport(v as "websocket" | "sse")}>
          <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="websocket">WebSocket</SelectItem>
            <SelectItem value="sse">SSE (fallback)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {connected && sessions.length > 1 && (
        <Card className="border-sky-500/20 bg-sky-500/[0.03]">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs">
              <Users className="h-4 w-4 text-sky-400" />
              <span className="font-medium text-sky-300">Multiplayer active</span>
              <span className="text-muted-foreground">— {sessions.length} players connected. WASD to move, mouse to orbit, scroll to zoom.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {renderer === "3d" ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
          <Card className="overflow-hidden border-border bg-card/40">
            <div ref={mountRef} className="w-full" style={{ height: "450px", cursor: "grab" }} />
          </Card>
          <div className="space-y-3">
            <Card className="border-border bg-card/40">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Users className="h-3.5 w-3.5 text-sky-400" />Players</CardTitle></CardHeader>
              <CardContent><div className="space-y-1">{sessions.length === 0 ? <p className="text-[11px] text-muted-foreground">No players</p> : sessions.map((s) => (<div key={s.sessionId} className="flex items-center gap-2 text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /><span className="font-mono text-foreground/70">{s.name}</span></div>))}</div></CardContent>
            </Card>
            <Card className="border-border bg-card/40">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Anchor className="h-3.5 w-3.5 text-primary" />Spatial Anchors</CardTitle></CardHeader>
              <CardContent><div className="max-h-32 space-y-0.5 overflow-y-auto scroll-thin">{scene.anchors.slice(0, 8).map((a) => (<div key={a.id} className="flex items-center gap-1.5 text-[10px]"><span className="font-mono text-emerald-300/70">{a.semanticId.split(".").pop()}</span><span className="ml-auto font-mono text-muted-foreground/60">({a.global.x.toFixed(0)}, {a.global.z.toFixed(0)})</span></div>))}</div></CardContent>
            </Card>
            <Card className="border-border bg-card/40">
              <CardHeader className="pb-2"><CardTitle className="text-xs">Controls</CardTitle></CardHeader>
              <CardContent><div className="space-y-1 text-[10px] text-muted-foreground"><p><kbd className="rounded bg-muted px-1">WASD</kbd> Move on ground plane</p><p><kbd className="rounded bg-muted px-1">Space/Shift</kbd> Up/Down</p><p><kbd className="rounded bg-muted px-1">Mouse drag</kbd> Orbit camera</p><p><kbd className="rounded bg-muted px-1">Scroll</kbd> Zoom</p></div></CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="border-border bg-card/40">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Terminal className="h-3.5 w-3.5 text-primary" />Text Runtime — Second Adapter</CardTitle></CardHeader>
          <CardContent><pre className="overflow-auto rounded border border-border/50 bg-background/60 p-3 font-mono text-[10px] leading-relaxed text-foreground/80 scroll-thin">{textOutput}</pre></CardContent>
        </Card>
      )}

      <Card className="border-border bg-card/40">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Radio className="h-3.5 w-3.5 text-primary" />PlayLiquid Protocol — 3D</CardTitle></CardHeader>
        <CardContent><div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300"><Box className="mr-1 h-2.5 w-2.5" />{scene.entities.length} entities</Badge>
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300"><Anchor className="mr-1 h-2.5 w-2.5" />{scene.anchors.length} anchors</Badge>
          <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 font-mono text-[9px] text-sky-300"><Wifi className="mr-1 h-2.5 w-2.5" />SSE stream</Badge>
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300"><ShieldCheck className="mr-1 h-2.5 w-2.5" />Kernel authority</Badge>
          <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 font-mono text-[9px] text-violet-300">Three.js 3D adapter</Badge>
        </div></CardContent>
      </Card>
    </div>
  );
}
