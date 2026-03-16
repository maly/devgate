import os from "os";

function detectLocalIp(options = {}) {
  const { preferredIp } = options;

  if (preferredIp && isValidLocalIPv4(preferredIp)) {
    return {
      ip: preferredIp,
      interface: "user-specified",
      reason: "User specified preferred IP"
    };
  }

  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [ifaceName, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      const isIPv6 = addr.family === "IPv6";
      const isLoopback = addr.address.startsWith("127.");
      const isIPv4 = addr.family === "IPv4";
      if (isIPv6 || isLoopback || !isIPv4) continue;

      const isActive = !addr.internal;
      const isPrivate = isPrivateIPv4(addr.address);

      candidates.push({
        ip: addr.address,
        interface: ifaceName,
        isActive,
        isPrivate
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    const activeDiff = Number(b.isActive) - Number(a.isActive);
    if (activeDiff !== 0) return activeDiff;
    
    const privateDiff = Number(b.isPrivate) - Number(a.isPrivate);
    if (privateDiff !== 0) return privateDiff;
    
    return a.interface.localeCompare(b.interface);
  });

  const best = candidates[0];

  let reason;
  if (best.isActive && best.isPrivate) {
    reason = `Active private network interface (${best.interface})`;
  } else if (best.isActive) {
    reason = `Active network interface (${best.interface})`;
  } else if (best.isPrivate) {
    reason = `Private network interface (${best.interface})`;
  } else {
    reason = `Network interface (${best.interface})`;
  }

  return {
    ip: best.ip,
    interface: best.interface,
    reason
  };
}

function isValidLocalIPv4(ip) {
  if (!ip) return false;

  const parts = ip.split(".");
  if (parts.length !== 4) return false;

  for (const part of parts) {
    if (!/^\d+$/.test(part)) return false;
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return false;
  }

  if (ip.startsWith("127.")) return false;

  const firstOctet = parseInt(parts[0], 10);
  if (firstOctet >= 224) return false;

  return true;
}

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  const first = parts[0];
  const second = parts[1];

  if (first === 10) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;

  return false;
}

export { detectLocalIp };
export default { detectLocalIp };
