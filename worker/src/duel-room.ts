import { json } from "./http.js";

export class DuelRoom {
  constructor(
    private readonly state: unknown,
    private readonly env: unknown,
  ) {
    void this.state;
    void this.env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "upgrade_required" }, { status: 426 });
    }

    return json({ error: "websocket_not_implemented" }, { status: 501 });
  }
}
