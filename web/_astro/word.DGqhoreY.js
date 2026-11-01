var e=[{pulse:!1,sway:!1,echo:!1,cut:!1,beat:!1,hearts:!1,hDen:.3,txFlash:!1,txWhisper:!1,txWall:!1,txRing:!1,txBreath:!1,txLine:!1,txBar:!1,txSw:!1,txDen:.3},{pulse:!1,sway:!0,echo:!0,cut:!1,beat:!1,hearts:!0,hDen:.3,txFlash:!1,txWhisper:!0,txWall:!1,txRing:!1,txBreath:!1,txLine:!1,txBar:!0,txSw:!1,txDen:.3},{pulse:!1,sway:!0,echo:!0,cut:!0,beat:!1,hearts:!0,hDen:.6,txFlash:!0,txWhisper:!0,txWall:!1,txRing:!1,txBreath:!1,txLine:!1,txBar:!0,txSw:!1,txDen:.5},{pulse:!0,sway:!0,echo:!0,cut:!0,beat:!0,hearts:!0,hDen:1,txFlash:!0,txWhisper:!0,txWall:!0,txRing:!0,txBreath:!0,txLine:!0,txBar:!0,txSw:!0,txDen:1}],t={mode:0,shape:0,arms:2,twist:4,speed:.6,soft:0,wob:0,drift:0,wInv:!0,wStag:!1,wFlash:!0,c1:`#ff5fa8`,c2:`#0b0b12`,level:2,who:0,fx:.5,fy:.22,turn:6,sx:-1,sy:-1,spots:``,hop:4,cam:1,lay:0,sAlpha:1,seq:0,...e[2],song:0,music:!0,sfx:!0,bgs:!0},n=[`#ff5fa8`,`#ffa6d0`,`#b05cff`,`#5b21b6`,`#fff5e1`,`#0b0b12`,`#ff4a2a`,`#c8ff2e`,`#1f2c7c`],r={mode:[0,4,1],shape:[0,3,1],arms:[1,12,1],twist:[.5,10,.1],speed:[-2,2,.05],soft:[0,1,.01],wob:[0,1,.01],drift:[0,1,.01],level:[0,3,1],who:[0,2,1],fx:[0,1,.01],fy:[0,1,.01],turn:[0,20,1],sx:[-1,1,.01],sy:[-1,1,.01],hop:[0,20,1],cam:[0,3,1],lay:[0,1,1],sAlpha:[.2,1,.05],hDen:[0,1,.05],txDen:[0,1,.05],seq:[0,1,1],song:[0,2,1]},i=Object.keys(r),a=[`pulse`,`wInv`,`wStag`,`wFlash`,`sway`,`echo`,`cut`,`beat`,`hearts`,`txBar`,`txSw`,`txFlash`,`txWhisper`,`txWall`,`txRing`,`txBreath`,`txLine`,`music`,`sfx`,`bgs`],o={mode:`m`,shape:`s`,arms:`n`,twist:`d`,speed:`v`,soft:`f`,wob:`w`,drift:`r`,pulse:`p`,wInv:`wi`,wStag:`wg`,wFlash:`wf`,c1:`a`,c2:`b`,level:`lv`,who:`h`,fx:`x`,fy:`y`,turn:`ro`,sx:`sx`,sy:`sy`,spots:`pt`,hop:`hp`,cam:`k`,lay:`l`,sAlpha:`sa`,sway:`sw`,echo:`ec`,cut:`ci`,beat:`bt`,hearts:`ht`,hDen:`hd`,txBar:`tb`,txSw:`ts`,txFlash:`tf`,txWhisper:`tw`,txWall:`ta`,txRing:`tr`,txBreath:`th`,txLine:`tl`,txDen:`td`,seq:`sq`,song:`so`,music:`mu`,sfx:`se`,bgs:`bs`},s=/^#[0-9a-f]{6}$/,c=e=>Math.round(Math.min(1,Math.max(0,e))*1e3)/1e3;function l(e){if(typeof e!=`string`||!e.trim())return[];let t=[];for(let n of e.split(`;`)){let[e,r]=n.split(`,`).map(Number);if(Number.isFinite(e)&&Number.isFinite(r)&&t.push([c(e),c(r)]),t.length>=6)break}return t}var u=e=>e.map(([e,t])=>`${c(e)},${c(t)}`).join(`;`),d=`tavern.spiral`,f=2;function p(e,n){let[i,a,o]=r[n],s=typeof e==`number`?e:typeof e==`string`&&e.trim()!==``?Number(e):NaN;if(!Number.isFinite(s)||(n===`mode`||n===`lay`||n===`shape`)&&s>a)return t[n];let c=Number((Math.round(s/o)*o).toFixed(2));return Math.min(a,Math.max(i,c))}function m(e,t){let n=typeof e==`string`?e.trim().toLowerCase():``,r=n.startsWith(`#`)?n:`#${n}`;return s.test(r)?r:t}function h(e){let n={...t};for(let t of i)e[t]!==void 0&&(n[t]=p(e[t],t));for(let t of a)e[t]!==void 0&&(n[t]=e[t]===!0||e[t]===`1`||e[t]===1);return n.spots=u(l(e.spots)),n.c1=m(e.c1,t.c1),n.c2=m(e.c2,t.c2),n}function g(e){let t=new URLSearchParams;for(let n of Object.keys(o)){let r=e[n];t.set(o[n],typeof r==`boolean`?r?`1`:`0`:typeof r==`string`?n===`c1`||n===`c2`?r.slice(1):r:String(r))}return t.toString()}function _(e){let t=new URLSearchParams(e),n={},r=!1;for(let e of Object.keys(o)){let i=t.get(o[e]);i!==null&&(n[e]=i,r=!0)}return r?h(n):null}function v(){try{let n=JSON.parse(localStorage.getItem(`tavern.spiral`)??`null`);if(!n||typeof n!=`object`)return{...t};let r=h(n);return n.v===f?r:{...r,...e[r.level]}}catch{return{...t}}}function y(e){try{localStorage.setItem(d,JSON.stringify({...e,v:f}))}catch{}}function b(e,t,n){let r=t*Math.min(n,1-n),i=t=>{let i=(t+e/30)%12,a=n-r*Math.max(-1,Math.min(i-3,9-i,1));return Math.round(a*255).toString(16).padStart(2,`0`)};return`#${i(0)}${i(8)}${i(4)}`}function x(){let e=Math.random,t=(t,n)=>t+e()*(n-t),n=t=>t[Math.floor(e()*t.length)],r=e()*360;return{mode:Math.floor(e()*4),shape:n([0,0,0,0,1,2,2,3]),arms:n([1,1,2,2,2,3,3,4,5,6,8]),twist:t(2,7),speed:t(.3,1)*(e()<.25?-1:1),soft:e()<.6?0:e()**2*.7,wob:e()<.65?0:t(.2,.9),drift:e()<.8?0:t(.3,1),pulse:e()<.25,c1:b(r,t(.7,.95),t(.62,.8)),c2:b((r+n([0,30,150,180,210]))%360,t(.45,.75),t(.07,.2))}}var S=`/_astro/her-006.Cp2pyjW1.webp`,C=`/_astro/her-006-mask.DCunuLXT.png`,w=`/_astro/her-006-mask2.CydsB8td.png`,T=`/_astro/clip-006-eyes.C0ZzDcCS.webp`,ee=`/_astro/clip-006-lick.vJS2bslN.webp`,E=(e,t,n)=>({c:[n,(e+t)/2],box:[(t-e)/2,t-e]}),D=[null,{img:S,mask:C,watch:{mask:w,pivot:[120,449],face:[98,593],radius:28,amp:.24},stills:[{img:T,size:[832,1216]},{img:ee,size:[832,702]}],size:[960,1720],eyes:[[468,215],[540,198]],focus:[553,358],waistY:640,feather:75,centerX:545,feet:[560,1690],chest:[596,452],motion:{breathe:2.5,chest:6,hair:2.5,beat:42,jolt:165},frames:{full:{c:[475,880],box:[840,1760]},half:{c:[455,530],box:[800,1e3]},gaze:{c:[553,358],box:[288,288]}},tour:[{from:E(30,930,545),to:E(60,880,545),dur:8},{from:E(360,740,130),to:E(390,720,124),dur:6,flash:!0,center:`watch`},{from:E(420,1160,500),to:E(380,1080,500),dur:7},{from:E(1080,1720,530),to:E(860,1500,520),dur:6,flash:!0},{from:E(200,770,596),to:E(170,720,590),dur:6,flash:!0},{from:E(60,400,505),to:E(125,300,505),dur:8},{from:E(-20,1740,475),to:E(40,1420,480),dur:7,flash:!0}],tour2:[{shot:5},{shot:1},{shot:4,flash:!1},{shot:6},{shot:3,back:!0,flash:!1},{shot:2,flash:!0},{shot:0,back:!0}],cutins:[{at:3,hold:2.4,kind:`box`,side:-1,c:[125,545],h:300},{at:9.6,hold:2.6,kind:`box`,side:1,c:[430,450],h:560,still:0},{at:16.5,hold:2.4,kind:`box`,side:1,c:[596,450],h:300,jolt:!0},{at:22.8,hold:2.4,kind:`box`,side:-1,c:[330,380],h:540,still:1},{at:29,hold:2.4,kind:`band`,side:1,c:[504,207],h:96},{at:36,hold:2.4,kind:`box`,side:-1,c:[520,930],h:360},{at:43.4,hold:2.6,kind:`box`,side:1,c:[430,450],h:560,still:0}]}],O=new WeakMap;function te(e,t){if(t!==1)return e;let n=O.get(e);if(n)return n;let r=e.tour.length,i=e.tour2??[...new Set([r-2,0,r-1,...Array.from({length:r},(e,t)=>r-1-t)])].filter(e=>e>=0&&e<r).map((e,t)=>({shot:e,back:t%2==1})),a=[];e.tour.reduce((e,t)=>(a.push(e),e+t.dur),0);let o=[],s=[],c=0;for(let t of i){let n=e.tour[t.shot];o.push({...n,from:t.back?n.to:n.from,to:t.back?n.from:n.to,flash:t.flash??n.flash});for(let r of e.cutins){let e=r.at-a[t.shot];e>=0&&e<n.dur&&s.push({...r,at:c+e,side:-r.side})}c+=n.dur}return O.set(e,n={tour:o,cutins:s}),n}var k=D.length,A={images:[],at:0},j=e=>e.who===k&&A.images.length>1&&e.turn>0;function ne(e,t){let n=A.images.length;return n?j(e)?Math.floor(Math.max(0,t)/e.turn)%n:Math.min(A.at,n-1):-1}function re(e,t){if(!j(e))return 99;let n=Math.floor(Math.max(0,t)/e.turn);return n===0?99:Math.max(0,t)-n*e.turn}var M={at:0};function N(e,t){if(e.spots?.length)return e.spots;if(t.who!==k){let n=l(t.spots);if(n.length)return n.map(([t,n])=>[t*e.size[0],n*e.size[1]]);if(t.sx>=0&&t.sy>=0)return[[t.sx*e.size[0],t.sy*e.size[1]]]}return[e.focus??[(e.eyes[0][0]+e.eyes[1][0])/2,(e.eyes[0][1]+e.eyes[1][1])/2]]}var ie=(e,t)=>{let n=Math.sin(e*127.1+t*311.7)*43758.5453;return n-Math.floor(n)};function P(e,t){let n=Array.from({length:e},(e,t)=>t);for(let r=e-1;r>0;r--){let e=Math.floor(ie(t,r)*(r+1));[n[r],n[e]]=[n[e],n[r]]}return t===0&&n.unshift(...n.splice(n.indexOf(0),1)),n}function F(e,t,n){let r=Math.floor(Math.max(0,n)/t),i=Math.floor(r/e),a=P(e,i);return i>0&&a[0]===P(e,i-1)[e-1]&&([a[0],a[1]]=[a[1],a[0]]),a[r%e]}function ae(e,t,n){let r=N(e,t);return n!==void 0&&r.length>1&&t.hop>0?r[F(r.length,t.hop,n)]:r[Math.min(M.at,r.length-1)]}function oe(e,t,n){if(t.hop<=0||N(e,t).length<2)return 99;let r=Math.floor(Math.max(0,n)/t.hop);return r===0?99:Math.max(0,n)-r*t.hop}var I=new WeakMap;function se(e){let[t,n]=e.size,r=e.spots.map(([e,r])=>[e*t,r*n]),i=r[0],a=e=>Math.min(n*.92,Math.max(n*.08,e)),o=e=>[t/2+(i[0]-t/2)*(1-e),a(i[1]+(n-i[1])*e)],s=(e,t)=>({c:e,box:[t/2,t]}),c=Math.min(t,n);return{img:e.canvas,mask:``,softEdge:!0,size:e.size,eyes:[i,i],spots:r,waistY:a(i[1]+(n-i[1])*.4),feather:n*.06,centerX:t/2,feet:[t/2,n*.98],chest:o(.22),motion:{breathe:0,chest:n*.004,hair:0,beat:0,jolt:0},frames:{full:{c:[t/2,n/2],box:[t*1.04,n*1.04]},half:{c:o(.2),box:[t*.66,n*.58]},gaze:{c:i,box:[c*.3,c*.3]}},tour:[{from:s(o(.12),n*.42),to:s(o(.2),n*.4),dur:8},{from:s(o(.52),n*.4),to:s(o(.42),n*.4),dur:7},{from:s(o(.86),n*.42),to:s(o(.7),n*.42),dur:7,flash:!0},{from:s(o(.04),n*.28),to:s(i,n*.16),dur:8},{from:{c:[t/2,n/2],box:[t*1.04,n*1.04]},to:{c:[t/2,n*.46],box:[t*.9,n*.9]},dur:6,flash:!0}],cutins:[{at:3,hold:2.4,kind:`box`,side:-1,c:o(.5),h:n*.22},{at:10.5,hold:2.4,kind:`band`,side:1,c:i,h:n*.06},{at:17.5,hold:2.4,kind:`box`,side:1,c:o(.22),h:n*.2},{at:25,hold:2.4,kind:`box`,side:-1,c:o(.72),h:n*.24},{at:31.5,hold:2.4,kind:`band`,side:-1,c:i,h:n*.06}]}}function L(e,t=0){if(e.who!==k)return D[e.who]??null;let n=A.images[ne(e,t)];if(!n)return null;let r=n.spots.join(`;`),i=I.get(n);return(!i||i.key!==r)&&I.set(n,i={key:r,standee:se(n)}),i.standee}var R=Math.PI*2,z={pulse:R/.9,wave:R/1.1,breath:4.2,hair:3.4,sway:5.6,beat:1.05,echo:2.6,hearts:16,watch:2,flash:2.4},B=z,V=.24,ce=()=>({t:0,phase:0,t0:0,flow:0}),H=2.5,le=55440,ue=e=>7+4*Math.round(e),U={aspect:1.15,slant:-.26,waveS:.045,waveQ:.025,line:.05},W={rate:.025,step:.09,hold:.9},G=e=>.299*e[0]+.587*e[1]+.114*e[2],K=``,de=[];function fe(e){let t=e.c1+e.c2;if(t===K)return de;let r=J(e.c1),i=J(e.c2),a=n.map(e=>{let t=J(e),n=Math.hypot(t[0]-r[0],t[1]-r[1],t[2]-r[2])/Math.sqrt(3);return{c:t,score:Math.min(Math.abs(G(t)-G(i)),n*2)}}).sort((e,t)=>t.score-e.score).filter((e,t)=>t===0||e.score>.4).slice(0,3);return K=t,de=a.flatMap(e=>e.c),de}var pe=(e,t)=>t.wInv&&e%2?e*2:e;function me(e,t,n){e.t+=t,e.phase=(e.phase+t*n.speed)%1,e.flow=((e.flow??0)+t*n.speed*H)%le}var q=(e,t)=>e/t%1,he=`#version 300 es
void main(){
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  gl_Position=vec4(p*2.0-1.0,0.0,1.0);
}`,ge=`#version 300 es
precision highp float;
uniform vec2 uRes,uCenter,uDriftV;
uniform float uPhase,uArms,uTwist,uPulseS,uSoft,uWob,uWave;
uniform int uMode,uShape;
uniform vec3 uC1,uC2;
uniform sampler2D uImg,uMask,uMask2,uStill,uWord;
uniform vec4 uWordA,uWordB,uWordGrid,uWf;
uniform float uWordInv,uWfT;
uniform ivec4 uWfI;
uniform int uWfN;
uniform vec3 uWfC[3];
uniform float uCutStill,uOn,uImgS,uBreath,uExpand,uCenterX,uStretch,uUpper,uWaist,uFeather,uHair,uHairPh,uBodyRot,uTorsoRot,uBeat,uHearts,uHeartPh,uWash,uFlash,uCutA,uHeartN,uSoftEdge,uBodyA;
uniform vec2 uImgO,uImgSize,uShake,uBody,uChest,uFeet,uEyeC,uStillSize;
uniform vec4 uEcho,uCutRect,uWatch;
uniform vec3 uCutCam;
uniform int uLay;
out vec4 o;
const float TAU=6.2831853;
float heartRho(float c,float s){
  float k=c*c*s*s*s;
  float lo=0.6,hi=1.6;
  for(int i=0;i<14;i++){
    float rm=0.5*(lo+hi);
    float q=rm*rm-1.0;
    float g=q*q*q-k*rm*rm*rm*rm*rm;
    if(g<0.0)lo=rm;else hi=rm;
  }
  return 0.5*(lo+hi);
}
vec4 img(vec2 p){
  vec2 f=smoothstep(vec2(0.0),vec2(0.035),p)*smoothstep(vec2(0.0),vec2(0.035),1.0-p);
  return texture(uImg,p)*step(0.0,p.x)*step(p.x,1.0)*step(0.0,p.y)*step(p.y,1.0)*mix(1.0,f.x*f.y,uSoftEdge);
}
vec4 body(vec2 p){
  vec4 c=img(p);
  if(uWatch.w>0.0){
    vec2 d=p*uImgSize-uWatch.xy;
    if(dot(d,d)<uWatch.w*uWatch.w){
      c*=1.0-texture(uMask2,p).g;
      float cs=cos(uWatch.z),sn=sin(uWatch.z);
      vec2 s=(uWatch.xy+vec2(cs*d.x+sn*d.y,cs*d.y-sn*d.x))/uImgSize;
      vec4 wc=img(s)*texture(uMask2,s).g;
      c=wc+c*(1.0-wc.a);
    }
  }
  return c;
}
vec2 turn(vec2 v,float a){
  float c=cos(a),s=sin(a);
  return vec2(c*v.x-s*v.y,s*v.x+c*v.y)-v;
}
vec2 disp(vec2 ip){
  vec3 mk=texture(uMask,ip/uImgSize).rgb;
  float up=1.0-smoothstep(uWaist-uFeather,uWaist+uFeather,ip.y);
  vec2 d=vec2(0.0);
  d.y-=uBreath*mk.g;
  d.x+=(ip.x-uCenterX)*uExpand*mk.g;
  d+=uShake*mk.r;
  d.y+=(ip.y-uChest.y)*uStretch*mk.r;
  d.x-=(ip.x-uChest.x)*uStretch*0.5*mk.r;
  d+=uBody*mk.g;
  d.y+=uUpper*up;
  d.x+=uHair*mk.b*(0.75+0.25*sin(ip.y*0.01-uHairPh));
  d+=turn(ip-uFeet,uBodyRot);
  d+=turn(ip-vec2(uCenterX,uWaist),uTorsoRot)*up;
  return d;
}
float dot2(vec2 v){return dot(v,v);}
float sdHeart(vec2 p){
  p.x=abs(p.x);
  if(p.y+p.x>1.0)return sqrt(dot2(p-vec2(0.25,0.75)))-0.35355339;
  return sqrt(min(dot2(p-vec2(0.0,1.0)),dot2(p-0.5*max(p.x+p.y,0.0))))*sign(p.x-p.y);
}
float rnd(float i,float s){return fract(sin(i*12.9898+s*78.233)*43758.5453);}
float stripes(float r,float ang,float seam,float tw){
  float v;
  if(uMode==0)v=ang/TAU*uArms+tw*r*3.0;
  else if(uMode==1)v=ang/TAU*uArms+tw*log(r);
  else if(uMode==2)v=ang/TAU*uArms+tw*0.15/r;
  else v=tw*r*3.0;
  v+=uWob*0.35*sin(ang*5.0+r*4.0-uWave)-uPhase;
  float e=min(fwidth(v),fwidth(v+seam))*TAU;
  return smoothstep(-(e+uSoft),e+uSoft,sin(v*TAU));
}
uint hashu(uint a,uint b){
  uint h=a*747796405u+b*2891336453u+12345u;
  h^=h>>16;h*=2246822519u;h^=h>>13;h*=3266489917u;h^=h>>16;
  return h;
}
float wordAt(int k,vec2 f,vec2 gx,vec2 gy,vec2 edge,vec2 pw){
  float c=0.0;
  vec2 d=(min(f,1.0-f)-edge)/pw;
  float inside=edge.x>0.0?clamp(min(d.x,d.y)+0.5,0.0,1.0):1.0;
  if(inside>0.0){
    int len=int(uWordA.y),cols=int(uWordGrid.x);
    int idx=k%len;
    if(idx<0)idx+=len;
    vec2 at=vec2(float(idx%cols),float(idx/cols));
    vec2 g=clamp((f-edge)/(1.0-2.0*edge),0.0,1.0);
    c=textureGrad(uWord,(at+uWordGrid.z+vec2(g.x,1.0-g.y)*(1.0-2.0*uWordGrid.z))/uWordGrid.xy,gx,gy).r*uWordA.w*inside;
  }
  return mix(c,1.0-c,float(k&1)*uWordInv);
}
vec3 hueTurn(vec3 c,float a){
  const vec3 k=vec3(0.57735);
  return c*cos(a)+cross(k,c)*sin(a)+k*dot(k,c)*(1.0-cos(a));
}
float cutEdge(vec2 lp){
  return min(uCutRect.z-abs(lp.x-0.25*lp.y),uCutRect.w-abs(lp.y));
}
void main(){
  float minRes=min(uRes.x,uRes.y);
  vec2 uv=(gl_FragCoord.xy-uCenter)/minRes-uDriftV;
  float rc=length(uv)+1e-6;
  float r,r2=0.0,stem=0.0;
  if(uShape==1)r=max(abs(uv.x),abs(uv.y))+1e-6;
  else if(uShape==2)r=rc/heartRho(uv.x/rc,uv.y/rc);
  else if(uShape==3){vec2 sq=sqrt(abs(uv)+0.002);float ss=sq.x+sq.y;r=0.4*ss*ss;}
  else if(uShape==4){
    float down=-uv.y/rc;
    float rho=heartRho(uv.x/rc,down);
    r=rc/rho;
    r2=rc/max(rho,1.58/max(down,0.2));
    stem=clamp((0.227-acos(clamp(down,-1.0,1.0)))*rc*minRes+0.5,0.0,1.0);
  }
  else r=rc;
  float ang=atan(uv.y,uv.x);
  float seam=(atan(-uv.y,-uv.x)-ang)/TAU*uArms;
  float tw=uTwist*(1.0+0.25*uPulseS);
  float wob=uWob*0.35*sin(ang*5.0+r*4.0-uWave);
  float m;
  vec3 c1=uC1;
  if(uMode==4){
    float n=uWordA.x;
    float asp=clamp(uWordB.x*4.0/tw,0.5,4.0);
    float b=n/asp+uWordB.y;
    float a=asp*(1.0+uWordB.y*b);
    float lr=log(rc);
    vec2 dth=vec2(-uv.y,uv.x)/(rc*rc*minRes);
    vec2 dlr=uv/(rc*rc*minRes);
    float s0=(n*ang+a*lr)/TAU;
    float q0=(ang-b*lr)/TAU+wob;
    vec2 ds0=(n*dth+a*dlr)/TAU;
    vec2 dq0=(dth-b*dlr)/TAU;
    float s=s0+uWordA.z+uWordB.z*sin(TAU*q0);
    float q=q0+uWordB.w*sin(TAU*(s0+uWordA.z));
    vec2 ds=ds0+uWordB.z*TAU*cos(TAU*q0)*dq0;
    vec2 dq=dq0+uWordB.w*TAU*cos(TAU*(s0+uWordA.z))*ds0;
    float row=floor(q);
    float u=s-n*row;
    float col0=floor(u);
    vec2 f=vec2(u-col0,q-row);
    int k=int(col0);
    float sc=1.0-2.0*uWordGrid.z;
    vec2 gx=vec2(ds.x,-dq.x)*sc*0.7/uWordGrid.xy;
    vec2 gy=vec2(ds.y,-dq.y)*sc*0.7/uWordGrid.xy;
    if(uWf.x>0.0){
      int len=int(uWordA.y);
      int K=k+uWfI.x+len*100000;
      int W=K/len;
      uint h=hashu(uint(W*uWfI.z-uWfI.w*uWfI.y+1073741824),uint(uWfI.y%uWfI.z));
      if(float(h&65535u)/65536.0<uWf.x){
        float span=float(len-1)*uWf.z+uWf.w;
        float wait=float(K-W*len)*uWf.z;
        float tl=uWf.y-float((h>>16)&255u)/255.0*max(uWfT-span,0.0)-wait;
        float lit=smoothstep(0.0,0.04,tl)*(1.0-smoothstep(span-wait-0.1,span-wait,tl));
        c1=mix(c1,uWfC[int((h>>24)%uint(uWfN))],lit);
      }
    }
    vec2 edge=vec2(uWordGrid.w,uWordGrid.w/asp);
    vec2 pw=max(vec2(length(ds),length(dq)),1e-6);
    m=wordAt(k,f,gx,gy,edge,pw);
    float es=0.5-min(f.x,1.0-f.x)/pw.x;
    float eq=0.5-min(f.y,1.0-f.y)/pw.y;
    if(es>0.0){
      float sd=step(0.5,f.x);
      m=mix(m,wordAt(k+int(sd)*2-1,vec2(1.0-sd,f.y),gx,gy,edge,pw),es);
    }
    if(eq>0.0){
      float sd=step(0.5,f.y);
      float u2=u+n*(1.0-2.0*sd);
      float c2=floor(u2);
      m=mix(m,wordAt(int(c2),vec2(u2-c2,1.0-sd),gx,gy,edge,pw),eq);
    }
  }else if(uShape==4)m=mix(stripes(r,ang,seam,tw),stripes(r2,ang,seam,tw),stem);
  else m=stripes(r,ang,seam,tw);
  vec3 col=mix(uC2,c1,m);
  if(uMode==2){col*=clamp(pow(rc*1.6,0.8),0.0,1.0);col*=1.0-0.3*smoothstep(0.6,1.0,rc);}

  vec2 sn=(gl_FragCoord.xy-0.5*uRes)/minRes;
  vec2 hv=0.5*uRes/minRes;
  float aa=1.5/minRes;
  vec3 light=mix(uC1,vec3(1.0),0.35);

  if(uOn>0.5){
    vec2 ip=(vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)-uImgO)/uImgS;
    vec2 q=ip-disp(ip);
    vec2 suv=q/uImgSize;
    vec4 c=body(suv);

    vec2 ec=uEyeC/uImgSize;
    float ghost=max(body((suv-ec)/uEcho.x+ec).a*uEcho.y,body((suv-ec)/uEcho.z+ec).a*uEcho.w);
    col=mix(col,light,ghost);

    float sh=0.0;
    vec2 rad=14.0/uImgSize;
    for(int i=0;i<8;i++){
      float a=float(i)*0.7853982;
      sh+=body(suv+vec2(cos(a),sin(a))*rad).a;
    }
    col=mix(col,uC2*0.45,sh*0.125*0.6*uBodyA);

    vec3 bc=c.a>0.001?c.rgb/c.a:vec3(0.0);
    if(uLay==1){
      vec3 lit=1.0-(1.0-bc)*(1.0-uC1*0.38);
      vec3 dim=bc*mix(vec3(1.0),uC2+0.3,0.5);
      bc=mix(bc,mix(dim,lit,m),uWash*mix(0.5,1.0,smoothstep(40.0,340.0,length(q-uEyeC))));
    }
    bc=mix(bc,vec3(1.0,0.9,0.95),max(uBeat*0.14,uFlash*0.45));
    col=mix(col,bc,c.a*uBodyA);
  }

  if(uBeat>0.001)col=mix(col,uC1,smoothstep(0.3,1.0,length(sn/hv))*uBeat*0.5);

  if(uCutA>0.001){
    vec2 lp=sn-uCutRect.xy;
    float edge=cutEdge(lp);
    vec2 ipc=uCutCam.xy+vec2(lp.x,-lp.y)*uCutCam.z;
    vec4 cc;
    if(uCutStill>0.5){
      vec2 sp=ipc/uStillSize;
      cc=texture(uStill,sp)*step(0.0,sp.x)*step(sp.x,1.0)*step(0.0,sp.y)*step(sp.y,1.0);
    }else cc=body((ipc-disp(ipc))/uImgSize);
    vec3 bg=mix(uC2*0.5,uC1,0.14+0.1*step(0.5,fract((sn.x+sn.y)*11.0)));
    vec3 inner=bg*(1.0-cc.a)+cc.rgb;
    inner=mix(inner,vec3(1.0,0.9,0.95),uFlash*0.4);
    vec3 box=mix(mix(uC1,vec3(1.0),0.75),inner,smoothstep(-aa,aa,edge-0.011));
    box=mix(uC2*0.3,box,smoothstep(-aa,aa,edge-0.004));
    col=mix(col,uC2*0.25,smoothstep(-aa,aa,cutEdge(lp-vec2(0.014,-0.018)))*uCutA*0.8);
    col=mix(col,box,smoothstep(-aa,aa,edge)*uCutA);
  }

  if(uHearts>0.5){
    for(int i=0;i<48;i++){
      float fi=float(i);
      if(fi>=uHeartN)break;
      float h1=rnd(fi,1.0),h2=rnd(fi,2.0),h3=rnd(fi,3.0),h4=rnd(fi,4.0);
      float near=h3*h3;
      float u=fract(h1+uHeartPh*(1.0+floor((1.0-h3)*2.99)));
      float size=mix(0.022,0.12,near)*(1.0+0.07*sin(uHeartPh*TAU*8.0+fi*2.4));
      vec2 pos=vec2((h2*2.0-1.0)*hv.x*0.95+0.035*sin(u*TAU*(1.0+floor(h4*2.0))+fi*1.7),mix(-hv.y-size*1.3,hv.y+size*1.3,u));
      vec2 hq=sn-pos;
      if(abs(hq.x)>size*2.4||abs(hq.y)>size*2.4)continue;
      float tilt=(h1-0.5)*0.7;
      hq=vec2(cos(tilt)*hq.x-sin(tilt)*hq.y,sin(tilt)*hq.x+cos(tilt)*hq.y)/size;
      hq.y+=0.55;
      float dd=sdHeart(hq)*size;
      float blur=mix(0.002,0.022,near);
      float kind=floor(h4*3.0);
      float core;
      float glow;
      if(kind<0.5){
        core=1.0-smoothstep(-blur*1.5,blur*2.5,dd);
        glow=0.5*exp(-max(dd,0.0)/(size*0.45));
      }else if(kind<1.5){
        core=exp(-abs(dd)/(blur*0.6+0.0035));
        glow=0.4*exp(-max(dd,0.0)/(size*0.55))+0.12*(1.0-smoothstep(-blur,blur,dd));
      }else{
        core=0.85*exp(-max(dd+size*0.3,0.0)/(size*0.3));
        glow=0.0;
      }
      vec3 tint=mix(hueTurn(uC1,(h2-0.5)*1.5),vec3(1.0),0.12+0.3*h1);
      vec3 hc=mix(tint,vec3(1.0),core*0.55)*clamp(core+glow,0.0,1.0)*smoothstep(0.0,0.12,u)*(1.0-smoothstep(0.75,1.0,u))*mix(1.0,0.72,near);
      col=col+hc-col*hc;
    }
  }

  col=mix(col,vec3(1.0,0.92,0.96),uFlash*0.3);
  o=vec4(col,1.0);
}`,_e=`uRes.uCenter.uDriftV.uPhase.uArms.uTwist.uPulseS.uSoft.uWob.uWave.uMode.uShape.uC1.uC2.uImg.uMask.uOn.uImgS.uImgO.uImgSize.uBreath.uExpand.uCenterX.uShake.uBody.uStretch.uChest.uUpper.uWaist.uFeather.uHair.uHairPh.uBodyRot.uTorsoRot.uFeet.uEyeC.uEcho.uLay.uBodyA.uBeat.uHearts.uHeartPh.uWash.uFlash.uCutA.uCutRect.uCutCam.uHeartN.uSoftEdge.uMask2.uStill.uWatch.uStillSize.uCutStill.uWord.uWordA.uWordB.uWordGrid.uWordInv.uWf.uWfT.uWfI.uWfN.uWfC`.split(`.`),J=e=>[1,3,5].map(t=>parseInt(e.slice(t,t+2),16)/255),ve=(e,t,n)=>e+(t-e)*n,ye=(e,t,n)=>[Math.cos(n)*e-Math.sin(n)*t-e,Math.sin(n)*e+Math.cos(n)*t-t],be=(e,t,n)=>{let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)},xe=e=>e.tour.reduce((e,t)=>e+t.dur,0);function Se(e,t,n,r,i){if(n===0)return{frame:e.frames.full,sinceFlash:99};if(n===1)return{frame:e.frames.half,sinceFlash:99};if(n===2)return{frame:{c:i,box:e.frames.gaze.box},sinceFlash:99};let a=r%xe(t),o=t.tour[0];for(let e of t.tour){if(o=e,a<e.dur)break;a-=e.dur}let s=Math.min(1,a/o.dur),{from:c,to:l}=o;return{frame:{c:[ve(c.c[0],l.c[0],s),ve(c.c[1],l.c[1],s)],box:[c.box[0]*(l.box[0]/c.box[0])**s,c.box[1]*(l.box[1]/c.box[1])**s]},sinceFlash:o.flash?a:99,pin:o.center}}function Ce(e,t){let n=t%xe(e),r=e.cutins.findIndex(e=>n>=e.at&&n<e.at+e.hold+V*2);if(r<0)return null;let i=e.cutins[r],a=n-i.at;return{cut:i,index:r,shown:1-(1-(a<V?a/V:Math.min(1,(i.hold+V*2-a)/V)))**3,since:a}}var Y=.27;function we(e){return Math.exp(-9*e)+(e>=Y?.6*Math.exp(-9*(e-Y)):0)}function Te(e,{onReady:t,onCue:n,size:r}={}){let i=e.getContext(`webgl2`,{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!!r});if(!i)return null;let a=null,o=!1,s=new Map,c=new Map,l=null,u={atlas:null,tex:null},d={y:0,vy:0,target:0,lastT:-1,lastCut:-1},f={t:-1,beat:0,sinceFlash:0,sinceSwap:0},p=[.5,.5],m=()=>{let e=i.createProgram();for(let[t,n]of[[i.VERTEX_SHADER,he],[i.FRAGMENT_SHADER,ge]]){let r=i.createShader(t);if(!r)return!1;i.shaderSource(r,n),i.compileShader(r),i.attachShader(e,r)}if(i.linkProgram(e),!i.getProgramParameter(e,i.LINK_STATUS))return!1;i.useProgram(e),a=Object.fromEntries(_e.map(t=>[t,i.getUniformLocation(e,t)])),i.uniform1i(a.uImg,0),i.uniform1i(a.uMask,1),i.uniform1i(a.uMask2,2),i.uniform1i(a.uStill,3),i.uniform1i(a.uWord,4),l=i.createTexture();for(let e of[i.TEXTURE0,i.TEXTURE1,i.TEXTURE2,i.TEXTURE3,i.TEXTURE4])i.activeTexture(e),i.bindTexture(i.TEXTURE_2D,l);return i.texImage2D(i.TEXTURE_2D,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,new Uint8Array(4)),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),s=new Map,c=new Map,u.tex=null,!0};if(!m())return null;let h=new AbortController;e.addEventListener(`webglcontextlost`,e=>(e.preventDefault(),a=null),{signal:h.signal}),e.addEventListener(`webglcontextrestored`,()=>void m(),{signal:h.signal});let g=(e,t,n)=>{if(e===``)return n(),l;let r=i.createTexture(),a=e=>{o||i.isContextLost()||(i.bindTexture(i.TEXTURE_2D,r),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,t),i.texImage2D(i.TEXTURE_2D,0,i.RGBA,i.RGBA,i.UNSIGNED_BYTE,e),i.generateMipmap(i.TEXTURE_2D),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR_MIPMAP_LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),n())};if(typeof e==`string`){let t=new Image;t.decoding=`async`,t.onload=()=>a(t),t.src=e}else a(e);return r},_=e=>{let n=s.get(e.img);if(!n){for(let[e,t]of s)typeof e!=`string`&&(i.deleteTexture(t.tex[0]),s.delete(e));let r={tex:[],loaded:0},a=()=>{r.loaded+=1,r.loaded===3&&typeof e.img==`string`&&t?.()};r.tex=[g(e.img,!0,a),g(e.mask,!1,a),g(e.watch?.mask??``,!1,a)],s.set(e.img,r),n=r;for(let t of e.stills??[]){if(c.has(t.img))continue;let e={tex:l,ready:!1};e.tex=g(t.img,!0,()=>e.ready=!0),c.set(t.img,e)}}return n.loaded===3?n:null};return{draw(t,o,s=z){if(!a||i.isContextLost())return;let m=Math.min(window.devicePixelRatio||1,2),h=r?r[0]:Math.round(e.clientWidth*m),g=r?r[1]:Math.round(e.clientHeight*m);if(!h||!g)return;(e.width!==h||e.height!==g)&&(e.width=h,e.height=g);let{t:v}=o,y=Math.max(0,v-(o.t0??0)),b=Math.min(h,g),x=L(t,y),S=x?_(x):null,C=q(v,s.beat),w=f.t>=0&&v>f.t&&v-f.t<.5,T=!t.beat||!w?0:C<f.beat?1:f.beat<Y&&C>=Y?2:0;f.t=v,f.beat=C,T&&n?.(T===1?`beat`:`beat2`);let ee=t.beat?Math.min(1,we(C)):0,E=R*q(v,s.wave);if(i.viewport(0,0,h,g),i.uniform2f(a.uRes,h,g),i.uniform1f(a.uPhase,o.phase),i.uniform1f(a.uArms,t.arms),i.uniform1f(a.uTwist,t.twist),i.uniform1f(a.uPulseS,t.pulse?Math.sin(R*q(v,s.pulse)):0),i.uniform1f(a.uSoft,t.soft),i.uniform1f(a.uWob,t.wob),i.uniform1f(a.uWave,E),i.uniform2f(a.uDriftV,t.drift*.07*Math.cos(E),t.drift*.07*Math.sin(E)),i.uniform1i(a.uMode,t.mode),t.mode===4){let e=u.atlas;if(i.activeTexture(i.TEXTURE4),e&&!u.tex){u.tex=i.createTexture(),i.bindTexture(i.TEXTURE_2D,u.tex),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),i.texImage2D(i.TEXTURE_2D,0,i.RGBA,i.RGBA,i.UNSIGNED_BYTE,e.canvas),i.generateMipmap(i.TEXTURE_2D),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR_MIPMAP_LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE);let t=i.getExtension(`EXT_texture_filter_anisotropic`);t&&i.texParameterf(i.TEXTURE_2D,t.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,i.getParameter(t.MAX_TEXTURE_MAX_ANISOTROPY_EXT)))}i.bindTexture(i.TEXTURE_2D,u.tex??l);let n=e?.count??1,r=pe(n,t),c=o.flow??0,d=ue(t.arms)+(t.wStag?.5:0);i.uniform4f(a.uWordA,d,n,(c%r+r)%r,+!!u.tex),i.uniform4f(a.uWordB,U.aspect,U.slant,U.waveS,t.wStag?0:U.waveQ),i.uniform1f(a.uWordInv,+!!t.wInv);let f=Math.floor(v/s.flash),p=fe(t);i.uniform4f(a.uWf,t.wFlash?Math.min(.5,W.rate*n):0,v-f*s.flash,W.step,W.hold),i.uniform1f(a.uWfT,s.flash),i.uniform4i(a.uWfI,Math.floor(c/r)*r,f,o.loop?Math.max(1,Math.round(o.loop.seconds/s.flash)):1024,o.loop?.words??0),i.uniform1i(a.uWfN,p.length/3),i.uniform3fv(a.uWfC,p),i.uniform4f(a.uWordGrid,e?.cols??1,e?.rows??1,e?.inset??0,U.line)}i.uniform1i(a.uShape,t.shape),i.uniform3f(a.uC1,...J(t.c1)),i.uniform3f(a.uC2,...J(t.c2)),i.uniform1f(a.uBeat,ee),i.uniform1f(a.uHearts,+!!t.hearts),i.uniform1f(a.uHeartN,Math.round(6+42*t.hDen)),i.uniform1f(a.uHeartPh,q(v,s.hearts)),i.uniform1f(a.uOn,x&&S?1:0);let D=[h/2,g/2],O=0,k=0;if(x&&S){let e=te(x,t.seq),r=Se(x,e,t.cam,y,ae(x,t,y)),o=t.cut?Ce(e,y):null,u=Math.min(re(t,y),oe(x,t,y));O=Math.max(Math.exp(-r.sinceFlash/.16),Math.exp(-u/.16),o?.7*Math.exp(-o.since/.13):0),w&&u<f.sinceSwap&&n?.(`flash`),f.sinceSwap=u;let p=Math.sin(R*q(v,s.breath)),m=d.lastT<0||v<d.lastT?0:Math.min(.05,v-d.lastT);d.lastT=v,d.target=-x.motion.chest*p,T&&(d.vy-=x.motion.beat*(T===1?1:.55));let _=o?o.index:-1;o&&_!==d.lastCut&&w&&(o.cut.jolt&&(d.vy+=x.motion.jolt),n?.(`cut`)),d.lastCut=_,w&&r.sinceFlash<f.sinceFlash&&n?.(`flash`),f.sinceFlash=r.sinceFlash;for(let e=0;e<4;e++)d.vy+=(90*(d.target-d.y)-7*d.vy)*(m/4),d.y+=d.vy*(m/4);let C=26*Math.tanh(d.y/26),E=.35*d.target,A=t.sway?.022*Math.sin(R*q(v,s.sway)):0,j=-1.4*A,ne=x.motion.hair*Math.sin(R*q(v,s.hair))+.35*.4*C+A*260,{frame:M}=r,N=Math.min(h/M.box[0],g/M.box[1])*(1+.02*ee),ie=h/2-M.c[0]*N,P=g/2-M.c[1]*N,F=x.watch,I=F?Math.atan2(F.face[0]-F.pivot[0],F.face[1]-F.pivot[1])+F.amp*Math.sin(R*q(v,s.watch)):0,[se,L]=x.eyes,z=[(se[0]+L[0])/2,(se[1]+L[1])/2],B=ae(x,t,y);if(F&&r.pin===`watch`){let e=ye(F.face[0]-F.pivot[0],F.face[1]-F.pivot[1],I);B=[F.face[0]+e[0],F.face[1]+e[1]]}let ce=1-be(x.waistY-x.feather,x.waistY+x.feather,B[1]),H=ye(B[0]-x.feet[0],B[1]-x.feet[1],A),le=ye(B[0]-x.centerX,B[1]-x.waistY,j);D=[ie+(B[0]+H[0]+le[0]*ce)*N,g-(P+(B[1]+(E+le[1])*ce+H[1])*N)];let ue=e=>[1+.4*e,t.echo?.42*Math.min(1,e*6)*(1-e)**2:0],U=ue(q(v,s.echo)),W=O>.02?[1+.5*(1-O),.5*O]:ue((q(v,s.echo)+.5)%1),G=o&&o.cut.still!==void 0?x.stills?.[o.cut.still]:void 0,K=G?c.get(G.img):void 0;if(o&&(!G||K?.ready)){let{cut:e,shown:t,since:n}=o,r=h/b/2,s=g/b/2,c=e.kind===`band`,l=c?r+.4:.41,u=c?.15:.29,d=c?0:e.side*(r-l-.035),f=c?.16*s:Math.max(-.35*s,-s+u+.05),p=d+e.side*(1-t)*(2*r+l);k=1,i.uniform4f(a.uCutRect,p,f,l,u);let m=G?1-.1*Math.min(1,n/(e.hold+V*2)):1;i.uniform3f(a.uCutCam,e.c[0],e.c[1],e.h*m/(2*u)),i.uniform1f(a.uCutStill,+!!G),G&&i.uniform2f(a.uStillSize,G.size[0],G.size[1])}if(i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,S.tex[0]),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,S.tex[1]),i.activeTexture(i.TEXTURE2),i.bindTexture(i.TEXTURE_2D,S.tex[2]),i.activeTexture(i.TEXTURE3),i.bindTexture(i.TEXTURE_2D,K?.ready?K.tex:l),F){let e=Math.hypot(F.face[0]-F.pivot[0],F.face[1]-F.pivot[1])+F.radius+24;i.uniform4f(a.uWatch,F.pivot[0],F.pivot[1],I,e)}else i.uniform4f(a.uWatch,0,0,0,0);i.uniform1f(a.uSoftEdge,+!!x.softEdge),i.uniform1f(a.uImgS,N),i.uniform2f(a.uImgO,ie,P),i.uniform2f(a.uImgSize,x.size[0],x.size[1]),i.uniform1f(a.uBreath,x.motion.breathe*p),i.uniform1f(a.uExpand,.006*p),i.uniform1f(a.uCenterX,x.centerX),i.uniform2f(a.uShake,0,C-E),i.uniform2f(a.uBody,0,C*.2),i.uniform1f(a.uStretch,.35*C/100),i.uniform2f(a.uChest,x.chest[0],x.chest[1]),i.uniform1f(a.uUpper,E),i.uniform1f(a.uWaist,x.waistY),i.uniform1f(a.uFeather,x.feather),i.uniform1f(a.uHair,ne),i.uniform1f(a.uHairPh,R*q(v,s.hair)*2),i.uniform1f(a.uBodyRot,A),i.uniform1f(a.uTorsoRot,j),i.uniform2f(a.uFeet,x.feet[0],x.feet[1]),i.uniform2f(a.uEyeC,z[0],z[1]),i.uniform4f(a.uEcho,U[0],U[1],W[0],W[1]),i.uniform1i(a.uLay,t.lay),i.uniform1f(a.uBodyA,t.sAlpha),i.uniform1f(a.uWash,.58+.16*p)}i.uniform1f(a.uFlash,O),i.uniform1f(a.uCutA,k),i.uniform2f(a.uCenter,D[0],D[1]),i.drawArrays(i.TRIANGLES,0,3),p=[D[0]/h,1-D[1]/g]},center:()=>p,word(e){e!==u.atlas&&(u.tex&&a&&!i.isContextLost()&&i.deleteTexture(u.tex),u.atlas=e,u.tex=null)},dispose(){o=!0,h.abort(),a=null,i.getExtension(`WEBGL_lose_context`)?.loseContext()}}}var Ee=`tavern-spiral`,De=`kv`;function Oe(){return new Promise((e,t)=>{let n=indexedDB.open(Ee,1);n.onupgradeneeded=()=>n.result.createObjectStore(De),n.onsuccess=()=>e(n.result),n.onerror=()=>t(n.error)})}async function ke(e,t){let n=await Oe();try{return await new Promise((r,i)=>{let a=t(n.transaction(De,e).objectStore(De));a.onsuccess=()=>r(a.result),a.onerror=()=>i(a.error)})}finally{n.close()}}var Ae=e=>ke(`readonly`,t=>t.get(e)),je=(e,t)=>ke(`readwrite`,n=>n.put(t,e)),Me=e=>ke(`readwrite`,t=>t.delete(e)),X=`images`,Ne=`image`,Pe=1600,Fe={fx:.5,fy:.22},Z=[];async function Ie(e,t){let n=await createImageBitmap(e),r=Math.min(1,Pe/Math.max(n.width,n.height)),i=document.createElement(`canvas`);i.width=Math.max(1,Math.round(n.width*r)),i.height=Math.max(1,Math.round(n.height*r)),i.getContext(`2d`).drawImage(n,0,0,i.width,i.height),n.close();let a=t.spots?.length?t.spots:[[t.fx,t.fy]];return{canvas:i,size:[i.width,i.height],fx:a[0][0],fy:a[0][1],spots:a}}async function Le(){try{Z.length?await je(X,A.images.map((e,t)=>({blob:Z[t],fx:e.fx,fy:e.fy,spots:e.spots}))):await Me(X)}catch{}}var Q=null;function Re(e){return Q??=(async()=>{if(A.images.length)return!0;try{let t=await Ae(X)??[];if(!t.length){let n=await Ae(Ne);n&&(t=[{blob:n,...e??Fe}],await je(X,t),await Me(Ne))}let n=[],r=[];for(let e of t.slice(0,8))try{n.push(await Ie(e.blob,e)),r.push(e.blob)}catch{}return A.images=n,Z=r,A.at=0,n.length>0}catch{return!1}})(),Q}async function ze(e){await Q;let t=A.images.length;for(let t of e){if(A.images.length>=8)break;try{let e=await Ie(t,Fe),n=await new Promise(t=>e.canvas.toBlob(t,`image/webp`,.92));A.images.push(e),Z.push(n??t)}catch{}}return A.images.length===t?-1:(Q=Promise.resolve(!0),A.at=t,await Le(),t)}async function Be(e){A.images[e]&&(A.images.splice(e,1),Z.splice(e,1),A.at=Math.max(0,Math.min(A.at,A.images.length-1)),Q=Promise.resolve(A.images.length>0),await Le())}var Ve=()=>Le(),He={labelKey:`a8d5c034`,label:{noto900:{href:`/fonts/ui/noto-sans-sc-900.19b8d493.woff2`,bytes:195452,family:`Noto Sans SC`,weight:900},noto700:{href:`/fonts/ui/noto-sans-sc-700.08a058f2.woff2`,bytes:198476,family:`Noto Sans SC`,weight:700},mplus800:{href:`/fonts/ui/m-plus-1-800.39e9af5d.woff2`,bytes:14556,family:`M PLUS 1`,weight:800},lilita:{href:`/fonts/ui/lilita-one.e1467dd8.woff2`,bytes:6432,family:`Lilita One`,weight:400,range:`U+0000-024F,U+2000-206F,U+2212`}},preload:[`/fonts/ui/noto-sans-sc-900.19b8d493.woff2`,`/fonts/ui/noto-sans-sc-700.08a058f2.woff2`,`/fonts/ui/m-plus-1-800.39e9af5d.woff2`,`/fonts/ui/lilita-one.e1467dd8.woff2`],bodyKey:`aafa395a`,bodyCss:`/fonts/body/index.css?v=c3b26b51`,blackCss:`/fonts/body/black.css?v=01446229`,displayKey:`1bbcf480`,displayCss:{zh:`/fonts/body/display-sc.css?v=33da10d9`,ja:`/fonts/body/display-ja.css?v=c0d06bbf`},jaKey:`4f87987c`,ja:[{href:`/fonts/ui/m-plus-1-ja-400.7aa50fed.woff2`,family:`M PLUS 1 JA`,weight:400,bytes:93908},{href:`/fonts/ui/m-plus-1-ja-900.4f599f3c.woff2`,family:`M PLUS 1 JA`,weight:900,bytes:90408},{href:`/fonts/ui/m-plus-1-ja-text-400.31cc4ec5.woff2`,family:`M PLUS 1 JA Text`,weight:400,bytes:180732}],koKey:`4a7ebf5c`,ko:[{href:`/fonts/ui/noto-sans-kr-500.baa23bba.woff2`,family:`Noto Sans KR`,weight:500,bytes:43464},{href:`/fonts/ui/noto-sans-kr-700.4dee5112.woff2`,family:`Noto Sans KR`,weight:700,bytes:43896},{href:`/fonts/ui/noto-sans-kr-900.2208b8a6.woff2`,family:`Noto Sans KR`,weight:900,bytes:42416}]},Ue=`tavern.spiral.word`;function We(e){return[...typeof e==`string`?e.replace(/\s+/g,``):``].slice(0,12).join(``)}function Ge(){try{return We(localStorage.getItem(Ue))}catch{return``}}function Ke(e){try{e?localStorage.setItem(Ue,e):localStorage.removeItem(Ue)}catch{}}var qe=()=>`${document.documentElement.lang.toLowerCase().startsWith(`ja`)?`'WDXL Lubrifont JPN', 'WDXL Lubrifont SC'`:`'WDXL Lubrifont SC', 'WDXL Lubrifont JPN'`}, 'Noto Sans SC Black', ${getComputedStyle(document.body).fontFamily}`,Je=null;function Ye(){return Je??=Promise.all([document.documentElement.lang.toLowerCase().startsWith(`ja`)?He.displayCss.ja:He.displayCss.zh,He.blackCss].map(e=>new Promise(t=>{let n=document.createElement(`link`);n.rel=`stylesheet`,n.href=e,n.onload=n.onerror=()=>t(),document.head.append(n)}))).then(()=>void 0),Je}var Xe=e=>e<=4?512:e<=9?384:320,Ze=1/16,Qe=3,$=null;function $e(e,t,n){$??=document.createElement(`canvas`);let r=Math.ceil(n*.5),i=Math.ceil(n*1.4),a=Math.ceil(n*2.2),o=Math.ceil(n*2);($.width!==a||$.height!==o)&&($.width=a,$.height=o);let s=$.getContext(`2d`,{willReadFrequently:!0});s.clearRect(0,0,a,o),s.font=t,s.textBaseline=`alphabetic`,s.textAlign=`left`,s.fillStyle=`#fff`,s.fillText(e,r,i);let c=s.getImageData(0,0,a,o).data,l=a,u=-1,d=o,f=-1;for(let e=0;e<o;e++)for(let t=0,n=e*a*4+3;t<a;t++,n+=4)c[n]<128||(t<l&&(l=t),t>u&&(u=t),e<d&&(d=e),e>f&&(f=e));return u<l||f<d?null:{l:l-r,t:d-i,w:u-l+1,h:f-d+1}}async function et(e){let t=[...We(e)],n=Math.max(1,t.length),r=Math.ceil(Math.sqrt(n)),i=Math.ceil(n/r),a=Xe(n),o=qe(),s=Math.round(a*.6),c=`${s}px ${o}`;await Ye();try{await document.fonts.load(c,t.join(``))}catch{}let l=document.createElement(`canvas`);l.width=r*a,l.height=i*a;let u=l.getContext(`2d`);u.fillStyle=`#000`,u.fillRect(0,0,l.width,l.height),u.font=c,u.textBaseline=`alphabetic`,u.textAlign=`left`,u.fillStyle=`#fff`,u.imageSmoothingEnabled=!1;let d=Math.round(a*Ze),f=a-d*2,p=f*1.06;return t.forEach((e,t)=>{let n=t%r*a,i=Math.floor(t/r)*a,o=$e(e,c,s);if(!o)return;let m=p/o.w,h=p/o.h;m=Math.min(m,h*Qe),h=Math.min(h,m*Qe),u.save(),u.beginPath(),u.rect(n+d,i+d,f,f),u.clip(),u.translate(n+a/2,i+a/2),u.scale(m,h),u.fillText(e,-(o.l+o.w/2),-(o.t+o.h/2)),u.restore(),u.drawImage(l,n+d,i+d,1,f,n,i+d,d,f),u.drawImage(l,n+d+f-1,i+d,1,f,n+d+f,i+d,d,f),u.drawImage(l,n,i+d,a,1,n,i,a,d),u.drawImage(l,n,i+d+f-1,a,1,n,i+d+f,a,d)}),{canvas:l,text:t.join(``),count:n,cols:r,rows:i,inset:d/a}}export{y as A,t as C,v as D,_ as E,x as O,L as S,u as T,pe as _,ze as a,M as b,Ve as c,je as d,H as f,ce as g,Te as h,Ke as i,g as j,h as k,Me as l,me as m,We as n,Be as o,B as p,Ge as r,Re as s,et as t,Ae as u,k as v,e as w,N as x,A as y};