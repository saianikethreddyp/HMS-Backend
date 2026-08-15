/** Pure domain rules for service usage recording, kept dependency-free for
 * fast unit testing. */

export const SERVICE_TYPES = ["OP", "PHARMACY", "DIAGNOSTIC"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export function isSupportedServiceType(value: string): value is ServiceType {
  return (SERVICE_TYPES as readonly string[]).includes(value);
}
