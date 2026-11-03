import unittest,subprocess,tempfile,os,time,json,urllib.request,urllib.error,http.cookiejar,socket,concurrent.futures
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class Client:
 def __init__(self,base):self.base=base;self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def req(self,path,body=None):
  req=urllib.request.Request(self.base+'/api/'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'} if body is not None else {})
  try:
   with self.opener.open(req) as r:return r.status,json.load(r)
  except urllib.error.HTTPError as e:return e.code,json.load(e)
class RushTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory();sock=socket.socket();sock.bind(('127.0.0.1',0));cls.port=sock.getsockname()[1];sock.close();cls.base=f'http://127.0.0.1:{cls.port}'
  cls.proc=subprocess.Popen(['python3',str(ROOT/'server.py')],env=os.environ|{'RUSH_ADMIN_PASSWORD':'test-admin-password-only-987','RUSH_DATA_DIR':cls.tmp.name,'PORT':str(cls.port)},stdout=subprocess.DEVNULL)
  for _ in range(100):
   try:urllib.request.urlopen(cls.base+'/api/state');break
   except Exception:time.sleep(.05)
 @classmethod
 def tearDownClass(cls):cls.proc.terminate();cls.proc.wait();cls.tmp.cleanup()
 def test_complete_permissions_and_rewards(self):
  anon=Client(self.base);admin=Client(self.base);a=Client(self.base);b=Client(self.base)
  self.assertEqual(anon.req('admin')[0],403)
  self.assertEqual(admin.req('admin/login',{'password':'test-admin-password-only-987'})[0],200)
  for cl,ph,name in [(a,'0501234567','Player A'),(b,'0501234568','Player B')]:
   self.assertEqual(cl.req('register',{'phone':ph,'pin':'1234','name':name})[0],200)
  ua=a.req('state')[1]['user'];ub=b.req('state')[1]['user']
  self.assertEqual(a.req('admin/approve',{'user_id':ua['id']})[0],403)
  self.assertEqual(a.req('event',{'code':'BADCODE'})[0],403)
  for u in [ua,ub]:self.assertEqual(admin.req('admin/approve',{'user_id':u['id']})[0],200)
  self.assertEqual(a.req('profile',{'name':'A','area':'north','badminton':'advanced','padel':'beginner','avatar':2,'public':True})[0],200)
  me=a.req('state')[1]['user'];self.assertEqual((me['badminton'],me['padel']),('advanced','beginner'))
  self.assertNotIn(ub['phone'],json.dumps(a.req('state')[1]))
  def event(i):
   r=admin.req('admin/create',{'title':'Session '+str(i),'sport':'badminton','starts':'2026-12-01T16:00:00+03:00','venue':'Court','capacity':4,'rounds':6,'minutes':20,'price':50})
   self.assertEqual(r[0],200);code=r[1]['code'];eid=a.req('event',{'code':code})[1]['event']['id'];return eid,code
  eid,code=event(1)
  with concurrent.futures.ThreadPoolExecutor() as pool:results=list(pool.map(lambda cl:cl.req('join',{'code':code,'slot':0}),[a,b]))
  self.assertEqual(sorted(x[0] for x in results),[200,409])
  winner=a if results[0][0]==200 else b;loser=b if winner is a else a
  self.assertEqual(loser.req('join',{'code':code,'slot':1})[0],200)
  self.assertEqual(winner.req('join',{'code':code,'slot':2})[0],400)
  self.assertEqual(a.req('admin/attend',{'user_id':ua['id'],'event_id':eid})[0],403)
  for u in [ua,ub]:admin.req('admin/confirm',{'event_id':eid,'user_id':u['id']})
  # Five attendances unlock exactly one reward, even if confirmation repeats.
  for i in range(5):
   if i:eid,code=event(i+1);self.assertEqual(a.req('join',{'code':code,'slot':0})[0],200);admin.req('admin/confirm',{'event_id':eid,'user_id':ua['id']})
   for repeat in range(2):self.assertEqual(admin.req('admin/attend',{'event_id':eid,'user_id':ua['id']})[0],200)
  s=a.req('state')[1];self.assertEqual(s['stamps'],5);self.assertEqual(len(s['rewards']),1)
  public=anon.req('state')[1];self.assertNotIn('phone',json.dumps(public));self.assertNotIn('north',json.dumps(public));self.assertEqual(public['leaderboard'][0]['visits'],5)
  eid,code=event(6);a.req('join',{'code':code,'slot':0})
  reward=s['rewards'][0]['id'];body={'event_id':eid,'user_id':ua['id'],'reward_id':reward}
  self.assertEqual(admin.req('admin/redeem',body)[0],200);self.assertEqual(admin.req('admin/redeem',body)[0],400)
  admin.req('admin/attend',{'event_id':eid,'user_id':ua['id']});self.assertEqual(a.req('state')[1]['stamps'],5)
  new=admin.req('admin/rotate',{'event_id':eid})[1]['code'];self.assertEqual(b.req('event',{'code':code})[0],400)
  self.assertEqual(a.req('event',{'event_id':eid})[0],200);self.assertEqual(b.req('event',{'event_id':eid})[0],400)
  a.req('profile',{'name':'A','area':'north','badminton':'advanced','padel':'beginner','avatar':2,'public':False})
  self.assertFalse(anon.req('state')[1]['leaderboard'])
  self.assertEqual(a.req('delete-account',{'pin':'9999'})[0],400)
  self.assertEqual(a.req('delete-account',{'pin':'1234'})[0],200);self.assertIsNone(a.req('state')[1]['user'])
if __name__=='__main__':unittest.main()
