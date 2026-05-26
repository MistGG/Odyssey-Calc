export type MeterShopCategoryId = 'bar-themes'

export type MeterShopSubcategoryId = 'common' | 'rare'

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
  subcategories: MeterShopSubcategory[]
}

export const METER_SHOP_CATEGORIES: MeterShopCategory[] = [
  {
    id: 'bar-themes',
    label: 'Bar Themes',
    available: true,
    subcategories: [
      {
        id: 'common',
        parentId: 'bar-themes',
        label: 'Common',
        available: true,
      },
      {
        id: 'rare',
        parentId: 'bar-themes',
        label: 'Rare',
        available: true,
      },
    ],
  },
]

export const DEFAULT_METER_SHOP_PATH = '/meter/shop/bar-themes/common'

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
