// Hub Design: значки холста — свои, по образцу панели инструментов дизайн-холстов (16 px, линия 1.3, currentColor)
const S = (body, size = 16, extra = "") =>
  `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

export const CANVAS_ICONS = {
  select: S('<path d="M4 2.6 12.4 7l-3.5 1.2L7.6 12 4 2.6Z" fill="currentColor" fill-opacity=".08"/>'),
  hand: S('<path d="M5.6 8.2V3.9a1 1 0 0 1 2 0v3.2m0-.2V2.8a1 1 0 0 1 2 0v4.3m0-3a1 1 0 0 1 2 0v5.4c0 2.3-1.6 4-3.8 4-1.500 0-2.400-.6-3.400-1.700L2.900 9.900a1 1 0 0 1 1.500-1.300l1.200 1.200"/>'),
  text: S('<path d="M3.500 4.500v-1.300h9v1.300M8 3.200v9.600M6.200 12.800h3.600"/>'),
  frame: S('<path d="M5.800 2.500v11M10.200 2.500v11M2.500 5.800h11M2.500 10.200h11"/>'),
  note: S('<path d="M3 3.500h10v6.200L9.700 13H3v-9.500ZM9.500 13V9.700H13"/>'),
  comment: S('<path d="M8 2.600c-3 0-5.400 2-5.400 4.500 0 1.200.5 2.200 1.300 3L3.300 13l2.900-1.100c.6.200 1.100.2 1.800.2 3 0 5.400-2 5.400-4.500S11 2.600 8 2.600Z"/>'),
  pencil: S('<path d="m10.300 3.200 2.500 2.500-7 7L3 13l.3-2.800 7-7ZM9 4.500l2.500 2.500"/>'),
  rect: S('<rect x="2.500" y="4" width="11" height="8" rx="1.600"/>'),
  oval: S('<ellipse cx="8" cy="8" rx="5.500" ry="4"/>'),
  arrow: S('<path d="M3 13 13 3M7 3h6v6"/>'),
  free: S('<path d="M2.500 11c2.500-5 4-5 5.500-2.500s3 2.500 5.500-3"/>'),
  chev: S('<path d="m4.500 6.500 3.500 3.500 3.500-3.500"/>', 10, 'stroke-width="1.400"'),
  chev12: S('<path d="m4.500 6.500 3.500 3.500 3.500-3.500"/>', 12, 'stroke-width="1.400"'),
  play: S('<path d="M5.500 3.700v8.600l7-4.300-7-4.300Z"/>'),
  play12: S('<path d="M5.500 3.700v8.600l7-4.300-7-4.300Z"/>', 12, 'stroke-width="1.500"'),
  panel: S('<rect x="2.500" y="3" width="11" height="10" rx="1.800"/><path d="M9.600 3v10"/>'),
  sliders: S('<path d="M3 5.200h4.600M11.400 5.200H13M3 10.800h1.600M8.400 10.800H13"/><circle cx="9.500" cy="5.200" r="1.700"/><circle cx="6.500" cy="10.800" r="1.700"/>', 14),
  download: S('<path d="M8 2.800v7M5.200 7.300 8 10.100l2.800-2.800M3.200 12.800h9.600"/>', 14),
  plus: S('<path d="M8 3.500v9M3.500 8h9"/>'),
  trash: S('<path d="M3.500 4.800h9M6.500 4.800V3.300h3v1.500M4.800 4.800l.6 8h5.200l.6-8"/>', 14),
};
