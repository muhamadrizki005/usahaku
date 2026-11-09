export function dashboardHref(path: string, category: string) {
  if (path === '/account') return path
  const key = category === 'restaurant' ? 'restoran' : category === 'barbershop' ? 'barbershop' : 'toko'
  return `${path}?category=${key}`
}
