import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN, listPacks, loadPack, parsePackXml } from './pack.js';

const MINIMAL = `<?xml version="1.0"?>
<animations xmlns="https://esheep.petrucci.ch/">
  <image><tilesx>4</tilesx><tilesy>2</tilesy><png><![CDATA[AAAA
BBBB]]></png><transparency>Magenta</transparency></image>
  <spawns><spawn id="1" probability="30"><x>10</x><y>20</y><next>1</next></spawn></spawns>
  <animations>
    <animation id="1">
      <name>walk</name>
      <start><x>-2</x><y>0</y><offsety>1</offsety><opacity>0.5</opacity><interval>200</interval></start>
      <end><x>-3</x><y>1</y><offsety>2</offsety><opacity>1</opacity><interval>100</interval></end>
      <sequence repeatfrom="1" repeat="random/5+10">
        <frame>2</frame><frame>3</frame>
        <action>flip</action>
        <next probability="90" only="none">1</next>
        <next probability="2" only="window">5</next>
      </sequence>
      <border><next probability="100" only="vertical">7</next></border>
      <gravity><next probability="100" only="none">3</next></gravity>
    </animation>
    <animation id="2"><name>bare</name><sequence><frame>0</frame></sequence></animation>
  </animations>
</animations>`;

describe('parsePackXml', () => {
  const pack = parsePackXml(MINIMAL, 'mini');

  it('reads the image block and joins the wrapped base64 into a data URL', () => {
    expect(pack).toMatchObject({
      kind: 'classic',
      name: 'mini',
      tilesX: 4,
      tilesY: 2,
      transparency: 'Magenta',
      png: 'data:image/png;base64,AAAABBBB',
    });
  });

  it('reads spawns', () => {
    expect(pack.spawns).toEqual([{ p: 30, x: '10', y: '20', next: 1 }]);
  });

  it('reads animation keyframes, frames, repeat expressions and transitions', () => {
    const walk = pack.animations[0];
    expect(walk).toMatchObject({
      id: 1,
      name: 'walk',
      repeat: 'random/5+10',
      repeatFrom: '1',
      frames: [2, 3],
      action: 'flip',
      start: { x: '-2', y: '0', offsety: '1', opacity: '0.5', interval: '200' },
      end: { x: '-3', y: '1', offsety: '2', opacity: '1', interval: '100' },
    });
    expect(walk.next).toEqual([
      { p: 90, only: 'none', id: 1 },
      { p: 2, only: 'window', id: 5 },
    ]);
    expect(walk.border).toEqual([{ p: 100, only: 'vertical', id: 7 }]);
    expect(walk.gravity).toEqual([{ p: 100, only: 'none', id: 3 }]);
  });

  it('applies defaults to sparse animations, including single-element lists', () => {
    expect(pack.animations[1]).toMatchObject({
      name: 'bare',
      frames: [0],
      repeat: '0',
      repeatFrom: '0',
      action: 'none',
      next: [],
      border: [],
      gravity: [],
      start: { x: '0', opacity: '1', interval: '200' },
    });
  });

  it('copes with a pack that has no spawns, animations or png', () => {
    const empty = parsePackXml(
      '<animations><image><tilesx>1</tilesx><tilesy>1</tilesy></image></animations>',
      'e',
    );
    expect(empty.animations).toEqual([]);
    expect(empty.spawns).toEqual([]);
    expect(empty.transparency).toBe('None');
    expect(empty.png).toBe('data:image/png;base64,');
  });

  it('parses the bundled woolly pack', () => {
    const xml = fs.readFileSync(
      path.join(__dirname, '..', '..', 'assets', 'packs', 'woolly', 'animations.xml'),
      'utf8',
    );
    const woolly = parsePackXml(xml, 'woolly');
    const names = woolly.animations.map((a) => a.name);
    expect(names).toHaveLength(56);
    expect(names).toEqual(
      expect.arrayContaining([
        'walk',
        'rotate1a',
        'drag',
        'fall',
        'toss',
        'sleep1a',
        'bathb',
        'jump',
      ]),
    );
    // Every frame must point at a tile that exists on the sheet.
    const frames = woolly.animations.flatMap((a) => a.frames);
    expect(Math.max(...frames)).toBeLessThan(woolly.tilesX * woolly.tilesY);
    expect(woolly.tilesX).toBe(16);
    expect(woolly.png.startsWith('data:image/png;base64,iVBOR')).toBe(true);
  });
});

describe('listPacks / loadPack', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esheep-packs-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const addPack = (name: string, withXml = true): void => {
    fs.mkdirSync(path.join(dir, 'packs', name), { recursive: true });
    if (withXml) fs.writeFileSync(path.join(dir, 'packs', name, 'animations.xml'), MINIMAL);
  };

  it('always offers builtin, even with no packs directory', () => {
    expect(listPacks(dir)).toEqual([BUILTIN]);
  });

  it('lists packs that contain animations.xml, sorted, ignoring other folders and files', () => {
    addPack('zebra');
    addPack('alpha');
    addPack('broken', false);
    fs.writeFileSync(path.join(dir, 'packs', 'stray.txt'), 'x');
    expect(listPacks(dir)).toEqual([BUILTIN, 'alpha', 'zebra']);
  });

  it('loads builtin as the bounce pack', () => {
    expect(loadPack(dir, BUILTIN)).toEqual({ kind: 'bounce', name: BUILTIN });
  });

  it('falls back to builtin for an unknown or removed pack', () => {
    expect(loadPack(dir, 'missing')).toEqual({ kind: 'bounce', name: BUILTIN });
  });

  it('refuses path traversal because only listed packs load', () => {
    addPack('ok');
    expect(loadPack(dir, '../../etc')).toEqual({ kind: 'bounce', name: BUILTIN });
  });

  it('loads a listed classic pack', () => {
    addPack('alpha');
    const p = loadPack(dir, 'alpha');
    expect(p.kind).toBe('classic');
    expect(p.name).toBe('alpha');
  });
});
