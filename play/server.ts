import { createServer } from "node:http";

import { getConfig } from "../src/lib/config";
import { createPlayHandler } from "../src/lib/play";
import { openStores } from "../src/lib/stores";

/**
 * Local stand-in for the play domain. Run it beside `next dev`:
 * the app answers on localhost:3000 and each game on {slug}.play.localhost:4001.
 * Browsers resolve any *.localhost name to this machine, so no DNS setup is needed.
 */
const { playHost, appOrigin } = getConfig();
const port = Number(playHost.split(":")[1] ?? 80);
const handle = createPlayHandler({ ...openStores(), playHost, appOrigin });

createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(port, () => {
  console.log(`Play server: games answer at http://{slug}.${playHost}`);
});
