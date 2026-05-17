"""SY094 SSH driver. Usage: python sy094-ssh.py 'command string'

Credentials read from (in priority order):
  1. Env vars: MACINCLOUD_SSH_HOST, MACINCLOUD_SSH_USER, MACINCLOUD_SSH_PW
  2. DATABASE_URL env + kv_store.creds.macincloud JSON value

Env-var approach (simplest - set before calling):
  export MACINCLOUD_SSH_HOST=SY094.macincloud.com
  export MACINCLOUD_SSH_USER=user276189
  export MACINCLOUD_SSH_PW=$(cat ~/.ecodiaos/macincloud-pw.txt)

kv_store key: creds.macincloud -> {host, username, ssh_password, ...}
Canonical credential docs: ~/ecodiaos/docs/secrets/macincloud.md
"""
import paramiko, sys, os, json

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')


def _load_from_kv_store():
    """Try to read creds.macincloud from the VPS Postgres kv_store."""
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        return {}
    try:
        import psycopg2
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute("SELECT value FROM kv_store WHERE key = 'creds.macincloud' LIMIT 1")
        row = cur.fetchone()
        conn.close()
        if not row:
            return {}
        raw = row[0]
        return json.loads(raw) if isinstance(raw, str) else raw
    except Exception as e:
        sys.stderr.write(f'[sy094-ssh] kv_store fallback failed: {e}\n')
        return {}


def _resolve_creds():
    host = os.environ.get('MACINCLOUD_SSH_HOST')
    user = os.environ.get('MACINCLOUD_SSH_USER')
    pw   = os.environ.get('MACINCLOUD_SSH_PW')
    if host and user and pw:
        return host, user, pw
    creds = _load_from_kv_store()
    host = host or creds.get('host') or 'SY094.macincloud.com'
    user = user or creds.get('username') or creds.get('user')
    pw   = pw   or creds.get('ssh_password') or creds.get('password')
    if not pw:
        sys.exit(
            'ERROR: SY094 SSH password not found.\n'
            'Set MACINCLOUD_SSH_PW env var, or ensure DATABASE_URL is set and '
            'kv_store.creds.macincloud contains {ssh_password: ...}.\n'
            'See ~/ecodiaos/docs/secrets/macincloud.md'
        )
    return host, user, pw


HOST, USER, PW = _resolve_creds()


def run(cmd, timeout=900):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PW, timeout=30, banner_timeout=30, auth_timeout=30, look_for_keys=False, allow_agent=False)
    full = f"bash -lc {paramiko_shell_quote(cmd)}"
    stdin, stdout, stderr = c.exec_command(full, get_pty=False, timeout=timeout)
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    rc = stdout.channel.recv_exit_status()
    c.close()
    return rc, out, err


def paramiko_shell_quote(s):
    return "'" + s.replace("'", "'\"'\"'") + "'"


if __name__ == '__main__':
    cmd = sys.stdin.read() if sys.argv[1] == '-' else sys.argv[1]
    rc, out, err = run(cmd, timeout=int(os.environ.get('TIMEOUT', '900')))
    sys.stdout.write(out)
    if err:
        sys.stderr.write('\n--STDERR--\n' + err)
    sys.exit(rc)
