import {requireBusiness} from '@/lib/access'
import {readSales} from '@/lib/pos-server'
import {TransactionHistory} from '@/components/transaction-management'
export default async function TransactionsPage(){
 const {supabase,business,member}=await requireBusiness(undefined, false, 'transactions:view')
 return <TransactionHistory member={member} business={business} sales={await readSales(supabase,business.id)}/>
}
