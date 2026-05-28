// Durable Object — 작품별 실시간 입찰 WebSocket 룸
export interface BidEvent {
  type: "bid_update" | "auction_closed" | "auction_started";
  artwork_id: number;
  amount?: number;
  bidder?: string;
  time?: string;
}

export class AuctionRoom implements DurableObject {
  private sessions: Set<WebSocket> = new Set();

  constructor(_state: DurableObjectState, _env: unknown) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/connect") {
      const upgrade = req.headers.get("Upgrade");
      if (upgrade !== "websocket") return new Response("Expected WebSocket", { status: 426 });
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();
      this.sessions.add(server);
      server.addEventListener("close", () => this.sessions.delete(server));
      server.addEventListener("error", () => this.sessions.delete(server));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/broadcast" && req.method === "POST") {
      const event = await req.json() as BidEvent;
      const msg = JSON.stringify(event);
      for (const ws of this.sessions) {
        try { ws.send(msg); } catch { this.sessions.delete(ws); }
      }
      return new Response("ok");
    }

    return new Response("not found", { status: 404 });
  }
}
