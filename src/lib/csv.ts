export function toCsv(columns: readonly string[], records: readonly object[]) {
  const escape = (value: unknown) => {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[\s]*[=+\-@]/u.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [columns.map(escape).join(","), ...records.map(record => columns.map(key => escape((record as Record<string, unknown>)[key])).join(","))].join("\r\n") + "\r\n";
}
