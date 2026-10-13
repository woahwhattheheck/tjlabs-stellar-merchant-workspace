function tarHeader(name, bytes, completedAt, { directory = false } = {}) {
  const header = Buffer.alloc(512);
  if (Buffer.byteLength(name) > 100) throw failure('CLIENT_ARCHIVE', 'Customer archive member name exceeds its fixed format.');
  header.write(name, 0, 100, 'utf8');
  const octal = (value, offset, length) => header.write(value.toString(8).padStart(length - 1, '0') + '\0', offset, length, 'ascii');
  octal(directory ? 0o700 : 0o600, 100, 8); octal(0, 108, 8); octal(0, 116, 8); octal(bytes, 124, 12);
  octal(Math.floor(Date.parse(completedAt) / 1000), 136, 12);
  header.fill(32, 148, 156); header.write(directory ? '5' : '0', 156); header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii'); header.write('merchant', 265, 32, 'ascii');
  const checksum = header.reduce((sum, value) => sum + value, 0);
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii'); return header;
}
