import { SearchSelect } from '@/components/common/search-select'

export const ALL_CATEGORIES = 'all'

export function CategoryFilter({
  sections,
  value,
  onChange,
  label,
}: {
  sections: { id: string; name: string | null }[]
  value: string
  onChange: (value: string) => void
  label: string
}) {
  if (sections.length < 2) return null

  return (
    <SearchSelect
      aria-label={label}
      className="w-full sm:w-56"
      value={value}
      placeholder="All categories"
      emptyText="No categories found."
      options={[
        { value: ALL_CATEGORIES, label: 'All categories' },
        ...sections.map((s) => ({ value: s.id, label: s.name ?? 'Other' })),
      ]}
      onValueChange={onChange}
    />
  )
}
