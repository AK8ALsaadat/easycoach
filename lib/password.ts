// Must match the live Supabase password_min_length; the server rejects shorter
// passwords after the form passes, which reads as "signup is broken".
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function passwordRequirements(password: string) {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    uppercase: /[A-Z]/.test(password),
    symbol: /[\p{P}\p{S}]/u.test(password),
  };
}

export function registrationPasswordIssue(password: string, confirmation: string): string | null {
  const rules = passwordRequirements(password);
  if (!rules.length) return "كلمة المرور يجب أن تكون 8 أحرف على الأقل";
  if (password.length > PASSWORD_MAX_LENGTH) return "كلمة المرور يجب ألا تتجاوز 128 حرفًا";
  if (!rules.uppercase) return "أضف حرفًا إنجليزيًا كبيرًا واحدًا على الأقل (A–Z)";
  if (!rules.symbol) return "أضف رمزًا خاصًا واحدًا على الأقل مثل ! @ # $ %";
  if (password !== confirmation) return "كلمتا المرور غير متطابقتين";
  return null;
}

/** A visible rule/length estimate, not a guarantee against password guessing. */
export function passwordStrength(password: string) {
  const rules = passwordRequirements(password);
  if (!password) return { score: 0, label: "لم تُكتب بعد" };
  if (!rules.length || !rules.uppercase || !rules.symbol || password.length > PASSWORD_MAX_LENGTH)
    return { score: 1, label: "ضعيفة" };
  if (password.length >= 16 && /[a-z]/.test(password) && /\d/.test(password))
    return { score: 4, label: "قوية جدًا" };
  if (password.length >= 12) return { score: 3, label: "قوية" };
  return { score: 2, label: "مقبولة" };
}
