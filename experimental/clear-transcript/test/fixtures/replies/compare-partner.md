**Choose REST** for a public API that backs a mobile app. Add GraphQL later only if you hit specific pain points. Skip gRPC for the public surface.

## Why REST wins here

- **Public means unknown clients.** Third parties need to call it from curl, Postman, any language, any browser. REST over HTTP/JSON works everywhere with zero tooling.
- **Caching and infrastructure.** CDNs, API gateways, rate limiters, WAFs, and logging all understand plain HTTP verbs and URLs. That matters when the API is exposed to the internet.
- **Simple to version, document, and debug.** OpenAPI gives you docs, SDK generation, and mock servers for free.
- **Mobile libraries are mature.** Every platform has first-class HTTP/JSON support.

## Where the others fit

| | Strength | Main cost for a public mobile API |
|---|---|---|
| **REST** | Universal, cacheable, easy to consume | Over/under-fetching; multiple round trips on slow networks |
| **GraphQL** | Client picks exact fields, one request per screen, great for varied clients | Harder caching, query-cost/abuse protection needed on a public endpoint, more server complexity |
| **gRPC** | Fast binary protocol, streaming, strong typing | Browsers and many third parties can't call it natively (need gRPC-Web or a proxy), harder to debug, poor fit for public consumers |

## When to deviate

- **GraphQL** makes sense if you have several mobile screens with very different data shapes, multiple client teams moving independently, or you're seeing real over-fetching pain on cellular. If you go this route, you must add query depth/complexity limits, persisted queries, and per-field auth, because public GraphQL is easy to abuse.
- **gRPC** is a good choice for internal service-to-service traffic behind your REST layer, or if you control both ends and need streaming. It's a legitimate mobile option when you own the client, but it's not a good public API.

## Practical setup

Start with REST and keep round trips down by:
- designing endpoints around screens where sensible (e.g. a `/home` aggregate),
- supporting field selection or `?include=` for expansion,
- using pagination, ETags, and compression.

That gets you most of GraphQL's benefit on mobile without its operational overhead. If you later need more, a GraphQL layer can sit on top of the same services.

**Caveat:** this assumes a typical product API. If your app is heavily real-time (chat, live tracking) or you have a large team with many divergent clients, the balance shifts toward GraphQL subscriptions or gRPC streaming, so tell me more if that applies.