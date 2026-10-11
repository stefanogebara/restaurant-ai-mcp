import i18n from '../../i18n/config';

export type CustomerPresetKind = 'allergy' | 'dietary' | 'seating';

const PRESET_VALUES: Record<CustomerPresetKind, string[]> = {
  allergy: ['Gluten', 'Lactose', 'Nuts', 'Seafood', 'Soy', 'Eggs', 'Shellfish'],
  dietary: ['Vegetarian', 'Vegan', 'Pescatarian', 'Kosher', 'Halal', 'Low-carb', 'Keto'],
  seating: ['Window', 'Outdoor', 'Quiet corner', 'Bar', 'Private room', 'Near entrance'],
};

export interface CustomerPresetOption {
  value: string;
  label: string;
  aliases: string[];
}

export function getCustomerPresetOptions(kind: CustomerPresetKind): CustomerPresetOption[] {
  return PRESET_VALUES[kind].map((value) => {
    const key = `crm.${kind}_${value.toLowerCase().replace(/[- ]/g, '_')}`;
    return {
      value,
      label: i18n.t(key, { defaultValue: value }),
      aliases: ['en', 'pt-BR', 'es'].map((lng) => i18n.t(key, { lng, defaultValue: value })),
    };
  });
}

export function displayCustomerPreset(value: string, kind: CustomerPresetKind): string {
  const match = getCustomerPresetOptions(kind).find(({ value: canonical, aliases }) =>
    [canonical, ...aliases].some((alias) => alias.toLocaleLowerCase() === value.toLocaleLowerCase())
  );
  return match?.label ?? value;
}
