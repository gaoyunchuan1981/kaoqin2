# Backend deployment notes

This backend uses SQLite in a single persistent file. The installer targets Ubuntu 24.04 and Node.js 24 LTS.

- Service: `attendance-api.service`
- API listener: `127.0.0.1:3000`
- Database: `/var/lib/attendance-api/attendance.db`
- Avatar uploads: `/var/lib/attendance-api/uploads`
- Health check: `http://127.0.0.1:3000/healthz`

The API is deliberately bound to loopback because the current routes do not authenticate callers. Keep port 3000 closed at the cloud firewall. Do not put a public reverse proxy in front of the API until authentication and HTTPS access for the app are added.

The production database starts empty. No sample employee names or phone numbers are inserted automatically.

To install, extract the deployment archive and run `sudo bash install.sh` from its directory. Check service output with `sudo journalctl -u attendance-api -n 50 --no-pager`.