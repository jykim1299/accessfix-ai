"""Local RC1 static preview. Serves dist files; no app, model or execution API."""
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path,PurePosixPath
from urllib.parse import urlsplit,unquote
import argparse,mimetypes,json,hashlib

ROOT=Path(__file__).resolve().parents[1]/'dist'
CSP="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
class ReadOnlyHandler(BaseHTTPRequestHandler):
 def end_headers(self):
  self.send_header('Content-Security-Policy',CSP)
  self.send_header('X-Content-Type-Options','nosniff')
  self.send_header('Referrer-Policy','no-referrer')
  self.send_header('X-Frame-Options','DENY')
  self.send_header('Cache-Control','no-cache')
  super().end_headers()
 def reject_write(self):
  self.send_response(405);self.send_header('Allow','GET, HEAD');self.send_header('Content-Length','0');self.end_headers()
 do_POST=do_PUT=do_PATCH=do_DELETE=do_OPTIONS=do_TRACE=do_CONNECT=reject_write
 def do_GET(self):self.serve(False)
 def do_HEAD(self):self.serve(True)
 def serve(self,head):
  name=unquote(urlsplit(self.path).path)
  if '\\' in name or '\x00' in name or any(p in ['.','..'] for p in name.split('/')):
   return self.send_error(404)
  name='index.html' if name=='/' else name.lstrip('/')
  if name.split('/')[0] in ['api','admin','.git','.env','src','scripts','provenance','node_modules']:
   return self.send_error(404)
  path=(ROOT/name).resolve()
  if not path.is_relative_to(ROOT.resolve()) or not path.is_file() or path.is_symlink():return self.send_error(404)
  body=path.read_bytes();mime=mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
  if path.suffix in ['.js','.mjs']:mime='text/javascript'
  if path.suffix in ['.json','.map']:mime='application/json'
  if path.suffix in ['.diff','.txt','.md']:mime='text/plain'
  self.send_response(200);self.send_header('Content-Type',mime+('; charset=utf-8' if mime.startswith('text/') or mime=='application/json' else ''))
  self.send_header('Content-Length',str(len(body)));self.end_headers()
  if not head:self.wfile.write(body)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8833);a=p.parse_args()
 if not (ROOT/'index.html').is_file():raise SystemExit('Build the static site first: pnpm run build')
 print(f'AccessFix AI read-only RC1: http://127.0.0.1:{a.port}/',flush=True)
 ThreadingHTTPServer(('127.0.0.1',a.port),ReadOnlyHandler).serve_forever()
