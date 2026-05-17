"""SY094 SSH driver. Usage: python sy094-ssh.py 'command string'"""
import paramiko, sys, os, time
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

HOST = 'SY094.macincloud.com'
USER = 'user276189'
PW   = 'xve24085ehi'

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
    # POSIX shell single-quote escape
    return "'" + s.replace("'", "'\"'\"'") + "'"

if __name__ == '__main__':
    cmd = sys.stdin.read() if sys.argv[1] == '-' else sys.argv[1]
    rc, out, err = run(cmd, timeout=int(os.environ.get('TIMEOUT', '900')))
    sys.stdout.write(out)
    if err:
        sys.stderr.write('\n--STDERR--\n' + err)
    sys.exit(rc)
