#!/usr/bin/env python3
"""One-shot watchdog for this local experiment, not a recurring automation."""
import argparse
import json
import os
import signal
import time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(path):
    try:return json.loads(path.read_text())
    except (FileNotFoundError,json.JSONDecodeError):return {}
def alive(pid):
    try:os.kill(pid,0);return True
    except ProcessLookupError:return False

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',required=True);args=parser.parse_args()
    run=(ROOT/args.run).resolve();pids=read(run/'processes.json')
    if set(pids)!={'black','white'}:raise ValueError('Expected recorded black/white PIDs')
    (run/'watchdog-pid.txt').write_text(str(os.getpid())+'\n')
    while True:
        phase=read(run/'status.json').get('phase')
        if phase in {'complete','failed','cancelled','paused'}:return
        exported=0
        for color,pid in pids.items():
            status=read(run/color/'status.json')
            if status.get('status')=='exported':exported+=1;continue
            if not alive(pid):
                if read(run/color/'status.json').get('status')=='exported':
                    exported+=1;continue
                error={'phase':'failed','error':f'{color} training/export process exited before successful export','log':str(run/(color+'.log'))}
                (run/'status.json').write_text(json.dumps(error,indent=2)+'\n')
                for other,other_pid in pids.items():
                    if other!=color and alive(other_pid):os.kill(other_pid,signal.SIGTERM)
                print(json.dumps(error),flush=True);return
        if exported==2:return  # Finish script supervises the remaining C++/match steps.
        time.sleep(5)
if __name__=='__main__':main()
