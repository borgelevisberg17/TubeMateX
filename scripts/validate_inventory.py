#!/usr/bin/env python3
import argparse, json, random, socket, sqlite3, urllib.request
from datetime import datetime, timezone

def private_host(host):
    try:
        ip = socket.gethostbyname(host)
        parts = [int(x) for x in ip.split('.')]
        return ip.startswith('127.') or ip.startswith('10.') or ip.startswith('192.168.') or (parts[0] == 172 and 16 <= parts[1] <= 31) or ip == '0.0.0.0'
    except Exception: return True

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--database',required=True); ap.add_argument('--sample',type=int,default=500); ap.add_argument('--timeout',type=int,default=8); ap.add_argument('--report',required=True); args=ap.parse_args()
    con=sqlite3.connect(args.database); rows=con.execute('SELECT id,url,kind,host FROM streams WHERE status="pending_review" ORDER BY RANDOM() LIMIT ?', (args.sample,)).fetchall(); con.close()
    results=[]
    for sid,url,kind,host in rows:
        if private_host(host): results.append({'id':sid,'url':url,'status':'blocked_host'}); continue
        req=urllib.request.Request(url, method='HEAD', headers={'User-Agent':'TubeMateX-inventory-validator/1.0'})
        try:
            with urllib.request.urlopen(req, timeout=args.timeout) as r:
                ct=(r.headers.get('content-type') or '').lower(); status='online' if r.status < 400 else 'offline'; results.append({'id':sid,'url':url,'kind':kind,'status':status,'http_code':r.status,'content_type':ct})
        except Exception as e: results.append({'id':sid,'url':url,'kind':kind,'status':'offline','error':type(e).__name__})
    summary={}
    for item in results: summary[item['status']]=summary.get(item['status'],0)+1
    payload={'checked_at':datetime.now(timezone.utc).isoformat(),'sample_size':len(results),'summary':summary,'results':results}
    with open(args.report,'w',encoding='utf-8') as f: json.dump(payload,f,ensure_ascii=False,indent=2)
    print(json.dumps({'checked_at':payload['checked_at'],'sample_size':len(results),'summary':summary},ensure_ascii=False))
if __name__=='__main__': main()
