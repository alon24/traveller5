/**
 * Minimal CSV parser for GTFS .txt files.
 * Returns an array of objects keyed by header row.
 */
export function parseCSV(text, maxRows = Infinity) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].replace('\r', '').split(',');
  const results = [];

  for (let i = 1; i < lines.length && results.length < maxRows; i++) {
    const line = lines[i].replace('\r', '');
    if (!line) continue;
    const values = splitCSVLine(line);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] || ''; });
    results.push(obj);
  }

  return results;
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
