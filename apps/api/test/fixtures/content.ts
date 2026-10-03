/** Minimal files with real magic bytes, for unit and e2e tests. */
export const fixtures = {
  png: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Buffer.from('JFIF\0'), 0x01, 0x01]),
  gif: Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'),
  webp: Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x1a, 0, 0, 0]),
    Buffer.from('WEBPVP8 '),
    Buffer.alloc(18),
  ]),
  pdf: Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'),
  zip: Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.alloc(40)]),
  exe: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]),
  html: Buffer.from('<!DOCTYPE html>\n<html><body><h1>Hi</h1></body></html>\n'),
  svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'),
  markdown: Buffer.from('# Release notes\n\n- faster uploads\n'),
};
