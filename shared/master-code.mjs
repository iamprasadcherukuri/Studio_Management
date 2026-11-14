export function masterCode(name) {
  const code = String(name)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!code || code.length > 100)
    throw Object.assign(
      new Error(
        "Generated code must contain letters or numbers and be at most 100 characters",
      ),
      { status: 400 },
    );
  return code;
}
