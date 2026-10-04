import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const envPath=path.resolve(dir,'../../.env.local');
const env=fs.existsSync(envPath)?fs.readFileSync(envPath,'utf8'):'';
const key=process.env.OPENAI_API_KEY||env.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
const instructions=`Bạn là Chubby, nhân vật chú mèo trợ lý ảo của website Nói lời hay và ứng xử đẹp, giúp luyện giao tiếp và ứng xử cho học sinh lớp 6–9 tại Việt Nam. Xưng mình và gọi người dùng là bạn; giới thiệu tên Chubby khi được hỏi. Có thể dùng một lời chào nhẹ nhàng như “Meo, chào bạn” và biểu tượng bàn chân mèo, nhưng không lạm dụng hoặc làm đùa khi người dùng đang buồn hay gặp nguy hiểm. Nói rõ mình là trợ lý ảo sử dụng trí tuệ nhân tạo khi cần, không nhận là một con mèo thật. Trả lời bằng tiếng Việt tự nhiên, ấm áp, phù hợp lứa tuổi. Lắng nghe, phản ánh cảm xúc, hỏi tối đa một câu gợi mở mỗi lượt. Với tình huống, đề xuất 2–4 bước khả thi và một câu nói mẫu; không phán xét, không gán chẩn đoán. Bốn bối cảnh: gia đình, nhà trường, nơi công cộng, không gian mạng. Nói rõ bạn là AI, không giả làm bạn thân duy nhất hoặc khuyên giữ bí mật với người lớn. Khi có tự hại, bạo lực, xâm hại hoặc nguy hiểm, ưu tiên an toàn trước mắt và khuyến khích tìm người lớn đáng tin, giáo viên hoặc dịch vụ khẩn cấp phù hợp. Không xin tên đầy đủ, địa chỉ, trường học, số điện thoại. Không hỗ trợ nội dung tình dục với trẻ em, gây hại, bắt nạt hay gian lận. Nếu tìm kiếm, chỉ trích nguồn thật do công cụ trả về; không bịa nguồn. Trả lời khoảng 150–250 từ khi cần, ngắn hơn với lời chào.`;
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
let active=0;
let dailyCount=0;
let currentDay=new Date().toISOString().slice(0,10);
const dailyLimit=Number(process.env.DAILY_REQUEST_LIMIT||300);
const port=Number(process.env.PORT||8790);
const allowedOrigins=new Set(['http://127.0.0.1:8790','http://localhost:8790']);
if(process.env.RENDER_EXTERNAL_URL)allowedOrigins.add(new URL(process.env.RENDER_EXTERNAL_URL).origin);
if(process.env.PUBLIC_URL)allowedOrigins.add(new URL(process.env.PUBLIC_URL).origin);
const readableStyle="<style id=\"handbook-readable-type\">.a4-page:not(.book-cover) .book-copy{font-size:18px;line-height:1.55;text-align:justify;word-break:normal;overflow-wrap:normal;hyphens:none}.a4-page .book-copy p,.a4-page .book-copy li{orphans:3;widows:3}.a4-page .book-copy h3{font-size:20px;text-align:left;text-wrap:balance;break-after:avoid}.a4-page .book-copy blockquote,.a4-page .book-copy aside,.a4-page .level p,.a4-page .comparison p,.a4-page .workbox p{font-size:17px;line-height:1.5}.a4-page .story-dialogue p{text-align:left}.a4-page h2{text-wrap:balance;word-break:normal;overflow-wrap:normal;hyphens:none}.a4-page:not(.book-cover) .a4-heading{grid-template-columns:minmax(0,1fr) 145px;min-height:145px;gap:18px;margin-bottom:14px}.a4-page:not(.book-cover) .a4-figure{width:145px}.a4-page .book-toc button{font-size:17px;text-align:left}@media print{.printing-book .a4-page:not(.book-cover) .book-copy{font-size:14pt;line-height:1.5}.printing-book .a4-page .book-copy h3{font-size:15pt}.printing-book .a4-page .book-copy blockquote,.printing-book .a4-page .book-copy aside,.printing-book .level p,.printing-book .comparison p,.printing-book .workbox p{font-size:13pt;line-height:1.5}.printing-book .a4-page:not(.book-cover) .a4-heading{grid-template-columns:minmax(0,1fr) 45mm;min-height:45mm;gap:6mm;margin-bottom:5mm}.printing-book .a4-page:not(.book-cover) .a4-figure,.printing-book .a4-page:not(.book-cover) .a4-figure .book-illustration{width:45mm}.printing-book .book-toc button{font-size:13pt}}.a4-page:not(.book-cover){padding-top:24px}.a4-page:not(.book-cover) .book-top{margin-bottom:12px}.a4-page:not(.book-cover) .a4-heading{grid-template-columns:minmax(0,1fr) 125px;min-height:125px;margin-bottom:10px}.a4-page:not(.book-cover) .a4-figure{width:125px}.a4-page .book-copy blockquote,.a4-page .book-copy aside,.a4-page .story-dialogue{margin-top:9px;margin-bottom:9px}.a4-page.book-cover h2{font-size:52px}.a4-page.book-cover .a4-figure{width:250px}@media print{.printing-book .a4-page:not(.book-cover){padding-top:10mm}.printing-book .a4-page.book-cover h2{font-size:39pt}.printing-book .a4-page.book-cover .a4-figure,.printing-book .a4-page.book-cover .book-illustration{width:78mm}}</style>";
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const origin=req.headers.origin;
 if(origin&&!allowedOrigins.has(origin))return json(res,403,{error:'Yêu cầu không được phép.'});
 if(req.method==='GET'&&pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(fs.readFileSync(path.join(dir,'index.html'),'utf8').replace('<header>',readableStyle+"<style>.a4-page[data-readable=\"large\"]:not(.book-cover) .book-copy{font-size:20px;line-height:1.55}.a4-page[data-readable=\"large\"] .book-copy blockquote,.a4-page[data-readable=\"large\"] .book-copy aside,.a4-page[data-readable=\"large\"] .level p,.a4-page[data-readable=\"large\"] .comparison p,.a4-page[data-readable=\"large\"] .workbox p{font-size:19px}.a4-page[data-readable=\"large\"] .book-copy h3{font-size:22px}.a4-page[data-readable=\"large\"] .book-toc button{font-size:19px}@media print{.printing-book .a4-page[data-readable=\"large\"]:not(.book-cover) .book-copy{font-size:15pt}.printing-book .a4-page[data-readable=\"large\"] .book-copy blockquote,.printing-book .a4-page[data-readable=\"large\"] .book-copy aside,.printing-book .a4-page[data-readable=\"large\"] .level p,.printing-book .a4-page[data-readable=\"large\"] .comparison p,.printing-book .a4-page[data-readable=\"large\"] .workbox p{font-size:14pt}.printing-book .a4-page[data-readable=\"large\"] .book-copy h3{font-size:16pt}}</style><script>(()=>{const pages=new Set([2,3,4,7,8,9,13,14,15,21,22,29,35,43,45]);function apply(){document.querySelectorAll('.a4-page').forEach(p=>{const n=parseInt(p.querySelector('.page-number')?.textContent,10);p.dataset.readable=pages.has(n)?'large':'normal'})}new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('beforeprint',apply);})();</script>"+'<header>'));}
 if(req.method==='GET'&&pathname==='/health')return json(res,200,{configured:!!key});
 if(req.method!=='POST'||pathname!=='/api/chat')return json(res,404,{error:'Không tìm thấy trang.'});
 if(!key)return json(res,503,{error:'Chưa tìm thấy khóa API trong cấu hình máy chủ.'});
 if(active>=4)return json(res,429,{error:'Đang có nhiều bạn trò chuyện. Bạn chờ một chút rồi gửi lại nhé.'});
 const today=new Date().toISOString().slice(0,10);
 if(today!==currentDay){currentDay=today;dailyCount=0;}
 if(dailyCount>=dailyLimit)return json(res,429,{error:'Đã hết số lượt trò chuyện của hôm nay. Bạn vẫn có thể luyện tình huống và đọc cẩm nang.'});
 let counted=false;
 try{
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>30000)return json(res,413,{error:'Tin nhắn quá dài.'});}
  const body=JSON.parse(raw);if(!Array.isArray(body.messages)||!body.messages.length)return json(res,400,{error:'Bạn viết một tin nhắn nhé.'});
  const messages=body.messages.slice(-12);if(messages.some(m=>!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>2500))return json(res,400,{error:'Mỗi tin nhắn tối đa 2.500 ký tự.'});
  active++;counted=true;dailyCount++;
  const payload={model:'gpt-4.1-mini',instructions,input:messages,max_output_tokens:900,store:false};
  if(body.search===true)payload.tools=[{type:'web_search'}];
  const upstream=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(60000)});
  const data=await upstream.json();
  if(!upstream.ok){const code=data.error?.code;return json(res,upstream.status,{error:code==='insufficient_quota'?'API báo chưa có hạn mức sử dụng. Cần kiểm tra số dư của đúng dự án OpenAI.':upstream.status===401?'Khóa API chưa được chấp nhận.':upstream.status===429?'API đang giới hạn lượt yêu cầu. Bạn thử lại sau nhé.':'OpenAI chưa xử lý được yêu cầu này.',code:code||'api_error'});}
  const texts=[],sources=[];for(const item of data.output||[])for(const c of item.content||[]){if(c.type==='output_text'){texts.push(c.text);for(const a of c.annotations||[])if(a.type==='url_citation'&&/^https?:\/\//.test(a.url))sources.push({title:a.title||a.url,url:a.url});}}
  if(!texts.length)return json(res,502,{error:'Chưa nhận được câu trả lời. Bạn thử lại nhé.'});
  json(res,200,{text:texts.join('\n'),sources:[...new Map(sources.map(s=>[s.url,s])).values()]});
 }catch{json(res,502,{error:'Chưa kết nối được OpenAI. Kiểm tra kết nối mạng rồi thử lại nhé.'});}finally{if(counted)active--;}
});
server.listen(port,process.env.PORT?'0.0.0.0':'127.0.0.1',()=>console.log('Website sẵn sàng trên cổng '+port+'; khóa được giữ trên máy chủ.'));

