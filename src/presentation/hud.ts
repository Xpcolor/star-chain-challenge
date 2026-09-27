import { FX } from "./fx-config";
import { panelCircuit, type Point } from "./hud-path";
type Border = {
  element: HTMLElement;
  points: Point[];
  edges: { a: Point; b: Point; length: number; start: number }[];
  total: number;
  phase: number;
  color: string;
};
export class ElectricHUD {
  private canvas = document.getElementById("electricity") as HTMLCanvasElement;
  private ctx = this.canvas.getContext("2d")!;
  private borders: Border[] = [];
  private height = 0;
  private width = 0;
  private particles: {
    x: number;
    y: number;
    tx: number;
    ty: number;
    t: number;
    delay: number;
  }[] = [];
  layout() {
    const width = document.documentElement.clientWidth,
      height =
        document.querySelector<HTMLElement>(".cockpit")?.offsetHeight ||
        innerHeight,
      dpr = Math.min(devicePixelRatio, 1.5);
    this.width = width;
    this.height = height;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = width + "px";
    this.canvas.style.height = height + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.borders = Array.from(
      document.querySelectorAll<HTMLElement>("[data-electric]"),
    ).map((element, i) => {
      const r = element.getBoundingClientRect(),
        style = getComputedStyle(element),
        matrix = new DOMMatrixReadOnly(
          style.transform === "none" ? undefined : style.transform,
        ),
        [ox, oy] = style.transformOrigin.split(" ").map(parseFloat),
        w = element.offsetWidth,
        h = element.offsetHeight;
      const project = ([x, y]: Point): Point => {
        const p = new DOMPoint(x - ox, y - oy, 0, 1).matrixTransform(matrix);
        return [ox + p.x / p.w, oy + p.y / p.w];
      };
      const corners = (
          [
            [0, 0],
            [w, 0],
            [w, h],
            [0, h],
          ] as Point[]
        ).map(project),
        dx = r.x - Math.min(...corners.map((p) => p[0])),
        dy = r.y + scrollY - Math.min(...corners.map((p) => p[1]));
      const cells = Array.from(element.querySelectorAll<HTMLElement>("[data-electric-cell]")).map(cell => {
        let x=0, y=0, node: HTMLElement | null=cell;
        while(node && node!==element) { x+=node.offsetLeft; y+=node.offsetTop; node=node.offsetParent as HTMLElement | null; }
        return {x,y,width:cell.offsetWidth,height:cell.offsetHeight};
      });
      const points = panelCircuit(w,h,cells)
        .map(project)
        .map((p) => [p[0] + dx, p[1] + dy] as Point);
      let total = 0;
      const edges = points.slice(1).map((b, i) => {
        const a = points[i],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]),
          edge = { a, b, length, start: total };
        total += length;
        return edge;
      });
      return {
        element,
        points,
        edges,
        total,
        phase: this.borders[i]?.phase || 0,
        color: element.dataset.electric === "violet" ? "#b397ff" : "#71dfff",
      };
    });
  }
  transfer(
    rects: { left: number; top: number; width: number; height: number }[],
  ) {
    const anchor = document
      .getElementById("hero-anchor")
      ?.getBoundingClientRect();
    if (!anchor) return;
    this.particles = [];
    for (const r of rects)
      for (let x = 0; x < 6; x++)
        for (let y = 0; y < 8; y++)
          this.particles.push({
            x: r.left + ((x + 0.5) * r.width) / 6,
            y: r.top + scrollY + ((y + 0.5) * r.height) / 8,
            tx: anchor.x + anchor.width * 0.4,
            ty: anchor.y + scrollY + anchor.height * 0.55,
            t: 0,
            delay: (7 - y) * 0.007 + x * 0.003,
          });
  }
  private drawSelectedRail(age: number, reduced: boolean) {
    const track = document.querySelector<HTMLElement>(
      ".rail-button.active:not(:disabled) .track",
    );
    if (!track) return;
    const star = track.querySelector<HTMLElement>(".position-star"),
      label = track.querySelector<HTMLElement>(".rail-label");
    if (!star || !label) return;
    const r = track.getBoundingClientRect(),
      marker = star.getBoundingClientRect(),
      center = marker.y + marker.height / 2 + scrollY,
      previousLabel =
        track.parentElement?.previousElementSibling?.querySelector(
          ".rail-label",
        ),
      top = Math.max(
        center - 13,
        previousLabel
          ? previousLabel.getBoundingClientRect().bottom + scrollY + 2
          : 0,
      ),
      bottom = Math.min(
        center + 13,
        label.getBoundingClientRect().y + scrollY - 3,
      ),
      color = getComputedStyle(track).getPropertyValue("--rail-color").trim(),
      ctx = this.ctx,
      steps = Math.max(24, Math.ceil(r.width / 8));
    if (bottom <= top) return;

    ctx.save();
    // Keep the glow above the tick labels and behind the position star.
    ctx.beginPath();
    ctx.rect(r.x - 7, top, r.width + 14, bottom - top);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(r.x - 7, top, r.width + 14, bottom - top);
    ctx.moveTo(marker.x + marker.width + 1, center);
    ctx.arc(
      marker.x + marker.width / 2,
      center,
      marker.width / 2 + 1,
      0,
      Math.PI * 2,
    );
    ctx.clip("evenodd");
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = color;
    for (let strand = 0; strand < (reduced ? 1 : 2); strand++) {
      const points: Point[] = [];
      for (let n = 0; n <= steps; n++) {
        const u = n / steps,
          fade = Math.min(1, u * 14, (1 - u) * 14),
          phase = age * 7 + strand * 2.4,
          wave = reduced
            ? 0
            : (Math.sin(n * 2.1 - phase) * 3.3 +
                Math.sin(n * 0.7 + phase * 0.73) * 2.2 +
                Math.sin(n * 0.23 - phase * 0.6) * 1.5) *
              fade;
        const room = wave < 0 ? center - top - 3 : bottom - center - 3;
        points.push([
          r.x + u * r.width,
          center + wave * Math.min(1, Math.max(0, room) / 7),
        ]);
      }
      for (let layer = 0; layer < 2; layer++) {
        ctx.beginPath();
        points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
        ctx.strokeStyle = layer ? "#f2fcff" : color;
        ctx.lineWidth = layer ? 1.2 : 3.6;
        ctx.shadowBlur = layer ? 3 : 10;
        ctx.globalAlpha = strand ? (layer ? 0.35 : 0.45) : layer ? 0.95 : 0.8;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  draw(age: number, dt: number, reduced: boolean) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    for (const b of this.borders) {
      const boost = b.element.dataset.pulse === "1";
      if (!reduced)
        b.phase +=
          (dt / FX.lightning.period) * (boost ? FX.lightning.boost : 1);
      for (let strand = 0; strand < 2; strand++) {
        const points: Point[] = [];
        const samples = 80;
        for (let i = 0; i <= samples; i++) {
          const d =
              ((b.phase + strand / 2) * b.total -
                (i * b.total * FX.lightning.length) / samples +
                b.total * 100) %
              b.total,
            e = b.edges.find((e) => d <= e.start + e.length) || b.edges.at(-1)!,
            t = (d - e.start) / e.length,
            j = reduced
              ? 0
              : Math.sin(i * 2.7 + Math.floor(age * 12)) *
                Math.sin(i * 0.45) *
                2.1;
          points.push([
            e.a[0] + (e.b[0] - e.a[0]) * t - ((e.b[1] - e.a[1]) / e.length) * j,
            e.a[1] + (e.b[1] - e.a[1]) * t + ((e.b[0] - e.a[0]) / e.length) * j,
          ]);
        }
        for (let layer = 0; layer < 2; layer++) {
          ctx.strokeStyle = layer ? "#effeff" : b.color;
          ctx.lineWidth = layer ? 0.85 : 3;
          ctx.shadowColor = b.color;
          ctx.shadowBlur = layer ? 5 : 14;
          // Draw eight connected brightness bands, not hundreds of shadowed strokes.
          for (let start = 0; start < samples; start += 10) {
            ctx.globalAlpha =
              (1 - start / samples) ** 0.7 *
              (reduced ? 0.2 : boost ? 0.95 : 0.62);
            ctx.beginPath();
            ctx.moveTo(...points[start]);
            for(let i=start+1;i<=Math.min(samples,start+10);i++)ctx.lineTo(...points[i]);
            ctx.stroke();
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    this.drawSelectedRail(age, reduced);
    if (!reduced)
      this.particles = this.particles.filter((p) => {
        p.t += dt;
        const t = Math.max(0, (p.t - p.delay) / 0.38);
        if (t > 1) return false;
        const k = t * t * (3 - 2 * t);
        ctx.fillStyle = "#a8f3ff";
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.shadowBlur = 9;
        ctx.strokeStyle = "#9ceeff";
        ctx.lineWidth = 1.5;
        const tail = Math.max(0, t - 0.06), tailK = tail * tail * (3 - 2 * tail);
        ctx.beginPath();
        ctx.moveTo(p.x+(p.tx-p.x)*tailK,p.y+(p.ty-p.y)*tailK-Math.sin(tail*Math.PI)*75);
        ctx.lineTo(p.x+(p.tx-p.x)*k,p.y+(p.ty-p.y)*k-Math.sin(t*Math.PI)*75);
        ctx.stroke();
        ctx.fillRect(
          p.x + (p.tx - p.x) * k,
          p.y + (p.ty - p.y) * k - Math.sin(t * Math.PI) * 75,
          3 + 3 * (1 - t),
          3 + 3 * (1 - t),
        );
        return true;
      });
    else this.particles = [];
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  reset() {
    this.particles = [];
  }
  dispose() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.borders = [];
    this.particles = [];
  }
}
