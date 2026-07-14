function findEndOfCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error('DOCX nemá platnú ZIP štruktúru.');
}

async function unzipEntry(buffer, name) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const end = findEndOfCentralDirectory(bytes);
  const centralOffset = view.getUint32(end + 16, true);
  const entries = view.getUint16(end + 10, true);
  const decoder = new TextDecoder();
  let offset = centralOffset;
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('DOCX má poškodený ZIP záznam.');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const fileName = decoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    offset += 46 + fileNameLength + extraLength + commentLength;
    if (fileName !== name) continue;
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('DOCX má poškodený obsah dokumentu.');
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const data = bytes.slice(localOffset + 30 + localNameLength + localExtraLength, localOffset + 30 + localNameLength + localExtraLength + compressedSize);
    if (method === 0) return data;
    if (method === 8 && 'DecompressionStream' in globalThis) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new Error('Tento prehliadač nevie lokálne rozbaliť DOCX. Otvor aplikáciu v aktuálnom Chrome alebo Edge.');
  }
  throw new Error('V DOCX chýba hlavný text dokumentu.');
}

function paragraphText(paragraph) {
  let text = '';
  const walk = node => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.localName === 't') text += child.textContent ?? '';
      else if (child.localName === 'tab') text += '\t';
      else if (child.localName === 'br' || child.localName === 'cr') text += '\n';
      else walk(child);
    }
  };
  walk(paragraph);
  return text;
}

export async function readDocxParagraphs(file) {
  if (!file || file.size > 15 * 1024 * 1024) throw new Error('DOCX je väčší než povolených 15 MB.');
  const xmlBytes = await unzipEntry(await file.arrayBuffer(), 'word/document.xml');
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(xmlBytes), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('DOCX obsahuje neplatný XML text.');
  return [...xml.getElementsByTagNameNS('*', 'p')].map(paragraph => {
    const styleNode = [...paragraph.getElementsByTagNameNS('*', 'pStyle')][0];
    return { text: paragraphText(paragraph), style: styleNode?.getAttribute('w:val') ?? styleNode?.getAttribute('val') ?? '' };
  }).filter(paragraph => paragraph.text.trim());
}
