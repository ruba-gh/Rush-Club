"""Create a PRIVATE local backup. Never commit or share the output."""
import os,sqlite3,tempfile,tarfile,shutil,datetime
from pathlib import Path
root=Path(__file__).resolve().parent
data=Path(os.getenv('RUSH_DATA_DIR',root/'data'))
out=Path(os.getenv('RUSH_BACKUP_DIR',root.parent/'rush-private-backups'));out.mkdir(mode=0o700,parents=True,exist_ok=True)
if not (data/'rush.sqlite3').exists() or not (data/'secret').exists():raise SystemExit('No complete Rush data directory found.')
with tempfile.TemporaryDirectory() as tmp:
 tmp=Path(tmp)
 with sqlite3.connect(data/'rush.sqlite3') as src,sqlite3.connect(tmp/'rush.sqlite3') as dst:src.backup(dst)
 shutil.copyfile(data/'secret',tmp/'secret')
 path=out/('rush-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')+'.tar.gz')
 with tarfile.open(path,'w:gz') as tar:
  tar.add(tmp/'rush.sqlite3',arcname='rush.sqlite3');tar.add(tmp/'secret',arcname='secret')
 path.chmod(0o600)
 print('Private backup created:',path)
