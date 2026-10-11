import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify';

/**
 * LAN guard, SPEC 9.3. The api is for one home network: requests from anything
 * that is not loopback or a private address are refused.
 */

function ipv4Octets(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

/** True for loopback, RFC 1918 private ranges and their IPv6 equivalents. */
export function isLanAddress(address: string | undefined): boolean {
  if (!address) return false;
  let ip = address.trim().toLowerCase();
  // Strip an IPv6 zone ("fe80::1%eth0") and unwrap IPv4-mapped IPv6 ("::ffff:192.168.1.5").
  ip = ip.replace(/%.*$/, '');
  if (ip.startsWith('::ffff:') && ip.includes('.')) ip = ip.slice('::ffff:'.length);

  const v4 = ipv4Octets(ip);
  if (v4) {
    const [a, b] = v4 as [number, number, number, number];
    return (
      a === 127 || // loopback
      a === 10 || // 10.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) // 192.168.0.0/16
    );
  }
  if (!ip.includes(':')) return false;
  if (ip === '::1') return true; // loopback
  const first = parseInt(ip.split(':')[0] || '0', 16);
  if (Number.isNaN(first)) return false;
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 // fe80::/10 link-local
  );
}

const HOUR_MS = 3_600_000;

/**
 * An onRequest hook that answers 403 to non-LAN addresses. The first rejection
 * of an address in any hour is logged; repeats within the hour are not, so a
 * scanner cannot fill the log.
 */
export function lanGuard(log: FastifyBaseLogger, now: () => number = Date.now) {
  const lastLogged = new Map<string, number>();
  return (req: FastifyRequest, reply: FastifyReply, done: () => void): void => {
    if (isLanAddress(req.ip)) {
      done();
      return;
    }
    const address = req.ip || 'unknown';
    const t = now();
    const previous = lastLogged.get(address);
    if (previous === undefined || t - previous >= HOUR_MS) {
      lastLogged.set(address, t);
      log.warn({ address, url: req.url }, 'lan guard: request from outside the LAN refused');
      // Keep the map from growing without bound.
      for (const [key, at] of lastLogged) if (t - at >= HOUR_MS) lastLogged.delete(key);
    }
    void reply.status(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'this api only answers requests from the local network',
    });
  };
}
