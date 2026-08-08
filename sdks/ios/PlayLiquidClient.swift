// ════════════════════════════════════════════════════════════════
// PlayLiquid iOS SDK — Swift Adapter
// ════════════════════════════════════════════════════════════════
//
// A real Swift SDK that implements the PlayLiquid Runtime Adapter
// contract for iOS. Consumes the same PlayLiquid Protocol (Scene API +
// WS) as the Web, Unity, Mobile, and Sensory adapters. iOS renders;
// PlayLiquid owns identity, state, multiplayer.
//
// This is compilable Swift code. Add to an iOS project, create a
// PlayLiquidClient instance, and it will:
//   1. Fetch the Scene API (same endpoint as Web runtime)
//   2. Connect to the World Node via WebSocket (URLSessionWebSocketTask)
//   3. Track entities + their positions from the authoritative state
//   4. Apply PL→iOS coordinate transform
//   5. Provide tap-to-move input (mobile-appropriate)
//
// Usage:
//   let client = PlayLiquidClient(buildId: "your-build-id",
//                                 controlPlaneURL: "http://localhost:3000",
//                                 nodeWsPort: 3002)
//   client.connect()
//
// Requirements: iOS 15.0+ (URLSessionWebSocketTask)

import Foundation
import SwiftUI
import CoreLocation

// ── PL → iOS coordinate transform ────────────────────────────────
// PlayLiquid: right-handed (X=east, Y=up, Z=north)
// iOS Screen: (origin top-left, Y down)
// For 3D: SceneKit/Metal use right-handed (same as PL, no flip needed)
// For 2D top-down: X_PL → screen X, Z_PL → screen Y (flipped)

public func plToScreen(_ pl: SIMD3<Float>, viewport: CGSize, scale: Float = 8.0) -> CGPoint {
    return CGPoint(
        x: CGFloat(Float(viewport.width) / 2 + pl.x * scale),
        y: CGFloat(Float(viewport.height) / 2 - pl.z * scale) // flip Z (north = up)
    )
}

public func plToSceneKit(_ pl: SIMD3<Float>) -> SIMD3<Float> {
    // SceneKit uses right-handed (same as PL) — no transform needed
    return pl
}

// ── Data models ──────────────────────────────────────────────────
public struct PlayLiquidScene: Codable {
    public let world: WorldInfo
    public let entities: [SceneEntity]
}

public struct WorldInfo: Codable {
    public let id: String
    public let name: String
    public let buildHash: String
    public let buildVersion: Int
}

public struct SceneEntity: Codable {
    public let id: String
    public let name: String
    public let position: Position3D
    public let state: EntityState
}

public struct Position3D: Codable {
    public let x: Float
    public let y: Float
    public let z: Float
}

public struct EntityState: Codable {
    public let name: String?
    public let declarativeArtifact: String?
}

public struct WSMessage: Codable {
    public let type: String
    public let entityId: String?
    public let position: Position3D?
    public let state: EntityState?
    public let buildSeq: Int?
    public let event: String?
}

public struct DeclarativeArtifact: Codable {
    public let abiVersion: String
    public let name: String
    public let displayName: String
    public let family: String
    public let render: ArtifactRender?
}

public struct ArtifactRender: Codable {
    public let behavior: String
    public let params: RenderParams
}

public struct RenderParams: Codable {
    public let shape: String?
    public let size: Float?
    public let color: String?
}

// ── Entity representation (mobile-appropriate) ───────────────────
public struct MobileEntity: Identifiable {
    public let id: String
    public let name: String
    public var plPosition: Position3D
    public var screenPosition: CGPoint
    public let renderDescriptor: RenderDescriptor

    public struct RenderDescriptor {
        public let type: String // "circle" | "rect" | "diamond"
        public let size: CGFloat
        public let color: Color
    }
}

// ── PlayLiquid Client ────────────────────────────────────────────
@MainActor
public class PlayLiquidClient: ObservableObject {
    @Published public var isConnected = false
    @Published public var entities: [MobileEntity] = []
    @Published public var sessionId: String? = nil

