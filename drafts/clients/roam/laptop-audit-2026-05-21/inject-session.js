((sessionJson) => {
  const s = JSON.parse(sessionJson);
  // Supabase v2 client stores session under "sb-<ref>-auth-token" in localStorage
  const ref = 'vzauarlfmkjfkcphojbd';
  const key = `sb-${ref}-auth-token`;
  const payload = {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_in: s.expires_in,
    expires_at: s.expires_at,
    token_type: s.token_type || 'bearer',
    user: s.user,
  };
  localStorage.setItem(key, JSON.stringify(payload));
  return JSON.stringify({stored: key, user_email: s.user?.email, expires_at: s.expires_at});
})(__SESSION_JSON__)
