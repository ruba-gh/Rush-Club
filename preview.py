"""Isolated UI preview. Not used for production."""
import os, secrets, tempfile, runpy, sys
os.environ['RUSH_ADMIN_PASSWORD']=secrets.token_urlsafe(32)
os.environ['RUSH_DATA_DIR']=tempfile.mkdtemp(prefix='rush-preview-')
os.environ['PORT']=sys.argv[sys.argv.index('--port')+1] if '--port' in sys.argv else os.getenv('PORT','3000')
runpy.run_path('server.py',run_name='__main__')
