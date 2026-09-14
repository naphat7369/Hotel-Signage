package hotel.stayscreen.player;

import android.app.Activity;
import android.os.*;
import android.content.SharedPreferences;
import android.graphics.*;
import android.media.MediaPlayer;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

/** Native local-file player. No WebView, Google Play services or external subscription. */
public class PlayerActivity extends Activity {
 private final Handler ui=new Handler(Looper.getMainLooper());
 private final ScheduledExecutorService network=Executors.newSingleThreadScheduledExecutor();
 private SharedPreferences prefs; private FrameLayout frame; private TextView message;
 private ImageView picture; private TextureView texture; private MediaPlayer video; private Surface surface;
 private volatile JSONObject manifest; private JSONObject item,program; private int index=0,generation=0;
 private String base,key,currentVersion=""; private long offset=0,began=0,lastShot=0; private boolean resumed=false;
 private Bitmap imageBitmap; private Runnable advance, pendingVideo; private long lastVideoPosition=-1; private int stalled=0;
 private FileInputStream currentFis;
 @Override public void onCreate(Bundle state){super.onCreate(state);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);getWindow().getDecorView().setSystemUiVisibility(5894);
  prefs=getSharedPreferences("player",MODE_PRIVATE);base=prefs.getString("server","");key=prefs.getString("token","");
  if(base.isEmpty()||key.isEmpty())setup();else startPlayer();
 }
 private void setup(){LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(60,35,60,35);box.setGravity(Gravity.CENTER);box.setBackgroundColor(Color.rgb(16,32,57));setContentView(box);
  TextView title=new TextView(this);title.setText("Shotel · ลงทะเบียนจอ");title.setTextSize(28);title.setTextColor(Color.WHITE);box.addView(title);
  EditText server=new EditText(this);server.setSingleLine(true);server.setText(base);server.setHint("https://signage.example.com");server.setTextColor(Color.WHITE);server.setHintTextColor(Color.LTGRAY);box.addView(server,new LinearLayout.LayoutParams(-1,-2));
  Button pair=new Button(this);pair.setText("สร้างรหัสจับคู่");box.addView(pair);message=new TextView(this);message.setTextColor(Color.WHITE);message.setTextSize(24);box.addView(message);
  pair.setOnClickListener(v->{base=server.getText().toString().trim().replaceAll("/+$","");try{URI u=URI.create(base);if(!Arrays.asList("http","https").contains(u.getScheme())||u.getHost()==null)throw new Exception();}catch(Exception e){message.setText("กรุณากรอก URL เซิร์ฟเวอร์ให้ถูกต้อง");return;}pair.setEnabled(false);network.execute(()->{try{JSONObject p=api("/pair/start",new JSONObject(),false);String secret=p.getString("secret");ui.post(()->message.setText(p.optString("code")+"\nนำรหัสไปกรอกใน Manage Displays"));for(int i=0;i<200;i++){Thread.sleep(3000);JSONObject result=api("/pair/status",new JSONObject().put("secret",secret),false);if(!result.optBoolean("pending")){key=result.getString("token");prefs.edit().putString("server",base).putString("token",key).apply();ui.post(this::startPlayer);return;}}throw new Exception("รหัสหมดอายุ กรุณาลองใหม่");}catch(Exception e){ui.post(()->{message.setText(e.getMessage());pair.setEnabled(true);});}});});
 }
 private void startPlayer(){
  frame=new FrameLayout(this);
  frame.setBackgroundColor(Color.BLACK);
  setContentView(frame);
  texture=new TextureView(this);
  frame.addView(texture,new FrameLayout.LayoutParams(-1,-1));
  picture=new ImageView(this);
  picture.setScaleType(ImageView.ScaleType.FIT_CENTER);
  frame.addView(picture,new FrameLayout.LayoutParams(-1,-1));
  message=new TextView(this);
  message.setTextColor(Color.WHITE);
  message.setGravity(Gravity.CENTER);
  message.setTextSize(22);
  frame.addView(message,new FrameLayout.LayoutParams(-1,-1));
  message.setText("กำลังดาวน์โหลด Playlist…");
  texture.setSurfaceTextureListener(new TextureView.SurfaceTextureListener(){
   public void onSurfaceTextureAvailable(SurfaceTexture s,int w,int h){
    if(surface!=null){try{surface.release();}catch(Exception ignored){}}
    surface=new Surface(s);
    if(pendingVideo!=null){Runnable r=pendingVideo;pendingVideo=null;ui.post(r);}
   }
   public void onSurfaceTextureSizeChanged(SurfaceTexture s,int w,int h){}
   public boolean onSurfaceTextureDestroyed(SurfaceTexture s){
    if(surface!=null){try{surface.release();}catch(Exception ignored){}surface=null;}
    return true;
   }
   public void onSurfaceTextureUpdated(SurfaceTexture s){}
  });
  manifest=readJson("manifest.json",null);
  
  Button unregisterBtn = new Button(this);
  unregisterBtn.setText("ลบจอ (Unregister)");
  unregisterBtn.setBackgroundColor(Color.parseColor("#AA000000"));
  unregisterBtn.setTextColor(Color.WHITE);
  unregisterBtn.setFocusable(true);
  FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(-2,-2);
  p.gravity = Gravity.TOP | Gravity.RIGHT;
  p.setMargins(30,30,30,30);
  frame.addView(unregisterBtn, p);
  unregisterBtn.setOnClickListener(v -> {
      prefs.edit().remove("token").apply();
      key="";
      manifest=null;
      new File(getFilesDir(),"manifest.json").delete();
      stopMedia();
      finish();
      startActivity(getIntent());
  });

  tickProgram();
  network.scheduleWithFixedDelay(this::sync,0,30,TimeUnit.SECONDS);
  ui.postDelayed(this::clockTick,1000);
 }
 private void clockTick(){if(isFinishing())return;tickProgram();if(video!=null&&video.isPlaying()){long pos=video.getCurrentPosition();stalled=pos==lastVideoPosition?stalled+1:0;lastVideoPosition=pos;if(stalled>20){stalled=0;play(index+1);}}ui.postDelayed(this::clockTick,1000);}
 private void tickProgram(){JSONObject selected=choose(manifest);String version=selected==null?"":selected.optString("id");if(!version.equals(currentVersion)){currentVersion=version;program=selected;play(0);}else if(program==null){message.setText("รอ Schedule หรือ Default Playlist");}}
 private JSONObject choose(JSONObject m){if(m==null)return null;JSONObject winner=null;JSONArray schedules=m.optJSONArray("schedules");for(int n=0;schedules!=null&&n<schedules.length();n++){JSONObject s=schedules.optJSONObject(n);if(!active(s))continue;if(winner==null||s.optInt("specificity")>winner.optInt("specificity")||s.optInt("specificity")==winner.optInt("specificity")&&(s.optLong("publishedAt")>winner.optLong("publishedAt")||s.optLong("publishedAt")==winner.optLong("publishedAt")&&s.optString("id").compareTo(winner.optString("id"))>0))winner=s;}return winner!=null?winner.optJSONObject("snapshot"):m.optJSONObject("fallback");}
 private boolean active(JSONObject s){try{ZonedDateTime t=Instant.ofEpochMilli(System.currentTimeMillis()+offset).atZone(ZoneId.of(s.getString("timezone")));LocalDate day=t.toLocalDate();int minute=t.getHour()*60+t.getMinute(),start=minutes(s.getString("startTime")),end=minutes(s.getString("endTime"));if(end<start&&minute<end)day=day.minusDays(1);if(day.toString().compareTo(s.getString("startDate"))<0||day.toString().compareTo(s.getString("endDate"))>0)return false;int dow=day.getDayOfWeek().getValue()%7;boolean allowed=false;JSONArray ds=s.getJSONArray("days");for(int i=0;i<ds.length();i++)if(ds.getInt(i)==dow)allowed=true;return allowed&&(start==end||(end>start?minute>=start&&minute<end:minute>=start||minute<end));}catch(Exception e){return false;}}
 private int minutes(String s){String[] a=s.split(":");return Integer.parseInt(a[0])*60+Integer.parseInt(a[1]);}
 private void stopMedia(){
  generation++;
  pendingVideo=null;
  if(advance!=null){ui.removeCallbacks(advance);advance=null;}
  if(video!=null){
   try{video.stop();}catch(Exception ignored){}
   try{video.reset();}catch(Exception ignored){}
   try{video.release();}catch(Exception ignored){}
   video=null;
  }
  picture.animate().cancel();
  picture.setImageDrawable(null);
  if(imageBitmap!=null){imageBitmap.recycle();imageBitmap=null;}
  item=null;
  lastVideoPosition=-1;
  stalled=0;
  if(currentFis!=null){try{currentFis.close();}catch(Exception ignored){}currentFis=null;}
 }
 private void play(int wanted){
  stopMedia();
  if(program==null){message.setVisibility(View.VISIBLE);message.setText("รอ Schedule");return;}
  JSONArray list=program.optJSONArray("items");
  if(list==null||list.length()==0)return;
  index=Math.floorMod(wanted,list.length());
  item=list.optJSONObject(index);
  File file=new File(getFilesDir(),item.optString("media"));
  if(!file.exists()){
   message.setVisibility(View.VISIBLE);
   message.setText("Cache ไม่ครบ กำลังรอดาวน์โหลดซ่อม");
   advance=()->play(index+1);
   ui.postDelayed(advance,2500);
   return;
  }
  message.setVisibility(View.GONE);
  began=System.currentTimeMillis();
  final int serial=generation;
  boolean isVideo=item.optString("type").startsWith("video")||item.optString("name").toLowerCase().endsWith(".mp4")||file.getName().toLowerCase().endsWith(".mp4");
  if(!isVideo){
   texture.setVisibility(View.GONE);
   picture.setVisibility(View.VISIBLE);
   BitmapFactory.Options opts=new BitmapFactory.Options();
   opts.inJustDecodeBounds=true;
   BitmapFactory.decodeFile(file.getPath(),opts);
   opts.inSampleSize=1;
   while(opts.outWidth/opts.inSampleSize>1920||opts.outHeight/opts.inSampleSize>1080)opts.inSampleSize*=2;
   opts.inJustDecodeBounds=false;
   imageBitmap=BitmapFactory.decodeFile(file.getPath(),opts);

   String transition=item.optString("transition","fade");
   long animSpeed=(long)(item.optDouble("transitionSpeed",0.8)*1000);
   if(animSpeed<100)animSpeed=800;

   picture.setTranslationX(0f);
   picture.setScaleX(1f);
   picture.setScaleY(1f);
   if("none".equals(transition)){
    picture.setAlpha(1f);
    picture.setImageBitmap(imageBitmap);
   }else if("slide".equals(transition)){
    picture.setAlpha(1f);
    picture.setImageBitmap(imageBitmap);
    int w=frame.getWidth()>0?frame.getWidth():1920;
    picture.setTranslationX(w);
    picture.animate().translationX(0f).setDuration(animSpeed).start();
   }else if("zoom".equals(transition)){
    picture.setImageBitmap(imageBitmap);
    picture.setAlpha(0f);
    picture.setScaleX(0.85f);
    picture.setScaleY(0.85f);
    picture.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(animSpeed).start();
   }else{
    picture.setImageBitmap(imageBitmap);
    picture.setAlpha(0f);
    picture.animate().alpha(1f).setDuration(animSpeed).start();
   }

   advance=()->finishItem(serial);
   ui.postDelayed(advance,(long)(item.optDouble("duration",10)*1000));
  }else{
   picture.setVisibility(View.GONE);
   texture.setVisibility(View.VISIBLE);
   advance=()->play(index+1);
   ui.postDelayed(advance,3600000);
   Runnable startVideo=()->{
    if(generation!=serial)return;
    try{
     if(surface==null||!surface.isValid()){
      if(texture.isAvailable()&&texture.getSurfaceTexture()!=null){
       surface=new Surface(texture.getSurfaceTexture());
      }else{
       throw new IllegalStateException("Surface is not ready");
      }
     }
     video=new MediaPlayer();
     Exception firstEx=null;
     try{
      video.setDataSource(file.getAbsolutePath());
     }catch(Exception ex){
      firstEx=ex;
      currentFis=new FileInputStream(file);
      video.setDataSource(currentFis.getFD(),0,file.length());
     }
     video.setSurface(surface);
     video.setVolume(0,0);
     video.setOnPreparedListener(p->{
      if(generation!=serial)return;
      int vw=p.getVideoWidth(),vh=p.getVideoHeight();
      if(vw>0&&vh>0)fitVideo(vw,vh);
      p.start();
      int dur=p.getDuration();
      if(dur>0){
       if(advance!=null)ui.removeCallbacks(advance);
       advance=()->finishItem(serial);
       ui.postDelayed(advance,dur+1500L);
      }
     });
     video.setOnVideoSizeChangedListener((p,vw,vh)->{if(vw>0&&vh>0)fitVideo(vw,vh);});
     video.setOnCompletionListener(p->ui.post(()->finishItem(serial)));
     video.setOnErrorListener((p,a,b)->{
      String errMsg="วิดีโอเล่นไม่ได้ (Error: "+a+", "+b+")";
      if(b==-1010)errMsg="กล่องไม่รองรับ Codec วิดีโอนี้ (ต้องใช้ MP4 H.264)";
      else if(b==-38)errMsg="สถานะตัวเล่นวิดีโอไม่พร้อม (Error -38)";
      final String msg=errMsg;
      ui.post(()->{
       message.setVisibility(View.VISIBLE);
       message.setText(msg);
       if(advance!=null)ui.removeCallbacks(advance);
       advance=()->play(index+1);
       ui.postDelayed(advance,4000);
      });
      return true;
     });
     video.prepareAsync();
    }catch(Exception e){
     final String em=e.getMessage();
     ui.post(()->{
      message.setVisibility(View.VISIBLE);
      message.setText("เตรียมวิดีโอไม่สำเร็จ: "+em);
      if(advance!=null)ui.removeCallbacks(advance);
      advance=()->play(index+1);
      ui.postDelayed(advance,4000);
     });
    }
   };
   if(surface!=null&&surface.isValid()){
    startVideo.run();
   }else if(texture.isAvailable()&&texture.getSurfaceTexture()!=null){
    surface=new Surface(texture.getSurfaceTexture());
    startVideo.run();
   }else{
    pendingVideo=startVideo;
   }
  }
 }
 private void fitVideo(int w,int h){if(w==0||h==0)return;float tw=texture.getWidth(),th=texture.getHeight(),scale=Math.min(tw/w,th/h);Matrix m=new Matrix();m.setScale(w*scale/tw,h*scale/th,tw/2,th/2);texture.setTransform(m);}
 private void finishItem(int serial){if(serial!=generation||item==null)return;try{JSONObject p=new JSONObject().put("id",UUID.randomUUID().toString()).put("media",item.optString("media")).put("count",1).put("seconds",(System.currentTimeMillis()-began)/1000.0).put("last",System.currentTimeMillis()+offset);synchronized(this){JSONObject q=readJson("plays.json",new JSONObject());JSONArray items=q.optJSONArray("items");if(items==null)items=new JSONArray();items.put(p);q.put("items",items);writeJson("plays.json",q);}}catch(Exception ignored){}play(index+1);}
 private Map<String,JSONObject> files(JSONObject m){Map<String,JSONObject> out=new LinkedHashMap<>();if(m==null)return out;ArrayList<JSONObject> programs=new ArrayList<>();if(m.optJSONObject("fallback")!=null)programs.add(m.optJSONObject("fallback"));JSONArray ss=m.optJSONArray("schedules");for(int i=0;ss!=null&&i<ss.length();i++)programs.add(ss.optJSONObject(i).optJSONObject("snapshot"));for(JSONObject p:programs){JSONArray a=p.optJSONArray("items");for(int i=0;a!=null&&i<a.length();i++){JSONObject f=a.optJSONObject(i);out.put(f.optString("media"),f);}}return out;}
 private void sync(){try{JSONObject candidate=api("/device/manifest",null,true);offset=candidate.optLong("serverTime")-System.currentTimeMillis();Map<String,JSONObject> fs=files(candidate);int ready=0;String error="";for(JSONObject f:fs.values()){File file=new File(getFilesDir(),f.optString("media"));try{if(!file.exists()||file.length()!=f.optLong("size")||!hash(file).equals(f.optString("checksum"))){download(f,file);}ready++;}catch(Exception e){error=e.getMessage();}}
  if(ready==fs.size()){writeJson("manifest.json",candidate);manifest=candidate;for(File f:getFilesDir().listFiles())if(f.getName().matches("[a-f0-9-]{36}")&&!fs.containsKey(f.getName()))f.delete();ui.post(()->{tickProgram();if(item==null)play(0);});}
  String health=ready==0?"CRITICAL":ready<fs.size()?"DEGRADED":"HEALTHY";JSONObject current=new JSONObject().put("media",item==null?"":item.optString("media")).put("version",currentVersion);JSONObject hb=api("/device/heartbeat",new JSONObject().put("health",health).put("error",error).put("cache",new JSONObject().put("ready",ready).put("total",fs.size())).put("current",current).put("revision",manifest==null?"":manifest.optString("revision")).put("capabilities",new JSONObject().put("player","Android Native").put("offline",true).put("screenshot",true).put("autoStart",false)),true);
  synchronized(this){JSONObject q=readJson("plays.json",new JSONObject());if(q.optJSONArray("items")!=null&&q.optJSONArray("items").length()>0){JSONArray a=q.getJSONArray("items"),batch=new JSONArray(),remaining=new JSONArray();for(int i=0;i<a.length();i++){if(i<200)batch.put(a.get(i));else remaining.put(a.get(i));}api("/device/plays",new JSONObject().put("items",batch),true);writeJson("plays.json",new JSONObject().put("items",remaining));}}
  if(hb.optBoolean("screenshotRequested")||System.currentTimeMillis()-lastShot>300000)ui.post(this::capture);
 }catch(Exception e){if(e.getMessage()!=null&&e.getMessage().startsWith("401:")){prefs.edit().remove("token").apply();key="";manifest=null;new File(getFilesDir(),"manifest.json").delete();ui.post(()->{stopMedia();message.setVisibility(View.VISIBLE);message.setText("จอถูกยกเลิกสิทธิ์ กรุณาปิดแล้วเปิดแอปเพื่อจับคู่ใหม่");});}}}
 private void capture(){if(item==null)return;Bitmap b=Bitmap.createBitmap(960,540,Bitmap.Config.ARGB_8888);Canvas c=new Canvas(b);c.drawColor(Color.BLACK);Bitmap source=video!=null?texture.getBitmap():imageBitmap;if(source==null){b.recycle();return;}float scale=Math.min(960f/source.getWidth(),540f/source.getHeight());float w=source.getWidth()*scale,h=source.getHeight()*scale;c.drawBitmap(source,null,new RectF((960-w)/2,(540-h)/2,(960+w)/2,(540+h)/2),null);ByteArrayOutputStream bytes=new ByteArrayOutputStream();b.compress(Bitmap.CompressFormat.JPEG,75,bytes);b.recycle();if(video!=null)source.recycle();String path="/device/screenshot?media="+item.optString("media")+"&version="+currentVersion;network.execute(()->{try{HttpURLConnection con=connection(path,true);con.setRequestMethod("POST");con.setDoOutput(true);con.setRequestProperty("Content-Type","image/jpeg");con.getOutputStream().write(bytes.toByteArray());if(con.getResponseCode()==200)lastShot=System.currentTimeMillis();con.disconnect();}catch(Exception ignored){}});}
 private HttpURLConnection connection(String path,boolean auth)throws Exception{HttpURLConnection c=(HttpURLConnection)new URL(base+"/api"+path).openConnection();c.setConnectTimeout(15000);c.setReadTimeout(30000);if(auth)c.setRequestProperty("Authorization","Bearer "+key);return c;}
 private void copy(InputStream in,OutputStream out)throws IOException{byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);}
 private JSONObject api(String path,JSONObject body,boolean auth)throws Exception{HttpURLConnection c=connection(path,auth);try{if(body!=null){c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");try(OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}}int status=c.getResponseCode();try(InputStream in=status<400?c.getInputStream():c.getErrorStream()){ByteArrayOutputStream bytes=new ByteArrayOutputStream();copy(in,bytes);String text=new String(bytes.toByteArray(),java.nio.charset.StandardCharsets.UTF_8);if(status>=400)throw new IOException(status+":"+text);return new JSONObject(text);}}finally{c.disconnect();}}
 private void download(JSONObject f,File file)throws Exception{HttpURLConnection c=connection("/device/media/"+f.getString("media"),true);File temp=new File(file.getPath()+".part");try{if(c.getResponseCode()!=200)throw new IOException("ดาวน์โหลดไม่ได้");try(InputStream in=c.getInputStream();OutputStream out=new FileOutputStream(temp)){copy(in,out);}if(temp.length()!=f.getLong("size")||!hash(temp).equals(f.getString("checksum")))throw new IOException("Checksum ไม่ตรง");Files.move(temp.toPath(),file.toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}finally{temp.delete();c.disconnect();}}
 private String hash(File file)throws Exception{MessageDigest d=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)d.update(b,0,n);}StringBuilder s=new StringBuilder();for(byte b:d.digest())s.append(String.format("%02x",b));return s.toString();}
 private JSONObject readJson(String name,JSONObject fallback){try{return new JSONObject(new String(Files.readAllBytes(new File(getFilesDir(),name).toPath()),java.nio.charset.StandardCharsets.UTF_8));}catch(Exception e){return fallback;}}
 private void writeJson(String name,JSONObject value)throws Exception{File temp=new File(getFilesDir(),name+".tmp");try(FileOutputStream out=new FileOutputStream(temp)){out.write(value.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));out.getFD().sync();}Files.move(temp.toPath(),new File(getFilesDir(),name).toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}
 @Override protected void onDestroy(){super.onDestroy();ui.removeCallbacksAndMessages(null);network.shutdownNow();if(video!=null)video.release();if(surface!=null){try{surface.release();}catch(Exception ignored){}surface=null;}}
}
