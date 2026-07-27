export function buildInterviewSettingsHref(recruitmentId: number): `/company/recruitments/${number}/interview-settings` {
  return `/company/recruitments/${recruitmentId}/interview-settings`;
}

export function buildPublicApplicationInterviewHref(
  applicationId: number,
  token: string,
): `/public/applications/${number}/interview?token=${string}` {
  return `/public/applications/${applicationId}/interview?token=${encodeURIComponent(token)}`;
}
