"""Package Node and native dynamic dependencies from a cached trusted build image."""
from pathlib import Path
import re
import shutil
import subprocess

output = Path('/runtime')
output.mkdir(exist_ok=True)
node = Path(shutil.which('node')).resolve()
engine = Path('/app/.build/native/bin/pbrain-rapfi')

def copy(source, destination=None):
    source = Path(source)
    target = output / str(destination or source).lstrip('/')
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)

copy(node, '/usr/local/bin/node')
for executable in [node, engine]:
    result = subprocess.check_output(['ldd', str(executable)], text=True)
    for library in re.findall(r'(?:=>\s*)?(/[^\s]+)', result):
        if Path(library).is_file(): copy(library)
for pattern in ['libnss_dns.so*', 'libnss_files.so*', 'libresolv.so*']:
    for library in Path('/lib/x86_64-linux-gnu').glob(pattern): copy(library)
for path in ['/etc/ssl/certs/ca-certificates.crt', '/etc/nsswitch.conf']:
    if Path(path).exists(): copy(path)
for name in ['LICENSE', 'LICENSE.txt']:
    license_path = node.parent.parent / name
    if license_path.exists(): copy(license_path, '/usr/share/licenses/node/' + name)
for package in ['libc6', 'libstdc++6', 'libgcc-s1', 'libatomic1']:
    notice = Path('/usr/share/doc') / package / 'copyright'
    if notice.exists(): copy(notice)
(output / 'tmp').mkdir(exist_ok=True)
(output / 'tmp').chmod(0o1777)
(output / 'etc').mkdir(exist_ok=True)
(output / 'etc/passwd').write_text('node:x:1000:1000:Node:/tmp:/usr/sbin/nologin\n')
(output / 'etc/group').write_text('node:x:1000:\n')