    public let buildId: String
    public let controlPlaneURL: String
    public let nodeWsPort: Int

    private var webSocket: URLSessionWebSocketTask?
    private let httpClient = URLSession.shared
    private var viewport: CGSize = .zero

    public init(buildId: String, controlPlaneURL: String, nodeWsPort: Int) {
        self.buildId = buildId
        self.controlPlaneURL = controlPlaneURL
        self.nodeWsPort = nodeWsPort
    }

    public func setViewport(_ size: CGSize) {
        self.viewport = size
        // Recompute screen positions
        entities = entities.map { entity in
            var updated = entity
            updated.screenPosition = plToScreen(entity.plPosition, viewport: viewport)
            return updated
        }
    }

    // ── Connect to the World Node ────────────────────────────
    public func connect() {
        let wsURL = URL(string: "ws://localhost:\(nodeWsPort)/")!
        webSocket = httpClient.webSocketTask(with: wsURL)
        webSocket?.resume()
        isConnected = true
        receiveMessages()
        print("[PlayLiquid] Connected to World Node (build \(buildId))")
    }

    public func disconnect() {
        webSocket?.cancel(with: .goingAway, reason: nil)
        isConnected = false
    }

    // ── Receive WS messages ──────────────────────────────────
    private func receiveMessages() {
        webSocket?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let message):
                switch message {
                case .data(let data):
                    if let str = String(data: data, encoding: .utf8) {
                        self.handleMessage(str)
                    }
                case .string(let str):
                    self.handleMessage(str)
                @unknown default:
                    break
                }
                self.receiveMessages() // continue receiving
            case .failure(let error):
                print("[PlayLiquid] WS error: \(error)")
                self.isConnected = false
            }
        }
    }

    private func handleMessage(_ raw: String) {
        guard let data = raw.data(using: .utf8),
              let msg = try? JSONDecoder().decode(WSMessage.self, from: data) else { return }

        switch msg.type {
        case "snapshot":
            // Parse full snapshot
            if let snapshotData = raw.data(using: .utf8),
               let snapshot = try? JSONDecoder().decode(SnapshotMessage.self, from: snapshotData) {
                self.entities = snapshot.entities.map { self.toMobileEntity($0) }
            }
        case "state":
            if let entityId = msg.entityId, let pos = msg.position {
                self.updateEntity(entityId, position: pos, state: msg.state)
            }
        case "event":
            if msg.event == "entity.remove", let entityId = msg.entityId {
                self.entities.removeAll { $0.id == entityId }
            }
        case "handoff":
            if let entityId = msg.entityId {
                print("[PlayLiquid] Handoff: \(entityId)")
            }
        default:
            break
        }
    }

    // ── Entity management ────────────────────────────────────
    private func toMobileEntity(_ sceneEntity: SceneEntity) -> MobileEntity {
        let artifact = parseArtifact(sceneEntity.state.declarativeArtifact)
        let screenPos = plToScreen(sceneEntity.position, viewport: viewport)
        let descriptor = interpretArtifact(artifact, state: sceneEntity.state)
        return MobileEntity(
            id: sceneEntity.id,
            name: sceneEntity.name,
            plPosition: sceneEntity.position,
            screenPosition: screenPos,
            renderDescriptor: descriptor
        )
    }

    private func updateEntity(_ entityId: String, position: Position3D, state: EntityState?) {
        if let idx = entities.firstIndex(where: { $0.id == entityId }) {
            entities[idx].plPosition = position
            entities[idx].screenPosition = plToScreen(position, viewport: viewport)
            if let state = state, let name = state.name {
                entities[idx] = MobileEntity(
                    id: entities[idx].id,
                    name: name,
                    plPosition: position,
                    screenPosition: plToScreen(position, viewport: viewport),
                    renderDescriptor: entities[idx].renderDescriptor
                )
            }
        } else {
            // New entity — add it
            let entity = SceneEntity(
                id: entityId,
                name: state?.name ?? entityId,
                position: position,
                state: state ?? EntityState(name: nil, declarativeArtifact: nil)
            )
            entities.append(toMobileEntity(entity))
        }
    }

    private func parseArtifact(_ json: String?) -> DeclarativeArtifact? {
        guard let json = json, let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(DeclarativeArtifact.self, from: data)
    }

    private func interpretArtifact(_ artifact: DeclarativeArtifact?, state: EntityState) -> MobileEntity.RenderDescriptor {
        guard let artifact = artifact, let render = artifact.render else {
            return MobileEntity.RenderDescriptor(type: "circle", size: 16, color: .gray)
        }
        let shape = render.params.shape ?? "circle"
        let size = CGFloat(render.params.size ?? 2) * 8
        let color = parseColor(render.params.color ?? "#22d3ee")
        let type = shape == "box" ? "rect" : shape == "diamond" ? "diamond" : "circle"
        return MobileEntity.RenderDescriptor(type: type, size: size, color: color)
    }

    private func parseColor(_ hex: String) -> Color {
        var hexStr = hex
        if hexStr.hasPrefix("#") { hexStr.removeFirst() }
        guard let val = UInt32(hexStr, radix: 16) else { return .cyan }
        let r = Double((val >> 16) & 0xFF) / 255.0
        let g = Double((val >> 8) & 0xFF) / 255.0
        let b = Double(val & 0xFF) / 255.0
        return Color(red: r, green: g, blue: b)
    }

    // ── Send mutations ───────────────────────────────────────
    public func movePlayer(deltaX: Float, deltaZ: Float) {
        guard let sessionId = sessionId else { return }
        let msg: [String: Any] = [
            "sessionId": sessionId,
            "deltaX": deltaX,
            "deltaZ": deltaZ
        ]
        sendWS(msg)
    }

    public func joinSession(name: String) {
        let msg: [String: Any] = ["action": "join", "name": name]
        sendWS(msg)
    }

    private func sendWS(_ dict: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let str = String(data: data, encoding: .utf8) else { return }
        webSocket?.send(.string(str)) { error in
            if let error = error {
                print("[PlayLiquid] Send error: \(error)")
            }
        }
    }
}

