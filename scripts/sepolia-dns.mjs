// The machine resolver does not answer for coinbase.com. This preload runs before fetch.
import dns from "node:dns";
import { Resolver } from "node:dns/promises";
import net from "node:net";

const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

dns.lookup = (hostname, options, callback) => {
  const opts = typeof options === "function" ? {} : options ?? {};
  const done = typeof options === "function" ? options : callback;
  const literal = net.isIP(hostname);
  if (literal) {
    if (opts.all) done(null, [{ address: hostname, family: literal }]);
    else done(null, hostname, literal);
    return;
  }
  const family = opts.family === 6 ? 6 : 4;
  const query = family === 6 ? resolver.resolve6(hostname) : resolver.resolve4(hostname);
  query.then(
    (addresses) => {
      const list = addresses.map((address) => ({ address, family }));
      const first = list[0];
      if (!first) {
        done(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }));
        return;
      }
      if (opts.all) done(null, list);
      else done(null, first.address, first.family);
    },
    (error) => done(error),
  );
};
