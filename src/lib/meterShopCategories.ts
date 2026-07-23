export type MeterShopCategoryId = 'bar-themes' | 'magia-bar-themes' | 'verdandi-bar-themes'

export type MeterShopSubcategoryId = 'common' | 'rare' | 'legendary'

export type MeterShopSubcategory = {
  id: MeterShopSubcategoryId
  parentId: MeterShopCategoryId
  label: string
  available: boolean
}

export type MeterShopCategory = {
  id: MeterShopCategoryId
  label: string
  available: boolean
  defaultPath: string
  subcategories: MeterShopSubcategory[]
}

const OLYMPUS_SHOP_SUBCATEGORIES = (parentId: 'bar-themes'): MeterShopSubcategory[] => [
  { id: 'common', parentId, label: 'Common', available: true },
  { id: 'rare', parentId, label: 'Rare', available: true },
  { id: 'legendary', parentId, label: 'Legendary', available: true },
]

const MAGIA_SHOP_SUBCATEGORIES = (parentId: 'magia-bar-themes'): MeterShopSubcategory[] => [
  { id: 'rare', parentId, label: 'Rare', available: true },
  { id: 'legendary', parentId, label: 'Legendary', available: true },
]

const VERDANDI_SHOP_SUBCATEGORIES = (parentId: 'verdandi-bar-themes'): MeterShopSubcategory[] => [
  { id: 'rare', parentId, label: 'Rare', available: true },
  { id: 'legendary', parentId, label: 'SSS Legendary', available: true },
]

export const METER_SHOP_CATEGORIES: MeterShopCategory[] = [
  {
    id: 'bar-themes',
    label: 'Olympus Bar Themes',
    available: true,
    defaultPath: '/meter/shop/bar-themes/common',
    subcategories: OLYMPUS_SHOP_SUBCATEGORIES('bar-themes'),
  },
  {
    id: 'magia-bar-themes',
    label: 'Magia Bar Themes',
    available: true,
    defaultPath: '/meter/shop/magia-bar-themes/rare',
    subcategories: MAGIA_SHOP_SUBCATEGORIES('magia-bar-themes'),
  },
  {
    id: 'verdandi-bar-themes',
    label: 'Verdandi Bar Themes',
    available: true,
    defaultPath: '/meter/shop/verdandi-bar-themes/rare',
    subcategories: VERDANDI_SHOP_SUBCATEGORIES('verdandi-bar-themes'),
  },
]

export const DEFAULT_METER_SHOP_PATH = METER_SHOP_CATEGORIES[0]!.defaultPath

export function meterShopCategoryById(id: string): MeterShopCategory | undefined {
  return METER_SHOP_CATEGORIES.find((c) => c.id === id)
}

export function meterShopSubcategoryByPath(
  categoryId: string,
  subcategoryId: string,
): MeterShopSubcategory | undefined {
  const category = meterShopCategoryById(categoryId)
  if (!category) return undefined
  return category.subcategories.find((s) => s.id === subcategoryId)
}
