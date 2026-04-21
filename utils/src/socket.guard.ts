import { TLSSocket } from "tls";

/**
 * utils/src/socket.guard.ts — TLSSocket Type Guard
 *
 * WHY THIS EXISTS:
 * In Express, `req.socket` is typed as `net.Socket` — a plain TCP socket.
 * But when the server runs over HTTPS (like Service B does), the actual
 * runtime type is `tls.TLSSocket` — a subclass that adds mTLS methods
 * like `getPeerCertificate()`.
 *
 * Without a type guard, you'd need a type assertion:
 *   const socket = req.socket as TLSSocket;  // ❌ Unsafe — no runtime check
 *
 * With the type guard, TypeScript narrows the type automatically:
 *   if (isTLSSocket(req.socket)) {
 *     req.socket.getPeerCertificate();  // ✅ Safe — runtime + compile-time checked
 *   }
 *
 * HOW TypeScript TYPE GUARDS WORK:
 * The return type `socket is TLSSocket` is a "type predicate". When this
 * function returns true, TypeScript narrows the parameter's type within
 * the truthy branch of an if-statement. This is how we avoid 'as' assertions.
 *
 * WHEN THIS WOULD RETURN FALSE:
 * If someone sends a plain HTTP request to Service B (which shouldn't happen
 * since it only listens on HTTPS), the socket would be a plain net.Socket
 * and this guard would correctly return false, preventing a runtime crash.
 */
export function isTLSSocket(socket: unknown): socket is TLSSocket {
  return socket instanceof TLSSocket;
}
