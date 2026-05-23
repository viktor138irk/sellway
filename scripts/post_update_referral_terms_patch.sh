#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP_FILE="$APP_DIR/sellway-frontend/src/App.jsx"
AUTH_CTX="$APP_DIR/sellway-frontend/src/contexts/AuthContext.jsx"
SERVER_FILE="$APP_DIR/sellway-backend/src/server.js"

if [[ -f "$APP_FILE" ]]; then
  if ! grep -q "TermsPage" "$APP_FILE"; then
    python3 - <<'PY' "$APP_FILE"
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text()
s=s.replace("const AdminLogs         = lazy(() => import('./pages/admin/LogsPage'));", "const AdminLogs         = lazy(() => import('./pages/admin/LogsPage'));\nconst TermsPage         = lazy(() => import('./pages/legal/TermsPage'));")
s=s.replace('<Route path="/register" element={<GuestOnly><RegisterPage/></GuestOnly>}/>', '<Route path="/register" element={<GuestOnly><RegisterPage/></GuestOnly>}/>\n    <Route path="/terms" element={<TermsPage/>}/>')
p.write_text(s)
PY
  fi
fi

if [[ -f "$AUTH_CTX" ]]; then
  if ! grep -q "termsAccepted" "$AUTH_CTX"; then
    python3 - <<'PY' "$AUTH_CTX"
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text()
s=s.replace("const { data } = await apiRegister(formData);", "const { data } = await apiRegister({ ...formData, termsAccepted: String(formData?.termsAccepted ?? true) });")
p.write_text(s)
PY
  fi
fi

if [[ -f "$SERVER_FILE" ]]; then
  python3 - <<'PY' "$SERVER_FILE"
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text().replace("pool.end().then(() => pool.end()).finally(() => process.exit(0))", "pool.end().finally(() => process.exit(0))")
p.write_text(s)
PY
fi

echo "Post update referral/terms patch applied"
