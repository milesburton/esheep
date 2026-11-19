/**
 * Evaluates the arithmetic expressions found in sprite packs (numbers, named variables,
 * `+ - * /`, unary minus and parentheses). Deliberately not `eval`: packs are untrusted data.
 * Unknown variables are 0 and any non-finite result collapses to 0.
 */
export const evalExpr = (src: string, vars: Readonly<Record<string, number>>): number => {
  const tokens = src.match(/\d+\.?\d*|\.\d+|[A-Za-z_]\w*|[-+*/()]/g) ?? [];
  let i = 0;

  const primary = (): number => {
    const t = tokens[i++];
    if (t === undefined) return 0;
    if (t === '(') {
      const v = sum();
      i++; // closing parenthesis (tolerated if missing)
      return v;
    }
    if (t === '-') return -primary();
    if (t === '+') return primary();
    if (/^[\d.]/.test(t)) return parseFloat(t);
    return vars[t] ?? 0;
  };

  const product = (): number => {
    let v = primary();
    while (tokens[i] === '*' || tokens[i] === '/') {
      const op = tokens[i++];
      const r = primary();
      v = op === '*' ? v * r : r === 0 ? 0 : v / r;
    }
    return v;
  };

  const sum = (): number => {
    let v = product();
    while (tokens[i] === '+' || tokens[i] === '-') {
      const op = tokens[i++];
      const r = product();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };

  const out = sum();
  return Number.isFinite(out) ? out : 0;
};
