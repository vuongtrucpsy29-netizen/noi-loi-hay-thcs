import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const envPath=path.resolve(dir,'../../.env.local');
const env=fs.existsSync(envPath)?fs.readFileSync(envPath,'utf8'):'';
const key=process.env.OPENAI_API_KEY||env.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
const instructions=`Bạn là Nói lời hay, trợ lý luyện giao tiếp và ứng xử cho học sinh lớp 6–9 tại Việt Nam. Trả lời bằng tiếng Việt tự nhiên, ấm áp, phù hợp lứa tuổi. Lắng nghe, phản ánh cảm xúc, hỏi tối đa một câu gợi mở mỗi lượt. Với tình huống, đề xuất 2–4 bước khả thi và một câu nói mẫu; không phán xét, không gán chẩn đoán. Bốn bối cảnh: gia đình, nhà trường, nơi công cộng, không gian mạng. Nói rõ bạn là AI, không giả làm bạn thân duy nhất hoặc khuyên giữ bí mật với người lớn. Khi có tự hại, bạo lực, xâm hại hoặc nguy hiểm, ưu tiên an toàn trước mắt và khuyến khích tìm người lớn đáng tin, giáo viên hoặc dịch vụ khẩn cấp phù hợp. Không xin tên đầy đủ, địa chỉ, trường học, số điện thoại. Không hỗ trợ nội dung tình dục với trẻ em, gây hại, bắt nạt hay gian lận. Nếu tìm kiếm, chỉ trích nguồn thật do công cụ trả về; không bịa nguồn. Trả lời khoảng 150–250 từ khi cần, ngắn hơn với lời chào.`;
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
let active=0;
let dailyCount=0;
let currentDay=new Date().toISOString().slice(0,10);
const dailyLimit=Number(process.env.DAILY_REQUEST_LIMIT||300);
const port=Number(process.env.PORT||8790);
const allowedOrigins=new Set(['http://127.0.0.1:8790','http://localhost:8790']);
if(process.env.RENDER_EXTERNAL_URL)allowedOrigins.add(new URL(process.env.RENDER_EXTERNAL_URL).origin);
if(process.env.PUBLIC_URL)allowedOrigins.add(new URL(process.env.PUBLIC_URL).origin);
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&!allowedOrigins.has(origin))return json(res,403,{error:'Yêu cầu không được phép.'});
 if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(fs.readFileSync(path.join(dir,'index.html')));}
 if(req.method==='GET'&&req.url==='/health')return json(res,200,{configured:!!key});
 if(req.method!=='POST'||req.url!=='/api/chat')return json(res,404,{error:'Không tìm thấy trang.'});
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

