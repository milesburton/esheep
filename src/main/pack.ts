import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';

export const BUILTIN = 'builtin';

const packsDir = (assetsDir: string): string => path.join(assetsDir, 'packs');

/** 'builtin' plus every folder under assets/packs containing animations.xml. */
export const listPacks = (assetsDir: string): string[] => {
  const dir = packsDir(assetsDir);
  const found = fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'animations.xml')))
        .map((d) => d.name)
    : [];
  return [BUILTIN, ...found.sort()];
};

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const str = (v: unknown, fallback = '0'): string =>
  v === undefined || v === null ? fallback : String(v).trim();

const point = (p: Raw | undefined): AnimPoint => ({
  x: str(p?.x),
  y: str(p?.y),
  offsety: str(p?.offsety),
  opacity: str(p?.opacity, '1'),
  interval: str(p?.interval, '200'),
});

const nexts = (list: Raw | Raw[] | undefined): NextRef[] =>
  arr(list).map((n) => ({
    p: Number(n['@_probability'] ?? 100),
    only: String(n['@_only'] ?? 'none'),
    id: Number(n['#text']),
  }));

/** Parse a desktopPet animations.xml into plain JSON (no DOM needed, testable in Node). */
export const parsePackXml = (xml: string, name: string): ClassicPack => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    removeNSPrefix: true,
  });
  const root = parser.parse(xml).animations as Raw;
  const image = root.image as Raw;

  const animations: PackAnim[] = arr<Raw>(root.animations?.animation).map((a) => {
    const seq = a.sequence as Raw;
    return {
      id: Number(a['@_id']),
      name: str(a.name, ''),
      start: point(a.start),
      end: point(a.end),
      repeat: String(seq?.['@_repeat'] ?? '0'),
      repeatFrom: String(seq?.['@_repeatfrom'] ?? '0'),
      frames: arr(seq?.frame).map(Number),
      action: str(seq?.action, 'none'),
      next: nexts(seq?.next),
      border: nexts(a.border?.next),
      gravity: nexts(a.gravity?.next),
    };
  });

  return {
    kind: 'classic',
    name,
    tilesX: Number(image.tilesx),
    tilesY: Number(image.tilesy),
    transparency: str(image.transparency, 'None'),
    png: `data:image/png;base64,${str(image.png, '').replace(/\s+/g, '')}`,
    animations,
    spawns: arr<Raw>(root.spawns?.spawn).map((s) => ({
      p: Number(s['@_probability'] ?? 100),
      x: str(s.x),
      y: str(s.y),
      next: Number(s.next),
    })),
  };
};

export const loadPack = (assetsDir: string, name: string): Pack => {
  if (name === BUILTIN || !listPacks(assetsDir).includes(name))
    return { kind: 'bounce', name: BUILTIN };
  const xml = fs.readFileSync(path.join(packsDir(assetsDir), name, 'animations.xml'), 'utf8');
  return parsePackXml(xml, name);
};
