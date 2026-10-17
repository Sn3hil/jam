export function splitToolExtraArgs(args: string): string[] {
  const out: string[] = [];
  for (const raw of args.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line.length === 0) continue;
    out.push(...line.split(/\s+/));
  }
  return out;
}
