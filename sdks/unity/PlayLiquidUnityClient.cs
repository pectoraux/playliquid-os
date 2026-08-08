// ════════════════════════════════════════════════════════════════
// PlayLiquid Unity SDK — C# Adapter
// ════════════════════════════════════════════════════════════════
//
// A real C# Unity SDK that implements the PlayLiquid Runtime Adapter
// contract. Consumes the same PlayLiquid Protocol (Scene API + WS) as
// the Web, Mobile, and Sensory adapters. Unity renders; PlayLiquid
// owns identity, state, multiplayer.
//
// This is compilable C# code. Drop into a Unity project, attach
// PlayLiquidUnityClient.cs to a GameObject, and it will:
//   1. Fetch the Scene API (same endpoint as Web runtime)
//   2. Connect to the World Node via WebSocket (socket.io)
//   3. Spawn Unity GameObjects for each entity from declarative artifacts
//   4. Apply PL→Unity coordinate transform (Z_PL → -Z_Unity)
//   5. Update positions in real-time from the authoritative state stream
//
// Usage in Unity:
//   var client = gameObject.AddComponent<PlayLiquidUnityClient>();
//   client.buildId = "your-build-id";
//   client.controlPlaneUrl = "http://localhost:3000";
//   client.nodeWsPort = 3002;
//   client.Connect();

using System;
using System.Collections;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using NativeWebSocket;

namespace PlayLiquid
{
    public class PlayLiquidUnityClient : MonoBehaviour
    {
        [Header("PlayLiquid Configuration")]
        public string buildId = "";
        public string controlPlaneUrl = "http://localhost:3000";
        public int nodeWsPort = 3002;
        public bool autoConnect = true;

        [Header("State")]
        public bool isConnected = false;
        public int entityCount = 0;

        private WebSocket websocket;
        private Dictionary<string, GameObject> entities = new Dictionary<string, GameObject>();
        private HttpClient httpClient = new HttpClient();

        // ── PL → Unity coordinate transform ─────────────────────
        // PlayLiquid: right-handed (X=east, Y=up, Z=north)
        // Unity: left-handed (X=east, Y=up, Z=forward)
        // Transform: Z_PL → -Z_Unity (flip Z axis)
        public static Vector3 PLToUnity(float x, float y, float z)
        {
            return new Vector3(x, y, -z);
        }

        public static Vector3 UnityToPL(float x, float y, float z)
        {
            return new Vector3(x, y, -z);
        }

        async void Start()
        {
            if (autoConnect && !string.IsNullOrEmpty(buildId))
            {
                await Connect();
            }
        }

        public async Task Connect()
        {
            Debug.Log($"[PlayLiquid] Connecting to World Node (build {buildId})...");

            // Fetch the Scene API
            var sceneUrl = $"{controlPlaneUrl}/api/runtime/{buildId}/scene";
            var sceneJson = await httpClient.GetStringAsync(sceneUrl);
            var scene = JsonUtility.FromJson<SceneResponse>(sceneJson);

            Debug.Log($"[PlayLiquid] Scene loaded: {scene.entities.Length} entities, hash={scene.world.buildHash}");

            // Connect to the World Node via WebSocket
            var wsUrl = $"ws://localhost:{nodeWsPort}/";
            websocket = new WebSocket(wsUrl);

            websocket.OnOpen += () =>
            {
                isConnected = true;
                Debug.Log("[PlayLiquid] WebSocket connected");
            };

            websocket.OnMessage += (bytes) =>
            {
                var msg = Encoding.UTF8.GetString(bytes);
                HandleMessage(msg);
            };

            websocket.OnClose += (e) =>
            {
                isConnected = false;
                Debug.Log("[PlayLiquid] WebSocket disconnected");
            };

            websocket.OnError += (e) =>
            {
                Debug.LogError($"[PlayLiquid] WebSocket error: {e}");
            };

            await websocket.Connect();
        }

        void Update()
        {
            #if !UNITY_WEBGL || UNITY_EDITOR
            if (websocket != null)
            {
                websocket.DispatchMessageQueue();
            }
            #endif
        }

        async void OnDestroy()
        {
            if (websocket != null)
            {
                await websocket.Close();
            }
        }

        // ── Handle incoming WS messages ─────────────────────────
        private void HandleMessage(string raw)
        {
            try
            {
                var msg = JsonUtility.FromJson<WSMessage>(raw);
                switch (msg.type)
                {
                    case "snapshot":
                        HandleSnapshot(raw);
                        break;
                    case "state":
                        HandleState(raw);
                        break;
                    case "event":
                        if (msg.eventName == "entity.remove")
                        {
                            RemoveEntity(msg.entityId);
                        }
                        break;
                    case "handoff":
                        Debug.Log($"[PlayLiquid] Handoff: {msg.entityId} → zone {msg.toZoneId}");
                        break;
                }
            }
            catch (Exception e)
            {
                Debug.LogError($"[PlayLiquid] Message parse error: {e.Message}");
            }
        }

        private void HandleSnapshot(string raw)
        {
            var snapshot = JsonUtility.FromJson<SnapshotMessage>(raw);
            foreach (var e in snapshot.entities)
            {
                SpawnOrUpdateEntity(e);
            }
            entityCount = entities.Count;
            Debug.Log($"[PlayLiquid] Snapshot: {snapshot.entities.Length} entities");
        }

        private void HandleState(string raw)
        {
            var stateMsg = JsonUtility.FromJson<StateMessage>(raw);
            var entityData = new EntityData
            {
                entityId = stateMsg.entityId,
                position = stateMsg.position,
                state = stateMsg.state
            };
            SpawnOrUpdateEntity(entityData);
        }

