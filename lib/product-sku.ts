export function productSkuPrefix(category: string, name: string): string {
  const categories = new Map([['minuman', 'MIN'], ['makanan', 'MAK'], ['bahan pokok', 'BPK']])
  const prefix = categories.get(category.trim().toLowerCase()) || category.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'PRD'
  const initials = name.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).map(word => word[0]).join('').slice(0, 24) || 'P'
  return `${prefix}-${initials}-`
}
