export function renderPortusIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const navy = [12, 18, 32, 255];
  const teal = [20, 184, 166, 255];
  const white = [232, 232, 240, 255];

  function pixel(x, y, color) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const offset = (y * size + x) * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  }

  function rect(x, y, width, height, color) {
    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) pixel(column, row, color);
    }
  }

  function roundedRect(x, y, width, height, radius, color) {
    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) {
        const dx = Math.max(x + radius - column, 0, column - (x + width - radius - 1));
        const dy = Math.max(y + radius - row, 0, row - (y + height - radius - 1));
        if (dx * dx + dy * dy <= radius * radius) pixel(column, row, color);
      }
    }
  }

  const margin = Math.max(1, Math.round(size * 0.04));
  roundedRect(margin, margin, size - margin * 2, size - margin * 2, Math.max(2, Math.round(size * 0.16)), navy);

  // Portal industrial envolvendo os cinco canais de captura.
  const left = Math.round(size * 0.2);
  const right = Math.round(size * 0.8);
  const top = Math.round(size * 0.21);
  const bottom = Math.round(size * 0.78);
  const stroke = Math.max(2, Math.round(size * 0.085));
  rect(left, top, right - left, stroke, teal);
  rect(left, top, stroke, bottom - top, teal);
  rect(right - stroke, top, stroke, bottom - top, teal);
  rect(left, bottom - stroke, right - left, stroke, teal);

  const barTop = Math.round(size * 0.39);
  const barBottom = Math.round(size * 0.64);
  const barWidth = Math.max(1, Math.round(size * 0.035));
  for (const position of [0.34, 0.42, 0.5, 0.58, 0.66]) {
    rect(Math.round(size * position) - Math.floor(barWidth / 2), barTop, barWidth, barBottom - barTop, white);
  }

  return pixels;
}
