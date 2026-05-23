#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
FILE="$APP_DIR/sellway-frontend/src/pages/auth/AuthPages.jsx"
python3 - <<'PY' "$FILE"
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
if "termsAccepted" not in s:
    s = s.replace(
        "const [form, setForm] = useState({ email: '', username: '', password: '', role: initialRole, ref: initialRef });",
        "const [form, setForm] = useState({ email: '', username: '', password: '', role: initialRole, ref: initialRef, termsAccepted: false });"
    )
    s = s.replace(
        "setErrors({});\n    setLoading(true);",
        "setErrors({});\n    if (!form.termsAccepted) { setErrors({ termsAccepted: 'Необходимо принять правила площадки' }); return; }\n    setLoading(true);"
    )
    s = s.replace("await register(form);", "await register({ ...form, termsAccepted: 'true' });")
    s = s.replace(
        "<Btn type=\"submit\" full loading={loading} size=\"lg\">Создать аккаунт</Btn>",
        "<label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#0A0A12', border: `1px solid ${errors.termsAccepted ? C.red : C.border}`, borderRadius: 10, padding: 12, cursor: 'pointer' }}><input type=\"checkbox\" checked={form.termsAccepted} onChange={e => setForm(f => ({ ...f, termsAccepted: e.target.checked }))} style={{ marginTop: 2, accentColor: C.accent }} /><span style={{ fontSize: 12, color: C.t2, lineHeight: 1.45 }}>Я принимаю <Link to=\"/terms\" style={{ color: C.accent }}>правила площадки и условия реферальной программы</Link>.</span></label>{errors.termsAccepted && <div style={{ fontSize: 11, color: C.red }}>{errors.termsAccepted}</div>}<Btn type=\"submit\" full loading={loading} size=\"lg\">Создать аккаунт</Btn>"
    )
p.write_text(s)
PY
echo "Register terms UI patched"
