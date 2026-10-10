from pathlib import Path
import re,json
root=Path(r'C:\Users\Admin\Downloads\FINNTECH');evidence=root/'docs/acceptance/cash-linked-assets-20261010'
source=(evidence/'merge-12-conflict.txt').read_text(encoding='utf-8')
def choose(m):
 current,next=m.group(1),m.group(2)
 return '' if 'const stockPosition=' in current else next
resolved=re.sub(r'^<<<<<<<[^\n]*\n(.*?)^=======\n(.*?)^>>>>>>>[^\n]*\n',choose,source,flags=re.M|re.S)
assert '<<<<<<<' not in resolved
resolved=resolved.replace('stockConnectionLabel(stockPrices.connection)','stockConnectionLabels[stockPrices.connection]')
assert 'stockConnectionLabels' in resolved and 'export const stockConnectionLabel=' not in resolved
(root/'apps/web/src/tracker/Assets.tsx').write_text(resolved,encoding='utf-8',newline='\n')
result=json.loads((evidence/'mirror-result.json').read_text());result['mirrored'].append('apps/web/src/tracker/Assets.tsx');result['conflicts']=[]
(evidence/'mirror-result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print('Root Assets mirror resolved; existing shared labels retained.')
