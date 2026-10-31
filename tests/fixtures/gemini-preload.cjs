if(process.env.USAHAKU_GEMINI_STUB!=='1'||process.env.GEMINI_API_KEY!=='usahaku-test-key-do-not-use')throw Error('Gemini test preload requires explicit stub mode and dummy key');
const fs=require('node:fs');const original=globalThis.fetch;
globalThis.fetch=async function(input,init){
 const url=String(input instanceof Request?input.url:input);if(!url.startsWith('https://generativelanguage.googleapis.com/'))return original(input,init);
 const body=JSON.parse(init.body),payload=JSON.parse(body.contents.at(-1).parts[0].text),q=payload.question.toLowerCase();
 const allowed=body.generationConfig.responseJsonSchema.properties.mode.enum;
 fs.appendFileSync(process.env.USAHAKU_GEMINI_CAPTURE,JSON.stringify({...payload,history:body.contents.slice(0,-1),modeAllowed:allowed})+'\n');
 if(q.includes('kuota'))return new Response('{}',{status:429});if(q.includes('jaringan'))throw Error('simulated provider failure');if(q.includes('lama'))await new Promise(r=>setTimeout(r,8000));
 const ids=payload.facts.map(f=>f.id),defaults=['net','count','stock_count'].filter(id=>ids.includes(id));
 let draft={mode:'answer',basis:'store_data',message:'Berikut ringkasannya.\n\n'+defaults.map(id=>'{{fact:'+id+'}}').join('\n'),factIds:defaults,assumptions:[],items:[]};
 if(q.includes('stok')){draft.factIds=ids.filter(id=>id.startsWith('stock_')).slice(0,6);draft.message='Berikut stok yang perlu diperiksa.\n\n'+draft.factIds.map(id=>'{{fact:'+id+'}}').join('\n')}
 if(q.includes('laba'))draft={...draft,basis:'general',message:'Laba aktual belum dapat dihitung karena HPP dan biaya operasional belum tersedia. Untuk simulasi, kurangi biaya barang dan operasional dari penjualan.',factIds:[]};
 if(q.includes('caption'))draft={...draft,basis:'general',message:'Belanja kebutuhan harian lebih mudah di toko kami. Pilih produk favoritmu dan hubungi kami untuk ketersediaannya.',factIds:[]};
 if(q.includes('barang')||q.includes('anggaran')){draft={...draft,basis:'estimate',message:'Saya siapkan rencana awal berikut untuk toko kebutuhan harian. Harga dan jumlah adalah perkiraan untuk uji penjualan awal.',factIds:[],assumptions:['Barang baru untuk toko kebutuhan harian.'],items:[{name:'Teh kemasan',quantity:20,unit:'pcs',unitCost:5000},{name:'Biskuit',quantity:20,unit:'pcs',unitCost:7500},{name:'Mi instan',quantity:30,unit:'pcs',unitCost:3000}]};if(payload.budget===null&&allowed.includes('clarification'))draft={...draft,mode:'clarification',basis:'general',message:'Barang baru atau produk yang sudah ada? Berapa anggarannya?',assumptions:[],items:[]}}
 if(q.includes('tanya lagi'))draft={...draft,mode:'clarification',message:'Di mana lokasinya?',items:[]};
 if(q.includes('format'))draft.factIds=['nonexistent'];
 if(q.includes('xss'))draft={...draft,mode:'answer',basis:'general',message:'Contoh teks aman: <img src=x onerror=window.__assistantXss=true>',factIds:[],items:[]};
 return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(draft)}]}}]});
};
