// KINIT 동작 관찰 PoC — 횟수 카운터 + 자세 피드백 (COCO 17 키포인트, 픽셀 좌표)
(function(root){
const M=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
const D=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function angle(a,b,c){const v1=[a[0]-b[0],a[1]-b[1]],v2=[c[0]-b[0],c[1]-b[1]];
  const cs=(v1[0]*v2[0]+v1[1]*v2[1])/(Math.hypot(...v1)*Math.hypot(...v2)+1e-9);return Math.acos(Math.max(-1,Math.min(1,cs)))*180/Math.PI;}
function pct(arr,p){const s=[...arr].sort((x,y)=>x-y);const i=(s.length-1)*p/100,lo=Math.floor(i),hi=Math.ceil(i);return s[lo]+(s[hi]-s[lo])*(i-lo);}
class Counter{
  // mode: 'squat' | 'hang_tuck'
  constructor(mode,opt={}){
    this.mode=mode;this.DELTA=opt.delta??0.22;this.LOW=opt.low??0.85;this.RET=opt.ret??0.85;this.MAXR=opt.maxr??0.85;this.MAXK=opt.maxk??150;
    this.minDur=mode==='hang_tuck'?0.30:0.40;this.histSec=8;this.warm=1.0;this.smSec=0.2;
    this.hist=[];this.sm=[];this.state='up';this.peak=null;this.cur=null;this.reps=[];this.t0=null;
    this.lastSeen=null;this.ratio=null;this.hanging=false;this.view='-';
  }
  feed(kp,conf,t){
    if(this.t0===null)this.t0=t;
    if(!kp)return null;
    const ok=[5,6,11,12,15,16].every(i=>conf[i]>0.25);
    if(!ok)return null;
    const sh=M(kp[5],kp[6]),hp=M(kp[11],kp[12]),an=M(kp[15],kp[16]),wr=M(kp[9],kp[10]);
    const torso=D(sh,hp)+1e-6;const f=(an[1]-hp[1])/torso;
    this.sm.push([t,f]);while(this.sm.length&&t-this.sm[0][0]>this.smSec)this.sm.shift();
    const fs=this.sm.reduce((a,b)=>a+b[1],0)/this.sm.length;
    const torsoPx=torso, shW=D(kp[5],kp[6]);
    this.view=(shW/torsoPx)>0.55?'front':'side';
    this.hanging=(conf[9]>0.2&&conf[10]>0.2)?((sh[1]-wr[1])/torso>0.07):false;
    const gate=this.mode==='hang_tuck'?this.hanging:true;
    if(this.state==='up'){this.hist.push([t,fs]);}
    while(this.hist.length&&t-this.hist[0][0]>this.histSec)this.hist.shift();
    if(!this.hist.length||(t-this.t0)<this.warm)return null;
    const base=pct(this.hist.map(x=>x[1]),80);const r=fs/base;this.ratio=r;
    const lc=(conf[11]+conf[13]+conf[15])/3,rc=(conf[12]+conf[14]+conf[16])/3;
    const [h,k,a,s]=lc>=rc?[11,13,15,5]:[12,14,16,6];
    const knee=angle(kp[h],kp[k],kp[a]);const v=[kp[s][0]-kp[h][0],kp[s][1]-kp[h][1]];
    const lean=Math.atan2(Math.abs(v[0]),-v[1])*180/Math.PI;
    const kd=[13,14,15,16].every(i=>conf[i]>0.25)?Math.abs(kp[13][0]-kp[14][0])/(Math.abs(kp[15][0]-kp[16][0])+1e-6):NaN;
    this.live={state:this.state,lean,kd,view:this.view,r,knee};const delta=this.DELTA*base;let event=null;
    if(this.state==='up'){
      this.peak=this.peak===null?fs:Math.max(this.peak,fs);
      if(gate&&fs<this.peak-delta&&fs<this.LOW*base){
        this.state='down';this.cur={t0:t,rmin:r,tb:t,fmin:fs,knee,lean,hipx:[hp[0]],sw:shW,kd,view:this.view};}
    }else{
      const c=this.cur;c.hipx.push(hp[0]);
      if(fs<c.fmin){Object.assign(c,{fmin:fs,rmin:r,tb:t,knee,lean,kd,view:this.view});}
      if(fs<c.fmin)c.rose=null;
      const sq=this.mode==='squat';
      if(sq&&gate&&fs>c.fmin+delta&&c.rose==null)c.rose=t;
      if(sq&&c.rose!=null&&gate&&fs<this.RET*base&&(t-c.rose)<2.0)return null;
      if(fs>c.fmin+delta||!gate){
        if(sq&&gate&&fs<this.RET*base)c.incomplete=true;
        if(gate&&!c.incomplete&&(t-c.t0)>=this.minDur&&this.valid(c)){
          c.t1=t;c.sway=(Math.max(...c.hipx)-Math.min(...c.hipx))/c.sw;c.n=this.reps.length+1;c.msg=coach(this.mode,c);
          this.reps.push(c);event=c;}
        this.state='up';this.peak=fs;this.cur=null;}
    }
    return event;
  }
  valid(c){if(c.rmin<0.05)return false;if(this.mode==='squat'&&c.rmin>(this.MAXR??0.72))return false;if(this.mode==='squat'&&c.view==='side'&&c.knee>this.MAXK)return false;return true;}
  get count(){return this.reps.length;}
}
function coach(mode,c){
  const m=[];const dur=c.t1-c.t0;const r=c.rmin;
  if(mode==='squat'){
    m.push(r<=0.5?'깊이 좋아요':(r<=0.65?'조금 더 앉아 볼까요':'얕아요, 더 앉아요'));
    if(c.view==='side'&&c.lean>50)m.push('가슴을 세워요');
    if(c.view==='front'&&c.kd<0.8)m.push('무릎이 모여요, 발끝 방향으로');
    if(dur<0.6)m.push('천천히 내려가요');
  }else{
    m.push(r<=0.4?'무릎을 높이 올렸어요':(r<=0.6?'좋아요, 조금 더 높이':'무릎을 더 끌어올려요'));
    if(c.sway>0.6)m.push('몸이 흔들려요, 배에 힘');
  }
  return m.join(' · ');
}
const API={Counter,coach};
if(typeof module!=='undefined')module.exports=API;else root.KINIT=API;
})(typeof window!=='undefined'?window:globalThis);
