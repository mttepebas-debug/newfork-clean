"""Replay application migrations in an already bootstrapped isolated local DB.
The named container must have network=none and no existing application schema.
Provider-managed auth/storage/realtime schema bootstrap is separate, schema-only.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
NAME = 'newfork-shift-exchange-replay-20260907'


def main():
    meta = json.loads(subprocess.run(['docker', 'inspect', NAME], capture_output=True, check=True, text=True).stdout)[0]
    assert meta['Name'] == '/' + NAME and meta['HostConfig']['NetworkMode'] == 'none'
    probe = subprocess.run(['docker','exec',NAME,'psql','-X','-U','postgres','-d','postgres','-Atc',"select to_regclass('public.workspaces');"], capture_output=True, text=True, check=True)
    assert not probe.stdout.strip(), 'An empty application schema is required; never reset a database here'
    output = ROOT / 'supabase/.temp/shift-exchange-replay'
    output.mkdir(exist_ok=True)
    source = [(path.name,path.read_bytes()) for path in sorted((ROOT/'supabase/migrations').glob('*.sql'))]
    report = {'container_id':meta['Id'],'network':'none','bootstrap':'current provider schemas only; application policies excluded; no rows copied','migrations':[]}
    started = time.monotonic()
    for name, content in source:
        (output/name).write_bytes(content)
        result = subprocess.run(['docker','exec','-i',NAME,'psql','-X','-U','postgres','-d','postgres','-q','-v','ON_ERROR_STOP=1','--single-transaction'],input=content,capture_output=True)
        report['migrations'].append({'file':name,'sha256':hashlib.sha256(content).hexdigest(),'exit_code':result.returncode})
        (output/(name+'.log')).write_bytes(result.stdout+result.stderr)
        report['elapsed_seconds']=round(time.monotonic()-started,2)
        (output/'result.json').write_text(json.dumps(report,indent=2))
        if result.returncode:
            print(json.dumps({'failed':name,'applied':len(report['migrations'])-1,'error':result.stderr.decode(errors='replace')[-3000:]}))
            return
    print(json.dumps({'applied':len(source),'status':'PASS','elapsed_seconds':report['elapsed_seconds']}))


if __name__ == '__main__':
    main()
