import type { TextOverlay } from "@/lib/compositing/overlay-layout";

export interface ComponentPreset {
  key: string;
  type: "select" | "text";
  label: string;
  labelEn: string;
  options?: string[];
  placeholder?: string;
  // Optional fully-styled overlay template. When present, ticking this
  // preset produces an overlay carrying this styling (font, curve, stroke,
  // shadow, and even an overridden `type`) instead of the plain default —
  // so a new frame's field looks like the reference frame without retuning.
  // Spread over the default overlay in presetOverlay(), so any field here
  // wins. Omitted for presets that just want a plain text/select field.
  overlay?: Partial<TextOverlay>;
}

function joinYearOptions(): string[] {
  const currentYear = new Date().getFullYear();
  const years: string[] = [];
  for (let year = currentYear; year >= 1988; year--) years.push(String(year));
  return years;
}

export const COMPONENT_PRESETS: ComponentPreset[] = [
  {
    key: "joinYear",
    type: "select",
    label: "Năm gia nhập FPT",
    labelEn: "YEAR YOU JOINED FPT",
    options: joinYearOptions(),
    // Mirrors the styled join-year overlay on the FPT-38 frame (see
    // prisma/seed.ts) so a new frame gets the same curved "N NĂM LÀM FPT"
    // ribbon out of the box. Admin can still drag the curve to fit a
    // differently-laid-out frame.
    overlay: {
      type: "yearsSince",
      x: 21,
      y: 19,
      fontSize: 46,
      color: "#ffffff",
      fontWeight: "bold",
      strokeColor: "#FF5A01",
      strokeWidth: 2.6,
      shadow: { offsetX: 0, offsetY: 7, blur: 7, color: "rgba(0,0,0,0.25)" },
      rotation: -44,
      curve: { centerX: 48, centerY: 58, radius: 55, angle: -122, direction: "cw" },
    },
  },
  {
    key: "unit",
    type: "select",
    label: "Đơn vị công tác",
    labelEn: "Business unit",
    options: ["FPT Software", "FPT Telecom", "FPT IS", "FPT Education", "FPT Retail", "Khác"],
  },
  {
    key: "slogan",
    type: "text",
    label: "Câu châm ngôn",
    labelEn: "Personal slogan",
    placeholder: "VD: Dream Big, Move Fast",
  },
  {
    key: "signature",
    type: "text",
    label: "Chữ ký / Tên hiển thị",
    labelEn: "Display name / signature",
    placeholder: "VD: Nguyễn Văn A",
  },
];
