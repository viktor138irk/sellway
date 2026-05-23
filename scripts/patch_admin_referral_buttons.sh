#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
API_FILE="$APP_DIR/sellway-frontend/src/api/admin.js"
PAGE_FILE="$APP_DIR/sellway-frontend/src/pages/admin/ReferralsPage.jsx"

python3 - <<'PY' "$API_FILE"
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text()
if "approveReferralApplication" not in s:
    s += "\nexport const approveReferralApplication = (userId, data={}) => client.post(`/admin/referrals/${userId}/approve`, data);\n"
    s += "export const rejectReferralApplication = (userId, data) => client.post(`/admin/referrals/${userId}/reject`, data);\n"
p.write_text(s)
PY

python3 - <<'PY' "$PAGE_FILE"
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text()
if "approveReferralApplication" not in s:
    s=s.replace("import { getAdminReferrals, saveReferralSettings } from '../../api/admin';", "import { getAdminReferrals, saveReferralSettings, approveReferralApplication, rejectReferralApplication } from '../../api/admin';")
if "async function approveReferral" not in s:
    marker="  async function save() {"
    insert="""
  async function approveReferral(userId) {
    try { await approveReferralApplication(userId); toast.success('Заявка одобрена'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Ошибка одобрения'); }
  }

  async function rejectReferral(userId) {
    const reason = window.prompt('Причина отказа');
    if (!reason) return;
    try { await rejectReferralApplication(userId, { reason }); toast.success('Заявка отклонена'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Ошибка отказа'); }
  }

"""
    s=s.replace(marker, insert+marker)
if "Заявки на модерацию" not in s:
    marker="    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:12 }}>"
    block="""
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
      <div style={{ padding:'15px 18px', borderBottom:`1px solid ${C.border}`, fontSize:15, fontWeight:900, color:C.t1 }}>Заявки на модерацию</div>
      {(data?.invited || []).filter(u => u.referral_application_status === 'pending').length === 0 ? <div style={{ padding:24, color:C.t3, fontSize:13 }}>Нет заявок на модерацию</div> : (data?.invited || []).filter(u => u.referral_application_status === 'pending').map(u => <div key={u.user_id} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:10, alignItems:'center', padding:'12px 18px', borderBottom:`1px solid ${C.border}` }}>
        <div><div style={{ color:C.t1, fontWeight:800, fontSize:13 }}>{u.username}</div><div style={{ color:C.t3, fontSize:11 }}>{u.email} · {u.role}</div></div>
        <Btn size="sm" onClick={() => approveReferral(u.user_id)}>Одобрить</Btn>
        <Btn size="sm" variant="ghost" onClick={() => rejectReferral(u.user_id)}>Отклонить</Btn>
      </div>)}
    </div>

"""
    s=s.replace(marker, block+marker)
p.write_text(s)
PY

echo "Admin referral moderation buttons patched"
