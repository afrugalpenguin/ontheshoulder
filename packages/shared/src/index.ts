/** Response body of `GET /health`. */
export interface Health {
  ok: true;
  version: string;
  uptime_s: number;
}
