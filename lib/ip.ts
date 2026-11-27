import { isIP } from 'node:net';

export function canonicalIp(value: string): string | null {
  const trimmed = value.trim();
  const plain = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
  const version = isIP(plain);
  if (version === 4) return plain;
  if (version !== 6 || plain.includes('%')) return null;
  // 统一大小写、压缩写法和 IPv4 映射地址，防止同一 IP 通过不同表示绕过限制。
  const ipv6 = new URL(`http://[${plain}]/`).hostname.slice(1, -1);
  const mapped = ipv6.match(/^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/);
  if (mapped) {
    const upper = parseInt(mapped[1], 16);
    const lower = parseInt(mapped[2], 16);
    return `${upper >> 8}.${upper & 255}.${lower >> 8}.${lower & 255}`;
  }
  return ipv6;
}

// 导入历史数据时保留无法识别的旧值，并兼容旧版带接口名的 IPv6 地址。
export function normalizeIp(value: string): string {
  const legacy = value.trim().replace(/^\[|\]$/g, '').split('%')[0];
  return canonicalIp(legacy) ?? legacy;
}