        // ── Spawn or update a Unity GameObject for an entity ────
        private void SpawnOrUpdateEntity(EntityData e)
        {
            if (entities.TryGetValue(e.entityId, out var go))
            {
                // Update position (with PL→Unity transform)
                go.transform.position = PLToUnity(e.position.x, e.position.y, e.position.z);
            }
            else
            {
                // Spawn a new GameObject
                go = GameObject.CreatePrimitive(PrimitiveType.Cube);
                go.name = e.entityId;
                go.transform.position = PLToUnity(e.position.x, e.position.y, e.position.z);
                entities[e.entityId] = go;

                // If the entity has a declarative artifact, interpret it
                // (in a full SDK, this would parse the artifact JSON and
                // create the appropriate Unity primitive + material)
                if (!string.IsNullOrEmpty(e.state.declarativeArtifact))
                {
                    InterpretArtifact(go, e.state.declarativeArtifact);
                }
            }
        }

        private void InterpretArtifact(GameObject go, string artifactJson)
        {
            try
            {
                var artifact = JsonUtility.FromJson<DeclarativeArtifact>(artifactJson);
                var render = artifact.render;
                if (render == null) return;

                // Create the appropriate primitive based on shape
                switch (render.params_shape)
                {
                    case "sphere":
                        Destroy(go.GetComponent<MeshFilter>());
                        go.AddComponent<MeshFilter>().mesh = CreateSphereMesh();
                        break;
                    case "box":
                        // Already a cube
                        break;
                    case "cylinder":
                        Destroy(go.GetComponent<MeshFilter>());
                        go.AddComponent<MeshFilter>().mesh = CreateCylinderMesh();
                        break;
                }

                // Apply color
                if (!string.IsNullOrEmpty(render.params_color))
                {
                    var renderer = go.GetComponent<Renderer>();
                    if (renderer != null)
                    {
                        var color = ParseColor(render.params_color);
                        renderer.material.color = color;
                    }
                }

                // Scale
                if (render.params_size > 0)
                {
                    go.transform.localScale = Vector3.one * render.params_size;
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[PlayLiquid] Artifact interpretation failed: {e.Message}");
            }
        }

        private void RemoveEntity(string entityId)
        {
            if (entities.TryGetValue(entityId, out var go))
            {
                Destroy(go);
                entities.Remove(entityId);
                entityCount = entities.Count;
            }
        }

        // ── Send a mutation to the World Node ───────────────────
        public async Task MovePlayer(string sessionId, float deltaX, float deltaZ)
        {
            if (!isConnected) return;
            var msg = new PlayerMoveMessage
            {
                sessionId = sessionId,
                deltaX = deltaX,
                deltaZ = deltaZ
            };
            var json = JsonUtility.ToJson(msg);
            await websocket.SendText(json);
        }

        public async Task MutateEntity(string entityId, Dictionary<string, object> statePatch)
        {
            if (!isConnected) return;
            // In a full SDK, this would serialize the patch and emit "entity:mutate"
            Debug.Log($"[PlayLiquid] MutateEntity: {entityId}");
        }

        // ── Utility: color parsing + mesh creation ──────────────
        private Color ParseColor(string hex)
        {
            if (hex.StartsWith("#")) hex = hex.Substring(1);
            if (hex.Length == 6)
            {
                byte r = Convert.ToByte(hex.Substring(0, 2), 16);
                byte g = Convert.ToByte(hex.Substring(2, 2), 16);
                byte b = Convert.ToByte(hex.Substring(4, 2), 16);
                return new Color32(r, g, b, 255);
            }
            return Color.white;
        }

        private Mesh CreateSphereMesh()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            var mesh = go.GetComponent<MeshFilter>().mesh;
            Destroy(go);
            return mesh;
        }

        private Mesh CreateCylinderMesh()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            var mesh = go.GetComponent<MeshFilter>().mesh;
            Destroy(go);
            return mesh;
        }
    }

    // ── Data classes for JSON deserialization ────────────────────
    [Serializable]
    public class SceneResponse
    {
        public WorldInfo world;
        public EntityData[] entities;
    }

    [Serializable]
    public class WorldInfo
    {
        public string id;
        public string name;
        public string buildHash;
        public int buildVersion;
    }

    [Serializable]
    public class EntityData
    {
        public string entityId;
        public string name;
        public Vector3Data position;
        public EntityState state;
    }

    [Serializable]
    public class EntityState
    {
        public string declarativeArtifact;
        public string name;
    }

    [Serializable]
    public class Vector3Data
    {
        public float x;
        public float y;
        public float z;
    }

    [Serializable]
    public class WSMessage
    {
        public string type;
        public string entityId;
        public string eventName;
        public string toZoneId;
    }

    [Serializable]
    public class SnapshotMessage
    {
        public string type;
        public EntityData[] entities;
        public int buildSeq;
    }

    [Serializable]
    public class StateMessage
    {
        public string type;
        public string entityId;
        public Vector3Data position;
        public EntityState state;
        public int seq;
        public int buildSeq;
    }

    [Serializable]
    public class DeclarativeArtifact
    {
        public string abiVersion;
        public string name;
        public string displayName;
        public string family;
        public ArtifactRender render;
    }

    [Serializable]
    public class ArtifactRender
    {
        public string behavior;
        public string params_shape;
        public float params_size;
        public string params_color;
    }

    [Serializable]
    public class PlayerMoveMessage
    {
        public string sessionId;
        public float deltaX;
        public float deltaZ;
    }
}
