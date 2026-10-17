export async function resolveBinary(
  envPath: string,
  name: string,
  cwdFallbackNames: string[] = [],
): Promise<string> {
  if (envPath) {
    if (await Bun.file(envPath).exists()) return envPath;
  }
  const which = Bun.which(name);
  if (which) return which;
  for (const local of cwdFallbackNames) {
    if (await Bun.file(local).exists()) return local;
  }
  return "";
}
