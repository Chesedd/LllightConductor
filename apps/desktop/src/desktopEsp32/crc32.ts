/** CRC-32/ISO-HDLC: poly=0x04c11db7 (reflected 0xedb88320), init/xorout=0xffffffff, refin/refout=true. */
export function crc32IsoHdlc(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
