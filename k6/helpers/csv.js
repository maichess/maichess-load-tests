// Minimal CSV parser for k6. Assumes comma-separated values, first row is
// headers, and no quoted commas within fields. Sufficient for the project's
// feeder files (users.csv, fens.csv, matches.csv).
export function parseCsv(content) {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] || '').trim()]));
  });
}
