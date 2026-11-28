/*
  Жижиг .xlsx үүсгэгч (гадны сангүй). Excel, Google Sheets, Numbers-д шууд нээгдэнэ.

  MiniXlsx.build([{ name, columns: [{ header, width }], rows: [[...], ...] }]) → Blob
  Тоо нь тоо, бусад нь текст болж орно. Эхний мөр (гарчиг) тод, хөлдөөсөн байна.
*/
(() => {
  'use strict';

  const encoder = new TextEncoder();

  // CRC32 (zip-д шаардлагатай)
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  // Шахалтгүй (STORE) zip архив.
  function zip(files) {
    const chunks = [];
    const central = [];
    let offset = 0;
    const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
    const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

    files.forEach(({ path, data }) => {
      const name = encoder.encode(path);
      const body = typeof data === 'string' ? encoder.encode(data) : data;
      const crc = crc32(body);
      const local = new Uint8Array([
        ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
        ...u32(crc), ...u32(body.length), ...u32(body.length), ...u16(name.length), ...u16(0),
      ]);
      chunks.push(local, name, body);
      central.push(
        new Uint8Array([
          ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
          ...u32(crc), ...u32(body.length), ...u32(body.length), ...u16(name.length), ...u16(0), ...u16(0),
          ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
        ]),
        name,
      );
      offset += local.length + name.length + body.length;
    });

    const centralSize = central.reduce((sum, c) => sum + c.length, 0);
    const end = new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(centralSize), ...u32(offset), ...u16(0),
    ]);
    return new Blob([...chunks, ...central, end], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  const esc = (value) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // XML-д зөвшөөрөгдөөгүй хяналтын тэмдэгтийг хасна (мөр шилжүүлэг, таб үлдэнэ).
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  function colName(index) {
    let name = '';
    let n = index + 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      name = String.fromCharCode(65 + r) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function cellXml(value, ref, style) {
    const s = style ? ` s="${style}"` : '';
    if (value === null || value === undefined || value === '') return `<c r="${ref}"${s}/>`;
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  }

  function sheetXml({ columns, rows }) {
    const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`).join('');
    const header = `<row r="1">${columns.map((c, i) => cellXml(c.header, `${colName(i)}1`, 1)).join('')}</row>`;
    const body = rows
      .map((row, r) => `<row r="${r + 2}">${row.map((v, i) => cellXml(v, `${colName(i)}${r + 2}`, 2)).join('')}</row>`)
      .join('');
    const last = `${colName(columns.length - 1)}${rows.length + 1}`;
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      `<cols>${cols}</cols><sheetData>${header}${body}</sheetData>` +
      `<autoFilter ref="A1:${last}"/>` +
      '</worksheet>'
    );
  }

  // Хуудасны нэр: 31 тэмдэгт хүртэл, : \ / ? * [ ] хориотой.
  const sheetName = (name, i) => (String(name).replace(/[:\\/?*[\]]/g, '.').slice(0, 31) || `Sheet${i + 1}`);

  function build(sheets) {
    const files = [
      {
        path: '[Content_Types].xml',
        data:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          sheets
            .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
            .join('') +
          '</Types>',
      },
      {
        path: '_rels/.rels',
        data:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
      },
      {
        path: 'xl/workbook.xml',
        data:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          `<sheets>${sheets.map((s, i) => `<sheet name="${esc(sheetName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
          (sheets.length
            ? `<definedNames>${sheets
                .map((s, i) => {
                  const last = `$${colName(s.columns.length - 1)}$${s.rows.length + 1}`;
                  return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(sheetName(s.name, i)).replace(/'/g, "''")}'!$A$1:${last}</definedName>`;
                })
                .join('')}</definedNames>`
            : '') +
          '</workbook>',
      },
      {
        path: 'xl/_rels/workbook.xml.rels',
        data:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          sheets
            .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
            .join('') +
          `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          '</Relationships>',
      },
      {
        path: 'xl/styles.xml',
        data:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
          '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
          '<fill><patternFill patternType="solid"><fgColor rgb="FFF3E7D3"/><bgColor indexed="64"/></patternFill></fill></fills>' +
          '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
          '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
          '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
          '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
          '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>' +
          '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
          '</styleSheet>',
      },
      ...sheets.map((s, i) => ({ path: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
    ];
    return zip(files);
  }

  window.MiniXlsx = { build };
})();
