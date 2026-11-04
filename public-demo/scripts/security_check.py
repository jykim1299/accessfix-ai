"""Check the built, local, read-only RC1. No credentials or model client required."""
from pathlib import Path
import json,hashlib,urllib.request,urllib.error,re,argparse
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--origin',default='http://127.0.0.1:8833');parser.add_argument('--out',type=Path,default=ROOT/'qa/security.json');args=parser.parse_args()
if args.out.exists():raise SystemExit('Use a fresh report path')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
files=[p for p in (ROOT/'dist').rglob('*') if p.is_file()]
before={p.relative_to(ROOT/'dist').as_posix():sha(p) for p in files}
findings=[]
for p in files:
 if p.suffix in ['.json','.js','.css','.html','.md','.txt','.diff']:
  t=p.read_text('utf-8',errors='replace')
  for pattern in [r'[A-Za-z]:[\\/]+Users[\\/]',r'/Users/[^/]+/',r'Authorization\s*:\s*Bearer\s+[A-Za-z0-9_-]{12,}',r'-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----']:
   if re.search(pattern,t,re.I):findings.append({'file':p.relative_to(ROOT/'dist').as_posix(),'kind':'potential_private_data','pattern':pattern})
 if p.name in ['.env','request.json','response.json'] or '.git' in p.parts or p.is_symlink():findings.append({'file':p.name,'kind':'disallowed_publish_file'})
results=[]
def request(path,method):
 req=urllib.request.Request(args.origin+path,method=method,data=b'{}' if method in ['POST','PUT','PATCH'] else None)
 try:
  with urllib.request.urlopen(req,timeout=5) as r:return r.status,dict(r.headers)
 except urllib.error.HTTPError as e:return e.code,dict(e.headers)
for method in ['POST','PUT','PATCH','DELETE','OPTIONS','TRACE','CONNECT']:
 for path in ['/','/api/analyses','/api/repairs/test/repair','/api/restore','/api/upload','/admin/execute']:
  status,headers=request(path,method);results.append({'method':method,'path':path,'status':status,'pass':status==405})
for path in ['/api/providers','/api/history','/.env','/.git/config','/src/main.tsx','/scripts/serve.py','/../README.md','/%2e%2e/README.md','/..%5cREADME.md']:
 status,_=request(path,'GET');results.append({'method':'GET','path':path,'status':status,'pass':status==404})
status,headers=request('/','GET');csp=headers.get('Content-Security-Policy','')
results.append({'method':'GET','path':'/','status':status,'pass':status==200 and "form-action 'none'" in csp and "frame-ancestors 'none'" in csp})
after={p.relative_to(ROOT/'dist').as_posix():sha(p) for p in files}
summary={'scope':'New RC1 static preview security checks; not historical model experiment','requests_tested':len(results),'checks':results,'publish_files':len(files),'potential_private_data':findings,'dist_unchanged_after_probes':before==after,'model_api_requests':0,'backend_app_or_model_sdk_in_server':False,'passed':all(x['pass'] for x in results) and not findings and before==after,'limitations':['Pattern scan is not a guarantee to detect every secret.','Production hosting headers and access policy require verification after a separately approved deployment.']}
args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(summary,indent=2),encoding='utf-8');print(json.dumps({k:summary[k] for k in ['requests_tested','publish_files','dist_unchanged_after_probes','passed']}));assert summary['passed']
