export function readIntegerEnvironment(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const raw = environment[name];
  if (raw !== undefined && !/^\d+$/.test(raw))
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  const value = Number.parseInt(raw ?? String(fallback), 10);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  return value;
}

export function isLoopbackHost(value: string): boolean {
  return value === "127.0.0.1" || value === "::1" || value === "localhost";
}
