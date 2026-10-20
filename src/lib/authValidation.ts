const hccciEmailPattern = /^[^\s@]+@hccci\.edu\.ph$/i;

export function isAllowedRegistrationEmail(email: string): boolean {
  return hccciEmailPattern.test(email.trim());
}