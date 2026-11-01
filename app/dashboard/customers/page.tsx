import {requireBusiness} from '@/lib/access'
import {readCustomers} from '@/lib/customers-server'
import CustomerManagement from '@/components/customer-management'
export default async function CustomersPage(){
 const {supabase,business,member}=await requireBusiness(['owner','admin'])
 return <CustomerManagement member={member} business={business} initialCustomers={await readCustomers(supabase,business.id)}/>
}