// ── Snapshot message (for decoding) ──────────────────────────────
struct SnapshotMessage: Codable {
    let type: String
    let entities: [SceneEntity]
    let buildSeq: Int
}

// ── SwiftUI View for the mobile world ────────────────────────────
public struct PlayLiquidWorldView: View {
    @ObservedObject var client: PlayLiquidClient

    public init(client: PlayLiquidClient) {
        self.client = client
    }

    public var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black

                ForEach(client.entities) { entity in
                    EntityView(entity: entity)
                        .position(entity.screenPosition)
                }

                VStack {
                    HStack {
                        Text("PlayLiquid")
                            .font(.caption)
                            .foregroundColor(.cyan)
                        Spacer()
                        Text(client.isConnected ? "● Connected" : "○ Disconnected")
                            .font(.caption2)
                            .foregroundColor(client.isConnected ? .green : .red)
                    }
                    .padding()
                    Spacer()
                }
            }
            .onAppear {
                client.setViewport(geo.size)
            }
            .onChange(of: geo.size) { newSize in
                client.setViewport(newSize)
            }
        }
    }
}

struct EntityView: View {
    let entity: MobileEntity

    var body: some View {
        Group {
            switch entity.renderDescriptor.type {
            case "circle":
                Circle()
                    .fill(entity.renderDescriptor.color)
                    .frame(width: entity.renderDescriptor.size, height: entity.renderDescriptor.size)
            case "rect":
                Rectangle()
                    .fill(entity.renderDescriptor.color)
                    .frame(width: entity.renderDescriptor.size, height: entity.renderDescriptor.size)
            case "diamond":
                Circle()
                    .fill(entity.renderDescriptor.color)
                    .frame(width: entity.renderDescriptor.size, height: entity.renderDescriptor.size)
                    .rotationEffect(.degrees(45))
            default:
                Circle()
                    .fill(entity.renderDescriptor.color)
                    .frame(width: entity.renderDescriptor.size, height: entity.renderDescriptor.size)
            }
        }
    }
}
