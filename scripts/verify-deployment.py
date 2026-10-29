"""Read-only checks for the deployed gateway, old ports and policy API."""
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

base = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8210').rstrip('/')

def request(url, payload=None):
    headers = {'Origin': base}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        headers['Content-Type'] = 'application/json'
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=30) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read()

report = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'base': base, 'games': [], 'api': []}
for slug, port in [('gomoku',8209),('othello',8207),('scout',8203),('heaven-ale',8200),('modern-art',8201),('jaipur',8204),('patchwork',8205),('carnegie',8206),('ra',8208)]:
    url = f'{base}/boardgame/{slug}/'
    status, headers, body = request(url)
    assert status == 200, (url,status)
    html = body.decode()
    title = re.search(r'<title>(.*?)</title>',html,re.S).group(1)
    old_status, _, old_body = request(f'http://127.0.0.1:{port}/')
    assert old_status == 200 and f'<title>{title}</title>' in old_body.decode(), (slug,'old port changed')
    assets = re.findall(r'(?:src|href)=["\x27]([^"\x27]+\.(?:js|css|svg))["\x27]',html)
    for asset in assets:
        address = urllib.parse.urljoin(url,asset)
        asset_status, asset_headers, asset_body = request(address)
        assert asset_status == 200 and 'text/html' not in asset_headers.get('Content-Type',''), (address,asset_status)
        if asset.endswith('.js'):
            script = asset_body.decode()
            for worker in set(re.findall(r'["\x27]([^"\x27]*ai\.worker[^"\x27]*\.js)["\x27]', script)):
                worker_url = urllib.parse.urljoin(address,worker)
                ws, wh, _ = request(worker_url)
                assert ws == 200 and 'javascript' in wh.get('Content-Type',''), (worker_url,ws)
    report['games'].append({'slug':slug,'title':title,'oldPort':port,'assets':len(assets)})

for path in ['/boardgame/','/boardgame/gomoku/engine/rules.wasm','/boardgame/gomoku/engine/rapfi.wasm','/boardgame/modern-art/artworks/artist-0-0.jpg']:
    status, headers, body = request(base+path)
    assert status == 200, (path,status)
    if path.endswith('.wasm'): assert body[:4] == b'\0asm'
    if path.endswith('.jpg'): assert headers.get('Content-Type','').startswith('image/')
for path in ['/boardgame/gomoku/private/renju.toml','/boardgame/gomoku/.build/runtime-models/manifest.json']:
    assert request(base+path)[0] == 404, path
for rule in ['freestyle','renju']:
    status, _, body = request(base+'/boardgame/gomoku/api/beginner-move',{'moves':[224,0,222,1,220,2,218,3],'rule':rule})
    assert status == 200,body
    result = json.loads(body)['result']
    assert result['move']==4 and result['nodes']==0 and result['depth']==0 and result['guard']=='block-four',result
    report['api'].append({'rule':rule,'zeroSearch':True,'blockFour':True})
for black in [[111,113,97,127],[109,110,111,67,82,97],[105,106,107,109,110]]:
    moves = [x for i,move in enumerate(black) for x in [move,i*2]]
    status, _, body = request(base+'/boardgame/gomoku/api/beginner-move',{'moves':moves,'rule':'renju'})
    assert status==200,body
    assert json.loads(body)['result']['move'] != (108 if black[0]==105 else 112)
for path in ['/boardgame/modern-art/api/replays?offset=0','/boardgame/heaven-ale/api/replays?page=1']:
    status, _, body = request(base+path)
    assert status==200,(path,status,body[:150])
    json.loads(body)
    report['api'].append({'path':path,'status':status})
status, _, body = request(base+'/api/native/health')
old_status, _, old_body = request('http://127.0.0.1:8207/api/native/health')
assert status==old_status,(status,old_status)
if status==200: assert json.loads(body)==json.loads(old_body)
report['api'].append({'path':'/api/native/health','status':status,'matchesOriginal':True})
print(json.dumps(report,ensure_ascii=False,indent=2))
