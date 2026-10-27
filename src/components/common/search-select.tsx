import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'

export type SearchSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

/**
 * A searchable single-choice picker for lists that can grow long, such as
 * clients and services. Pass `value={null}` for an action picker that
 * clears after each choice.
 */
export function SearchSelect({
  id,
  value,
  options,
  placeholder,
  emptyText = 'No results.',
  disabled,
  invalid,
  className,
  contentClassName,
  onValueChange,
  ...aria
}: {
  id?: string
  value: string | null
  options: SearchSelectOption[]
  placeholder: string
  emptyText?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  contentClassName?: string
  onValueChange: (value: string) => void
  'aria-label'?: string
}) {
  const selected = options.find((o) => o.value === value) ?? null
  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(option) => option && onValueChange(option.value)}
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        className={className}
        placeholder={placeholder}
        aria-invalid={invalid}
        {...aria}
      />
      <ComboboxContent className={contentClassName}>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(option: SearchSelectOption) => (
            <ComboboxItem
              key={option.value}
              value={option}
              disabled={option.disabled}
            >
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
