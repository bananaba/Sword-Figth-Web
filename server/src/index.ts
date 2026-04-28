import { listen } from "@colyseus/tools";
import config from "./app.config";

const PORT = Number(process.env.PORT ?? 2567);

listen(config, PORT)
  .then(() => {
    // eslint-disable-next-line no-console
    console.log(`[server] Colyseus listening on :${PORT}`);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[server] failed to start", err);
    process.exit(1);
  });
