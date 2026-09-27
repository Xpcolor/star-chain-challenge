export type Point = [number, number];
export type Cell = { x: number; y: number; width: number; height: number };
function outline(
  x: number,
  y: number,
  w: number,
  h: number,
  c: number,
): Point[] {
  return [
    [x, y + c],
    [x + c, y],
    [x + w - c, y],
    [x + w, y + c],
    [x + w, y + h - c],
    [x + w - c, y + h],
    [x + c, y + h],
    [x, y + h - c],
    [x, y + c],
  ];
}
/** Two trails share this closed circuit: outer frame, then one continuous bow-shaped scan.
 * Cross only the cells' top/bottom edges; descend through the gutters, never through copy.
 * Inner cells do not get separate loops or additional lightning heads.
 */
export function panelCircuit(
  width: number,
  height: number,
  cells: Cell[],
): Point[] {
  const cut = Math.min(16, width / 4, height / 4),
    points = outline(0, 0, width, height, cut);
  const rows = [...cells].sort((a, b) => a.y - b.y);
  if (rows.length) points.push([0, rows[0].y]);
  for (const cell of rows) {
    const c = Math.min(6, cell.width / 4, cell.height / 4);
    points.push(
      [cell.x, cell.y],
      [cell.x + cell.width - c, cell.y],
      [cell.x + cell.width, cell.y + c],
      [cell.x + cell.width, cell.y + cell.height - c],
      [cell.x + cell.width - c, cell.y + cell.height],
      [cell.x, cell.y + cell.height],
    );
  }
  if (rows.length) points.push([0, rows.at(-1)!.y + rows.at(-1)!.height]);
  points.push([0, cut]);
  return points.filter(
    (p, i) => !i || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1],
  );
}
