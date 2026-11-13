export function csvCell(value) {
  let text = String(value ?? "");
  const isNumber = /^-?\d+(?:\.\d+)?$/.test(text);
  if (
    !isNumber &&
    (/^[=+\-@\t\r\n]/.test(text) || /^[=+\-@]/.test(text.trimStart()))
  )
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
