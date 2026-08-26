export interface OverlayCurve {
  centerX: number; // % of frame width — arc center
  centerY: number; // % of frame height — arc center
  radius: number;  // % of frame width — arc radius (kept width-based so the
                    // arc stays a true circle even on a non-square frame)
  angle: number;   // degrees, math convention (0=right, -90=up) — angle of
                    // the MIDPOINT of the resolved text along the arc
  direction: "cw" | "ccw"; // reading direction along the arc
}

// Optional drop shadow, in the same pixel space as the rendered frame
// (offsets/blur are frame pixels, not CSS reference pixels).
export interface TextShadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

export interface TextOverlay {
  key: string;
  label: string;
  labelEn: string;
  type: "select" | "text" | "yearsSince";
  options?: string[];
  placeholder?: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  // CSS font-weight token (e.g. "bold", "600"). Omitted renders at normal
  // weight, matching every overlay before this field existed.
  fontWeight?: string;
  // Optional outline drawn behind the fill (Figma "outer" stroke look).
  // strokeWidth is in frame pixels. Both omitted = no outline (unchanged).
  strokeColor?: string;
  strokeWidth?: number;
  // Optional drop shadow. Omitted = no shadow (unchanged).
  shadow?: TextShadow;
  // Clockwise degrees around (x,y), for ribbon-style diagonal banners baked
  // into a frame's artwork (e.g. Frame 29's "N NĂM LÀM FPT" ribbon). Omitted
  // or 0 draws upright, matching every overlay before this field existed.
  rotation?: number;
  // Optional: draw the resolved text one character at a time along a
  // circular arc instead of as a single straight/rotated string. When set,
  // x/y/rotation above are ignored for this overlay (kept in the data,
  // just unused for drawing).
  curve?: OverlayCurve;
}

export interface ResolvedDraw {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  rotation: number;
  // CSS font-weight token carried from the overlay so both renderers paint
  // (and measure) at the same weight. Absent = normal weight, unchanged.
  fontWeight?: string;
  // Outline + drop shadow carried from the overlay so both renderers apply
  // them identically. All absent = plain fill, unchanged.
  strokeColor?: string;
  strokeWidth?: number;
  shadow?: TextShadow;
  // Set only on curved-arc character draws (see resolveCurvedDraws), whose
  // anchor point is meant to be the glyph's visual CENTER, not its default
  // start/baseline origin. Left absent for straight/rotated draws so their
  // ResolvedDraw shape — and rendering — stays exactly as before this field
  // existed.
  centered?: boolean;
}

// Measures a single character's rendered width in px at a given font size.
// Text-rendering differs between the browser's canvas (client preview) and
// node-canvas (server download), so overlay-layout.ts never guesses this
// itself — each caller measures with its own canvas 2d context so curved
// text lines up the same way in both places.
export type MeasureChar = (char: string, fontSize: number, fontWeight?: string) => number;

// Safety-net default for callers that don't care about curved overlays (or
// haven't wired a real measurer yet) — a rough monospace approximation.
const DEFAULT_MEASURE_CHAR: MeasureChar = (_char, fontSize) => fontSize * 0.6;

// FPT's founding-anniversary phrasing: a join year of the current year (or
// next) still counts as year 1 — never "0 years" — so tenure is floored at 1
// rather than computed as an inclusive year count.
function formatYearsSince(joinYear: string, lang: "vi" | "en"): string {
  const num = Number(joinYear);
  const years = Number.isFinite(num) ? Math.max(1, new Date().getFullYear() - num) : 1;
  if (lang === "en") {
    return years === 1 ? "1 YEAR WITH FPT" : `${years} YEARS WITH FPT`;
  }
  return `${years} NĂM LÀM FPT`;
}

// Lays `text` out one character at a time along a circular arc: each
// character becomes its own ResolvedDraw, spaced by its measured width so
// letters don't overlap or gap unevenly, centered on curve.angle, and
// rotated to stay tangent to the circle (upright, facing outward).
// The paint-style fields shared by every ResolvedDraw an overlay produces —
// bundled so both the straight and curved branches (and future renderers)
// carry them identically without a long positional parameter list.
type DrawStyle = Pick<ResolvedDraw, "fontSize" | "color" | "fontWeight" | "strokeColor" | "strokeWidth" | "shadow">;

function styleOf(o: TextOverlay): DrawStyle {
  return {
    fontSize: o.fontSize,
    color: o.color,
    fontWeight: o.fontWeight,
    strokeColor: o.strokeColor,
    strokeWidth: o.strokeWidth,
    shadow: o.shadow,
  };
}

function resolveCurvedDraws(
  text: string,
  curve: OverlayCurve,
  style: DrawStyle,
  width: number,
  height: number,
  measureChar: MeasureChar,
): ResolvedDraw[] {
  const centerX = (curve.centerX / 100) * width;
  const centerY = (curve.centerY / 100) * height;
  const radiusPx = (curve.radius / 100) * width;
  const chars = Array.from(text);

  const charAngles = chars.map(ch => {
    const widthPx = measureChar(ch, style.fontSize, style.fontWeight);
    return radiusPx > 0 ? (widthPx / radiusPx) * (180 / Math.PI) : 0;
  });
  const totalAngle = charAngles.reduce((sum, a) => sum + a, 0);
  const sign = curve.direction === "cw" ? 1 : -1;

  let cursor = curve.angle - sign * (totalAngle / 2);
  const draws: ResolvedDraw[] = [];
  for (let i = 0; i < chars.length; i++) {
    const half = charAngles[i] / 2;
    const angleDeg = cursor + sign * half;
    const angleRad = (angleDeg * Math.PI) / 180;
    const x = centerX + radiusPx * Math.cos(angleRad);
    const y = centerY + radiusPx * Math.sin(angleRad);
    const rotation = angleDeg + 90 + (curve.direction === "ccw" ? 180 : 0);
    draws.push({ text: chars[i], x, y, rotation, centered: true, ...style });
    cursor += sign * charAngles[i];
  }
  return draws;
}

export function resolveOverlayDraws(
  overlays: TextOverlay[],
  values: Record<string, string>,
  width: number,
  height: number,
  lang: "vi" | "en" = "vi",
  measureChar: MeasureChar = DEFAULT_MEASURE_CHAR,
): ResolvedDraw[] {
  return overlays
    .filter(o => values[o.key])
    .flatMap((o): ResolvedDraw[] => {
      const text = o.type === "yearsSince" ? formatYearsSince(values[o.key], lang) : values[o.key];
      const style = styleOf(o);
      if (o.curve) {
        return resolveCurvedDraws(text, o.curve, style, width, height, measureChar);
      }
      return [
        {
          text,
          x: (o.x / 100) * width,
          y: (o.y / 100) * height,
          rotation: o.rotation ?? 0,
          ...style,
        },
      ];
    });
}
