# Genera las capas 2.5D del holograma a partir de la imagen oficial (docs/referencia/quetzal-ref.png).
# Salida en public/hologram/: ave.jpg, resto.jpg (aditivas sobre negro), depth.png (R profundidad ave, G profundidad resto, B balanceo),
# aura.json (puntos de partículas muestreados sobre la propia imagen) y composicion.png (verificación: ave + resto).
# Uso: powershell -ExecutionPolicy Bypass -File tools/hologram/build-layers.ps1
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$src = Join-Path $root 'docs\referencia\quetzal-ref.png'
$out = Join-Path $root 'public\hologram'
New-Item -ItemType Directory -Force $out | Out-Null

$cs = @'
using System;using System.Collections.Generic;using System.Drawing;using System.Drawing.Imaging;using System.IO;using System.Text;
public static class Layers{
 const int X0=95,Y0=20,W=810,H=648;
 static double SS(double a,double b,double x){double t=Math.Max(0,Math.Min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
 static bool InPoly(float[][] p,float x,float y){bool c=false;for(int i=0,j=p.Length-1;i<p.Length;j=i++){if(((p[i][1]>y)!=(p[j][1]>y))&&(x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0]))c=!c;}return c;}
 static void Blur(float[] a,int w,int h,int r,int passes){var t=new float[a.Length];for(int p=0;p<passes;p++){
   for(int y=0;y<h;y++){double s=0;int n=0;for(int x=-r;x<=r;x++){int xx=Math.Max(0,Math.Min(w-1,x));s+=a[y*w+xx];n++;}for(int x=0;x<w;x++){t[y*w+x]=(float)(s/n);int xo=Math.Max(0,Math.Min(w-1,x-r)),xi=Math.Max(0,Math.Min(w-1,x+r+1));s+=a[y*w+xi]-a[y*w+xo];}}
   for(int x=0;x<w;x++){double s=0;int n=0;for(int y=-r;y<=r;y++){int yy=Math.Max(0,Math.Min(h-1,y));s+=t[yy*w+x];n++;}for(int y=0;y<h;y++){a[y*w+x]=(float)(s/n);int yo=Math.Max(0,Math.Min(h-1,y-r)),yi=Math.Max(0,Math.Min(h-1,y+r+1));s+=t[yi*w+x]-t[yo*w+x];}}}}
 static float[][] P(params float[] v){var r=new float[v.Length/2][];for(int i=0;i<r.Length;i++)r[i]=new float[]{v[2*i],v[2*i+1]};return r;}
 static void Paint(float[] a,int w,int h,float sc,float[][] poly,float val){for(int y=0;y<h;y++)for(int x=0;x<w;x++)if(InPoly(poly,x/sc,y/sc))a[y*w+x]=val;}
 static void Ellipse(float[] a,int w,int h,float sc,float cx,float cy,float rx,float ry,float val){for(int y=0;y<h;y++)for(int x=0;x<w;x++){double dx=(x/sc-cx)/rx,dy=(y/sc-cy)/ry;if(dx*dx+dy*dy<=1)a[y*w+x]=val;}}
 public static void Run(string src,string outDir){
  var R=new float[W*H];var G=new float[W*H];var B=new float[W*H];
  using(var bmp=new Bitmap(src)){for(int y=0;y<H;y++)for(int x=0;x<W;x++){var c=bmp.GetPixel(X0+x,Y0+y);R[y*W+x]=c.R/255f;G[y*W+x]=c.G/255f;B[y*W+x]=c.B/255f;}}
  // 1) destello redondo desenfocado sobre la cola: se atenúa (era un foco del laboratorio, no del ave)
  for(int y=0;y<H;y++)for(int x=0;x<W;x++){double dx=x-715,dy=y-565,d=Math.Sqrt(dx*dx+dy*dy);if(d>26)continue;int i=y*W+x;float m=Math.Max(R[i],Math.Max(G[i],B[i]));double w=Math.Max(0,1-d/26);w=w*w*(3-2*w);w*=Math.Min(1.0,Math.Max(0,(m-0.35)/0.45));R[i]=(float)(R[i]*(1-w)+0.05*w);G[i]=(float)(G[i]*(1-w)+0.18*w);B[i]=(float)(B[i]*(1-w)+0.45*w);}
  // 2) máscara de conservación: fuera monitores/focos desenfocados del fondo
  var K=new float[W*H];for(int i=0;i<K.Length;i++)K[i]=1;
  var excl=new float[W*H];var gray=new float[W*H];
  for(int y=0;y<H;y++)for(int x=0;x<W;x++){int ax=x+X0,ay=y+Y0;if((ax>=842&&ay>=588)||(ax>=158&&ax<=268&&ay>=552&&ay<=625))excl[y*W+x]=1;if(ax>=150&&ax<=275&&ay>=525&&ay<=630)gray[y*W+x]=1;}
  Blur(excl,W,H,5,2);Blur(gray,W,H,10,2);
  for(int y=0;y<H;y++)for(int x=0;x<W;x++){int i=y*W+x;float bf=(float)(1-SS(H-24,H,y));K[i]=(1-excl[i])*bf;}   // monitor derecho fuera; el borde inferior se desvanece
  // 3) máscara del ave (polígono dibujado a mano; el anillo, el globo y los datos quedan fuera) suavizada
  var pts=new float[]{2,190,95,88,170,120,250,12,262,50,335,5,375,60,405,40,425,85,468,125,478,185,500,215,505,262,470,262,420,262,408,300,425,380,480,440,540,490,620,520,720,548,808,566,780,578,700,595,620,605,560,600,520,625,470,640,420,640,370,610,300,622,210,595,135,530,90,430,60,330,40,250};
  var poly=P(pts);var M=new float[W*H];for(int y=0;y<H;y++)for(int x=0;x<W;x++)M[y*W+x]=InPoly(poly,x,y)?1f:0f;Blur(M,W,H,9,3);
  // 4) capas aditivas sobre negro (ave + resto = imagen original con el fondo oscurecido)
  var ave=new Bitmap(W,H,PixelFormat.Format24bppRgb);var res=new Bitmap(W,H,PixelFormat.Format24bppRgb);var sum=new Bitmap(W,H,PixelFormat.Format24bppRgb);
  var lumA=new float[W*H];var lumR=new float[W*H];
  for(int y=0;y<H;y++)for(int x=0;x<W;x++){int i=y*W+x;float m=Math.Max(R[i],Math.Max(G[i],B[i]));double a=SS(0.20,0.46,m)*K[i];a*=1-gray[i]*(1-SS(0.10,0.32,B[i]-R[i]));   // el monitor desenfocado es gris (R≈B): se descarta por saturación
   float ma=(float)(a*M[i]),mr=(float)(a*(1-M[i]));
   ave.SetPixel(x,y,Color.FromArgb((int)(R[i]*ma*255),(int)(G[i]*ma*255),(int)(B[i]*ma*255)));
   res.SetPixel(x,y,Color.FromArgb((int)(R[i]*mr*255),(int)(G[i]*mr*255),(int)(B[i]*mr*255)));
   sum.SetPixel(x,y,Color.FromArgb((int)(R[i]*a*255),(int)(G[i]*a*255),(int)(B[i]*a*255)));
   lumA[i]=m*ma;lumR[i]=m*mr;}
  var enc=ImageCodecInfo.GetImageEncoders();ImageCodecInfo jpg=null;foreach(var e in enc)if(e.MimeType=="image/jpeg")jpg=e;
  var ep=new EncoderParameters(1);ep.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,92L);
  ave.Save(Path.Combine(outDir,"ave.jpg"),jpg,ep);res.Save(Path.Combine(outDir,"resto.jpg"),jpg,ep);sum.Save(Path.Combine(outDir,"composicion.png"),ImageFormat.Png);
  // 5) mapas de profundidad y balanceo (media resolución)
  int dw=W/2,dh=H/2;float sc=0.5f;
  var dr=new float[dw*dh];var dg=new float[dw*dh];var db=new float[dw*dh];
  for(int i=0;i<dr.Length;i++){dr[i]=0.36f;dg[i]=0.38f;}
  Paint(dr,dw,dh,sc,P(60,200,330,160,380,420,250,520,110,430),0.55f);                         // alas medias
  Paint(dr,dw,dh,sc,P(330,430,520,480,808,566,700,600,400,640,300,560),0.58f);                 // plumas inferiores y cola
  Paint(dr,dw,dh,sc,P(400,240,500,250,480,330,430,420,330,430,330,300),0.74f);                 // cuello y pecho
  Paint(dr,dw,dh,sc,P(250,10,345,0,420,45,480,130,440,160,300,150,260,90),0.86f);              // cresta
  Ellipse(dr,dw,dh,sc,440,195,75,70,1.0f);                                                       // cabeza
  Paint(dr,dw,dh,sc,P(0,150,110,150,110,450,0,450),0.22f);                                       // puntas lejanas a la izquierda (al fondo)
  Blur(dr,dw,dh,9,3);
  Ellipse(dg,dw,dh,sc,475,325,105,100,0.12f);                                                    // globo (al fondo)
  Paint(dg,dw,dh,sc,P(620,90,800,90,800,540,640,540),0.66f);                                     // bloques de datos (flotan delante)
  Blur(dg,dw,dh,9,3);
  for(int y=0;y<dh;y++)for(int x=0;x<dw;x++){double px=x/sc,py=y/sc,d=Math.Sqrt((px-440)*(px-440)+(py-300)*(py-300));double hd=Math.Sqrt((px-440)*(px-440)+(py-195)*(py-195));
   double w=SS(110,330,d)*(1-SS(60,115,0)*0);w*=SS(80,150,hd);int ix=(int)Math.Min(W-1,px),iy=(int)Math.Min(H-1,py);db[y*dw+x]=(float)(w*M[iy*W+ix]);}
  Blur(db,dw,dh,4,2);
  var depth=new Bitmap(dw,dh,PixelFormat.Format24bppRgb);
  for(int y=0;y<dh;y++)for(int x=0;x<dw;x++){int i=y*dw+x;depth.SetPixel(x,y,Color.FromArgb((int)(Math.Max(0,Math.Min(1,dr[i]))*255),(int)(Math.Max(0,Math.Min(1,dg[i]))*255),(int)(Math.Max(0,Math.Min(1,db[i]))*255)));}
  depth.Save(Path.Combine(outDir,"depth.png"),ImageFormat.Png);
  // 6) puntos de partículas muestreados sobre la propia imagen (peso = brillo^2)
  var rnd=new Random(1998);var sb=new StringBuilder();int n1=3200,n2=900;
  Func<float[],int,List<int>> sample=(lum,n)=>{var cum=new double[lum.Length];double acc=0;for(int i=0;i<lum.Length;i++){acc+=lum[i]*lum[i];cum[i]=acc;}var l=new List<int>();for(int k=0;k<n;k++){double t=rnd.NextDouble()*acc;int lo=0,hi=cum.Length-1;while(lo<hi){int mid=(lo+hi)/2;if(cum[mid]<t)lo=mid+1;else hi=mid;}l.Add(lo);}return l;};
  var s1=sample(lumA,n1);var s2=sample(lumR,n2);
  sb.Append("{\"w\":"+W+",\"h\":"+H+",\"n1\":"+n1+",\"n2\":"+n2+",\"p\":[");bool first=true;
  Action<List<int>,float[]> emit=(lst,dm)=>{foreach(int idx in lst){int x=idx%W,y=idx/W;int zi=(int)(Math.Max(0,Math.Min(1,dm[Math.Min(dh-1,y/2)*dw+Math.Min(dw-1,x/2)]))*255);if(!first)sb.Append(',');first=false;sb.Append(x+","+y+","+zi);}};
  emit(s1,dr);emit(s2,dg);sb.Append("]}");File.WriteAllText(Path.Combine(outDir,"aura.json"),sb.ToString());
  ave.Dispose();res.Dispose();sum.Dispose();depth.Dispose();
 }
}
'@
Add-Type -TypeDefinition $cs -ReferencedAssemblies System.Drawing
[Layers]::Run($src, $out)
Get-ChildItem $out | Select-Object Name, @{n='KB'; e={[int]($_.Length/1KB)}}
