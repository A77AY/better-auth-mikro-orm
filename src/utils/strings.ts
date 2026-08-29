export function quote(value: string): string {
  return JSON.stringify(value);
}

export function propertyKey(value: string): string {
  return /^[A-Z_$][\w$]*$/i.test(value) ? value : quote(value);
}

export function stringArray(values: readonly string[]): string {
  return `[${values.map(quote).join(", ")}]`;
}

export function toPascalCase(value: string): string {
  const result = value
    .replaceAll(/([a-z\d])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z\d]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`)
    .join("");
  if (!result) return "Model";
  return /^\d/.test(result) ? `Model${result}` : result;
}

export function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

export function toKebabCase(value: string): string {
  return toSnakeCase(value).replaceAll("_", "-");
}
