"""Rush community. Python 3.12+, no third-party packages."""
from datetime import datetime
import os, json, sqlite3, secrets, hashlib, hmac, time, re, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parent
DATA=Path(os.getenv('RUSH_DATA_DIR',ROOT/'data')); DATA.mkdir(exist_ok=True)
PROD=os.getenv('RUSH_ENV')=='production'
ADMIN=os.getenv('RUSH_ADMIN_PASSWORD','')
if len(ADMIN)<14: raise SystemExit('Set RUSH_ADMIN_PASSWORD to a unique password of at least 14 characters.')
secret_file=DATA/'secret'
if not secret_file.exists():
    fd=os.open(secret_file,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:f.write(secrets.token_hex(32))
PEPPER=secret_file.read_text()
LOCK=threading.RLock()
def db():
    c=sqlite3.connect(DATA/'rush.sqlite3',timeout=20);c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON');return c
def init():
    with db() as c:c.executescript('''
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,phone TEXT UNIQUE NOT NULL,name TEXT NOT NULL,area TEXT DEFAULT '',badminton TEXT DEFAULT 'beginner',padel TEXT DEFAULT 'beginner',avatar INTEGER DEFAULT 0,public INTEGER DEFAULT 1,salt TEXT NOT NULL,pin_hash TEXT NOT NULL,approved INTEGER DEFAULT 0,created REAL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,admin INTEGER,expires REAL);
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,title TEXT,sport TEXT,starts TEXT,venue TEXT,price INTEGER,capacity INTEGER,rounds INTEGER,minutes INTEGER,code_hash TEXT,status TEXT DEFAULT 'open',created REAL);
    CREATE TABLE IF NOT EXISTS entries(event_id TEXT REFERENCES events(id),user_id TEXT REFERENCES users(id),slot INTEGER,confirmed INTEGER DEFAULT 0,attended INTEGER DEFAULT 0,level TEXT,reward_id TEXT,PRIMARY KEY(event_id,user_id),UNIQUE(event_id,slot));
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
    INSERT OR IGNORE INTO settings VALUES('paid_visits','5');
    CREATE TABLE IF NOT EXISTS rewards(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),cycle INTEGER,status TEXT DEFAULT 'earned',UNIQUE(user_id,cycle));
    CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER,until REAL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,action TEXT,user_id TEXT,event_id TEXT,created REAL);
    ''')
def digest(x):return hmac.new(PEPPER.encode(),x.encode(),hashlib.sha256).hexdigest()
def pinhash(pin,salt):return hashlib.scrypt((pin+PEPPER).encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1).hex()
def phone(x):
    x=str(x).translate(str.maketrans('٠١٢٣٤٥٦٧٨٩','0123456789')); x=re.sub(r'[\s+()-]','',x)
    if x.startswith('00966'):x=x[2:]
    if x.startswith('05'):x='966'+x[1:]
    if not re.fullmatch(r'9665\d{8}',x):raise ValueError('اكتبي رقم جوال سعودي صحيح')
    return x
def safe_user(u):return {k:u[k] for k in ['id','name','area','badminton','padel','avatar','public','approved']}|{'phone':u['phone']}
def audit(c,action,uid='',eid=''):c.execute('INSERT INTO audit(action,user_id,event_id,created) VALUES(?,?,?,?)',(action,uid,eid,time.time()))
class App(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'public'),**kw)
    def log_message(self,*a):pass
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','same-origin');self.send_header('X-Frame-Options','DENY')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        super().end_headers()
    def result(self,obj,status=200,cookie=None):
        data=json.dumps(obj,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)))
        if cookie:self.send_header('Set-Cookie',cookie)
        self.end_headers();self.wfile.write(data)
    def session(self,c):
        ck=SimpleCookie();ck.load(self.headers.get('Cookie','')); token=ck.get('rush_session');token=token.value if token else ''
        return c.execute('SELECT * FROM sessions WHERE token=? AND expires>?',(digest(token),time.time())).fetchone()
    def auth(self,c,admin=False):
        s=self.session(c)
        if not s or (admin and not s['admin']):raise PermissionError('سجلي الدخول بحساب مصرح له')
        return s
    def throttle(self,c,key,limit=8):
        now=time.time();r=c.execute('SELECT * FROM attempts WHERE key=?',(key,)).fetchone()
        if r and r['until']>now and r['count']>=limit:raise ValueError('محاولات كثيرة، حاولي بعد ١٥ دقيقة')
        n=r['count']+1 if r and r['until']>now else 1
        c.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)',(key,n,now+900 if n==1 else r['until']));c.commit()
    def do_GET(self):
        if not self.path.startswith('/api/'):
            if urlparse(self.path).path=='/':self.path='/index.html'
            return super().do_GET()
        try:
            with db() as c:
                path=urlparse(self.path).path;s=self.session(c)
                if path=='/api/state':
                    rank=[dict(r) for r in c.execute("SELECT u.id,u.name,u.avatar,COUNT(e.event_id) visits,SUM(CASE WHEN v.sport='badminton' THEN 1 ELSE 0 END) badminton,SUM(CASE WHEN v.sport='padel' THEN 1 ELSE 0 END) padel FROM users u JOIN entries e ON e.user_id=u.id AND e.attended=1 JOIN events v ON v.id=e.event_id WHERE u.public=1 GROUP BY u.id ORDER BY visits DESC,u.name")]
                    out={'leaderboard':rank,'user':None,'admin':bool(s and s['admin']),'events':[],'rewards':[],'stamps':0,'target':int(c.execute("SELECT value FROM settings WHERE key='paid_visits'").fetchone()[0])}
                    if s and s['user_id']:
                        u=c.execute('SELECT * FROM users WHERE id=?',(s['user_id'],)).fetchone()
                        if u:
                            out['user']=safe_user(u);out['events']=[dict(r) for r in c.execute('SELECT v.id,v.title,v.sport,v.starts,v.venue,v.price,v.capacity,v.rounds,v.minutes,v.status,e.slot,e.confirmed,e.attended,e.level FROM events v JOIN entries e ON e.event_id=v.id WHERE e.user_id=? ORDER BY starts DESC',(u['id'],))];out['rewards']=[dict(r) for r in c.execute('SELECT id,cycle,status FROM rewards WHERE user_id=?',(u['id'],))];out['stamps']=c.execute("SELECT COUNT(*) FROM entries WHERE user_id=? AND attended=1 AND reward_id IS NULL",(u['id'],)).fetchone()[0]
                    return self.result(out)
                if path=='/api/admin':
                    self.auth(c,True)
                    return self.result({'users':[safe_user(r) for r in c.execute('SELECT * FROM users ORDER BY created DESC')],'events':[dict(r) for r in c.execute('SELECT id,title,sport,starts,venue,price,capacity,rounds,minutes,status FROM events ORDER BY starts DESC')],'entries':[dict(r) for r in c.execute('SELECT e.*,u.name,u.phone FROM entries e JOIN users u ON u.id=e.user_id')],'audit':[dict(r) for r in c.execute('SELECT * FROM audit ORDER BY id DESC LIMIT 100')],'areas':[dict(r) for r in c.execute("SELECT area,COUNT(*) count FROM users WHERE area!='' GROUP BY area HAVING COUNT(*)>=3")]})
                return self.result({'error':'Not found'},404)
        except PermissionError as e:self.result({'error':str(e)},403)
        except Exception:self.result({'error':'تعذر تحميل البيانات'},500)
    def do_POST(self):
        origin=self.headers.get('Origin')
        if origin and urlparse(origin).netloc!=self.headers.get('Host'):return self.result({'error':'طلب غير مسموح'},403)
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.result({'error':'JSON required'},415)
        try:
            size=int(self.headers.get('Content-Length',0))
            if size>12000:raise ValueError('الطلب كبير جدًا')
            b=json.loads(self.rfile.read(size));p=urlparse(self.path).path
            with LOCK,db() as c:
                if p in ['/api/register','/api/login','/api/admin/login']:
                    self.throttle(c,'ip:'+digest(self.client_address[0]),40)
                    isadmin=p=='/api/admin/login'
                    if isadmin:
                        self.throttle(c,'admin',8)
                        if not hmac.compare_digest(str(b.get('password','')),ADMIN):raise ValueError('بيانات الدخول غير صحيحة')
                        uid=None
                    else:
                        ph=phone(b.get('phone',''));self.throttle(c,'phone:'+digest(ph));pin=str(b.get('pin',''))
                        if not re.fullmatch(r'\d{4}',pin):raise ValueError('الرقم الشخصي يتكون من ٤ أرقام')
                        u=c.execute('SELECT * FROM users WHERE phone=?',(ph,)).fetchone()
                        if p=='/api/register':
                            if u:raise ValueError('تعذر إنشاء الحساب بهذه البيانات، جربي الدخول أو تواصلي مع الإدارة')
                            name=str(b.get('name','')).strip()[:40]
                            if len(name)<2:raise ValueError('اكتبي اسمك')
                            uid=secrets.token_hex(12);salt=secrets.token_hex(16)
                            c.execute('INSERT INTO users(id,phone,name,salt,pin_hash,created) VALUES(?,?,?,?,?,?)',(uid,ph,name,salt,pinhash(pin,salt),time.time()));audit(c,'register_pending',uid)
                        else:
                            if not u:
                                pinhash(pin,'00'*16);raise ValueError('بيانات الدخول غير صحيحة')
                            if not hmac.compare_digest(u['pin_hash'],pinhash(pin,u['salt'])):raise ValueError('بيانات الدخول غير صحيحة')
                            uid=u['id']
                        c.execute('DELETE FROM attempts WHERE key=?',('phone:'+digest(ph),))
                    token=secrets.token_urlsafe(32);c.execute('INSERT INTO sessions VALUES(?,?,?,?)',(digest(token),uid,int(isadmin),time.time()+86400));c.commit()
                    return self.result({'ok':True},cookie='rush_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400'+('; Secure' if PROD else ''))
                if p=='/api/logout':
                    s=self.session(c)
                    if s:c.execute('DELETE FROM sessions WHERE token=?',(s['token'],))
                    c.commit();return self.result({'ok':True},cookie='rush_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
                s=self.auth(c);uid=s['user_id'];isadmin=s['admin']
                if p=='/api/profile':
                    if not uid:raise PermissionError('حساب لاعبة مطلوب')
                    name=str(b.get('name','')).strip()[:40];area=b.get('area','');levels=['beginner','intermediate','advanced']
                    if not name or area not in ['', 'north','south','east','west','central'] or b.get('badminton') not in levels or b.get('padel') not in levels:raise ValueError('راجعي بيانات الحساب')
                    c.execute('UPDATE users SET name=?,area=?,badminton=?,padel=?,avatar=?,public=? WHERE id=?',(name,area,b['badminton'],b['padel'],int(b.get('avatar',0))%6,int(bool(b.get('public'))),uid))
                elif p in ['/api/change-pin','/api/delete-account']:
                    self.throttle(c,'sensitive:'+str(uid))
                    u=c.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
                    if not u or not hmac.compare_digest(u['pin_hash'],pinhash(str(b.get('pin','')),u['salt'])):raise ValueError('الرقم الشخصي غير صحيح')
                    if p=='/api/change-pin':
                        pin=str(b.get('new_pin',''))
                        if not re.fullmatch(r'\d{4}',pin):raise ValueError('٤ أرقام مطلوبة')
                        salt=secrets.token_hex(16);c.execute('UPDATE users SET salt=?,pin_hash=? WHERE id=?',(salt,pinhash(pin,salt),uid));c.execute('DELETE FROM sessions WHERE user_id=?',(uid,));audit(c,'user_pin_changed',uid)
                    else:
                        c.execute('DELETE FROM entries WHERE user_id=?',(uid,));c.execute('DELETE FROM rewards WHERE user_id=?',(uid,));c.execute('DELETE FROM sessions WHERE user_id=?',(uid,));c.execute("UPDATE audit SET user_id='deleted' WHERE user_id=?",(uid,));c.execute('DELETE FROM users WHERE id=?',(uid,))
                elif p in ['/api/event','/api/join']:
                    u=c.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
                    if not u or not u['approved']:raise PermissionError('حسابك بانتظار اعتماد الإدارة قبل الانضمام')
                    self.throttle(c,'code:'+uid,20)
                    if p=='/api/event' and b.get('event_id'):
                        ev=c.execute('SELECT v.* FROM events v JOIN entries e ON e.event_id=v.id WHERE v.id=? AND e.user_id=?',(b['event_id'],uid)).fetchone()
                    else:ev=c.execute('SELECT * FROM events WHERE code_hash=?',(digest(str(b.get('code','')).strip().upper()),)).fetchone()
                    if not ev:raise ValueError('رمز التجمع غير صحيح أو تم تغييره')
                    eid=ev['id'];existing=c.execute('SELECT * FROM entries WHERE user_id=? AND event_id=?',(uid,eid)).fetchone()
                    if p=='/api/join':
                        if ev['status']!='open':raise ValueError('اختيار الفرق مقفل لهذا التجمع')
                        slot=int(b.get('slot',-1))
                        if not 0<=slot<ev['capacity']:raise ValueError('اختاري مكانًا متاحًا')
                        if existing:raise ValueError('أنت مسجلة بالفعل في هذا التجمع')
                        level=u[ev['sport']]
                        c.execute('INSERT INTO entries(event_id,user_id,slot,level) VALUES(?,?,?,?)',(eid,uid,slot,level));audit(c,'join',uid,eid)
                    participants=[dict(r) for r in c.execute('SELECT u.name,u.avatar,e.slot,e.level,e.confirmed FROM entries e JOIN users u ON u.id=e.user_id WHERE e.event_id=?',(eid,))]
                    c.commit();return self.result({'event':{k:ev[k] for k in ['id','title','sport','starts','venue','price','capacity','rounds','minutes','status']},'participants':participants,'joined':bool(existing or p=='/api/join')})
                elif p.startswith('/api/admin/'):
                    self.auth(c,True);act=p.rsplit('/',1)[-1]
                    if act=='approve':
                        c.execute('UPDATE users SET approved=1 WHERE id=?',(b['user_id'],));audit(c,'approve_manual_phone_not_sms',b['user_id'])
                    elif act=='move':
                        ev=c.execute('SELECT * FROM events WHERE id=?',(b['event_id'],)).fetchone();slot=int(b['slot'])
                        if not ev or ev['status'] in ['cancelled','completed'] or not 0<=slot<ev['capacity']:raise ValueError('لا يمكن النقل إلى هذا المكان')
                        c.execute('UPDATE entries SET slot=? WHERE event_id=? AND user_id=?',(slot,b['event_id'],b['user_id']));audit(c,'admin_move_team',b['user_id'],b['event_id'])
                    elif act=='reset-pin':
                        pin=str(b.get('pin',''))
                        if not re.fullmatch(r'\d{4}',pin):raise ValueError('٤ أرقام مطلوبة')
                        salt=secrets.token_hex(16);c.execute('UPDATE users SET salt=?,pin_hash=? WHERE id=?',(salt,pinhash(pin,salt),b['user_id']));c.execute('DELETE FROM sessions WHERE user_id=?',(b['user_id'],));audit(c,'admin_reset_pin_after_external_identity_check',b['user_id'])
                    elif act=='create':
                        sport=b.get('sport');cap=int(b.get('capacity',8));rounds=int(b.get('rounds',6));minutes=int(b.get('minutes',20));price=int(b.get('price',50))
                        if sport not in ['badminton','padel'] or cap not in [4,8,12,16] or not 1<=rounds<=30 or not 5<=minutes<=120 or not 0<=price<=5000:raise ValueError('راجعي إعدادات التجمع')
                        if not b.get('title') or not b.get('starts') or not b.get('venue'):raise ValueError('املئي بيانات التجمع')
                        datetime.fromisoformat(b['starts'])
                        if rounds%(cap//4):raise ValueError('اختاري عدد راوندات يقبل القسمة على عدد المجموعات عشان يتساوى وقت اللعب')
                        eid=secrets.token_hex(8);code=secrets.token_hex(4).upper()
                        c.execute('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(eid,str(b['title'])[:80],sport,str(b['starts'])[:30],str(b['venue'])[:120],price,cap,rounds,minutes,digest(code),'open',time.time()));audit(c,'event_created','',eid);c.commit();return self.result({'ok':True,'code':code})
                    elif act=='rotate':
                        code=secrets.token_hex(4).upper();c.execute('UPDATE events SET code_hash=? WHERE id=?',(digest(code),b['event_id']));audit(c,'code_rotated','',b['event_id']);c.commit();return self.result({'ok':True,'code':code})
                    elif act=='status':
                        if b['status'] not in ['open','locked','completed','cancelled']:raise ValueError('حالة غير صحيحة')
                        c.execute('UPDATE events SET status=? WHERE id=?',(b['status'],b['event_id']));audit(c,'status_'+b['status'],'',b['event_id'])
                    elif act in ['confirm','attend']:
                        e=c.execute('SELECT * FROM entries WHERE event_id=? AND user_id=?',(b['event_id'],b['user_id'])).fetchone()
                        if not e:raise ValueError('الحجز غير موجود')
                        if act=='attend' and not e['confirmed']:raise ValueError('أكدي الحجز أولًا')
                        if act=='attend' and c.execute('SELECT status FROM events WHERE id=?',(b['event_id'],)).fetchone()[0]=='cancelled':raise ValueError('التجمع ملغي')
                        c.execute('UPDATE entries SET '+('confirmed' if act=='confirm' else 'attended')+'=1 WHERE event_id=? AND user_id=?',(b['event_id'],b['user_id']));audit(c,act,b['user_id'],b['event_id'])
                        if act=='attend':
                            target=int(c.execute("SELECT value FROM settings WHERE key='paid_visits'").fetchone()[0]);count=c.execute('SELECT COUNT(*) FROM entries WHERE user_id=? AND attended=1 AND reward_id IS NULL',(b['user_id'],)).fetchone()[0]
                            for cycle in range(1,count//target+1):c.execute('INSERT OR IGNORE INTO rewards(id,user_id,cycle) VALUES(?,?,?)',(secrets.token_hex(12),b['user_id'],cycle))
                    elif act=='redeem':
                        e=c.execute('SELECT * FROM entries WHERE event_id=? AND user_id=?',(b['event_id'],b['user_id'])).fetchone();r=c.execute("SELECT * FROM rewards WHERE id=? AND user_id=? AND status='earned'",(b['reward_id'],b['user_id'])).fetchone()
                        if not e or not r or e['attended'] or e['reward_id']:raise ValueError('تعذر استخدام المكافأة على هذا الحجز')
                        c.execute("UPDATE rewards SET status='redeemed' WHERE id=?",(r['id'],));c.execute('UPDATE entries SET reward_id=?,confirmed=1 WHERE event_id=? AND user_id=?',(r['id'],b['event_id'],b['user_id']));audit(c,'reward_redeemed',b['user_id'],b['event_id'])
                    elif act=='rewards':
                        return self.result({'rewards':[dict(r) for r in c.execute("SELECT id,cycle FROM rewards WHERE user_id=? AND status='earned'",(b['user_id'],))]})
                    else:raise ValueError('إجراء غير موجود')
                else:raise ValueError('إجراء غير موجود')
                c.commit();self.result({'ok':True})
        except PermissionError as e:self.result({'error':str(e)},403)
        except sqlite3.IntegrityError:self.result({'error':'المكان محجوز أو التسجيل موجود، حدّثي الصفحة وجربي مكانًا آخر'},409)
        except (ValueError,KeyError,TypeError) as e:self.result({'error':str(e) if isinstance(e,ValueError) else 'راجعي الحقول المطلوبة'},400)
        except Exception:self.result({'error':'تعذر إكمال العملية، حاولي مرة ثانية'},500)
if __name__=='__main__':
    init();port=int(os.getenv('PORT',8000));print(f'Rush running at http://localhost:{port}',flush=True);ThreadingHTTPServer(('0.0.0.0',port),App).serve_forever()
