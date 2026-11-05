export function numericProblem(value:string,min?:number|string,max?:number|string,step:number|string=1):string {
  if(!value)return ''
  if(!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)||!Number.isFinite(Number(value)))return 'Isi angka yang valid; gunakan titik untuk pecahan.'
  const n=Number(value),lower=min===undefined?undefined:Number(min),upper=max===undefined?undefined:Number(max)
  if(lower!==undefined&&n<lower)return `Nilai minimal ${lower.toLocaleString('id-ID')}.`
  if(upper!==undefined&&n>upper)return `Nilai maksimal ${upper.toLocaleString('id-ID')}.`
  if(step!=='any'){
    const interval=Number(step),base=lower??0
    const decimal=(v:string)=>/[eE]/.test(v)?Number(v).toFixed(12).replace(/0+$/,'').replace(/\.$/,''):v
    const texts=[value,String(base),String(step)].map(decimal),scale=Math.max(...texts.map(v=>(v.split('.')[1]||'').length))
    const integer=(v:string)=>{const sign=v.startsWith('-')?-BigInt(1):BigInt(1),[whole,fraction='']=v.replace(/^[-+]/,'').split('.');return sign*BigInt((whole||'0')+fraction.padEnd(scale,'0'))}
    if(interval>0&&texts.every(v=>/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v))&&integer(texts[2])!==BigInt(0)&&(integer(texts[0])-integer(texts[1]))%integer(texts[2])!==BigInt(0))return interval===1?'Isi angka bulat.':`Gunakan kelipatan ${interval.toLocaleString('id-ID',{maximumFractionDigits:12})}.`
  }
  return ''
}
export function constraintMessage(field:HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement):string {
  const display=(field.dataset.validationTarget?field.ownerDocument.getElementById(field.dataset.validationTarget):field)||field
  const labelledBy=display.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>field.ownerDocument.getElementById(id)?.textContent||'').join(' ')
  const labels='labels' in display?Array.from((display as HTMLInputElement).labels||[]).map(l=>l.textContent).join(' '):''
  const label=(display.getAttribute('aria-label')||labelledBy||labels||field.name||'Isian').replace(/\s+/g,' ').replace(/\s*\*\s*$/,'').trim()
  const v=field.validity
  if(v.customError)return field.validationMessage
  if(v.valueMissing)return field instanceof HTMLInputElement&&field.type==='checkbox'?'Centang konfirmasi ini sebelum melanjutkan.':`${label} wajib diisi.`
  if(v.typeMismatch)return field instanceof HTMLInputElement&&field.type==='email'?'Masukkan alamat email yang valid.':`${label} belum valid.`
  if(v.tooShort&&'minLength' in field)return `${label} minimal ${field.minLength} karakter.`
  if(v.tooLong&&'maxLength' in field)return `${label} maksimal ${field.maxLength} karakter.`
  if(v.patternMismatch)return field.dataset.validationMessage||`${label} belum sesuai format yang diminta.`
  if(v.rangeUnderflow&&'min' in field)return `${label} minimal ${field.min}.`
  if(v.rangeOverflow&&'max' in field)return `${label} maksimal ${field.max}.`
  return `${label} belum valid. Periksa kembali nilainya.`
}
