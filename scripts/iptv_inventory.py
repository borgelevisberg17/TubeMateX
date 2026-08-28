#!/usr/bin/env python3
import argparse, csv, hashlib, json, re, sqlite3
from pathlib import Path
from urllib.parse import urlparse

URL_RE = re.compile(r'https?://[^\s<>"\'`\\]+', re.I)
EXTS = {'.m3u','.m3u8','.mpd','.csv','.json','.jsonl','.txt','.yaml','.yml','.xml','.md','.conf','.list'}
SKIP = {'.git','node_modules','dist','build'}

def clean_url(value): return value.rstrip("),;]}>\'")
def row_for(url, repo, file, meta=None):
    url = clean_url(url)
    try: host = urlparse(url).netloc.lower()
    except ValueError: return None
    if not host: return None
    return {'url': url, 'url_hash': hashlib.sha256(url.encode()).hexdigest(), 'kind': 'hls' if 'm3u8' in url.lower() else 'dash' if '.mpd' in url.lower() or 'dash' in url.lower() else 'http', 'host': host, 'title': (meta or {}).get('title'), 'group_name': (meta or {}).get('group_name'), 'country': (meta or {}).get('country'), 'language': (meta or {}).get('language'), 'source_repo': repo, 'source_file': file}
def parse(text, repo, file):
    rows=[]; meta={}
    for line in text.splitlines():
        value=line.strip()
        if not value: continue
        if value.startswith('#EXTINF'):
            comma=value.find(','); attrs=dict(re.findall(r'([\w-]+)="([^"]*)"', value))
            meta={'title': value[comma+1:].strip() if comma>=0 else None, 'group_name': attrs.get('group-title'), 'country': attrs.get('tvg-country'), 'language': attrs.get('tvg-language')}; continue
        if value.startswith('http'):
            item=row_for(value, repo, file, meta)
            if item: rows.append(item)
            meta={}
    if rows: return rows
    return [item for m in URL_RE.findall(text) if (item:=row_for(m, repo, file))]
def files(root):
    for p in root.rglob('*'):
        if p.is_file() and not any(part in SKIP for part in p.parts) and p.suffix.lower() in EXTS:
            yield p

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--input', required=True); ap.add_argument('--output', required=True); args=ap.parse_args()
    root=Path(args.input); out=Path(args.output); out.parent.mkdir(parents=True, exist_ok=True)
    con=sqlite3.connect(out); con.executescript('''PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS streams (id TEXT PRIMARY KEY,url TEXT NOT NULL UNIQUE,url_hash TEXT NOT NULL,kind TEXT NOT NULL,host TEXT NOT NULL,title TEXT,group_name TEXT,country TEXT,language TEXT,status TEXT NOT NULL DEFAULT 'pending_review',authorization_status TEXT NOT NULL DEFAULT 'unknown',first_seen_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,source_count INTEGER NOT NULL DEFAULT 1); CREATE TABLE IF NOT EXISTS stream_sources (stream_id TEXT NOT NULL,source_repo TEXT NOT NULL,source_file TEXT NOT NULL,first_seen_at TEXT NOT NULL,PRIMARY KEY(stream_id,source_repo,source_file)); CREATE INDEX IF NOT EXISTS streams_status_idx ON streams(status);''')
    now=__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(); count=0
    for p in files(root):
        try: text=p.read_text(errors='ignore')
        except OSError: continue
        if p.suffix.lower() != '.jsonl' and len(text)>20_000_000: continue
        parsed_rows = []
        if p.suffix.lower() == '.jsonl':
            for line in text.splitlines():
                try:
                    raw = json.loads(line)
                    item = row_for(raw.get('url',''), raw.get('source_repo', root.name), raw.get('source_file', str(p.relative_to(root))), raw)
                    if item: parsed_rows.append(item)
                except Exception: pass
        else:
            parsed_rows = parse(text, root.name, str(p.relative_to(root)))
        for item in parsed_rows:
            sid='stream-'+item['url_hash']; count+=1
            con.execute('''INSERT INTO streams(id,url,url_hash,kind,host,title,group_name,country,language,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET last_seen_at=excluded.last_seen_at,source_count=streams.source_count+1''',(sid,item['url'],item['url_hash'],item['kind'],item['host'],item['title'],item['group_name'],item['country'],item['language'],now,now))
            con.execute('INSERT OR IGNORE INTO stream_sources VALUES(?,?,?,?)',(sid,item['source_repo'],item['source_file'],now))
    con.commit(); summary=dict(zip(['streams','hls','dash','pending'],con.execute("SELECT COUNT(*),SUM(kind='hls'),SUM(kind='dash'),SUM(status='pending_review') FROM streams").fetchone())); print(json.dumps({'output':str(out),'ingested_rows':count,**summary},indent=2)); con.close()
if __name__=='__main__': main()
