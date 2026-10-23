// QA only: run after the report browser suite has generated its test PDF.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
const root=path.resolve('artifacts/reports')
const tools=process.env.REPORT_PDF_TOOLS||path.resolve('.cache/report-pdf-tools/unpacked/poppler-26.09.0/Library/bin')
const binary=name=>process.platform==='win32'?path.join(tools,name+'.exe'):name
const pdf=path.join(root,'report.pdf'),textFile=path.join(root,'report-pdf-text.txt')
const info=execFileSync(binary('pdfinfo'),[pdf],{encoding:'utf8'})
const pages=Number(info.match(/^Pages:\s+(\d+)/m)?.[1])
assert.ok(pages>1&&pages<=20,'Expected a complete multi-page test report')
execFileSync(binary('pdftotext'),['-layout',pdf,textFile])
const text=fs.readFileSync(textFile,'utf8'),expected=JSON.parse(fs.readFileSync(path.join(root,'pdf-expected.json'),'utf8'))
// Layout extraction interleaves adjacent table columns across wrapped UUIDs.
// Raw content order keeps each cell together; retain layout text for label QA.
const raw=execFileSync(binary('pdftotext'),['-raw',pdf,'-'],{encoding:'utf8'})
const compact=raw.replace(/\s/g,'').toUpperCase()
for(const id of expected.references)assert.ok(compact.includes(id.toUpperCase()),'Missing sale reference in PDF: '+id)
for(const label of expected.labels)assert.ok(text.includes(label),'Missing PDF text: '+label)
assert.ok(!text.includes('CATATAN-PRIVAT-TIDAK-DIEKSPOR'))
for(let page=1;page<=pages;page++)execFileSync(binary('pdftoppm'),['-f',String(page),'-l',String(page),'-scale-to','1400','-singlefile','-png',pdf,path.join(root,'pdf-page-'+page)])
fs.writeFileSync(path.join(root,'pdf-results.json'),JSON.stringify({passed:true,pages,allReferencesPresent:true,privateNotesAbsent:true,renderedPages:pages},null,2))
console.log('PASS: PDF '+pages+' pages; all sale references present; pages rendered for visual review')
