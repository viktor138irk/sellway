#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SRC="$APP_DIR/sellway-frontend/src"
MAIN="$SRC/main.jsx"
CATALOG="$SRC/pages/store/CatalogPage.jsx"
CSS="$SRC/mobile-fixes.css"

cat > "$CSS" <<'EOF'
*{box-sizing:border-box}html,body,#root{width:100%;min-height:100%;margin:0}body{overflow-x:hidden;background:#080812}img{max-width:100%}
@media(max-width:760px){
body,#root,#root>div{max-width:100vw!important;overflow-x:hidden!important;min-width:0!important}
header{max-width:100vw!important;overflow-x:hidden!important}
.fade-in{max-width:100vw!important;min-width:0!important;padding-left:12px!important;padding-right:12px!important;overflow-x:hidden!important}
aside[style*="width: 230"]{width:100%!important;max-width:100%!important;flex-basis:100%!important}
main[style*="min-width: 280"]{width:100%!important;min-width:0!important;flex-basis:100%!important}
aside[style*="width: 220"]{width:100%!important;max-width:100%!important;position:relative!important;height:auto!important;border-right:0!important;border-bottom:1px solid #1E1E2E!important}
aside[style*="width: 220"] nav{display:flex!important;overflow-x:auto!important;gap:6px!important;padding:10px!important;white-space:nowrap!important}
aside[style*="width: 220"] nav a{flex:0 0 auto!important;border-left:0!important;padding:9px 12px!important}
aside[style*="width: 220"]+main{width:100%!important;min-width:0!important;overflow-x:hidden!important}
div[style*="min-height: calc(100vh - 90px)"][style*="display: flex"]{display:block!important;min-height:auto!important;width:100%!important}
[style*="repeat(auto-fill,minmax(120px,1fr))"],[style*="repeat(auto-fill,minmax(130px,1fr))"]{grid-template-columns:repeat(2,minmax(0,1fr))!important}
[style*="repeat(auto-fill,minmax(92px,1fr))"]{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
}
@media(min-width:761px){
[style*="repeat(auto-fill,minmax(92px,1fr))"]{gap:8px!important}
[style*="repeat(auto-fill,minmax(92px,1fr))"]>div{border-radius:9px!important}
[style*="repeat(auto-fill,minmax(92px,1fr))"]>div>div:nth-child(2){padding:6px!important;gap:3px!important}
[style*="repeat(auto-fill,minmax(92px,1fr))"] span{font-size:9px!important}
[style*="repeat(auto-fill,minmax(92px,1fr))"] div{font-size:10px!important;line-height:1.25!important}
}
EOF

python3 - <<'PY' "$MAIN" "$CATALOG"
from pathlib import Path
import sys
main=Path(sys.argv[1])
cat=Path(sys.argv[2])
s=main.read_text()
if "mobile-fixes.css" not in s:
    s=s.replace("import App from './App';", "import App from './App';\nimport './mobile-fixes.css';")
main.write_text(s)

c=cat.read_text()
c=c.replace("repeat(auto-fill,minmax(210px,1fr))", "repeat(auto-fill,minmax(92px,1fr))")
old="{cats.map(c => <div key={c.id} onClick={() => setParam('category', c.slug)}"
new="{cats.filter(c => !c.parent_id || category === cats.find(p => p.id === c.parent_id)?.slug).map(c => <div key={c.id} onClick={() => setParam('category', c.slug)}"
c=c.replace(old,new)
cat.write_text(c)
PY

echo "Mobile layout and compact catalog patched"
