import { NextRequest } from "next/server";
import { chromium } from "playwright";
import { lookup } from "dns/promises";
import http from "http";
import net from "net";
import { isPrivateOrReservedIp, isPrivateOrReservedIPv6 } from "@/lib/ssrfGuard";

/**
 * Ephemeral loopback CONNECT proxy: Chromium routes ALL traffic through it,
 * and every tunnel is re-validated at connect time (host allowlist + fresh
 * DNS resolution with private-IP blocking, connecting to the resolved IP —
 * not the hostname). This closes the TOCTOU/DNS-rebinding gap (SEC-008):
 * Chromium can never resolve or reach a private address itself.
 */
function startPinnedProxy(
  hostAllowed: (host: string) => boolean
): Promise<{ server: http.Server; port: number; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(405).end();
    });
    server.on("connect", (req, socket, head) => {
      const target = req.url || "";
      const colon = target.lastIndexOf(":");
      const host = colon === -1 ? target : target.slice(0, colon);
      const port = colon === -1 ? 443 : Number(target.slice(colon + 1));
      const deny = () => {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
      };
      if (!hostAllowed(host) || port !== 443) {
        deny();
        return;
      }
      lookup(host, { all: true })
        .then((addrs) => {
          if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
            deny();
            return;
          }
          const upstream = net.connect(port, addrs[0].address, () => {
            socket.write("HTTP/1.1 200 Connection established\r\n\r\n");
            upstream.write(head);
            socket.pipe(upstream);
            upstream.pipe(socket);
          });
          upstream.on("error", () => socket.destroy());
          socket.on("error", () => upstream.destroy());
        })
        .catch(deny);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({ server, port: addr.port, close: () => server.close() });
    });
  });
}

// Single source of truth: the shared, fail-closed SSRF guard. It decodes
// IPv4-mapped IPv6 numerically (including hex form ::ffff:7f00:1 = 127.0.0.1)
// and covers every private/reserved IPv4 + IPv6 range.
function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    return isPrivateOrReservedIPv6(ip);
  }
  return isPrivateOrReservedIp(ip);
}

async function isValidPowerBiUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    // Only allow HTTPS to Power BI domains
    if (parsed.protocol !== "https:") return false;
    const allowedHost = (host: string) =>
      host === "powerbi.com" ||
      host.endsWith(".powerbi.com") ||
      host === "powerbi.microsoft.com" ||
      host.endsWith(".powerbi.microsoft.com");
    if (!allowedHost(parsed.hostname)) {
      return false;
    }
    if (parsed.hostname === "localhost") return false;
    // If hostname is already an IP, check directly
    if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname) || parsed.hostname.includes(":")) {
      return !isPrivateIp(parsed.hostname);
    }
    // Resolve hostname and check resolved IPs
    try {
      const addresses = await lookup(parsed.hostname, { all: true });
      if (addresses.some((a) => isPrivateIp(a.address))) {
        return false;
      }
    } catch {
      // If DNS resolution fails, block the request
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let browser;
  let proxyCloser: (() => void) | null = null;
  try {
    const { url, width = 1280, height = 720 } = (await req.json()) as {
      url: string;
      width?: number;
      height?: number;
    };

    if (!url || typeof url !== "string") {
      return Response.json({ error: "URL is required" }, { status: 400 });
    }

    if (!(await isValidPowerBiUrl(url))) {
      return Response.json({ error: "Invalid or unauthorized URL" }, { status: 400 });
    }

    // Clamp viewport dimensions: unbounded values let a caller exhaust
    // server memory via an absurd Chromium window size.
    const safeWidth = Math.min(Math.max(Number(width) || 1280, 320), 3840);
    const safeHeight = Math.min(Math.max(Number(height) || 720, 240), 2160);

    // Chromium routes every connection through a loopback CONNECT proxy that
    // re-validates host + DNS at connect time and dials the resolved IP:
    // rebinding (TOCTOU, SEC-008) and private-network reachability are closed.
    const allowedHost = (host: string) =>
      host === "powerbi.com" ||
      host.endsWith(".powerbi.com") ||
      host === "powerbi.microsoft.com" ||
      host.endsWith(".powerbi.microsoft.com");
    const proxy = await startPinnedProxy(allowedHost);
    proxyCloser = proxy.close;

    browser = await chromium.launch({
      headless: true,
      // Keep the Chromium sandbox ON: dropping --no-sandbox restores process
      // isolation (the container runs as non-root 'nextjs', which supports it).
      args: ["--disable-dev-shm-usage", `--proxy-server=http://127.0.0.1:${proxy.port}`],
    });
    const page = await browser.newPage({
      viewport: { width: safeWidth, height: safeHeight },
    });

    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    // Extra wait for Power BI report to render
    await page.waitForTimeout(3000);

    const screenshot = await page.screenshot({
      type: "png",
      fullPage: false,
    });

    return Response.json({
      image: `data:image/png;base64,${screenshot.toString("base64")}`,
    });
  } catch (error) {
    // Generic error only: raw Playwright/Chromium messages leak internal
    // DNS/connection details (SEC-012).
    console.error("[PowerBI screenshot] Error:", error instanceof Error ? error.message : String(error));
    return Response.json(
      { error: "Screenshot failed: the report could not be loaded or rendered" },
      { status: 500 }
    );
  } finally {
    if (browser) await browser.close();
    if (proxyCloser) proxyCloser();
  }
}
