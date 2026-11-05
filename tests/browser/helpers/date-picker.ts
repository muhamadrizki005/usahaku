import { type Page } from '@playwright/test'
import { calendarLabel } from '../../../lib/calendar-date'
import { chooseSelect } from './select-option'
export async function chooseDate(page:Page,label:string,date:string){
  await page.getByLabel(label,{exact:true}).click()
  const calendar=page.getByRole('dialog',{name:'Kalender '+label,exact:true})
  await chooseSelect(calendar.getByLabel('Tahun kalender',{exact:true}),date.slice(0,4))
  await chooseSelect(calendar.getByLabel('Bulan kalender',{exact:true}),String(Number(date.slice(5,7))-1))
  await calendar.getByRole('button',{name:calendarLabel(date),exact:true}).click()
}
