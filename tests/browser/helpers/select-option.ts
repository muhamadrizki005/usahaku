import { expect,type Locator } from '@playwright/test'
export async function chooseSelect(control:Locator,option:string|{label?:string;value?:string;index?:number}){
  await control.click()
  const options=control.page().getByRole('listbox').last().getByRole('option')
  const wanted=typeof option==='string'?{value:option}:option
  if(wanted.label!==undefined){await control.page().getByRole('listbox').last().getByRole('option',{name:wanted.label,exact:true}).click();return}
  const values=await options.evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).dataset.value))
  const index=wanted.index??values.indexOf(wanted.value)
  expect(index,'Pilihan dropdown tersedia').toBeGreaterThanOrEqual(0)
  await options.nth(index).click()
}
export async function expectDisabledOption(control:Locator,label:string){
  await control.click()
  await expect(control.page().getByRole('listbox').last().getByRole('option',{name:label,exact:true})).toBeDisabled()
  await control.page().keyboard.press('Escape')
}
