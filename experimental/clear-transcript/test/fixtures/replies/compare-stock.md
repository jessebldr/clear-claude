**Recommendation: REST (JSON over HTTP) as the public API, with GraphQL as an optional layer if your mobile screens become chatty.** Avoid gRPC as the primary public interface.

## Comparison

| | REST | GraphQL | gRPC |
|---|---|---|---|
| **Transport** | HTTP/1.1 or 2, JSON | HTTP, JSON (single endpoint) | HTTP/2, Protobuf |
| **Mobile fit** | Good | Excellent for varied screens | Good on native, awkward in browsers/web |
| **Payload efficiency** | Over/under-fetching common | Client asks for exactly what it needs | Smallest, fastest |
| **Round trips** | Often several per screen | Usually one | Streaming and multiplexing help |
| **Caching** | Native HTTP/CDN caching | Hard (POST, single URL); needs persisted queries or client caches | Not HTTP-cache friendly |
| **Third-party adoption** | Easiest; curl, any language | Moderate learning curve | Needs codegen and tooling; high friction |
| **Tooling/debugging** | Universal | Good (introspection, GraphiQL) | Weaker (binary, needs grpcurl etc.) |
| **Versioning** | URL/header versions | Additive schema evolution | Protobuf field evolution (very good) |
| **Rate limiting/security** | Simple, per endpoint | Hard: query depth/cost analysis required | Straightforward per method |
| **Streaming** | SSE/WebSockets bolted on | Subscriptions | First-class bidirectional |

## Why this matters for a *public* API

- **Public means unknown clients.** REST is the lowest-friction contract: any developer can try it with curl, and gateways, CDNs, WAFs, and API-management tools all understand it.
- **GraphQL exposes your query surface.** Arbitrary client queries mean you must handle depth limits, cost analysis, and N+1 problems, or a single query can hurt you. Worth it when you control the clients, less so for anonymous third parties.
- **gRPC** shines for internal service-to-service traffic. For public use it needs gRPC-Web or a gateway for browsers, and most external developers don't want to adopt Protobuf toolchains.

## Mobile-specific considerations

- **Latency and battery**: fewer round trips matter. GraphQL wins here; with REST you can compensate with well-designed aggregate endpoints (e.g., `/home-screen`) or `?include=`/field selection.
- **Flaky networks**: REST's HTTP caching, ETags, and idempotent verbs make offline and retry behavior simple.
- **Schema evolution**: old app versions live for years. Additive-only changes matter regardless of which style you pick; GraphQL and Protobuf make this easier by design.

## Decision guide

- **Small team, public API, standard CRUD-ish app** → REST. Add OpenAPI for docs and generated client SDKs.
- **Many screens with diverse data needs, your own mobile clients drive most usage** → GraphQL (Apollo/Relay-style), possibly alongside REST for third parties.
- **Real-time or heavy streaming (chat, live tracking), or you're already microservice-heavy** → gRPC internally behind a REST/GraphQL edge, or gRPC directly to your own native apps only.

## Pragmatic architecture

Public REST (or GraphQL) at the edge, gRPC between internal services. This gives you broad compatibility externally and efficiency internally, and you can add GraphQL later as a BFF (backend-for-frontend) without breaking the REST contract.

If you tell me your data shape, expected third-party usage, and team experience, I can narrow this further.